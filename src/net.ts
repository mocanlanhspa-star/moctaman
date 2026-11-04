import type { Stats as PracticeStats } from './progress';
/** x, z in metres, r = facing angle, k = kneeling */
export type Person = { id: string; name: string; x: number; z: number; r: number; k: boolean; l?: string; lv?: number };
export type Move = [string, number, number, number, number];
export type ActType = 'incense' | 'bell' | 'wish' | 'lantern' | 'fish' | 'chant' | 'bow' | 'tap';
/** One seat of the 120: who holds it (null = free) and how many ms they may still keep it */
export type SeatInfo = { seat: number; id: string | null; left?: number };
export type SeatResult = { ok: boolean; seat?: number; left?: number; error?: string; queued?: boolean; pos?: number; full?: boolean };
export type QueueInfo = { pos: number; total: number; want: number | null }; // pos 0 = not waiting
export type ActEvent = { id: string; name: string; type: ActType; text?: string; t: number };
export type Stats = { online: number; visitors: number; incense: number; bells: number; wishes: number; lanterns: number; fish: number; chants: number; seated?: number; queued?: number };
export type FeedItem = { name: string; text: string; t: number };
export type Profile = { xp: number; stats: PracticeStats; streak: number; badges: string[]; today: number };
export type Account = { username: string; name: string };
export type NetStatus = 'connecting' | 'online' | 'solo' | 'reconnecting';

export type NetHandlers = {
  onHello(me: Person, people: Person[], feed: FeedItem[], stats: Stats, seats: SeatInfo[]): void;
  onSeat(s: SeatInfo): void;
  onQueue(q: QueueInfo): void;
  /** the 5 minutes are up: stand and give the seat to someone else */
  onStand(cooldownMs: number): void;
  onJoin(p: Person): void;
  onLeave(id: string): void;
  onMoves(m: Move[]): void;
  onLook(d: { id: string; l: string }): void;
  /** my saved profile, sent once when I connect (account is null for a guest) */
  onProfile(p: Profile, account: Account | null): void;
  /** merit gained: the new totals */
  onXp(d: Profile & { gain: number; lv: number }): void;
  onLevelUp(lv: number): void;
  onBadge(id: string): void;
  /** someone's level changed (it shows as their aura) */
  onLvl(d: { id: string; lv: number }): void;
  onAct(e: ActEvent): void;
  onStats(s: Stats): void;
  onStatus(s: NetStatus): void;
};

export const EMPTY_PROFILE: Profile = { xp: 0, stats: { bows: 0, incense: 0, bells: 0, chants: 0, meditate: 0, wishes: 0, lanterns: 0 }, streak: 0, badges: [], today: 0 };
const EMPTY: Stats = { online: 1, visitors: 1, incense: 0, bells: 0, wishes: 0, lanterns: 0, fish: 0, chants: 0 };
const SOLO_LIMIT: Partial<Record<ActType, number>> = { incense: 40_000, bell: 5_000, wish: 10_000, lantern: 30_000, chant: 20_000 };
const SEAT_MS = 5 * 60_000;
const SEAT_COOLDOWN_MS = 90_000;

// Talks to the server over one SSE stream + POSTs. If there is no server (static hosting, offline) it falls
// back to "solo" mode so the hall still works for a single visitor.
export class Net {
  private es?: EventSource;
  private me?: Person;
  private solo = false;
  private helloTimer?: number;
  private soloLast: Partial<Record<ActType, number>> = {};
  private soloStats: Stats = { ...EMPTY };

  constructor(private h: NetHandlers) {}

  private myLook = '';
  connect(name: string, look = '', token = '') {
    this.myLook = look;
    this.h.onStatus('connecting');
    this.helloTimer = window.setTimeout(() => this.goSolo(name), 6000);
    try {
      const es = new EventSource(`/api/stream?name=${encodeURIComponent(name)}&look=${encodeURIComponent(look)}&token=${encodeURIComponent(token)}`);
      this.es = es;
      const on = <T,>(event: string, fn: (d: T) => void) =>
        es.addEventListener(event, (e) => {
          try {
            fn(JSON.parse((e as MessageEvent).data));
          } catch {
            /* ignore malformed event */
          }
        });
      on<{ me: Person; people: Person[]; feed: FeedItem[]; stats: Stats; seats: SeatInfo[]; profile?: Profile; account?: Account | null }>('hello', (d) => {
        window.clearTimeout(this.helloTimer);
        this.me = d.me;
        this.h.onStatus('online');
        this.h.onHello(d.me, d.people, d.feed, d.stats, d.seats ?? []);
        this.h.onProfile(d.profile ?? EMPTY_PROFILE, d.account ?? null);
      });
      on<Profile & { gain: number; lv: number }>('xp', (d) => this.h.onXp(d));
      on<{ lv: number }>('levelup', (d) => this.h.onLevelUp(d.lv));
      on<{ id: string }>('badge', (d) => this.h.onBadge(d.id));
      on<{ id: string; lv: number }>('lvl', (d) => this.h.onLvl(d));
      on<SeatInfo>('seat', (s) => this.h.onSeat(s));
      on<QueueInfo>('queue', (q) => this.h.onQueue(q));
      on<{ cooldown: number }>('stand', (d) => this.h.onStand(d.cooldown));
      on<Person>('join', (p) => this.h.onJoin(p));
      on<{ id: string }>('leave', (d) => this.h.onLeave(d.id));
      on<Move[]>('moves', (m) => this.h.onMoves(m));
      on<{ id: string; l: string }>('look', (d) => this.h.onLook(d));
      on<ActEvent>('act', (e) => this.h.onAct(e));
      on<Stats>('stats', (s) => this.h.onStats(s));
      es.onerror = () => {
        if (!this.me) {
          if (es.readyState === EventSource.CLOSED) this.goSolo(name);
        } else this.h.onStatus('reconnecting');
      };
    } catch {
      this.goSolo(name);
    }
  }

  private goSolo(name: string) {
    if (this.solo || this.me) return;
    window.clearTimeout(this.helloTimer);
    this.es?.close();
    this.solo = true;
    this.me = { id: 'solo', name, x: 0, z: 17.2, r: Math.PI, k: false, l: this.myLook };
    this.h.onStatus('solo');
    this.h.onHello(this.me, [this.me], [], this.soloStats, []);
    this.h.onProfile(EMPTY_PROFILE, null);
  }

  private soloSeat = -1;
  private soloTimer?: number;
  private soloCooldown = 0;

  /** Take seat number `index` (0..119), or the nearest free one when `index` is undefined; null gives the seat up */
  async seat(index?: number | null, queue = false): Promise<SeatResult> {
    if (!this.me) return { ok: false, error: 'Chưa kết nối.' };
    if (this.solo) {
      if (index === null) {
        window.clearTimeout(this.soloTimer);
        if (this.soloSeat >= 0) this.h.onSeat({ seat: this.soloSeat, id: null });
        this.soloSeat = -1;
        return { ok: true };
      }
      if (Date.now() < this.soloCooldown) return { ok: false, error: 'Bạn vừa ngồi xong, chờ một chút để ngồi lại.' };
      const want = index ?? 0;
      if (this.soloSeat >= 0) this.h.onSeat({ seat: this.soloSeat, id: null });
      window.clearTimeout(this.soloTimer);
      this.soloSeat = want;
      this.h.onSeat({ seat: want, id: this.me.id, left: SEAT_MS });
      this.soloTimer = window.setTimeout(() => {
        this.h.onSeat({ seat: want, id: null });
        this.soloSeat = -1;
        this.soloCooldown = Date.now() + SEAT_COOLDOWN_MS;
        this.h.onStand(SEAT_COOLDOWN_MS);
      }, SEAT_MS);
      return { ok: true, seat: want, left: SEAT_MS };
    }
    try {
      const res = await fetch('/api/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(index === null ? { id: this.me.id, release: true } : { id: this.me.id, seat: index, queue }),
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Mất kết nối, đang thử lại.' };
    }
  }

  async act(type: ActType, text?: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.me) return { ok: false, error: 'Chưa kết nối.' };
    if (this.solo) {
      const gap = SOLO_LIMIT[type] ?? 0;
      const now = Date.now();
      if (gap && now - (this.soloLast[type] ?? 0) < gap) return { ok: false, error: 'Bạn thao tác hơi nhanh, chờ một chút nhé.' };
      this.soloLast[type] = now;
      this.h.onAct({ id: this.me.id, name: this.me.name, type, text, t: now });
      return { ok: true };
    }
    try {
      const res = await fetch('/api/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.me.id, type, text }),
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Mất kết nối, đang thử lại.' };
    }
  }

  /** Stop waiting in line for a seat */
  async leaveQueue() {
    if (this.solo || !this.me) return;
    await fetch('/api/seat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: this.me.id, leaveQueue: true }) }).catch(() => {});
  }

  /** Change my outfit, hair or skin (encoded by look.ts) */
  setLook(l: string) {
    this.myLook = l;
    if (this.solo || !this.me) return;
    void fetch('/api/look', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: this.me.id, look: l }) }).catch(() => {});
  }

  /** Tell the others where I am (fire and forget) */
  move(x: number, z: number, r: number, k: boolean) {
    if (this.solo || !this.me) return;
    void fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.me.id, x, z, r, k }),
      keepalive: true,
    }).catch(() => {});
  }

  close() {
    window.clearTimeout(this.helloTimer);
    this.es?.close();
  }
}

// ---- accounts and leaderboards (plain requests, no stream needed) ----
export type AuthResult = { ok: boolean; token?: string; name?: string; username?: string; error?: string };
const post = async (url: string, body: unknown): Promise<AuthResult> => {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { ok: false, error: 'Chưa kết nối được máy chủ, bạn thử lại nhé.' };
  }
};
export const authRegister = (username: string, password: string, display: string, id?: string) => post('/api/register', { username, password, display, id });
export const authLogin = (username: string, password: string) => post('/api/login', { username, password });
export const authLogout = (token: string) => post('/api/logout', { token });

export type BoardKind = 'xp' | 'today' | 'bows' | 'chants' | 'meditate' | 'streak';
export type BoardRow = { rank: number; name: string; lv: number; value: number };
export type BoardData = { kind: BoardKind; rows: BoardRow[]; me: { rank: number; value: number } | null; total: number };
export async function fetchBoard(kind: BoardKind, token: string): Promise<BoardData | null> {
  try {
    const res = await fetch(`/api/board?kind=${kind}&token=${encodeURIComponent(token)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}