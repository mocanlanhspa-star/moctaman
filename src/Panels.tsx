import { useEffect, useState } from 'react';
import { Award, Bell, Crown, Drum, Flame, Heart, Lamp, Moon, PenLine, Sparkles, Sun, X } from 'lucide-react';
import { AURA_TIERS, BADGES, HATS, LEVEL_MAX, levelOf, titleOf, xpForLevel } from './progress';
import { authLogin, authRegister, fetchBoard, type BoardData, type BoardKind, type Profile } from './net';
import { TRACKS_A, TRACKS_B, type TrackId } from './audio';

const BADGE_ICONS: Record<string, typeof Award> = { sparkles: Sparkles, heart: Heart, flame: Flame, drum: Drum, moon: Moon, bell: Bell, pen: PenLine, lamp: Lamp, sun: Sun, award: Award, crown: Crown };
const num = (n: number) => n.toLocaleString('vi-VN');

export function Close({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="absolute right-3 top-3 text-white/60 hover:text-white" aria-label="Đóng">
      <X size={16} />
    </button>
  );
}

// ---------------------------------------------------------------- sign in / register
export function AuthForm({ mode, guestId, onAuthed }: { mode: 'login' | 'register'; guestId?: string; onAuthed: (token: string, name: string, username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [display, setDisplay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'w-full rounded-xl border border-[#e7b860]/40 bg-black/30 px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-[#f0c35a]';
  const submit = async () => {
    setBusy(true);
    setError('');
    const r = mode === 'login' ? await authLogin(username.trim(), password) : await authRegister(username.trim(), password, display.trim(), guestId);
    setBusy(false);
    if (r.ok && r.token) onAuthed(r.token, r.name ?? username, r.username ?? username);
    else setError(r.error ?? 'Chưa được, bạn thử lại nhé.');
  };
  return (
    <div className="flex flex-col gap-2 text-left">
      <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoCapitalize="none" autoCorrect="off" placeholder="Tài khoản (chữ không dấu, số)" className={field} />
      {mode === 'register' && <input value={display} onChange={(e) => setDisplay(e.target.value)} maxLength={24} placeholder="Tên hiện trên đầu bạn (có dấu cũng được)" className={field} />}
      <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} type="password" maxLength={64} placeholder="Mật khẩu (từ 6 ký tự)" className={field} />
      {error && <div className="text-[12px] text-amber-300">{error}</div>}
      <button onClick={submit} disabled={busy} className="rounded-xl bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] px-4 py-3 font-temple text-[15px] font-bold text-[#2a1608] transition hover:brightness-110 disabled:opacity-60">
        {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký và vào chánh điện'}
      </button>
      {mode === 'register' && <div className="text-[11px] leading-relaxed text-[#a99c82]">Đăng ký để lưu cấp độ, huy hiệu, trang phục và lên bảng xếp hạng. Lần sau vào chỉ cần đăng nhập. Không thu tiền và không hỏi thông tin cá nhân.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- profile: level, streak, stats, badges
export function ProfilePanel({ profile, account, onClose, onSignUp, onSignOut }: { profile: Profile; account: { name: string } | null; onClose: () => void; onSignUp: () => void; onSignOut: () => void }) {
  const lv = levelOf(profile.xp);
  const from = xpForLevel(lv);
  const to = xpForLevel(lv + 1);
  const pct = lv >= LEVEL_MAX ? 100 : Math.round(((profile.xp - from) / Math.max(1, to - from)) * 100);
  const have = new Set(profile.badges);
  const stat = (label: string, n: number) => (
    <div className="rounded-xl bg-white/5 px-2 py-1.5 text-center">
      <div className="text-[15px] font-bold text-[#ffe9a8]">{num(n)}</div>
      <div className="text-[10px] text-[#cbbd9f]">{label}</div>
    </div>
  );
  return (
    <div className="glass rise-in absolute left-3 top-[150px] z-30 max-h-[calc(100vh-290px)] w-[min(92vw,360px)] overflow-y-auto rounded-3xl p-4 sm:left-5">
      <Close onClick={onClose} />
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] font-temple text-[22px] font-bold text-[#2a1608] shadow-[0_0_18px_rgba(255,210,110,0.6)]">{lv}</div>
        <div className="min-w-0">
          <div className="truncate font-temple text-[15px] font-semibold text-[#f0c35a]">{account?.name ?? 'Khách ghé thăm'}</div>
          <div className="text-[12px] text-[#e8dcc4]">Cấp {lv} · {titleOf(lv)}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ffd36b] to-[#f08a4a]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-[#cbbd9f]">
          <span>{num(profile.xp)} điểm công đức</span>
          <span>{lv >= LEVEL_MAX ? 'Đã đạt cấp cao nhất' : `còn ${num(to - profile.xp)} để lên cấp ${lv + 1}`}</span>
        </div>
      </div>
      {!account && (
        <button onClick={onSignUp} className="mt-3 w-full rounded-xl border border-[#f0c35a]/60 bg-[#f0c35a]/10 px-3 py-2 text-[12.5px] font-semibold text-[#ffe9a8]">
          Đăng ký để lưu cấp độ và lên bảng xếp hạng
        </button>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {stat('ngày liên tiếp', profile.streak)}
        {stat('công đức hôm nay', profile.today)}
        {stat('lạy Phật', profile.stats.bows)}
        {stat('nén hương', profile.stats.incense)}
        {stat('câu niệm', profile.stats.chants)}
        {stat('phút thiền', profile.stats.meditate)}
        {stat('lần rung chuông', profile.stats.bells)}
        {stat('lời nguyện', profile.stats.wishes)}
        {stat('đèn hoa đăng', profile.stats.lanterns)}
      </div>
      <div className="mt-4 text-[12px] font-semibold text-[#f0c35a]">Hào quang và phần thưởng theo cấp</div>
      <div className="mt-1 flex flex-col gap-1">
        {AURA_TIERS.map((t) => (
          <div key={t.min} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] ${lv >= t.min ? 'bg-[#f0c35a]/15 text-[#ffe9a8]' : 'text-white/40'}`}>
            <span className="w-14 shrink-0 font-semibold">Cấp {t.min}</span>
            <span className="min-w-0">{t.name}: {t.desc}</span>
          </div>
        ))}
        {HATS.filter((h) => h.id > 0).map((h) => (
          <div key={h.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] ${lv >= h.min ? 'text-[#ffe9a8]' : 'text-white/40'}`}>
            <span className="w-14 shrink-0 font-semibold">Cấp {h.min}</span>
            <span>Mở khóa {h.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 text-[12px] font-semibold text-[#f0c35a]">Huy hiệu ({profile.badges.length}/{BADGES.length})</div>
      <div className="mt-1 grid grid-cols-4 gap-2">
        {BADGES.map((b) => {
          const Icon = BADGE_ICONS[b.icon] ?? Award;
          const on = have.has(b.id);
          return (
            <div key={b.id} title={`${b.name}: ${b.desc}`} className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-center ${on ? 'bg-[#f0c35a]/15' : 'opacity-35'}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${on ? 'bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] text-[#2a1608]' : 'bg-white/10 text-white'}`}>
                <Icon size={17} />
              </span>
              <span className="text-[9.5px] leading-tight text-[#e8dcc4]">{b.name}</span>
            </div>
          );
        })}
      </div>
      {account && (
        <button onClick={onSignOut} className="mt-4 w-full rounded-xl border border-white/20 px-3 py-2 text-[12px] text-white/70 hover:bg-white/5">
          Đăng xuất
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- leaderboards
const BOARD_TABS: Array<[BoardKind, string, string]> = [
  ['xp', 'Công đức', 'điểm'],
  ['today', 'Hôm nay', 'điểm'],
  ['bows', 'Lạy Phật', 'lạy'],
  ['chants', 'Niệm', 'câu'],
  ['meditate', 'Thiền', 'phút'],
  ['streak', 'Chuyên cần', 'ngày'],
];
export function BoardPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [kind, setKind] = useState<BoardKind>('xp');
  const [data, setData] = useState<BoardData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const d = await fetchBoard(kind, token);
      if (!live) return;
      setData(d);
      setFailed(!d);
    };
    void load();
    const id = window.setInterval(load, 20_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [kind, token]);
  const unit = BOARD_TABS.find((t) => t[0] === kind)![2];
  return (
    <div className="glass rise-in absolute right-3 top-[236px] z-30 max-h-[calc(100vh-330px)] w-[min(94vw,360px)] overflow-y-auto rounded-3xl p-4 sm:right-5 sm:top-[248px]">
      <Close onClick={onClose} />
      <div className="font-temple text-[14px] font-semibold text-[#f0c35a]">Bảng vàng tu tập</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BOARD_TABS.map(([k, name]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-2.5 py-1 text-[11.5px] ${kind === k ? 'border-[#f0c35a] bg-[#f0c35a]/20 text-[#ffe9a8]' : 'border-white/15 text-white/70'}`}>
            {name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {failed && <div className="text-[12px] text-amber-300">Chưa tải được bảng, bạn thử lại sau nhé.</div>}
        {data && data.rows.length === 0 && <div className="text-[12px] text-[#cbbd9f]">Chưa có ai trên bảng này. Hãy là người đầu tiên.</div>}
        {data?.rows.map((r) => (
          <div key={`${r.rank}-${r.name}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${r.rank === 1 ? 'bg-[#ffd36b] text-[#2a1608]' : r.rank === 2 ? 'bg-[#d9dde3] text-[#2a2f36]' : r.rank === 3 ? 'bg-[#d89a62] text-[#2a1608]' : 'bg-white/10 text-white/70'}`}>{r.rank}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#f5ecde]">{r.name}</span>
            <span className="shrink-0 text-[10.5px] text-[#cbbd9f]">Cấp {r.lv}</span>
            <span className="w-16 shrink-0 text-right text-[12px] font-semibold text-[#ffe9a8]">{num(r.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-[#a99c82]">
        {data?.me ? `Bạn đứng hạng ${data.me.rank} với ${num(data.me.value)} ${unit}.` : token ? 'Bạn chưa có tên trên bảng này.' : 'Đăng ký để có tên trên bảng xếp hạng.'}
      </div>
      <div className="mt-1 text-[10px] text-[#8c8068]">Điểm công đức chỉ đến từ việc tu tập trong chánh điện, không liên quan đến tiền bạc hay quà tặng.</div>
    </div>
  );
}

// ---------------------------------------------------------------- music: two separate systems
type Chan = { on: boolean; setOn: (v: boolean) => void; track: TrackId | null; setTrack: (id: TrackId) => void; vol: number; setVol: (v: number) => void };
export function MusicPanel({ a, b, onClose }: { a: Chan; b: Chan; onClose: () => void }) {
  const section = (title: string, hint: string, c: Chan, list: Array<{ id: string; name: string; desc: string }>) => (
    <div className="mt-3 rounded-2xl border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-[#f0c35a]">{title}</div>
          <div className="text-[10.5px] text-[#a99c82]">{hint}</div>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={c.on} onChange={(e) => c.setOn(e.target.checked)} /> Bật
        </label>
      </div>
      <div className={`mt-2 flex flex-col gap-1 ${c.on ? '' : 'opacity-50'}`}>
        {list.map((t) => (
          <button key={t.id} onClick={() => c.setTrack(t.id)} className={`rounded-lg border px-2.5 py-1.5 text-left ${t.id === c.track ? 'border-[#f0c35a] bg-[#f0c35a]/15' : 'border-white/10 hover:bg-white/5'}`}>
            <div className="text-[12.5px] font-semibold text-[#ffe9a8]">{t.name}</div>
            <div className="text-[10.5px] text-[#cbbd9f]">{t.desc}</div>
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-[11.5px]">
        Âm lượng <input type="range" min={0} max={1} step={0.05} value={c.vol} onChange={(e) => c.setVol(Number(e.target.value))} className="flex-1 accent-[#f0c35a]" />
      </label>
    </div>
  );
  return (
    <div className="glass rise-in absolute right-3 top-[236px] z-30 max-h-[calc(100vh-330px)] w-[min(94vw,340px)] overflow-y-auto rounded-3xl p-4 sm:right-5 sm:top-[248px]">
      <Close onClick={onClose} />
      <div className="font-temple text-[14px] font-semibold text-[#f0c35a]">Âm nhạc</div>
      <div className="text-[11px] text-[#a99c82]">Hai hệ thống nhạc chạy riêng, bật hoặc tắt riêng, chỉnh âm lượng riêng.</div>
      {section('Nhạc nền', 'Âm thanh êm dịu cho cả chánh điện', a, TRACKS_A)}
      {section('Nhạc chùa của Sếp Mộc', 'Bài tụng, niệm do Sếp tự làm, chọn bài bạn muốn nghe', b, TRACKS_B)}
    </div>
  );
}
