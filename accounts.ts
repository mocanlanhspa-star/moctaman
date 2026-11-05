/**
 * Accounts, progress and leaderboards, kept on the server. Data lives in one JSON blob:
 *  - in data/users.json on this machine, or
 *  - in a free Upstash Redis database when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
 *    (use this on hosts whose disk is wiped on every restart, such as Render's free plan).
 * Passwords are never stored: only a salted scrypt hash.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BADGES, LEVEL_MAX, earnedBadges, emptyStats, levelOf, xpForLevel, type Stats } from './src/progress';

export type Holder = {
  xp: number;
  stats: Stats;
  streak: number;
  lastDay: string;
  todayKey: string;
  todayXp: number;
  badges: string[];
};
export type User = Holder & {
  key: string;
  name: string;
  salt: string;
  hash: string;
  created: number;
  look: string;
  featured: string[]; // up to 3 badges shown next to the name
  admin?: boolean; // the owner's showcase account: everything maxed, kept off the public leaderboards
};
type Blob = { users: Record<string, User>; tokens: Record<string, { k: string; e: number }> };

let data: Blob = { users: {}, tokens: {} };
const FILE = path.join(process.cwd(), 'data', 'users.json');
const REMOTE = process.env.UPSTASH_REDIS_REST_URL;
const REMOTE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REMOTE_KEY = 'ttta-users';
let dirty = false;
export const markDirty = () => {
  dirty = true;
};
export const storageKind = () => (REMOTE && REMOTE_TOKEN ? 'upstash' : 'file');

export async function initStore() {
  try {
    if (REMOTE && REMOTE_TOKEN) {
      const r = await fetch(`${REMOTE}/get/${REMOTE_KEY}`, { headers: { Authorization: `Bearer ${REMOTE_TOKEN}` } });
      const j = (await r.json()) as { result?: string };
      if (j.result) data = JSON.parse(j.result);
    } else if (fs.existsSync(FILE)) {
      data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Could not load accounts:', err);
  }
  data.users ??= {};
  data.tokens ??= {};
  setInterval(flush, 8000);
  process.on('SIGTERM', () => void flush().then(() => process.exit(0)));
}

async function flush() {
  if (!dirty) return;
  dirty = false;
  const json = JSON.stringify(data);
  try {
    if (REMOTE && REMOTE_TOKEN) {
      await fetch(REMOTE, { method: 'POST', headers: { Authorization: `Bearer ${REMOTE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['SET', REMOTE_KEY, json]) });
    } else {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, json);
    }
  } catch (err) {
    dirty = true;
    console.error('Could not save accounts:', err);
  }
}

/** Vietnam date, e.g. "2026-11-04"; offset -1 is yesterday */
export const dayKey = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

export const newHolder = (): Holder => ({ xp: 0, stats: emptyStats(), streak: 0, lastDay: '', todayKey: '', todayXp: 0, badges: [] });

/** Add merit (and one more of a practice) and report what changed: new level, new badges */
export function award(p: Holder, gain: number, stat?: keyof Stats, n = 1) {
  const today = dayKey();
  if (p.todayKey !== today) {
    p.todayKey = today;
    p.todayXp = 0;
  }
  if (p.lastDay !== today) {
    p.streak = p.lastDay === dayKey(-1) ? p.streak + 1 : 1;
    p.lastDay = today;
  }
  const before = levelOf(p.xp);
  p.xp += gain;
  p.todayXp += gain;
  if (stat) p.stats[stat] += n;
  const after = levelOf(p.xp);
  const have = new Set(p.badges);
  const fresh = earnedBadges(p).filter((b) => !have.has(b));
  if (fresh.length) p.badges = [...p.badges, ...fresh];
  markDirty();
  return { before, after, fresh };
}

// ---- accounts ----
const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 32).toString('hex');
export const cleanUsername = (u: unknown) => (typeof u === 'string' && /^[a-zA-Z0-9_.-]{3,20}$/.test(u) ? u.toLowerCase() : null);

export function issueToken(key: string) {
  const token = crypto.randomBytes(24).toString('hex');
  data.tokens[token] = { k: key, e: Date.now() + 90 * 86400_000 };
  markDirty();
  return token;
}
export function userByToken(token: unknown): User | undefined {
  if (typeof token !== 'string') return undefined;
  const t = data.tokens[token];
  if (!t || t.e < Date.now()) return undefined;
  return data.users[t.k];
}
export function dropToken(token: string) {
  delete data.tokens[token];
  markDirty();
}

export function register(username: unknown, password: unknown, display: string, merge?: Holder): { ok: true; user: User; token: string } | { ok: false; error: string } {
  const key = cleanUsername(username);
  if (!key) return { ok: false, error: 'Tài khoản gồm 3 đến 20 ký tự: chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.' };
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) return { ok: false, error: 'Mật khẩu cần từ 6 ký tự.' };
  if (data.users[key]) return { ok: false, error: 'Tài khoản này đã có người dùng, bạn chọn tên khác nhé.' };
  const salt = crypto.randomBytes(12).toString('hex');
  const user: User = {
    ...newHolder(),
    key,
    name: display || key,
    salt,
    hash: hashPw(password, salt),
    created: Date.now(),
    look: '',
    featured: [],
  };
  if (merge) {
    // what the visitor practised as a guest in this visit is kept
    user.xp = merge.xp;
    user.stats = { ...merge.stats };
    user.todayKey = merge.todayKey;
    user.todayXp = merge.todayXp;
    user.lastDay = merge.lastDay;
    user.streak = merge.streak;
    user.badges = [...merge.badges];
  }
  data.users[key] = user;
  markDirty();
  return { ok: true, user, token: issueToken(key) };
}

export function login(username: unknown, password: unknown): { ok: true; user: User; token: string } | { ok: false; error: string } {
  const key = cleanUsername(username);
  const user = key ? data.users[key] : undefined;
  const bad = { ok: false as const, error: 'Sai tài khoản hoặc mật khẩu.' };
  if (!user || typeof password !== 'string') return bad;
  const a = Buffer.from(hashPw(password, user.salt), 'hex');
  const b = Buffer.from(user.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return bad;
  return { ok: true, user, token: issueToken(user.key) };
}

// ---- leaderboards ----
export type BoardKind = 'xp' | 'today' | 'bows' | 'chants' | 'meditate' | 'streak';
export const BOARD_KINDS: BoardKind[] = ['xp', 'today', 'bows', 'chants', 'meditate', 'streak'];

const valueOf = (u: User, kind: BoardKind) => {
  switch (kind) {
    case 'xp':
      return u.xp;
    case 'today':
      return u.todayKey === dayKey() ? u.todayXp : 0;
    case 'bows':
      return u.stats.bows;
    case 'chants':
      return u.stats.chants;
    case 'meditate':
      return u.stats.meditate;
    case 'streak':
      return u.lastDay === dayKey() || u.lastDay === dayKey(-1) ? u.streak : 0;
  }
};

export function board(kind: BoardKind, meKey?: string, limit = 20) {
  const rows = Object.values(data.users)
    .filter((u) => !u.admin)
    .map((u) => ({ u, v: valueOf(u, kind) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v || a.u.created - b.u.created);
  const top = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, name: r.u.name, lv: levelOf(r.u.xp), value: r.v }));
  const mine = meKey ? rows.findIndex((r) => r.u.key === meKey) : -1;
  return { rows: top, me: mine >= 0 ? { rank: mine + 1, value: rows[mine].v } : null, total: rows.length };
}

/** What the page shows about someone's progress */
export const profileOf = (p: Holder | User) => ({
  xp: p.xp,
  stats: p.stats,
  streak: p.streak,
  badges: p.badges,
  today: p.todayKey === dayKey() ? p.todayXp : 0,
  featured: 'featured' in p ? p.featured : [],
  admin: 'admin' in p && p.admin === true,
});

/**
 * The owner's showcase account, made from two environment variables so the password never sits in the code:
 * ADMIN_USER (default "admin") and ADMIN_PASSWORD. Everything is maxed: level 120, every stat, every badge.
 * It is recreated with these values each time the server starts, and it is left off the public leaderboards.
 */
export function ensureAdmin(username: string | undefined, password: string | undefined, display: string | undefined) {
  const key = cleanUsername(username || 'admin');
  if (!key || !password || password.length < 8) return false;
  const salt = crypto.randomBytes(12).toString('hex');
  const old = data.users[key];
  const maxXp = xpForLevel(LEVEL_MAX) + 5000;
  const admin: User = {
    ...(old ?? newHolder()),
    key,
    name: display || 'Quản trị Mộc An Lành',
    salt,
    hash: hashPw(password, salt),
    created: old?.created ?? Date.now(),
    look: old?.look ?? '',
    featured: old?.featured?.length ? old.featured : ['cap-120', 'cap-100', 'chuoi-100'],
    admin: true,
    xp: Math.max(old?.xp ?? 0, maxXp),
    stats: { bows: 12000, incense: 1200, bells: 600, chants: 60000, meditate: 7200, wishes: 400, lanterns: 300 },
    streak: 120,
    lastDay: dayKey(),
    todayKey: dayKey(),
    todayXp: old?.todayKey === dayKey() ? old.todayXp : 0,
    badges: BADGES.map((b) => b.id),
  };
  data.users[key] = admin;
  markDirty();
  return true;
}
