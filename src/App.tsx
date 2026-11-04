import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Armchair, Bell, Crosshair, Drum, Flame, Heart, Info, Lamp, Lock, Maximize, Music, PenLine, PersonStanding, Send, Shirt, Tag, Trophy, Users, X } from 'lucide-react';
import { GENDERS, HAIR_FOR, HAIR_STYLES, OUTFITS, SKIN_TONES, encodeLook, parseLook, specFor, type LookSpec } from './look';
import { TempleWorld } from './three/world';
import { EMPTY_PROFILE, Net, authLogout, type Account, type ActEvent, type NetStatus, type Person, type Profile, type QueueInfo, type SeatInfo, type Stats } from './net';
import { hallAudio, type TrackId } from './audio';
import { AuthForm, BoardPanel, Close, MusicPanel, ProfilePanel } from './Panels';
import { BADGES, HATS, LEVEL_MAX, levelOf, titleOf, xpForLevel } from './progress';
import { BUILTIN_SUTRAS, loadExtraSutras, type Sutra } from './sutras';
import { COLS, MAX_SEATS, ROWS } from './layout';
import { blessingFor, detectWish, shouldAnswer } from './services/wishResponder';

const TEMPLE_NAME = 'Tâm Tịnh Tâm An';
const INCENSE_COOLDOWN_MS = 40_000;
const BELL_COOLDOWN_MS = 5_000;
const EMPTY_STATS: Stats = { online: 0, visitors: 0, incense: 0, bells: 0, wishes: 0, lanterns: 0, fish: 0, chants: 0 };
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
// the seats as they lie in the hall: front row at the top, aisle in the middle
const SEAT_ROWS = Array.from({ length: ROWS }, (_, r) => [8, 6, 4, 2, 0, 1, 3, 5, 7, 9].map((s) => r * COLS + s));

type Line = { id: number; name: string; text: string; kind: 'wish' | 'sys' | 'blessing' };
let lineId = 0;

let gainId = 0;
const savedToken = () => {
  try {
    return localStorage.getItem('ttta-token') || '';
  } catch {
    return '';
  }
};
const savedAccountName = () => {
  try {
    return localStorage.getItem('ttta-acc') || '';
  } catch {
    return '';
  }
};
const keepAccount = (token: string, name: string) => {
  try {
    if (token) {
      localStorage.setItem('ttta-token', token);
      localStorage.setItem('ttta-acc', name);
    } else {
      localStorage.removeItem('ttta-token');
      localStorage.removeItem('ttta-acc');
    }
  } catch {
    /* private mode */
  }
};

const savedName = () => {
  try {
    return localStorage.getItem('ttta-name') || '';
  } catch {
    return '';
  }
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<TempleWorld | null>(null);
  const netRef = useRef<Net | null>(null);
  const peopleRef = useRef(new Map<string, Person>());
  const selfRef = useRef<string | null>(null);
  const feedRef = useRef<Array<{ name: string; text: string }>>([]);
  const statsRef = useRef<Stats>(EMPTY_STATS);
  const enteredRef = useRef(false);
  const fishSentRef = useRef(0);

  const [glError, setGlError] = useState('');
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState(savedName);
  const [status, setStatus] = useState<NetStatus>('connecting');
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [lines, setLines] = useState<Line[]>([]);
  const [namesOn, setNamesOn] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [composer, setComposer] = useState<null | 'wish' | 'lantern'>(null);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState('');
  const [offering, setOffering] = useState(false);
  const [incenseAt, setIncenseAt] = useState(0);
  const [bellAt, setBellAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [zone, setZone] = useState('');
  const [zoneShow, setZoneShow] = useState(false);
  const [kneeling, setKneeling] = useState(false);
  const [hint, setHint] = useState(true);
  const zoneTimer = useRef<number>(0);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const [look, setLookState] = useState<LookSpec>(() => {
    try {
      const saved = parseLook(localStorage.getItem('ttta-look'));
      if (saved) return saved;
    } catch {
      /* private mode */
    }
    return specFor(Math.random().toString(36));
  });
  const [lookOpen, setLookOpen] = useState(false);
  const [chant, setChant] = useState(false);
  const [taps, setTaps] = useState(0);
  const [auto, setAuto] = useState(false);
  const [bpm, setBpm] = useState(70);
  const [sutras, setSutras] = useState<Sutra[]>(BUILTIN_SUTRAS);
  const [sutraId, setSutraId] = useState(BUILTIN_SUTRAS[0].id);
  const [lineIdx, setLineIdx] = useState(0);
  const [musicOpen, setMusicOpen] = useState(false);
  // two separate music systems: A = background music, B = the recorded temple music the visitor picks
  const [musicA, setMusicA] = useState<{ on: boolean; track: TrackId; vol: number }>({ on: true, track: 'tinh-tam', vol: 0.8 });
  const [musicB, setMusicB] = useState<{ on: boolean; track: TrackId | null; vol: number }>({ on: true, track: null, vol: 0.8 });
  // account and progress
  const [account, setAccount] = useState<Account | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [authMode, setAuthMode] = useState<'guest' | 'login' | 'register'>('guest');
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [gain, setGain] = useState<{ id: number; n: number } | null>(null);
  const [banner, setBanner] = useState('');
  const tokenRef = useRef(savedToken());
  const myLvRef = useRef(1);
  const level = levelOf(profile.xp);
  // seats: 120 cushions, 5 minutes each, a waiting line when all are taken
  const [seatOpen, setSeatOpen] = useState(false);
  const [seatTaken, setSeatTaken] = useState<Record<number, string>>({});
  const [mySeat, setMySeat] = useState(-1);
  const [seatEnds, setSeatEnds] = useState(0);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [seatCool, setSeatCool] = useState(0);
  const seatTakenRef = useRef<Record<number, string>>({});
  const mySeatRef = useRef(-1);
  const sutraRef = useRef<Sutra>(BUILTIN_SUTRAS[0]);
  const lineRef = useRef(0);
  const sutra = sutras.find((s) => s.id === sutraId) ?? sutras[0];
  sutraRef.current = sutra;

  const say = useCallback((l: Omit<Line, 'id'>) => setLines((p) => [...p.slice(-5), { ...l, id: ++lineId }]), []);
  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? '' : t)), 3200);
  }, []);

  const pushBoards = () => worldRef.current?.setBoards(statsRef.current, feedRef.current);
  const applyPeople = () => worldRef.current?.syncPeople([...peopleRef.current.values()]);

  // the 3D hall starts right away so the entrance screen has the hall moving behind it
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    try {
      worldRef.current = new TempleWorld(canvasRef.current, overlayRef.current, {
        onSound: (kind, mine) => {
          if (kind === 'bell') hallAudio.bell(mine ? 1 : 0.35);
          else if (kind === 'fish') hallAudio.fish(mine ? 1 : 0.22);
          else if (mine) hallAudio.chime();
        },
        onSelfOfferDone: () => setOffering(false),
        onZone: (name) => {
          setZone(name);
          setZoneShow(true);
          window.clearTimeout(zoneTimer.current);
          zoneTimer.current = window.setTimeout(() => setZoneShow(false), 2800);
          hallAudio.setZone(name === 'Chánh điện' ? 'hall' : 'yard');
        },
        onKneel: setKneeling,
        onMove: (x, z, r, k) => netRef.current?.move(x, z, r, k),
        onSeated: () => {},
        onStandUp: () => {
          // I got up by myself: give the seat back
          mySeatRef.current = -1;
          setMySeat(-1);
          void netRef.current?.seat(null);
        },
      });
    } catch (err) {
      console.error(err);
      setGlError('Trình duyệt của bạn chưa chạy được 3D (WebGL). Hãy thử Chrome, Edge hoặc Safari mới nhất.');
    }
    return () => {
      netRef.current?.close();
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadExtraSutras().then((extra) => extra.length && setSutras([...BUILTIN_SUTRAS, ...extra]));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!entered) return;
    const id = window.setTimeout(() => setHint(false), 16000);
    return () => window.clearTimeout(id);
  }, [entered]);

  const handleAct = useCallback(
    (e: ActEvent) => {
      const mine = e.id === selfRef.current;
      if (e.type === 'fish' && mine) return; // already played locally
      worldRef.current?.act(e);
      if (e.type === 'wish') {
        feedRef.current = [...feedRef.current.slice(-9), { name: e.name, text: e.text ?? '' }];
        say({ name: e.name, text: e.text ?? '', kind: 'wish' });
        pushBoards();
        if (mine) {
          const topic = detectWish(e.text ?? '');
          if (topic && shouldAnswer(e.name)) {
            window.setTimeout(() => say({ name: TEMPLE_NAME, text: blessingFor(topic, e.name, TEMPLE_NAME), kind: 'blessing' }), 1400);
          }
        }
      } else if (e.type === 'lantern') {
        say({ name: e.name, text: `thả đèn hoa đăng: ${e.text ?? ''}`, kind: 'wish' });
      }
      const key = ({ incense: 'incense', bell: 'bells', wish: 'wishes', lantern: 'lanterns', fish: 'fish', chant: 'chants' } as Partial<Record<ActEvent['type'], keyof Stats>>)[e.type];
      if (key) {
        statsRef.current = { ...statsRef.current, [key]: (statsRef.current[key] ?? 0) + 1 };
        setStats(statsRef.current);
        pushBoards();
      }
    },
    [say]
  );

  const enter = () => {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 24) || 'Khách ghé thăm';
    try {
      localStorage.setItem('ttta-name', clean);
    } catch {
      /* private mode */
    }
    hallAudio.start();
    const net = new Net({
      onHello: (me, people, feed, s, seats) => {
        selfRef.current = me.id;
        seatTakenRef.current = Object.fromEntries(seats.filter((x) => x.id).map((x) => [x.seat, x.id as string]));
        setSeatTaken(seatTakenRef.current);
        worldRef.current?.setSeats(seats);
        mySeatRef.current = -1;
        setMySeat(-1);
        setQueue(null);
        peopleRef.current = new Map(people.map((p) => [p.id, p]));
        worldRef.current?.setSelf(me.id);
        applyPeople();
        statsRef.current = s;
        setStats(s);
        feedRef.current = feed.map((f) => ({ name: f.name, text: f.text }));
        pushBoards();
        if (!enteredRef.current) {
          enteredRef.current = true;
          worldRef.current?.enter();
          setEntered(true);
          say({ name: TEMPLE_NAME, text: `A Di Đà Phật, chào ${me.name} đã ghé thăm.`, kind: 'sys' });
        }
      },
      onJoin: (p) => {
        peopleRef.current.set(p.id, p);
        applyPeople();
      },
      onMoves: (m) => worldRef.current?.applyMoves(m),
      onLook: (d) => {
        const p = peopleRef.current.get(d.id);
        if (p) peopleRef.current.set(d.id, { ...p, l: d.l });
        if (d.id !== selfRef.current) worldRef.current?.applyLook(d.id, d.l);
      },
      onSeat: (s: SeatInfo) => {
        const next = { ...seatTakenRef.current };
        if (s.id) next[s.seat] = s.id;
        else delete next[s.seat];
        seatTakenRef.current = next;
        setSeatTaken(next);
        worldRef.current?.updateSeat(s);
        if (s.id && s.id === selfRef.current && s.left !== undefined) {
          // my seat: walk to the cushion
          mySeatRef.current = s.seat;
          setMySeat(s.seat);
          setSeatEnds(Date.now() + s.left);
          setSeatOpen(false);
          setQueue(null);
          worldRef.current?.walkToSeat(s.seat);
          say({ name: TEMPLE_NAME, text: `Chỗ số ${s.seat + 1} dành cho bạn, được ngồi 5 phút.`, kind: 'sys' });
        } else if (!s.id && s.seat === mySeatRef.current) {
          mySeatRef.current = -1;
          setMySeat(-1);
        }
      },
      onQueue: (q) => setQueue(q.pos > 0 ? q : null),
      onStand: (cooldown) => {
        worldRef.current?.standUp(false);
        mySeatRef.current = -1;
        setMySeat(-1);
        setSeatCool(Date.now() + cooldown);
        flash('Hết 5 phút ngồi rồi, mời bạn đứng dậy nhường chỗ cho người khác nhé.');
        say({ name: TEMPLE_NAME, text: 'Đã hết 5 phút ngồi. Cảm ơn bạn đã nhường chỗ.', kind: 'sys' });
      },
      onLeave: (id) => {
        peopleRef.current.delete(id);
        applyPeople();
      },
      onAct: handleAct,
      onStats: (s) => {
        statsRef.current = s;
        setStats(s);
        pushBoards();
      },
      onProfile: (p, acc) => {
        setProfile(p);
        setAccount(acc);
        myLvRef.current = levelOf(p.xp);
        if (selfRef.current) worldRef.current?.applyLv(selfRef.current, myLvRef.current);
        // ?previewlv=120 shows that level's aura on your own character (only on your screen, nothing is saved)
        const preview = Number(new URLSearchParams(window.location.search).get('previewlv'));
        if (preview >= 1 && preview <= LEVEL_MAX && selfRef.current) worldRef.current?.applyLv(selfRef.current, preview);
        // a saved sign-in that the server no longer knows: forget it
        if (!acc && tokenRef.current) {
          tokenRef.current = '';
          keepAccount('', '');
        }
      },
      onXp: (d) => {
        setProfile(d);
        const id = ++gainId;
        setGain({ id, n: d.gain });
        window.setTimeout(() => setGain((g) => (g && g.id === id ? null : g)), 1400);
      },
      onLevelUp: (lv) => {
        myLvRef.current = lv;
        if (selfRef.current) worldRef.current?.applyLv(selfRef.current, lv);
        setBanner(`Lên cấp ${lv} · ${titleOf(lv)}`);
        window.setTimeout(() => setBanner(''), 4200);
        hallAudio.chime();
        say({ name: TEMPLE_NAME, text: `Chúc mừng ${profileName()} đã lên cấp ${lv}.`, kind: 'sys' });
      },
      onBadge: (bid) => {
        const b = BADGES.find((x) => x.id === bid);
        if (!b) return;
        flash(`Huy hiệu mới: ${b.name}`);
        say({ name: TEMPLE_NAME, text: `${profileName()} nhận huy hiệu "${b.name}".`, kind: 'sys' });
      },
      onLvl: (d) => {
        const p = peopleRef.current.get(d.id);
        if (p) peopleRef.current.set(d.id, { ...p, lv: d.lv });
        if (d.id !== selfRef.current) worldRef.current?.applyLv(d.id, d.lv);
      },
      onStatus: setStatus,
    });
    netRef.current = net;
    net.connect(clean, encodeLook(look), tokenRef.current);
  };
  const profileName = () => peopleRef.current.get(selfRef.current ?? '')?.name ?? 'Bạn';

  // sign in / register finished: remember the token and reload, so the visit starts signed in
  const authed = (token: string, accName: string) => {
    keepAccount(token, accName);
    window.location.reload();
  };
  const signOut = async () => {
    if (tokenRef.current) await authLogout(tokenRef.current);
    keepAccount('', '');
    window.location.reload();
  };

  // ---- actions ----
  const incenseLeft = Math.max(0, Math.ceil((incenseAt + INCENSE_COOLDOWN_MS - now) / 1000));
  const bellLeft = Math.max(0, Math.ceil((bellAt + BELL_COOLDOWN_MS - now) / 1000));

  const lightIncense = async () => {
    if (incenseLeft > 0 || offering) return;
    if (!worldRef.current?.canOffer()) {
      flash('Hãy bước vào chánh điện, lại gần bàn hương rồi thắp nhé.');
      return;
    }
    const r = await netRef.current?.act('incense');
    if (r?.ok) {
      setIncenseAt(Date.now());
      setOffering(true);
    } else if (r?.error) flash(r.error);
  };
  const ringBell = async () => {
    if (bellLeft > 0) return;
    const r = await netRef.current?.act('bell');
    if (r?.ok) setBellAt(Date.now());
    else if (r?.error) flash(r.error);
  };
  const tapFish = useCallback(() => {
    hallAudio.fish(1);
    worldRef.current?.act({ id: selfRef.current ?? '', name: '', type: 'fish', t: Date.now() });
    setTaps((n) => n + 1);
    const next = (lineRef.current + 1) % sutraRef.current.lines.length;
    lineRef.current = next;
    setLineIdx(next);
    if (next === 0) hallAudio.chime(); // one full round finished
    void netRef.current?.act('tap'); // every knock earns merit
    const t = Date.now();
    if (t - fishSentRef.current > 1600) {
      fishSentRef.current = t;
      void netRef.current?.act('fish');
    }
  }, []);
  const sendDraft = async () => {
    const text = draft.trim();
    if (!text || !composer) return;
    const r = await netRef.current?.act(composer, text);
    if (r?.ok) {
      setDraft('');
      setComposer(null);
    } else flash(r?.error ?? 'Chưa gửi được.');
  };

  useEffect(() => {
    if (!auto || !chant) return;
    const id = window.setInterval(tapFish, 60000 / bpm);
    return () => window.clearInterval(id);
  }, [auto, chant, bpm, tapFish]);

  const bow = () => void netRef.current?.act('bow');
  // channel A (background) and channel B (picked recordings) are controlled separately
  const chanA = {
    on: musicA.on,
    setOn: (on: boolean) => {
      setMusicA((m) => ({ ...m, on }));
      hallAudio.setMusicA(on);
    },
    track: musicA.track as TrackId | null,
    setTrack: (id: TrackId) => {
      setMusicA((m) => ({ ...m, track: id, on: true }));
      hallAudio.setTrackA(id);
      hallAudio.setMusicA(true);
    },
    vol: musicA.vol,
    setVol: (vol: number) => {
      setMusicA((m) => ({ ...m, vol }));
      hallAudio.setVolumeA(vol);
    },
  };
  const chanB = {
    on: musicB.on,
    setOn: (on: boolean) => {
      setMusicB((m) => ({ ...m, on }));
      hallAudio.setMusicB(on);
    },
    track: musicB.track,
    setTrack: (id: TrackId) => {
      setMusicB((m) => ({ ...m, track: id, on: true }));
      hallAudio.setTrackB(id);
      hallAudio.setMusicB(true);
    },
    vol: musicB.vol,
    setVol: (vol: number) => {
      setMusicB((m) => ({ ...m, vol }));
      hallAudio.setVolumeB(vol);
    },
  };
  const toggleNames = () => {
    setNamesOn((v) => {
      worldRef.current?.setShowNames(!v);
      return !v;
    });
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const changeLook = (next: LookSpec) => {
    setLookState(next);
    const enc = encodeLook(next);
    try {
      localStorage.setItem('ttta-look', enc);
    } catch {
      /* private mode */
    }
    if (selfRef.current) worldRef.current?.applyLook(selfRef.current, enc);
    netRef.current?.setLook(enc);
  };
  const toggleLookPanel = () => {
    setLookOpen((open) => {
      worldRef.current?.previewSelf(!open);
      return !open;
    });
  };
  const pickSutra = (id: string) => {
    setSutraId(id);
    lineRef.current = 0;
    setLineIdx(0);
  };

  // ---- seats ----
  const seatsFree = MAX_SEATS - Object.keys(seatTaken).length;
  const coolLeft = Math.max(0, Math.ceil((seatCool - now) / 1000));
  const bookSeat = async (i: number) => {
    const holder = seatTakenRef.current[i];
    if (holder === selfRef.current) return;
    // a taken cushion: join the line for exactly this number; a free one: sit there
    const r = await netRef.current?.seat(i, Boolean(holder));
    if (r?.queued) flash(`Đã xếp hàng chờ chỗ số ${i + 1}, bạn đứng thứ ${r.pos}.`);
    else if (r && !r.ok) flash(r.error ?? 'Chưa nhận được chỗ.');
  };
  const nearestSeat = async () => {
    const r = await netRef.current?.seat(undefined, true);
    if (r?.queued) flash(`Chánh điện đủ 120 chỗ. Bạn đã vào hàng chờ, đứng thứ ${r.pos}.`);
    else if (r && !r.ok) flash(r.error ?? 'Chưa nhận được chỗ.');
  };
  const leaveLine = () => {
    void netRef.current?.leaveQueue();
    setQueue(null);
  };
  const giveUpSeat = () => worldRef.current?.standUp(true);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0503] text-[#f5ecde]">
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />

      {glError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 text-center">
          <p className="glass max-w-md rounded-2xl p-6 text-sm leading-relaxed">{glError}</p>
        </div>
      )}

      {/* ---------------- entrance ---------------- */}
      {!entered && !glError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
          <div className="glass rise-in max-h-[94vh] w-full max-w-md overflow-y-auto rounded-[28px] p-7 text-center sm:p-9">
            <div className="font-temple text-[11px] uppercase tracking-[0.35em] text-[#e0b86a]">Mở cửa 24/24</div>
            <h1 className="gold-text font-temple mt-2 text-[34px] font-bold leading-tight sm:text-[40px]">TÂM TỊNH TÂM AN</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-[#e8dcc4]">
              Một chánh điện yên tĩnh trên màn hình của bạn. Ghé thắp một nén hương, rung chuông, gửi một lời nguyện lành cùng mọi người.
            </p>
            {tokenRef.current ? (
              <div className="mt-6 rounded-2xl border border-[#e7b860]/30 bg-black/20 p-3 text-left">
                <div className="text-[12px] text-[#cbbd9f]">Đã đăng nhập sẵn</div>
                <div className="font-temple text-[17px] font-semibold text-[#ffe9a8]">{savedAccountName() || 'Tài khoản của bạn'}</div>
                <button onClick={signOut} className="mt-1 text-[11.5px] text-white/60 underline hover:text-white">Đăng xuất, dùng tài khoản khác</button>
              </div>
            ) : (
              <>
                <div className="mt-5 flex justify-center gap-1.5 text-[12.5px]">
                  {([['guest', 'Chơi khách'], ['login', 'Đăng nhập'], ['register', 'Đăng ký']] as const).map(([m, label]) => (
                    <button key={m} onClick={() => setAuthMode(m)} className={`rounded-full border px-3.5 py-1.5 ${authMode === m ? 'border-[#f0c35a] bg-[#f0c35a]/20 text-[#ffe9a8]' : 'border-white/15 text-white/70'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {authMode === 'guest' ? (
                  <div className="text-left">
                    <label className="mt-4 block text-[12px] font-semibold text-[#e0b86a]">Tên hiện trên đầu bạn</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && enter()}
                      maxLength={24}
                      placeholder="Ví dụ: Mộc An Lành"
                      className="mt-1 w-full rounded-xl border border-[#e7b860]/40 bg-black/30 px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-[#f0c35a]"
                    />
                    <div className="mt-1 text-[11px] text-[#a99c82]">Chơi khách thì cấp độ chỉ tính trong lần ghé này. Đăng ký để lưu lại và lên bảng xếp hạng.</div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <AuthForm mode={authMode} onAuthed={authed} />
                  </div>
                )}
              </>
            )}
            {(tokenRef.current || authMode === 'guest') && (
              <>
                <div className="mt-4 text-left">
                  <div className="mb-1 text-[12px] font-semibold text-[#e0b86a]">Nhân vật và trang phục</div>
                  <LookPicker look={look} onChange={changeLook} level={1} compact />
                </div>
                <button
                  onClick={enter}
                  disabled={status === 'online' && enteredRef.current}
                  className="mt-4 w-full rounded-xl bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] px-4 py-3.5 font-temple text-[16px] font-bold text-[#2a1608] shadow-[0_6px_24px_rgba(240,180,60,0.35)] transition hover:brightness-110 active:scale-[0.98]"
                >
                  Bước vào chánh điện
                </button>
              </>
            )}
            <p className="mt-3 text-[11.5px] text-[#cbbd9f]">Nên bật loa nhỏ để nghe tiếng chuông và nhạc nền.</p>
            <p className="mt-5 border-t border-white/10 pt-4 text-[10.5px] leading-relaxed text-[#a99c82]">
              Đây là không gian thư giãn mang tính giải trí, không phải chùa và không đại diện cho tổ chức tôn giáo nào. Không thu tiền, không nhận quà tặng.
            </p>
          </div>
        </div>
      )}

      {/* ---------------- hud ---------------- */}
      {entered && (
        <>
          <div className="absolute left-3 top-3 z-20 flex flex-col gap-2 sm:left-5 sm:top-5">
            <div className="glass flex items-center gap-3 rounded-full py-2 pl-3 pr-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] text-[#2a1608]">
                <Flame size={16} />
              </span>
              <div className="leading-tight">
                <div className="gold-text font-temple text-[15px] font-bold">{TEMPLE_NAME}</div>
                <div className="text-[10.5px] text-[#cbbd9f]">Không gian thư giãn · mở 24/24</div>
              </div>
            </div>
            <div className="glass flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px]">
              <Users size={14} className="text-[#e0b86a]" />
              <span className={status === 'online' ? 'text-emerald-300' : 'text-amber-300'}>●</span>
              <span>{status === 'solo' ? 'Chế độ một mình' : status === 'reconnecting' ? 'Đang nối lại…' : `${stats.online} người đang ghé thăm`}</span>
            </div>
            {(mySeat >= 0 || queue) && (
              <div className="glass flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px]">
                <Armchair size={14} className="text-[#e0b86a]" />
                {mySeat >= 0 ? (
                  <span>Chỗ số {mySeat + 1} · còn <b className="text-[#ffe9a8]">{clock(Math.max(0, seatEnds - now))}</b></span>
                ) : (
                  <span>Hàng chờ: thứ <b className="text-[#ffe9a8]">{queue!.pos}</b>/{queue!.total}{queue!.want !== null ? ` (chỗ số ${queue!.want + 1})` : ''}</span>
                )}
              </div>
            )}
            <button
              onClick={() => {
                setBoardOpen(false);
                setProfileOpen((v) => !v);
              }}
              className="glass w-52 rounded-2xl px-3 py-2 text-left transition hover:brightness-110"
            >
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="font-semibold text-[#ffe9a8]">Cấp {level} · {titleOf(level)}</span>
                <span className="flex items-center gap-1 text-[#f0a35a]"><Flame size={12} />{profile.streak}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#ffd36b] to-[#f08a4a] transition-all"
                  style={{ width: `${level >= LEVEL_MAX ? 100 : Math.round(((profile.xp - xpForLevel(level)) / Math.max(1, xpForLevel(level + 1) - xpForLevel(level))) * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-[#a99c82]">{account ? account.name : 'Khách: bấm để đăng ký lưu cấp'}</div>
            </button>
          </div>

          <div className="absolute right-3 top-3 z-20 flex gap-1.5 sm:right-5 sm:top-5">
            <div className="glass flex items-center gap-0.5 rounded-full p-1">
              <IconBtn
                label="Bảng vàng tu tập"
                onClick={() => {
                  setMusicOpen(false);
                  setProfileOpen(false);
                  setBoardOpen((v) => !v);
                }}
              >
                <Trophy size={17} />
              </IconBtn>
              <IconBtn
                label="Âm nhạc"
                active={musicA.on || musicB.on}
                onClick={() => {
                  setBoardOpen(false);
                  setMusicOpen((v) => !v);
                }}
              >
                <Music size={17} />
              </IconBtn>
              <IconBtn label="Hiện tên mọi người" active={namesOn} onClick={toggleNames}>
                <Tag size={17} />
              </IconBtn>
              <IconBtn label="Quay camera ra sau lưng nhân vật" onClick={() => worldRef.current?.recenter()}>
                <Crosshair size={17} />
              </IconBtn>
              <IconBtn label="Toàn màn hình" onClick={fullscreen}>
                <Maximize size={17} />
              </IconBtn>
              <IconBtn label="Hướng dẫn" onClick={() => setHelpOpen(true)}>
                <Info size={17} />
              </IconBtn>
            </div>
          </div>

          {status === 'solo' && (
            <div className="glass absolute left-1/2 top-[88px] z-20 w-[min(92vw,460px)] -translate-x-1/2 rounded-xl px-4 py-2 text-center text-[11.5px] text-[#e8dcc4] sm:top-5">
              Máy chủ chưa phản hồi nên bạn đang ở một mình, chưa lưu được cấp độ. Hãy tải lại trang để thử kết nối lại.
            </div>
          )}

          {/* zone name, controls hint, map, touch stick */}
          <div
            className={`pointer-events-none absolute left-1/2 top-[22%] z-20 -translate-x-1/2 text-center transition-opacity duration-700 ${zoneShow ? 'opacity-100' : 'opacity-0'}`}
          >
            <div className="gold-text font-temple text-[34px] font-bold tracking-wide sm:text-[44px]">{zone}</div>
            <div className="mx-auto mt-1 h-px w-40 bg-gradient-to-r from-transparent via-[#f0c35a] to-transparent" />
          </div>
          {hint && (
            <div className="glass rise-in pointer-events-none absolute left-1/2 top-[88px] z-20 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-center text-[12.5px] leading-relaxed text-[#eadfc8] sm:top-5">
              {touch ? 'Cần bên trái để đi · vuốt màn hình để xoay · chụm hai ngón để phóng to' : 'W A S D hoặc mũi tên để đi · Shift để chạy · kéo chuột để xoay · cuộn để phóng to · K để quỳ lạy · bấm xuống sàn để đi tới đó'}
            </div>
          )}
          <MiniMap world={worldRef} />
          {touch && <Joystick onChange={(x, y) => worldRef.current?.setJoystick(x, y)} />}

          {/* feed */}
          <div className={`pointer-events-none absolute left-3 z-20 w-[min(78vw,340px)] sm:left-5 ${touch ? 'bottom-[290px]' : 'bottom-[112px] sm:bottom-[120px]'}`}>
            {lines.slice(-5).map((l) => (
              <div key={l.id} className="feed-line mb-1.5 text-[12.5px] leading-snug">
                <span className={l.kind === 'blessing' ? 'font-semibold text-[#ffe08a]' : 'font-semibold text-[#f0c35a]'}>{l.name}</span>
                <span className="text-[#f5ecde]">{l.kind === 'sys' ? ' ' : ': '}{l.text}</span>
              </div>
            ))}
          </div>

          {toast && (
            <div className="glass rise-in absolute bottom-[150px] left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[12.5px]">{toast}</div>
          )}

          {/* chant: pick a text, tap the wooden fish, one line per tap */}
          {chant && (
            <div className="glass rise-in absolute bottom-[112px] left-1/2 z-30 w-[min(94vw,460px)] -translate-x-1/2 rounded-3xl p-4 text-center sm:bottom-[124px]">
              <button onClick={() => { setChant(false); setAuto(false); }} className="absolute right-3 top-3 text-white/60 hover:text-white" aria-label="Đóng"><X size={16} /></button>
              <div className="font-temple text-[12px] uppercase tracking-[0.25em] text-[#e0b86a]">Tụng kinh, gõ mõ</div>
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {sutras.map((s) => (
                  <button key={s.id} onClick={() => pickSutra(s.id)} className={`shrink-0 rounded-full border px-3 py-1 text-[12px] ${s.id === sutra.id ? 'border-[#f0c35a] bg-[#f0c35a]/20 text-[#ffe9a8]' : 'border-white/15 text-white/70'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-[#a99c82]">{sutra.blurb}</div>
              <div className="font-temple my-3 min-h-[92px]">
                <div className="text-[13px] text-white/30">{sutra.lines[(lineIdx - 1 + sutra.lines.length) % sutra.lines.length]}</div>
                <div className="gold-text my-1 text-[24px] font-bold leading-snug">{sutra.lines[lineIdx % sutra.lines.length]}</div>
                <div className="text-[13px] text-white/30">{sutra.lines[(lineIdx + 1) % sutra.lines.length]}</div>
              </div>
              <button
                onPointerDown={(e) => { e.preventDefault(); tapFish(); }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#e7b860]/60 bg-gradient-to-b from-[#c2762f] to-[#7a3f12] text-[#ffe9b8] shadow-[0_8px_26px_rgba(0,0,0,0.5)] transition active:scale-90"
                aria-label="Gõ mõ"
              >
                <Drum size={34} />
              </button>
              <div className="mt-2 text-[12px] text-[#cbbd9f]">Đã gõ {taps} tiếng · câu {(lineIdx % sutra.lines.length) + 1}/{sutra.lines.length}</div>
              <div className="mt-2 flex items-center justify-center gap-3 text-[12px]">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Gõ tự động</label>
                <label className="flex items-center gap-1.5">Nhịp <input type="range" min={30} max={120} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-24 accent-[#f0c35a]" /></label>
              </div>
            </div>
          )}

          {/* outfit panel: the camera turns to face the character while it is open */}
          {lookOpen && (
            <div className="glass rise-in absolute left-3 top-[150px] z-30 max-h-[calc(100vh-290px)] w-[min(92vw,340px)] overflow-y-auto rounded-3xl p-4 sm:left-5">
              <button onClick={toggleLookPanel} className="absolute right-3 top-3 text-white/60 hover:text-white" aria-label="Đóng"><X size={16} /></button>
              <div className="font-temple mb-2 text-[14px] font-semibold text-[#f0c35a]">Trang phục đi chánh điện</div>
              <LookPicker look={look} onChange={changeLook} level={level} />
            </div>
          )}

          {/* seats: 120 cushions, 5 minutes each, a line when all are taken */}
          {seatOpen && (
            <div className="glass rise-in absolute bottom-[112px] left-1/2 z-30 flex max-h-[62vh] w-[min(96vw,480px)] -translate-x-1/2 flex-col rounded-3xl p-4 sm:bottom-[124px]">
              <button onClick={() => setSeatOpen(false)} className="absolute right-3 top-3 text-white/60 hover:text-white" aria-label="Đóng"><X size={16} /></button>
              <div className="font-temple text-[14px] font-semibold text-[#f0c35a]">Chỗ ngồi trong chánh điện</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[#cbbd9f]">
                Chánh điện có {MAX_SEATS} chỗ, còn <b className="text-[#ffe9a8]">{seatsFree}</b> chỗ trống. Mỗi người ngồi tối đa 5 phút rồi nhường chỗ. Bấm đúng số để ngồi đúng chỗ đó. Chỗ đã có người thì bấm vào để xếp hàng chờ chỗ ấy. Ngoài chỗ ngồi, ai cũng được vào tham quan.
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={nearestSeat} disabled={coolLeft > 0 || mySeat >= 0} className="rounded-xl bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] px-3 py-2 text-[12.5px] font-semibold text-[#2a1608] disabled:opacity-50">
                  {seatsFree > 0 ? 'Nhận chỗ trống gần nhất' : 'Xếp hàng chờ chỗ bất kỳ'}
                </button>
                {mySeat >= 0 && <button onClick={giveUpSeat} className="rounded-xl border border-[#e7b860]/50 px-3 py-2 text-[12.5px] text-[#f0c35a]">Đứng dậy, trả chỗ</button>}
                {queue && <button onClick={leaveLine} className="rounded-xl border border-white/20 px-3 py-2 text-[12.5px] text-white/80">Rời hàng chờ</button>}
              </div>
              {coolLeft > 0 && <div className="mt-1 text-[11px] text-amber-300">Bạn vừa ngồi xong, chờ {coolLeft} giây nữa để ngồi lại.</div>}
              <div className="mt-3 overflow-y-auto">
                <div className="mb-1 text-center text-[10px] uppercase tracking-widest text-[#e0b86a]/70">Phía bàn thờ</div>
                {SEAT_ROWS.map((row, r) => (
                  <div key={r} className="mb-1 flex justify-center gap-1">
                    {row.map((i, k) => {
                      const holder = seatTaken[i];
                      const cls = holder ? (holder === selfRef.current ? 'bg-emerald-400 text-black' : 'bg-[#7a2a22]/80 text-[#ffb3a6]') : 'border border-[#f0c35a]/60 text-[#ffe9a8] hover:bg-[#f0c35a]/20';
                      return (
                        <button key={i} onClick={() => bookSeat(i)} title={holder ? (holder === selfRef.current ? 'Chỗ của bạn' : 'Có người ngồi, bấm để xếp hàng chờ') : 'Còn trống'} className={`h-7 w-7 rounded-md text-[10.5px] font-semibold ${k === 5 ? 'ml-3' : ''} ${cls}`}>
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* music: two separate systems, each with its own switch and volume */}
          {musicOpen && <MusicPanel a={chanA} b={chanB} onClose={() => setMusicOpen(false)} />}
          {profileOpen && (
            <ProfilePanel
              profile={profile}
              account={account}
              onClose={() => setProfileOpen(false)}
              onSignUp={() => {
                setProfileOpen(false);
                setAuthOpen(true);
              }}
              onSignOut={signOut}
            />
          )}
          {boardOpen && <BoardPanel token={tokenRef.current} onClose={() => setBoardOpen(false)} />}
          {authOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setAuthOpen(false)}>
              <div className="glass rise-in relative w-full max-w-sm rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
                <Close onClick={() => setAuthOpen(false)} />
                <div className="gold-text font-temple mb-3 text-[20px] font-bold">Đăng ký để lưu cấp độ</div>
                <AuthForm mode="register" guestId={selfRef.current ?? undefined} onAuthed={authed} />
              </div>
            </div>
          )}
          {gain && (
            <div key={gain.id} className="feed-line pointer-events-none absolute left-1/2 top-[34%] z-30 -translate-x-1/2 font-temple text-[22px] font-bold text-[#ffe08a] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              +{gain.n} công đức
            </div>
          )}
          {banner && (
            <div className="rise-in pointer-events-none absolute left-1/2 top-[26%] z-40 -translate-x-1/2 text-center">
              <div className="gold-text font-temple text-[34px] font-bold sm:text-[46px]">{banner}</div>
              <div className="mx-auto mt-1 h-px w-56 bg-gradient-to-r from-transparent via-[#f0c35a] to-transparent" />
            </div>
          )}

          {/* wish / lantern composer */}
          {composer && (
            <div className="glass rise-in absolute bottom-[112px] left-1/2 z-30 w-[min(94vw,430px)] -translate-x-1/2 rounded-3xl p-4 sm:bottom-[124px]">
              <button onClick={() => setComposer(null)} className="absolute right-3 top-3 text-white/60 hover:text-white" aria-label="Đóng"><X size={16} /></button>
              <div className="font-temple text-[13px] font-semibold text-[#f0c35a]">{composer === 'wish' ? 'Gửi một lời nguyện lành' : 'Thả một chiếc đèn hoa đăng'}</div>
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendDraft()}
                  maxLength={composer === 'wish' ? 90 : 60}
                  placeholder={composer === 'wish' ? 'Con mong gia đình luôn bình an…' : 'Ghi một điều tốt lành…'}
                  className="min-w-0 flex-1 rounded-xl border border-[#e7b860]/40 bg-black/30 px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-[#f0c35a]"
                />
                <button onClick={sendDraft} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] px-4 font-semibold text-[#2a1608]">
                  <Send size={15} /> Gửi
                </button>
              </div>
              <div className="mt-2 text-[10.5px] text-[#a99c82]">Mọi người trong chánh điện sẽ thấy. Vui lòng không ghi liên kết hay số điện thoại.</div>
            </div>
          )}

          {/* action bar */}
          <div className="absolute bottom-[max(14px,env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2">
            <div className="glass flex max-w-[96vw] items-center gap-0.5 overflow-x-auto rounded-[26px] p-1.5">
              <ActBtn icon={<Heart size={22} />} label="Lạy Phật" onClick={bow} />
              <ActBtn icon={<PersonStanding size={22} />} label={kneeling ? 'Đứng dậy' : 'Quỳ lạy'} active={kneeling} onClick={() => worldRef.current?.toggleKneel()} />
              <ActBtn icon={<Flame size={22} />} label={offering ? 'Đang thắp…' : incenseLeft > 0 ? `${incenseLeft}s` : 'Thắp hương'} disabled={incenseLeft > 0 || offering} onClick={lightIncense} />
              <ActBtn icon={<Bell size={22} />} label={bellLeft > 0 ? `${bellLeft}s` : 'Rung chuông'} disabled={bellLeft > 0} onClick={ringBell} />
              <ActBtn icon={<Drum size={22} />} label="Tụng kinh" active={chant} onClick={() => { setComposer(null); setSeatOpen(false); setChant((v) => !v); }} />
              <ActBtn icon={<Armchair size={22} />} label={mySeat >= 0 ? `Chỗ ${mySeat + 1}` : queue ? `Chờ #${queue.pos}` : 'Chỗ ngồi'} active={seatOpen || mySeat >= 0} onClick={() => { setComposer(null); setChant(false); setSeatOpen((v) => !v); }} />
              <ActBtn icon={<Shirt size={22} />} label="Trang phục" active={lookOpen} onClick={toggleLookPanel} />
              <ActBtn icon={<PenLine size={22} />} label="Lời nguyện" active={composer === 'wish'} onClick={() => { setChant(false); setComposer((c) => (c === 'wish' ? null : 'wish')); }} />
              <ActBtn icon={<Lamp size={22} />} label="Đèn hoa đăng" active={composer === 'lantern'} onClick={() => { setChant(false); setComposer((c) => (c === 'lantern' ? null : 'lantern')); }} />
            </div>
            <p className="mt-1.5 text-center text-[9.5px] text-white/45">Không gian thư giãn mang tính giải trí · không phải chùa, không đại diện tổ chức tôn giáo nào</p>
          </div>

          {helpOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setHelpOpen(false)}>
              <div className="glass rise-in w-full max-w-md rounded-3xl p-6 text-[13.5px] leading-relaxed" onClick={(e) => e.stopPropagation()}>
                <div className="gold-text font-temple mb-2 text-[20px] font-bold">Cách ghé chánh điện</div>
                <ul className="list-disc space-y-1.5 pl-5 text-[#eadfc8]">
                  <li>Bạn tự điều khiển nhân vật: phím W A S D hoặc mũi tên để đi, Shift để chạy, bấm xuống sàn để đi tới đó (điện thoại dùng cần bên trái).</li>
                  <li>Kéo chuột (hoặc vuốt) để xoay camera, cuộn (hoặc chụm hai ngón) để phóng to, thu nhỏ. Phím K để quỳ lạy hoặc đứng dậy.</li>
                  <li>Bước ra cửa là sân vườn có ao sen, hành lang đi dạo và cổng tam quan. Bản đồ nhỏ góc phải cho biết bạn đang ở đâu.</li>
                  <li><b>Thắp hương</b>: đứng gần bàn hương trong chánh điện, nhân vật sẽ đi tới vái, lạy ba lạy rồi cắm hương. Mỗi 40 giây một lần.</li>
                  <li><b>Rung chuông</b>: cả chánh điện cùng nghe tiếng chuông.</li>
                  <li><b>Gõ mõ</b>: gõ theo nhịp, niệm "Nam mô A Di Đà Phật" cho lòng lắng lại.</li>
                  <li><b>Lời nguyện, đèn hoa đăng</b>: một điều tốt lành bạn muốn gửi, mọi người cùng thấy.</li>
                  <li>Những bạn ngồi không có tên là nhân vật trang trí cho chánh điện đỡ vắng, không tính vào số người đang online.</li>
                </ul>
                <button onClick={() => setHelpOpen(false)} className="mt-5 w-full rounded-xl border border-[#e7b860]/50 py-2.5 font-semibold text-[#f0c35a] hover:bg-white/5">Đã hiểu</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MiniMap({ world }: { world: RefObject<TempleWorld | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const px = (x: number) => ((x + 20) / 40) * W;
    const pz = (z: number) => ((z + 16) / 78) * H;
    const rect = (x0: number, x1: number, z0: number, z1: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
    };
    const draw = () => {
      g.clearRect(0, 0, W, H);
      rect(-20, 20, 15, 61, '#1c3322');
      rect(-2.6, 2.6, 15, 59, '#8a8479');
      rect(-12.6, -3.6, 24, 44, '#1d4a58');
      rect(3.6, 12.6, 24, 44, '#1d4a58');
      rect(-19.4, -15.2, 15.5, 59, '#5a3a22');
      rect(15.2, 19.4, 15.5, 59, '#5a3a22');
      rect(-9.2, 9.2, -16, 14.4, '#7a2e1c');
      rect(-1, 1, -16, 14.4, '#a8221c');
      rect(-8, 8, 59.6, 61, '#e0b04a');
      for (const p of world.current?.getMapPoints() ?? []) {
        g.beginPath();
        g.fillStyle = p.self ? '#ffd36b' : '#ffffff';
        g.arc(px(p.x), pz(p.z), p.self ? 4 : 2.2, 0, Math.PI * 2);
        g.fill();
        if (p.self) {
          g.strokeStyle = '#2a1608';
          g.lineWidth = 1.5;
          g.stroke();
        }
      }
    };
    draw();
    const id = window.setInterval(draw, 120);
    return () => window.clearInterval(id);
  }, [world]);
  return <canvas ref={ref} width={80} height={156} className="glass absolute right-3 top-[64px] z-20 rounded-xl sm:right-5 sm:top-[76px]" />;
}

function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number } | null>(null);
  const R = 46;
  const update = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / R, -dy / R);
  };
  const release = () => {
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };
  return (
    <div
      className="absolute bottom-[130px] left-5 z-30 h-[120px] w-[120px] touch-none rounded-full border border-[#e7b860]/40 bg-black/25 backdrop-blur-sm"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        update(e);
      }}
      onPointerMove={update}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-gradient-to-b from-[#ffe9a8] to-[#d9a03a] opacity-90"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function LookPicker({ look, onChange, compact, level = 1 }: { look: LookSpec; onChange: (l: LookSpec) => void; compact?: boolean; level?: number }) {
  const outfit = OUTFITS[look.o];
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12px] ${on ? 'border-[#f0c35a] bg-[#f0c35a]/20 text-[#ffe9a8]' : 'border-white/15 text-white/70 hover:bg-white/5'}`;
  const dot = (on: boolean) => `h-6 w-6 rounded-full border-2 ${on ? 'border-white' : 'border-white/20'}`;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const setGender = (g: number) => onChange({ ...look, g, h: HAIR_FOR[g].includes(look.h) ? look.h : HAIR_FOR[g][0] });
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-1.5">
        {GENDERS.map((name, g) => (
          <button key={name} onClick={() => setGender(g)} className={chip(look.g === g)}>{name}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OUTFITS.map((o, i) => (
          <button key={o.id} onClick={() => onChange({ ...look, o: i })} className={chip(look.o === i)}>{o.name}</button>
        ))}
      </div>
      {!compact && <div className="text-[11px] text-[#a99c82]">{outfit.desc}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-[11px] text-[#cbbd9f]">Nón lá</span>
        {HATS.map((h) => {
          const locked = h.min > level;
          return (
            <button
              key={h.id}
              disabled={locked}
              title={locked ? `Mở khóa ở cấp ${h.min}` : h.name}
              onClick={() => onChange({ ...look, n: h.id })}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] ${look.n === h.id ? 'border-[#f0c35a] bg-[#f0c35a]/20 text-[#ffe9a8]' : 'border-white/15 text-white/70'} ${locked ? 'opacity-40' : 'hover:bg-white/5'}`}
            >
              {locked && <Lock size={10} />}
              {h.id === 0 ? 'Không đội' : `${h.name}${locked ? ` · cấp ${h.min}` : ''}`}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 text-[11px] text-[#cbbd9f]">Màu áo</span>
        {outfit.colors.map((c, i) => (
          <button key={c.name} title={c.name} onClick={() => onChange({ ...look, c: i })} className={dot(look.c === i)} style={{ background: hex(c.hex) }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-16 text-[11px] text-[#cbbd9f]">Tóc</span>
        {HAIR_FOR[look.g].map((h) => (
          <button key={h} onClick={() => onChange({ ...look, h })} className={chip(look.h === h)}>{HAIR_STYLES[h]}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 text-[11px] text-[#cbbd9f]">Màu da</span>
        {SKIN_TONES.map((s, i) => (
          <button key={s} onClick={() => onChange({ ...look, s: i })} className={dot(look.s === i)} style={{ background: hex(s) }} />
        ))}
      </div>
    </div>
  );
}
function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 ${active === false ? 'text-white/40' : 'text-[#fbe7b8]'}`}
    >
      {children}
    </button>
  );
}

function ActBtn({ icon, label, onClick, disabled, active }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`act-btn ${active ? 'bg-[#f0c35a]/20' : ''}`}>
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
