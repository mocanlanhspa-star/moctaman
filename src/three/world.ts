import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildHall, seatPos, SPOTS, MAX_SEATS, type Hall } from './hall';
import { buildYard, type Yard } from './yard';
import { Chibi, lookFor, lookOf } from './chibi';
import { slideMove, walkable, zoneAt, setDynamicObstacles, type ZoneName } from './walk';
import { ROW_GAP, seatXZ } from '../layout';
import { tierOf } from '../progress';
import type { ActEvent, Person, SeatInfo } from '../net';

export type WorldCallbacks = {
  onSound(kind: 'bell' | 'fish' | 'chime', mine: boolean): void;
  onSelfOfferDone(): void;
  onZone(name: ZoneName): void;
  onKneel(kneeling: boolean): void;
  /** the player reached the seat they booked */
  onSeated(seat: number): void;
  /** the player got up by themselves (moved or pressed K): tell the server to free the seat */
  onStandUp(): void;
  /** the player's own position, a few times a second, for other visitors to see */
  onMove(x: number, z: number, r: number, k: boolean): void;
};

type Entry = {
  person: Person;
  chibi: Chibi;
  tx: number;
  tz: number;
  tr: number;
  tk: boolean;
  plate?: HTMLElement;
  bubble?: HTMLElement;
  bubbleUntil: number;
  spot: number;
};

const BUBBLE_MS = 9000;
const WALK = 2.1;
const RUN = 3.9;
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class TempleWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private hall: Hall;
  private yard: Yard;
  private entries = new Map<string, Entry>();
  private ambient = new Map<number, Chibi>();
  private selfId: string | null = null;
  private selfRing?: THREE.Mesh;
  private playerLight = new THREE.PointLight(0xffc27a, 9, 9, 2);
  private showNames = true;
  private clock = new THREE.Clock();
  private raf = 0;
  private frame = 0;
  private low: boolean;
  private ro: ResizeObserver;
  private tmp = new THREE.Vector3();
  private mode: 'intro' | 'play' = 'intro';

  // player + camera rig
  private player = new THREE.Vector3(0, 0, 17.2);
  private playerRot = Math.PI;
  private kneeling = false;
  private yaw = 0;
  private pitch = 0.36;
  private dist = 5.6;
  private camTarget = new THREE.Vector3(0, 1.3, 13);
  private keys = new Set<string>();
  private joy = new THREE.Vector2();
  private moveTarget: { x: number; z: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private downAt = { x: 0, y: 0, t: 0, moved: 0 };
  private lastSend = 0;
  private lastSent = { x: 0, z: 0, r: 0, k: false };
  // seats: who holds which of the 120 cushions, and my own booking
  private seatOcc = new Map<number, string>();
  private ambientSeats: number[] = [];
  private mySeat = -1;
  private seated = false;
  private autoPath: THREE.Vector3[] = [];
  private kneelSince = 0;
  private zone: ZoneName | null = null;
  private zoneT = 0;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLElement, private cb: WorldCallbacks) {
    this.low = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.hall = buildHall(this.scene, this.renderer, this.low);
    this.yard = buildYard(this.scene, this.low);
    this.scene.add(this.playerLight);

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: this.low ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), this.low ? 0.3 : 0.38, 0.6, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // decorative kneelers on some cushions keep the hall from looking empty; they block the way like real people
    const ids = Array.from({ length: MAX_SEATS }, (_, i) => i);
    let s = 7;
    for (let i = ids.length - 1; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const spots = ids.slice(0, this.low ? 12 : 30);
    for (const seat of spots) {
      const c = new Chibi(lookFor(`amb${seat}`));
      c.kneelAt(seatPos(seat));
      this.scene.add(c.root);
      this.ambient.set(seat, c);
    }
    this.ambientSeats = spots;
    this.refreshSeats();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ public api
  setSelf(id: string | null) {
    this.selfId = id;
    this.selfRing?.removeFromParent();
    this.selfRing = undefined;
    const e = id ? this.entries.get(id) : undefined;
    if (e) this.adoptSelf(e);
    this.refreshSeats();
  }

  setShowNames(on: boolean) {
    this.showNames = on;
  }

  /** The visitor pressed "enter": hand over the camera and the controls */
  enter() {
    this.mode = 'play';
    this.yaw = 0;
    this.pitch = 0.36;
    this.dist = 5.6;
  }

  recenter() {
    // turn the camera to look the way the character faces
    this.yaw = this.playerRot + Math.PI;
    this.pitch = 0.36;
    this.dist = 5.6;
  }

  setJoystick(x: number, y: number) {
    this.joy.set(x, y);
  }

  toggleKneel() {
    if (this.mySeat >= 0) {
      this.standUp(true); // K while seated = get up and give the seat back
      return;
    }
    this.setKneelState(!this.kneeling);
  }

  /** Initial picture of the 120 seats, then one change at a time */
  setSeats(list: SeatInfo[]) {
    this.seatOcc.clear();
    for (const s of list) if (s.id) this.seatOcc.set(s.seat, s.id);
    this.refreshSeats();
  }
  updateSeat(s: SeatInfo) {
    if (s.id) this.seatOcc.set(s.seat, s.id);
    else this.seatOcc.delete(s.seat);
    this.refreshSeats();
  }

  /** My booking was accepted: walk in through the door and along the row to the cushion, then kneel there */
  walkToSeat(seat: number) {
    this.mySeat = seat;
    this.seated = false;
    this.moveTarget = null;
    this.setKneelState(false);
    const sp = seatXZ(seat);
    const laneZ = sp.z + ROW_GAP * 0.5;
    const p = this.player;
    const pts: THREE.Vector3[] = [];
    if (p.z > 14.2) pts.push(new THREE.Vector3(0, 0, Math.max(p.z, 15.6)), new THREE.Vector3(0, 0, 13.2));
    else pts.push(new THREE.Vector3(0, 0, p.z));
    pts.push(new THREE.Vector3(0, 0, laneZ), new THREE.Vector3(sp.x, 0, laneZ), new THREE.Vector3(sp.x, 0, sp.z));
    this.autoPath = pts;
  }

  /** The server asked me to stand (5 minutes are up) or I got up myself */
  standUp(voluntary: boolean) {
    const had = this.mySeat >= 0;
    this.mySeat = -1;
    this.seated = false;
    this.autoPath = [];
    this.setKneelState(false);
    if (had && voluntary) this.cb.onStandUp();
  }

  private refreshSeats() {
    // a decorative kneeler gives way as soon as a real person books its cushion
    for (const seat of this.ambientSeats) {
      const c = this.ambient.get(seat);
      if (c && this.seatOcc.has(seat)) {
        this.scene.remove(c.root);
        this.ambient.delete(seat);
      }
    }
    setDynamicObstacles([...this.ambient.keys()].map((seat) => ({ ...seatXZ(seat), r: 0.5 })));
    const taken: Record<number, 'me' | 'other'> = {};
    for (const [seat, id] of this.seatOcc) taken[seat] = id === this.selfId ? 'me' : 'other';
    this.hall.setSeatNumbers(taken);
  }

  canOffer() {
    return this.player.z < 14 && Math.hypot(this.player.x, this.player.z + 5.5) < 8.5;
  }

  getMapPoints() {
    const out: Array<{ x: number; z: number; self: boolean }> = [];
    for (const [id, e] of this.entries) out.push({ x: e.chibi.root.position.x, z: e.chibi.root.position.z, self: id === this.selfId });
    return out;
  }

  setBoards(s: { online: number; incense: number; wishes: number; visitors: number }, feed: Array<{ name: string; text: string }>) {
    this.hall.setBoards(s, feed);
  }

  syncPeople(list: Person[]) {
    const wanted = new Set(list.map((p) => p.id));
    for (const [id, e] of this.entries) {
      if (wanted.has(id)) continue;
      this.removeEntry(e);
      this.entries.delete(id);
    }
    for (const p of list) {
      if (this.entries.has(p.id)) continue;
      const chibi = new Chibi(lookOf(p.id, p.l));
      chibi.root.position.set(p.x, 0, p.z);
      chibi.root.rotation.y = p.r;
      chibi.enterFree(p.k);
      chibi.setTier(tierOf(p.lv ?? 1));
      const e: Entry = { person: p, chibi, tx: p.x, tz: p.z, tr: p.r, tk: p.k, bubbleUntil: 0, spot: -1 };
      this.entries.set(p.id, e);
      this.scene.add(chibi.root);
      if (p.id === this.selfId) this.adoptSelf(e);
    }
  }

  /** Someone's level changed: their aura follows */
  applyLv(id: string, lv: number) {
    this.entries.get(id)?.chibi.setTier(tierOf(lv));
  }

  /** Someone (or me) changed clothes */
  applyLook(id: string, l: string) {
    const e = this.entries.get(id);
    if (!e) return;
    e.person = { ...e.person, l };
    e.chibi.setLook(lookOf(id, l));
  }

  private saved = { yaw: 0, pitch: 0.36, dist: 5.6 };
  /** Camera swings round to face my character, close up, while the outfit panel is open */
  previewSelf(on: boolean) {
    if (on) {
      this.saved = { yaw: this.yaw, pitch: this.pitch, dist: this.dist };
      this.yaw = this.playerRot + 1.3; // three-quarter view from the side, so the camera stays clear of the hall wall
      this.pitch = 0.14;
      this.dist = 4.6;
    } else {
      this.yaw = this.saved.yaw;
      this.pitch = this.saved.pitch;
      this.dist = this.saved.dist;
    }
  }

  applyMoves(moves: Array<[string, number, number, number, number]>) {
    for (const [id, x, z, r, k] of moves) {
      if (id === this.selfId) continue;
      const e = this.entries.get(id);
      if (!e) continue;
      e.tx = x;
      e.tz = z;
      e.tr = r;
      e.tk = k === 1;
    }
  }

  act(ev: ActEvent) {
    const e = this.entries.get(ev.id);
    const mine = ev.id === this.selfId;
    if (ev.type === 'bell') {
      this.hall.ringBell();
      this.cb.onSound('bell', mine);
    } else if (ev.type === 'fish') {
      this.hall.tapFish();
      this.cb.onSound('fish', mine);
    } else if (!e) {
      return;
    } else if (ev.type === 'bow') {
      e.chibi.bow();
    } else if (ev.type === 'incense') {
      this.startOffer(e, mine);
    } else if (ev.type === 'wish' || ev.type === 'lantern') {
      this.showBubble(e, ev.text ?? '');
      if (ev.type === 'lantern') this.hall.releaseLantern(e.chibi.root.position, e.person.name);
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    for (const e of this.entries.values()) this.removeEntry(e);
    this.entries.clear();
    this.hall.dispose();
    this.yard.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ input
  private typing() {
    const t = document.activeElement?.tagName;
    return t === 'INPUT' || t === 'TEXTAREA';
  }
  /** Same id whether the browser reports a physical key code or only the typed character */
  private keyId(e: KeyboardEvent) {
    if (e.code) return e.code;
    return e.key.length === 1 ? `Key${e.key.toUpperCase()}` : e.key === 'Shift' ? 'ShiftLeft' : e.key;
  }
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.typing() || e.ctrlKey || e.metaKey) return;
    const id = this.keyId(e);
    if (id === 'KeyK') {
      if (!e.repeat) this.toggleKneel();
      return;
    }
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(id)) {
      this.keys.add(id);
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(this.keyId(e));
  private onBlur = () => this.keys.clear();

  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.downAt.moved += Math.abs(dx) + Math.abs(dy);
      if (this.mode === 'play') {
        this.yaw -= dx * 0.0055;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.08, 1.25);
      }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.dist = THREE.MathUtils.clamp(this.dist - (d - this.pinch) * 0.02, 2.4, 10);
      this.pinch = d;
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const quick = performance.now() - this.downAt.t < 320 && this.downAt.moved < 8;
    if (quick && this.pointers.size === 0 && this.mode === 'play') this.clickToMove(e.clientX, e.clientY);
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.004, 2.4, 10);
  };

  private clickToMove(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.tmp);
    if (hit && walkable(hit.x, hit.z)) this.moveTarget = { x: hit.x, z: hit.z };
  }

  // ------------------------------------------------------------------ internals
  private adoptSelf(e: Entry) {
    this.player.set(e.person.x, 0, e.person.z);
    this.playerRot = e.person.r;
    this.camTarget.set(e.person.x, 1.3, e.person.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.56, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false })
    );
    ring.position.y = 0.02;
    e.chibi.root.add(ring);
    this.selfRing = ring;
  }

  private removeEntry(e: Entry) {
    e.plate?.remove();
    e.bubble?.remove();
    e.chibi.dispose();
    this.scene.remove(e.chibi.root);
  }

  private setKneelState(k: boolean) {
    const me = this.selfId ? this.entries.get(this.selfId) : undefined;
    if (!me || me.chibi.busy || this.kneeling === k) return;
    this.kneeling = k;
    if (k) this.kneelSince = performance.now();
    me.chibi.setKneel(k);
    this.cb.onKneel(k);
  }

  private startOffer(e: Entry, mine: boolean) {
    if (e.chibi.busy) return;
    if (mine) {
      if (this.mySeat >= 0) this.standUp(true); // lighting incense means leaving the seat
      this.setKneelState(false);
    }
    const used = new Set([...this.entries.values()].filter((o) => o !== e && o.chibi.busy).map((o) => o.spot));
    e.spot = Math.max(0, SPOTS.findIndex((_, i) => !used.has(i)));
    const p = e.chibi.root.position;
    const front = new THREE.Vector3(0, 0, -5.35);
    const there: THREE.Vector3[] = [];
    const back: THREE.Vector3[] = [front];
    if (p.z > -4.8) {
      there.push(new THREE.Vector3(0, 0, p.z));
      back.push(new THREE.Vector3(0, 0, p.z));
    }
    there.push(front, SPOTS[e.spot]);
    back.push(new THREE.Vector3(p.x, 0, p.z));
    this.moveTarget = null;
    e.chibi.offer(there, back, {
      onPlant: () => {
        this.hall.plantIncense();
        this.cb.onSound('chime', mine);
      },
      onDone: () => {
        e.spot = -1;
        if (mine) {
          this.player.set(e.chibi.root.position.x, 0, e.chibi.root.position.z);
          this.cb.onSelfOfferDone();
        }
      },
    });
  }

  private showBubble(e: Entry, text: string) {
    if (!text) return;
    if (!e.bubble) {
      e.bubble = document.createElement('div');
      e.bubble.className = 'bubble';
      this.overlay.appendChild(e.bubble);
    }
    e.bubble.textContent = text;
    e.bubble.style.opacity = '1';
    e.bubbleUntil = performance.now() + BUBBLE_MS;
  }

  private resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    const pr = Math.min(window.devicePixelRatio || 1, this.low ? 1.25 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.75 ? 72 : aspect < 1.1 ? 62 : 55;
    this.camera.updateProjectionMatrix();
    this.hall.setViewport(h * pr, THREE.MathUtils.degToRad(this.camera.fov));
  }

  private updatePlayer(dt: number) {
    const me = this.selfId ? this.entries.get(this.selfId) : undefined;
    if (!me) return;
    if (me.chibi.busy) {
      this.player.set(me.chibi.root.position.x, 0, me.chibi.root.position.z);
      this.playerRot = me.chibi.root.rotation.y;
      return;
    }
    let ix = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    let iz = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + this.joy.y;
    const manual = Math.hypot(ix, iz) > 0.08;
    if (this.autoPath.length || this.seated) {
      if (manual) this.standUp(true); // moving by yourself cancels the booking
      else {
        this.followSeatPath(me, dt);
        return;
      }
    }
    let wx = 0;
    let wz = 0;
    let power = 1;
    if (manual) {
      this.moveTarget = null;
      const len = Math.hypot(ix, iz);
      const m = Math.min(1, len);
      ix /= len;
      iz /= len;
      // forward = away from the camera, right = to its right
      wx = -Math.sin(this.yaw) * iz + Math.cos(this.yaw) * ix;
      wz = -Math.cos(this.yaw) * iz - Math.sin(this.yaw) * ix;
      power = m;
    } else if (this.moveTarget) {
      const dx = this.moveTarget.x - this.player.x;
      const dz = this.moveTarget.z - this.player.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) this.moveTarget = null;
      else {
        wx = dx / d;
        wz = dz / d;
      }
    }
    let moved = false;
    if (wx || wz) {
      if (this.kneeling) this.setKneelState(false);
      const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? RUN : WALK) * power;
      const [nx, nz] = slideMove(this.player.x, this.player.z, wx * speed * dt, wz * speed * dt);
      moved = Math.hypot(nx - this.player.x, nz - this.player.z) > 1e-4;
      if (!moved) this.moveTarget = null;
      this.player.set(nx, 0, nz);
      this.playerRot += angDiff(this.playerRot, Math.atan2(wx, wz)) * Math.min(1, dt * 12);
    }
    me.chibi.root.position.copy(this.player);
    me.chibi.root.position.y = this.kneeling && this.player.z < 14 ? 0.07 : 0;
    me.chibi.root.rotation.y = this.playerRot;
    me.chibi.moving = moved;
  }

  /** Walk the booked route to the cushion by themselves (no collision check: the route is clear), then kneel */
  private followSeatPath(me: Entry, dt: number) {
    if (this.autoPath.length) {
      const to = this.autoPath[0];
      const dx = to.x - this.player.x;
      const dz = to.z - this.player.z;
      const d = Math.hypot(dx, dz);
      const step = WALK * 1.5 * dt;
      if (d <= step) {
        this.player.set(to.x, 0, to.z);
        this.autoPath.shift();
      } else {
        this.player.x += (dx / d) * step;
        this.player.z += (dz / d) * step;
        this.playerRot += angDiff(this.playerRot, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
      }
      me.chibi.root.position.copy(this.player);
      me.chibi.root.rotation.y = this.playerRot;
      me.chibi.moving = true;
      if (!this.autoPath.length) {
        this.seated = true;
        this.playerRot = Math.PI;
        me.chibi.root.rotation.y = Math.PI;
        me.chibi.moving = false;
        this.setKneelState(true);
        this.cb.onSeated(this.mySeat);
      }
    } else {
      me.chibi.root.position.set(this.player.x, 0.07, this.player.z);
      me.chibi.moving = false;
    }
  }

  private updateRemotes(dt: number) {
    for (const [id, e] of this.entries) {
      if (id === this.selfId || e.chibi.busy) continue;
      const p = e.chibi.root.position;
      const dx = e.tx - p.x;
      const dz = e.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 8) p.set(e.tx, 0, e.tz);
      else {
        const k = Math.min(1, dt * 7);
        p.x += dx * k;
        p.z += dz * k;
      }
      p.y += ((e.tk && p.z < 14 ? 0.07 : 0) - p.y) * Math.min(1, dt * 8); // a kneeler in the hall sits on the cushion
      const moving = d > 0.07;
      e.chibi.moving = moving;
      const rot = moving ? Math.atan2(dx, dz) : e.tr;
      e.chibi.root.rotation.y += angDiff(e.chibi.root.rotation.y, rot) * Math.min(1, dt * 10);
      e.chibi.setKneel(e.tk);
    }
  }

  private updateCamera(dt: number, t: number) {
    if (this.mode === 'intro') {
      this.camera.position.set(Math.sin(t * 0.12) * 3.2, 3.2 + Math.sin(t * 0.09) * 0.4, 11.4 - Math.cos(t * 0.1) * 0.8);
      this.camera.lookAt(0, 2.2, -9);
      return;
    }
    const lift = this.kneeling ? 0.85 : 1.25;
    this.camTarget.lerp(this.tmp.set(this.player.x, lift, this.player.z), 1 - Math.exp(-dt * 9));
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // pull the camera in along its line until it is not inside a wall, the ceiling or the roof
    const pos = new THREE.Vector3();
    let d = this.dist;
    for (let i = 0; i < 16; i++) {
      pos.copy(dir).multiplyScalar(d).add(this.camTarget);
      if (this.cameraFits(pos)) break;
      d *= 0.88;
    }
    pos.y = Math.max(pos.y, 0.45);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.camTarget);
  }

  private cameraFits(p: THREE.Vector3) {
    if (Math.abs(p.x) > 19.6 || p.z > 62 || p.z < -15.4 || p.y > 14) return false;
    if (this.player.z < 14.2) return p.z <= 13.7 && Math.abs(p.x) <= 8.6 && p.y <= 7.2; // inside the hall
    if (this.player.z > 15.4) return p.z >= 15.6; // never peek from inside the hall wall
    return true;
  }

  private place(el: HTMLElement, head: THREE.Vector3, dy: number, scale: number) {
    this.tmp.copy(head).project(this.camera);
    if (this.tmp.z > 1 || this.tmp.z < -1) {
      el.style.visibility = 'hidden';
      return false;
    }
    const x = (this.tmp.x * 0.5 + 0.5) * this.overlay.clientWidth;
    const y = (-this.tmp.y * 0.5 + 0.5) * this.overlay.clientHeight + dy;
    el.style.visibility = 'visible';
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(${scale.toFixed(2)})`;
    return true;
  }

  private updateOverlay(now: number) {
    const head = new THREE.Vector3();
    for (const [id, e] of this.entries) {
      const mine = id === this.selfId;
      const far = this.camera.position.distanceTo(e.chibi.root.position) > 30;
      const wantPlate = !far && (mine || e.chibi.busy || this.showNames);
      if (wantPlate && !e.plate) {
        e.plate = document.createElement('div');
        e.plate.className = mine ? 'plate self' : 'plate';
        e.plate.textContent = mine ? `${e.person.name} (bạn)` : e.person.name;
        this.overlay.appendChild(e.plate);
      }
      const hasBubble = e.bubble && now < e.bubbleUntil;
      if (!wantPlate && !hasBubble) {
        if (e.plate) e.plate.style.display = 'none';
        continue;
      }
      e.chibi.headWorld(head);
      const dist = this.camera.position.distanceTo(head);
      const scale = THREE.MathUtils.clamp(8 / dist, 0.62, 1.15);
      if (e.plate) {
        e.plate.style.display = wantPlate ? '' : 'none';
        if (wantPlate) {
          const ok = this.place(e.plate, head, -4, scale);
          e.plate.style.opacity = mine || e.chibi.busy ? '1' : String(THREE.MathUtils.clamp(1.5 - dist / 14, 0.35, 0.95));
          if (!ok) continue;
        }
      }
      if (e.bubble) {
        if (hasBubble) {
          this.place(e.bubble, head, wantPlate ? -30 * scale : -4, scale);
          if (e.bubbleUntil - now < 700) e.bubble.style.opacity = '0';
        } else if (e.bubble.style.visibility !== 'hidden') e.bubble.style.visibility = 'hidden';
      }
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    if (this.mode === 'play') this.updatePlayer(dt);
    this.updateRemotes(dt);
    for (const e of this.entries.values()) e.chibi.update(dt, t);
    for (const c of this.ambient.values()) c.update(dt, t);
    this.hall.update(t, dt);
    this.yard.update(t, dt);
    this.updateCamera(dt, t);
    this.playerLight.position.set(this.player.x, 2.4, this.player.z + 0.8);
    this.composer.render();
    if (this.selfRing) (this.selfRing.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(t * 3) * 0.25;
    if (++this.frame % 2 === 0) this.updateOverlay(performance.now());

    if (this.mode === 'play') {
      const me = this.selfId ? this.entries.get(this.selfId) : undefined;
      const now = performance.now();
      if (me && !me.chibi.busy && now - this.lastSend > 200) {
        const s = this.lastSent;
        if (Math.hypot(this.player.x - s.x, this.player.z - s.z) > 0.02 || Math.abs(angDiff(s.r, this.playerRot)) > 0.05 || s.k !== this.kneeling) {
          this.lastSend = now;
          this.lastSent = { x: this.player.x, z: this.player.z, r: this.playerRot, k: this.kneeling };
          this.cb.onMove(this.player.x, this.player.z, this.playerRot, this.kneeling);
        }
      }
      // kneeling without a booked seat is only for a short lạy: stand up after 90 s in the hall
      if (this.kneeling && this.mySeat < 0 && this.player.z < 14 && now - this.kneelSince > 90_000) this.setKneelState(false);
      if (now - this.zoneT > 400) {
        this.zoneT = now;
        const z = zoneAt(this.player.x, this.player.z);
        if (z !== this.zone) {
          this.zone = z;
          this.cb.onZone(z);
        }
      }
    }
  };
}
