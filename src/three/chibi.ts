/**
 * Cute chibi devotees built from primitives (no model files): big round head, little robe, hands joined.
 * Each person is 4 draw calls (body, two legs, shadow), so a full hall stays light, even on phones.
 * Animation is procedural: kneel, bow (lạy), stand + walk, and "offer incense" (walk up, vái, 3 bows, plant).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OUTFITS, SKIN_TONES, parseLook, specFor, type LookSpec } from '../look';

export type Look = {
  skin: number;
  hair: number;
  hairStyle: number; // 0 húi cua, 1 short, 2 bun, 3 long (see look.ts)
  robe: number;
  pants: number;
  gender: number; // 0 nam, 1 nữ
  outfit: string;
  hat: number; // 0 none, 1 to 4 nón lá in rising grades (see HATS in progress.ts)
};

const HAIR = 0x1b1411;

export function lookFromSpec(spec: LookSpec): Look {
  const o = OUTFITS[spec.o] ?? OUTFITS[0];
  const robe = o.colors[spec.c]?.hex ?? o.colors[0].hex;
  const pants =
    o.id === 'lam' ? 0x454b5a : o.id === 'ao-dai' ? 0xf1ece0 : o.id === 'ba-ba' ? 0x2b2b30 : o.id === 'nau-song' ? 0x5a4630 : robe;
  return { skin: SKIN_TONES[spec.s] ?? SKIN_TONES[0], hair: HAIR, hairStyle: spec.h, robe, pants, gender: spec.g, outfit: o.id, hat: spec.n };
}

/** The look a person is wearing: their own choice if they made one, else a stable random one from their id */
export function lookOf(id: string, encoded?: string): Look {
  return lookFromSpec(parseLook(encoded) ?? specFor(id));
}
export const lookFor = (id: string) => lookFromSpec(specFor(id));

// ---- geometry kit ----
const SPHERE = new THREE.SphereGeometry(1, 14, 10);
const HEMI = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const CAPSULE = new THREE.CapsuleGeometry(1, 1, 4, 8);
const TORUS = new THREE.TorusGeometry(1, 0.13, 6, 24);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 6);
const CONE = new THREE.ConeGeometry(1, 1, 22);

type Part = { g: THREE.BufferGeometry; c: number; m: THREE.Matrix4 };
const T = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );

function merge(parts: Part[]) {
  const list = parts.map(({ g, c, m }) => {
    const geo = g.clone().applyMatrix4(m);
    const col = new THREE.Color(c);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  });
  const out = mergeGeometries(list, false)!;
  list.forEach((g) => g.dispose());
  return out;
}

const cache = new Map<string, { upper: THREE.BufferGeometry; leg: THREE.BufferGeometry }>();
function geometriesFor(look: Look) {
  const key = JSON.stringify(look);
  const hit = cache.get(key);
  if (hit) return hit;
  const dark = 0x2a1a12;
  const f = look.gender === 1;
  const o = look.outfit;
  const wide = o === 'trang' || o === 'nau-song';
  const white = 0xe9e4d8;

  const upper: Part[] = [
    { g: SPHERE, c: look.robe, m: T(0, 0.26, 0, f ? 0.3 : 0.34, 0.34, f ? 0.27 : 0.29) }, // body (slimmer for a woman)
    { g: SPHERE, c: look.robe, m: T(0, 0.04, 0, o === 'trang' ? 0.44 : o === 'nau-song' ? 0.4 : o === 'ba-ba' ? 0.34 : 0.36, o === 'ba-ba' ? 0.08 : 0.14, o === 'trang' ? 0.4 : 0.32) }, // skirt of the robe
    { g: SPHERE, c: look.robe, m: T(-0.24, 0.34, 0.12, wide ? 0.11 : 0.09, wide ? 0.19 : 0.15, wide ? 0.11 : 0.09, 0, 0, -0.5) }, // sleeves
    { g: SPHERE, c: look.robe, m: T(0.24, 0.34, 0.12, wide ? 0.11 : 0.09, wide ? 0.19 : 0.15, wide ? 0.11 : 0.09, 0, 0, 0.5) },
    { g: SPHERE, c: look.skin, m: T(-0.035, 0.4, 0.27, 0.06, 0.06, 0.06) }, // hands joined
    { g: SPHERE, c: look.skin, m: T(0.035, 0.4, 0.27, 0.06, 0.06, 0.06) },
    { g: SPHERE, c: look.skin, m: T(0, 0.72, 0, 0.28, 0.26, 0.26) }, // head
    { g: SPHERE, c: look.skin, m: T(-0.27, 0.7, 0, 0.05, 0.07, 0.04) }, // ears
    { g: SPHERE, c: look.skin, m: T(0.27, 0.7, 0, 0.05, 0.07, 0.04) },
    { g: SPHERE, c: dark, m: T(-0.095, 0.73, 0.24, 0.03, 0.036, 0.016) }, // eyes
    { g: SPHERE, c: dark, m: T(0.095, 0.73, 0.24, 0.03, 0.036, 0.016) },
    { g: SPHERE, c: 0xe98f8f, m: T(-0.16, 0.66, 0.21, 0.045, 0.026, 0.012) }, // blush
    { g: SPHERE, c: 0xe98f8f, m: T(0.16, 0.66, 0.21, 0.045, 0.026, 0.012) },
  ];
  // face: a man has thick brows, a woman thin brows, lashes and rosy lips
  if (f) {
    upper.push(
      { g: SPHERE, c: look.hair, m: T(-0.095, 0.792, 0.236, 0.034, 0.008, 0.01) },
      { g: SPHERE, c: look.hair, m: T(0.095, 0.792, 0.236, 0.034, 0.008, 0.01) },
      { g: SPHERE, c: dark, m: T(-0.125, 0.757, 0.236, 0.016, 0.01, 0.008) },
      { g: SPHERE, c: dark, m: T(0.125, 0.757, 0.236, 0.016, 0.01, 0.008) },
      { g: SPHERE, c: 0xd9606a, m: T(0, 0.62, 0.255, 0.03, 0.014, 0.012) }
    );
  } else {
    upper.push(
      { g: SPHERE, c: look.hair, m: T(-0.095, 0.787, 0.236, 0.05, 0.014, 0.012) },
      { g: SPHERE, c: look.hair, m: T(0.095, 0.787, 0.236, 0.05, 0.014, 0.012) },
      { g: SPHERE, c: 0x8a4a3a, m: T(0, 0.62, 0.255, 0.022, 0.01, 0.01) }
    );
  }
  // outfit details
  if (o === 'lam') upper.push({ g: TORUS, c: white, m: T(0, 0.5, 0.02, 0.2, 0.2, 0.2, Math.PI / 2) }); // white collar
  if (o === 'trang') upper.push({ g: TORUS, c: 0xd9b64a, m: T(0, 0.27, 0, 0.3, 0.3, 0.3, Math.PI / 2, 0, 0.62) }); // diagonal gold sash
  if (o === 'nau-song') upper.push({ g: TORUS, c: 0x3a2a1c, m: T(0, 0.17, 0, 0.32, 0.32, 0.32, Math.PI / 2) }); // dark belt
  if (o === 'ba-ba') {
    upper.push({ g: TORUS, c: 0xc0463a, m: T(0, 0.5, 0.02, 0.2, 0.2, 0.2, Math.PI / 2) }); // checked scarf (khăn rằn)
    for (const y of [0.36, 0.27, 0.18]) upper.push({ g: SPHERE, c: white, m: T(0, y, 0.3, 0.02, 0.02, 0.02) }); // buttons
  }
  if (o === 'ao-dai') {
    upper.push(
      { g: TORUS, c: look.robe, m: T(0, 0.5, 0.02, 0.19, 0.19, 0.19, Math.PI / 2) }, // high collar
      { g: SPHERE, c: look.robe, m: T(0, -0.02, 0.27, 0.13, 0.28, 0.03) }, // front and back panels
      { g: SPHERE, c: look.robe, m: T(0, -0.02, -0.27, 0.13, 0.28, 0.03) }
    );
    if (!f) upper.push({ g: SPHERE, c: 0x1b1411, m: T(0, 0.98, -0.01, 0.2, 0.12, 0.2) }); // khăn đóng for a man
  }
  // hair
  const cap = (sx: number, sy: number, sz: number, tilt: number) => ({ g: HEMI, c: look.hair, m: T(0, 0.74, -0.02, sx, sy, sz, tilt) });
  if (look.hairStyle === 0) upper.push({ g: HEMI, c: 0x4a403a, m: T(0, 0.74, -0.015, 0.287, 0.27, 0.283, -0.28) }); // closely cropped: a lighter, shorter cap
  else upper.push(cap(0.295, 0.28, 0.285, -0.3));
  if (look.hairStyle === 2 && !look.hat) upper.push({ g: SPHERE, c: look.hair, m: T(0, 1.0, -0.06, 0.11, 0.1, 0.11) });
  // nón lá: a cone hat, plainer or richer by grade
  if (look.hat > 0) {
    const rich = look.hat === 4;
    upper.push({ g: CONE, c: rich ? 0xe9bf55 : 0xe8d7a8, m: T(0, 1.03, 0, 0.53, 0.2, 0.53) });
    if (look.hat === 2) upper.push({ g: TORUS, c: 0xc0463a, m: T(0, 0.67, 0.02, 0.27, 0.27, 0.27, Math.PI / 2) }); // red chin strap
    if (look.hat >= 3) upper.push({ g: TORUS, c: 0xe2b13c, m: T(0, 0.93, 0, 0.5, 0.5, 0.5, Math.PI / 2) }); // gold rim
    if (rich) {
      upper.push({ g: TORUS, c: 0xe2b13c, m: T(0, 0.67, 0.02, 0.27, 0.27, 0.27, Math.PI / 2) });
      upper.push({ g: SPHERE, c: 0xf3a6b8, m: T(0, 1.15, 0, 0.055, 0.055, 0.055) }); // lotus bud on top
    }
  }
  if (look.hairStyle === 3) {
    upper.push(
      { g: SPHERE, c: look.hair, m: T(0, 0.52, -0.2, 0.25, 0.38, 0.13) },
      { g: SPHERE, c: look.hair, m: T(-0.25, 0.58, -0.04, 0.07, 0.22, 0.09) },
      { g: SPHERE, c: look.hair, m: T(0.25, 0.58, -0.04, 0.07, 0.22, 0.09) }
    );
  }
  const leg: Part[] = [
    { g: CAPSULE, c: look.pants, m: T(0, -0.13, 0, 0.075, 0.1, 0.075) },
    { g: SPHERE, c: f ? 0xf2ece0 : 0x4a3a30, m: T(0, -0.29, 0.03, 0.09, 0.05, 0.12) }, // shoe
  ];
  const made = { upper: merge(upper), leg: merge(leg) };
  cache.set(key, made);
  return made;
}

const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 });
const stickMat = new THREE.MeshBasicMaterial({ color: 0xa8321a });
const tipMat = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);

const KNEEL_Y = 0.1;
const LEG = 0.3;
const WALK_SPEED = 1.5;

type OfferHooks = { onPlant: () => void; onDone: () => void };

export class Chibi {
  root = new THREE.Group();
  busy = false;
  private upper = new THREE.Group();
  private legs: THREE.Group[] = [];
  private stick?: THREE.Group;
  private stand = 0; // 0 kneeling, 1 standing
  private state: 'kneel' | 'walk' | 'pray' | 'bows' | 'free' = 'kneel';
  /** Set by the owner of this body every frame in 'free' mode: is it walking right now */
  moving = false;
  private freeKneel = false;
  private path: THREE.Vector3[] = [];
  private onArrive?: () => void;
  private bowT = -1;
  private bowAmp = 0.8;
  private nextBow = 2 + Math.random() * 6;
  private bowsLeft = 0;
  private prayT = 0;
  private hooks?: OfferHooks;
  private back: THREE.Vector3[] = [];
  private phase = Math.random() * 10;

  constructor(look: Look) {
    const { upper, leg } = geometriesFor(look);
    this.upperMesh = new THREE.Mesh(upper, bodyMat);
    this.upper.add(this.upperMesh);
    this.root.add(this.upper);
    for (const x of [-0.11, 0.11]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, LEG, 0);
      const legMesh = new THREE.Mesh(leg, bodyMat);
      this.legMeshes.push(legMesh);
      pivot.add(legMesh);
      pivot.visible = false;
      this.root.add(pivot);
      this.legs.push(pivot);
    }
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.012;
    this.root.add(shadow);
    this.applyPose(0);
    this.root.rotation.y = Math.PI;
  }

  private upperMesh!: THREE.Mesh;
  private legMeshes: THREE.Mesh[] = [];

  /** Change clothes, hair or skin while standing here */
  setLook(look: Look) {
    const { upper, leg } = geometriesFor(look);
    this.upperMesh.geometry = upper;
    for (const m of this.legMeshes) m.geometry = leg;
  }

  /** One bow (lạy), standing or kneeling */
  bow() {
    if (this.bowT < 0 && this.state !== 'pray' && this.state !== 'bows') {
      this.bowT = 0;
      this.bowAmp = 0.8;
    }
  }

  // ---- aura: a glow that grows with the level (tiers 1 to 5, see AURA_TIERS in progress.ts) ----
  private tier = 0;
  private auraGroups: THREE.Group[] = [];
  private auraParts: Array<{ o: THREE.Object3D; spin: number; pulse: number; base: number }> = [];

  setTier(tier: number) {
    if (tier === this.tier) return;
    this.tier = tier;
    for (const g of this.auraGroups) g.removeFromParent();
    this.auraGroups = [];
    this.auraParts = [];
    if (tier <= 0) return;
    const ground = new THREE.Group();
    const head = new THREE.Group(); // follows the body when it bows
    this.root.add(ground);
    this.upper.add(head);
    this.auraGroups = [ground, head];
    const glow = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const put = (parent: THREE.Group, o: THREE.Object3D, spin = 0, pulse = 0) => {
      parent.add(o);
      this.auraParts.push({ o, spin, pulse, base: o.scale.x });
    };
    // 1: a ring of light on the floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 44).rotateX(-Math.PI / 2), glow(0xffe9a8, 0.6));
    ring.position.y = 0.03;
    put(ground, ring, 0, 0.06);
    // 2: a golden halo over the head
    if (tier >= 2) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 40).rotateX(Math.PI / 2), glow(0xffd36b, 0.95));
      halo.position.y = 1.2;
      put(head, halo, 0.6, 0.05);
    }
    // 3: a column of light and sparks circling the body
    if (tier >= 3) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 3.2, 28, 1, true), glow(0xfff0b8, 0.04 + tier * 0.012));
      column.position.y = 1.6;
      put(ground, column, 0, 0.03);
      const sparks = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow(0xfff6d0, 0.95));
        const a = (i / 5) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.7, 0.3 + (i % 3) * 0.45, Math.sin(a) * 0.7);
        sparks.add(s);
      }
      put(ground, sparks, 0.9);
    }
    // 4: a second tilted halo and lotus petals drifting around
    if (tier >= 4) {
      const halo2 = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.016, 8, 44).rotateX(Math.PI / 2), glow(0xffb86b, 0.85));
      halo2.position.y = 1.2;
      halo2.rotation.x = 0.45;
      put(head, halo2, -0.5, 0.05);
      const petals = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.35, 0.6), glow(0xf8b6c8, 0.9));
        const a = (i / 8) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.95, 0.9 + Math.sin(i * 1.7) * 0.3, Math.sin(a) * 0.95);
        p.rotation.y = -a;
        petals.add(p);
      }
      put(ground, petals, -0.5);
    }
    // 5: a golden orb of light and a lotus under the feet
    if (tier >= 5) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 28, 18), glow(0xffd36b, 0.045));
      orb.position.y = 0.75;
      put(ground, orb, 0, 0.05);
      const lotus = new THREE.Group();
      for (let i = 0; i < 14; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6).scale(0.5, 0.16, 1), glow(i % 2 ? 0xffe9a8 : 0xf8b6c8, 0.85));
        const a = (i / 14) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62);
        p.rotation.y = -a + Math.PI / 2;
        lotus.add(p);
      }
      put(ground, lotus, 0.25);
    }
  }

  private animateAura(t: number) {
    for (const p of this.auraParts) {
      if (p.spin) p.o.rotation.y = t * p.spin;
      if (p.pulse) p.o.scale.setScalar(p.base * (1 + Math.sin(t * 2.2) * p.pulse));
    }
  }

  /** Is this person up and offering incense (name plate and camera care about it) */
  isOffering() {
    return this.busy;
  }

  headWorld(out: THREE.Vector3) {
    return this.upper.localToWorld(out.set(0, 1.12, 0));
  }

  /** Hand the body to its player (or to network interpolation): stand or kneel in place, moved from outside */
  enterFree(kneel = false) {
    this.state = 'free';
    this.freeKneel = kneel;
    this.nextBow = 1 + Math.random() * 4;
  }

  setKneel(k: boolean) {
    if (this.state === 'free') this.freeKneel = k;
  }

  isKneeling() {
    return this.state === 'kneel' || (this.state === 'free' && this.freeKneel);
  }

  private isStepping() {
    return this.state === 'walk' || (this.state === 'free' && this.moving && !this.freeKneel);
  }

  kneelAt(p: THREE.Vector3) {
    this.root.position.copy(p);
    this.kneelHere();
  }

  kneelHere() {
    this.state = 'kneel';
    this.root.rotation.y = Math.PI; // face the altar
    this.nextBow = 1 + Math.random() * 7;
  }

  walk(points: THREE.Vector3[], then?: () => void) {
    this.path = points.map((p) => p.clone());
    this.onArrive = then;
    this.state = 'walk';
  }

  /** Walk to the incense table, vái with a lit stick, bow three times, plant it, walk back */
  offer(toSpot: THREE.Vector3[], back: THREE.Vector3[], hooks: OfferHooks) {
    this.busy = true;
    this.hooks = hooks;
    this.back = back;
    this.bowT = -1;
    this.walk(toSpot, () => {
      this.root.rotation.y = Math.PI;
      this.state = 'pray';
      this.prayT = 0;
      this.setStick(true);
    });
  }

  private setStick(on: boolean) {
    if (on && !this.stick) {
      const g = new THREE.Group();
      for (const dx of [-0.03, 0, 0.03]) {
        const s = new THREE.Mesh(CYL, stickMat);
        s.scale.set(0.008, 0.5, 0.008);
        s.position.set(dx, 0.2, 0);
        const tip = new THREE.Mesh(SPHERE, tipMat);
        tip.scale.setScalar(0.02);
        tip.position.set(dx, 0.46, 0);
        g.add(s, tip);
      }
      g.position.set(0, 0.42, 0.3);
      this.stick = g;
      this.upper.add(g);
    } else if (!on && this.stick) {
      this.upper.remove(this.stick);
      this.stick = undefined;
    }
  }

  private applyPose(walkT: number) {
    const s = this.stand;
    this.upper.position.y = KNEEL_Y + LEG * s;
    this.legs.forEach((l, i) => {
      l.visible = s > 0.08;
      l.position.y = LEG * s + KNEEL_Y * (1 - s);
      l.rotation.x = Math.sin(walkT + i * Math.PI) * 0.7 * s * (this.isStepping() ? 1 : 0);
    });
  }

  private tick = Math.floor(Math.random() * 3);
  private skipped = 0;

  update(dt: number, t: number) {
    if (this.auraParts.length) this.animateAura(t);
    // A person just kneeling barely changes: update every third frame to keep a full hall smooth
    if (this.state === 'kneel' && this.bowT < 0 && this.stand === 0 && !this.busy) {
      this.skipped += dt;
      if (++this.tick % 3) return;
      dt = this.skipped;
    }
    this.skipped = 0;

    const targetStand = this.isKneeling() ? 0 : 1;
    this.stand += (targetStand - this.stand) * Math.min(1, dt * 5);
    if (Math.abs(this.stand - targetStand) < 0.01) this.stand = targetStand;

    let bob = 0;
    if (this.state === 'walk') {
      let step = WALK_SPEED * dt;
      while (step > 0 && this.path.length) {
        const to = this.path[0];
        const dx = to.x - this.root.position.x;
        const dz = to.z - this.root.position.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.001) this.root.rotation.y = Math.atan2(dx, dz);
        if (len <= step) {
          this.root.position.set(to.x, to.y, to.z);
          this.path.shift();
          step -= len;
        } else {
          this.root.position.x += (dx / len) * step;
          this.root.position.z += (dz / len) * step;
          step = 0;
        }
      }
      bob = Math.abs(Math.sin(t * 9 + this.phase)) * 0.045;
      if (!this.path.length) {
        const arrive = this.onArrive ?? (() => this.kneelHere());
        this.onArrive = undefined;
        arrive();
      }
    } else if (this.state === 'free' && !this.freeKneel) {
      if (this.moving) bob = Math.abs(Math.sin(t * 9 + this.phase)) * 0.045;
    } else if (this.state === 'kneel' || this.state === 'free') {
      this.nextBow -= dt;
      if (this.nextBow <= 0 && this.bowT < 0) {
        this.bowT = 0;
        this.bowAmp = 0.85;
        this.nextBow = 4 + Math.random() * 9;
      }
    } else if (this.state === 'pray') {
      this.prayT += dt;
      // slow nod while holding the stick
      this.upper.rotation.x = Math.sin(this.prayT * 2.4) * 0.12;
      if (this.prayT > 2.4) {
        this.state = 'bows';
        this.bowsLeft = 3;
        this.bowT = 0;
        this.bowAmp = 0.7;
      }
    }

    // bow (lạy): ease down, hold, ease up
    if (this.bowT >= 0) {
      const DOWN = 0.8, HOLD = 0.55, UP = 0.9;
      this.bowT += dt;
      const b = this.bowT;
      let w = 0;
      if (b < DOWN) w = 0.5 - 0.5 * Math.cos((Math.PI * b) / DOWN);
      else if (b < DOWN + HOLD) w = 1;
      else if (b < DOWN + HOLD + UP) w = 0.5 + 0.5 * Math.cos((Math.PI * (b - DOWN - HOLD)) / UP);
      else {
        this.bowT = -1;
        if (this.state === 'bows') {
          if (--this.bowsLeft > 0) this.bowT = 0;
          else {
            this.setStick(false);
            this.hooks?.onPlant();
            const done = this.hooks?.onDone;
            this.hooks = undefined;
            this.walk(this.back, () => {
              this.busy = false;
              this.enterFree(false);
              done?.();
            });
          }
        }
      }
      this.upper.rotation.x = this.bowT < 0 ? 0 : w * this.bowAmp;
    } else if (this.state !== 'pray') {
      this.upper.rotation.x = 0;
    }

    this.upper.scale.y = 1 + Math.sin(t * 1.6 + this.phase) * 0.012;
    this.applyPose(t * 9 + this.phase);
    this.upper.position.y += bob;
  }

  dispose() {
    this.setStick(false);
  }
}
