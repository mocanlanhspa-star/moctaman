/**
 * The hall itself, all procedural: lacquered columns, wood floor and carpet, lattice windows with moonlight shafts,
 * hanging lanterns, a stepped altar with a golden Buddha on a lotus throne, an incense table with real rising smoke,
 * a bronze bell, a wooden fish, falling lotus petals and drifting dust. Nothing here needs a model file.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAX_SEATS, COLS, ROWS, seatXZ } from '../layout';

// ---- layout (metres). The altar is at -z, visitors enter from the door at +z and the camera looks toward -z ----
export { MAX_SEATS };
export const seatPos = (i: number) => {
  const p = seatXZ(i);
  return new THREE.Vector3(p.x, 0.07, p.z);
};
export const DOOR = new THREE.Vector3(0, 0, 13);
export const SPOTS = [0, -1.2, 1.2, -2.4, 2.4].map((x) => new THREE.Vector3(x, 0, -6.05));
export const INCENSE_TABLE = new THREE.Vector3(0, 0, -7.35);

export const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
export const glowTex = (stops: Array<[number, string]>) =>
  canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });

const woodTex = (r: number, g0: number, b: number, plank: number, seed: number) => {
  const rnd = mulberry32(seed);
  return canvasTex(1024, 1024, (g, w, h) => {
    for (let x = 0; x < w; x += plank) {
      const k = 0.78 + rnd() * 0.4;
      g.fillStyle = `rgb(${r * k | 0},${g0 * k | 0},${b * k | 0})`;
      g.fillRect(x, 0, plank, h);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x, 0, 2, h);
      for (let i = 0; i < 22; i++) {
        g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.07})`;
        g.fillRect(x + rnd() * plank, 0, 1 + rnd() * 2, h);
      }
      for (let j = 0; j < 2; j++) {
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(x, rnd() * h, plank, 2);
      }
    }
  });
};

function makeLotus(r: number, rings: number[], color: number, glow = 0.18) {
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: glow });
  const total = rings.reduce((a, b) => a + b, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  const m = new THREE.Matrix4();
  let n = 0;
  rings.forEach((count, ring) => {
    const tilt = 0.25 + ring * 0.32;
    const len = r * (1 - ring * 0.14);
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + ring * 0.35;
      m.identity()
        .multiply(new THREE.Matrix4().makeRotationY(ang))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, r * 0.1))
        .multiply(new THREE.Matrix4().makeRotationX(tilt))
        .multiply(new THREE.Matrix4().makeTranslation(0, len * 0.5, 0))
        .multiply(new THREE.Matrix4().makeScale(r * 0.27, len * 0.5, r * 0.08));
      mesh.setMatrixAt(n++, m);
    }
  });
  return mesh;
}

export type Hall = {
  update(t: number, dt: number): void;
  plantIncense(): void;
  ringBell(): void;
  tapFish(): void;
  releaseLantern(from: THREE.Vector3, name: string): void;
  petalBurst(at: THREE.Vector3, n?: number): void;
  setBoards(s: { online: number; incense: number; wishes: number; visitors: number }, feed: Array<{ name: string; text: string }>): void;
  /** seat index -> 'me' or 'other' for taken seats, so the numbers on the cushions change colour */
  setSeatNumbers(taken: Record<number, 'me' | 'other'>): void;
  setViewport(heightPx: number, fovRad: number): void;
  dispose(): void;
};

export function buildHall(scene: THREE.Scene, renderer: THREE.WebGLRenderer, low: boolean): Hall {
  const rnd = mulberry32(11);
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color(0x0b0503);
  scene.fog = new THREE.FogExp2(0x180905, 0.016);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.42;

  const gold = new THREE.MeshStandardMaterial({ color: 0xe2b13c, metalness: 1, roughness: 0.28, envMapIntensity: 1.5, emissive: 0x2a1a02 });
  const red = new THREE.MeshPhysicalMaterial({ color: 0x8e1512, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2b1408, roughness: 0.62 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0x4a1a14, roughness: 0.95 });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // ---- floor, carpet ----
  const floorTex = woodTex(74, 42, 22, 64, 3);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(19, 31).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.08 }));
  floor.position.set(0, 0, -0.5);
  root.add(floor);

  const carpetTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6e0f12';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e0b04a';
    g.lineWidth = 5;
    g.strokeRect(10, -10, w - 20, h + 20);
    g.lineWidth = 2;
    g.strokeRect(22, -10, w - 44, h + 20);
    g.strokeStyle = 'rgba(224,176,74,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w / 2, 24);
    g.lineTo(w / 2 + 50, h / 2);
    g.lineTo(w / 2, h - 24);
    g.lineTo(w / 2 - 50, h / 2);
    g.closePath();
    g.stroke();
  });
  carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping;
  carpetTex.repeat.set(1, 11);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 21).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.9 }));
  carpet.position.set(0, 0.008, 3.2);
  root.add(carpet);

  // ---- cushions: one instanced pair (gold edge + red top) for every seat ----
  const cushGold = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), gold, MAX_SEATS);
  const cushRed = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.07, 0.8), new THREE.MeshStandardMaterial({ color: 0x7a1414, roughness: 0.85 }), MAX_SEATS);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < MAX_SEATS; i++) {
    const p = seatPos(i);
    cushGold.setMatrixAt(i, mm.makeTranslation(p.x, 0.025, p.z));
    cushRed.setMatrixAt(i, mm.makeTranslation(p.x, 0.04, p.z));
  }
  root.add(cushGold, cushRed);

  // seat numbers on the cushions: one atlas texture, one merged mesh, redrawn whenever seats are taken or freed
  const CELL = 64;
  const ACOLS = 12;
  const AROWS = Math.ceil(MAX_SEATS / ACOLS);
  const atlas = document.createElement('canvas');
  atlas.width = ACOLS * CELL;
  atlas.height = AROWS * CELL;
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 8;
  let occupied: Record<number, 'me' | 'other'> = {};
  const drawAtlas = () => {
    const g = atlas.getContext('2d')!;
    g.clearRect(0, 0, atlas.width, atlas.height);
    g.textAlign = 'center';
    g.font = '700 30px "Be Vietnam Pro", sans-serif';
    for (let i = 0; i < MAX_SEATS; i++) {
      const state = occupied[i];
      g.fillStyle = state === 'me' ? '#9bffa8' : state === 'other' ? '#ff8f7e' : '#f6dd9a';
      g.fillText(String(i + 1), (i % ACOLS) * CELL + CELL / 2, Math.floor(i / ACOLS) * CELL + 43);
    }
    atlasTex.needsUpdate = true;
  };
  drawAtlas();
  const quads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    const p = seatXZ(i);
    const geo = new THREE.PlaneGeometry(0.46, 0.46).rotateX(-Math.PI / 2).translate(p.x, 0.082, p.z);
    const u0 = (i % ACOLS) / ACOLS;
    const u1 = u0 + 1 / ACOLS;
    const v1 = 1 - Math.floor(i / ACOLS) / AROWS;
    const v0 = v1 - 1 / AROWS;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
    quads.push(geo);
  }
  root.add(new THREE.Mesh(mergeGeometries(quads)!, new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, depthWrite: false, toneMapped: false })));
  void COLS;
  void ROWS;

  // ---- walls, windows, shafts of moonlight ----
  box(0.4, 8, 31, plaster, -9.2, 4, -0.5);
  box(0.4, 8, 31, plaster, 9.2, 4, -0.5);
  const latticeTex = canvasTex(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#a9c0ff');
    gr.addColorStop(1, '#5f78c8');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c99a33';
    g.lineWidth = 6;
    for (let i = -h; i < w + h; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.moveTo(i + h, 0);
      g.lineTo(i, h);
      g.stroke();
    }
    g.lineWidth = 14;
    g.strokeRect(0, 0, w, h);
  });
  const windowMat = new THREE.MeshBasicMaterial({ map: latticeTex, toneMapped: false, color: 0xbfc9e8 });
  const shaftTex = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(170,195,255,0.9)');
    gr.addColorStop(1, 'rgba(170,195,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shafts: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-9, -2, 5, 11]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.6), windowMat);
      win.position.set(side * 8.98, 3.9, z);
      win.rotation.y = -side * Math.PI / 2;
      root.add(win);
      box(0.25, 5, 0.18, gold, side * 8.95, 3.9, z - 1.3);
      box(0.25, 5, 0.18, gold, side * 8.95, 3.9, z + 1.3);
      box(0.25, 0.18, 2.8, gold, side * 8.95, 6.25, z);
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 10), shaftMat);
      shaft.position.set(side * 6.3, 3.4, z);
      shaft.rotation.set(0, side * Math.PI / 2, side * -0.55);
      root.add(shaft);
      shafts.push(shaft);
    }
  }

  // back (altar) wall with a gold lotus mandala
  const mandala = canvasTex(1024, 1024, (g, w, h) => {
    const bg = g.createRadialGradient(512, 470, 40, 512, 470, 700);
    bg.addColorStop(0, '#a81c14');
    bg.addColorStop(1, '#2a0907');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(232,180,70,0.8)';
    for (let r = 120; r < 520; r += 60) {
      g.lineWidth = r % 120 === 0 ? 3 : 1.5;
      g.beginPath();
      g.arc(512, 470, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.save();
      g.translate(512, 470);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, -300, 34, 90, 0, 0, Math.PI * 2);
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    }
  });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(18.4, 8), new THREE.MeshStandardMaterial({ map: mandala, emissiveMap: mandala, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.9 }));
  backWall.position.set(0, 4, -16);
  root.add(backWall);

  // front wall with an open doorway onto the night
  box(7.2, 8, 0.4, plaster, -5.4, 4, 14.4);
  box(7.2, 8, 0.4, plaster, 5.4, 4, 14.4);
  box(3.6, 3.2, 0.4, plaster, 0, 6.4, 14.4);

  // ---- columns and ceiling ----
  const colGeo = new THREE.CylinderGeometry(0.36, 0.4, 7.4, 20);
  for (const x of [-7.3, 7.3]) {
    for (const z of [-12.5, -6, 0, 6, 12]) {
      const col = new THREE.Mesh(colGeo, red);
      col.position.set(x, 3.7, z);
      root.add(col);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.6, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.8 }));
      base.position.set(x, 0.2, z);
      root.add(base);
      for (const y of [0.45, 7.2]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 24).rotateX(Math.PI / 2), gold);
        ring.position.set(x, y, z);
        root.add(ring);
      }
    }
  }
  const ceilTex = woodTex(52, 28, 14, 96, 5);
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(3, 3);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(19, 31).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.8 }));
  ceil.position.set(0, 8, -0.5);
  root.add(ceil);
  for (let z = -15; z <= 14; z += 3.5) {
    box(18.6, 0.5, 0.4, darkWood, 0, 7.72, z);
    box(18.6, 0.06, 0.46, gold, 0, 7.45, z);
  }
  for (const x of [-6, 0, 6]) box(0.5, 0.45, 31, darkWood, x, 7.74, -0.5);

  // ---- hanging lanterns (instanced, swaying) ----
  const lanternAnchors: Array<[number, number]> = [];
  for (const z of [-11, -7.5, -4, -0.5, 3, 6.5, 10]) for (const x of [-3.7, 3.7, -6.6, 6.6]) lanternAnchors.push([x, z]);
  const LN = lanternAnchors.length;
  const lBody = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 14, 10).scale(0.36, 0.46, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x6a0e0a, emissive: 0xff3b12, emissiveIntensity: 2.4, roughness: 0.6 }),
    LN
  );
  const lCap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.17, 0.1, 10), gold, LN);
  const lTassel = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xc8352a, roughness: 0.8 }), LN);
  root.add(lBody, lCap, lTassel);
  const lm = new THREE.Matrix4();
  const lq = new THREE.Quaternion();
  const lantern = (t: number) => {
    lanternAnchors.forEach(([ax, az], i) => {
      const a = Math.sin(t * 0.8 + i * 1.7) * 0.045;
      const len = 1.7;
      lq.setFromEuler(new THREE.Euler(0, 0, a));
      const body = new THREE.Matrix4().compose(new THREE.Vector3(ax + Math.sin(a) * len, 7.7 - Math.cos(a) * len, az), lq, new THREE.Vector3(1, 1, 1));
      lBody.setMatrixAt(i, body);
      lCap.setMatrixAt(i, lm.multiplyMatrices(body, new THREE.Matrix4().makeTranslation(0, 0.46, 0)));
      lTassel.setMatrixAt(i, lm.multiplyMatrices(body, new THREE.Matrix4().makeTranslation(0, -0.72, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI))));
    });
    lBody.instanceMatrix.needsUpdate = lCap.instanceMatrix.needsUpdate = lTassel.instanceMatrix.needsUpdate = true;
  };
  lantern(0);

  // ---- stepped altar, golden Buddha, offerings ----
  const altar = new THREE.Group();
  root.add(altar);
  box(11.4, 0.34, 2.4, red, 0, 0.17, -9.5, altar);
  box(11.2, 0.04, 2.2, darkWood, 0, 0.36, -9.5, altar); box(11.5, 0.07, 0.06, gold, 0, 0.3, -8.28, altar);
  box(9.8, 0.68, 2.2, red, 0, 0.34, -11.1, altar);
  box(9.6, 0.04, 2.0, darkWood, 0, 0.7, -11.1, altar); box(9.9, 0.07, 0.06, gold, 0, 0.64, -10.04, altar);
  box(8.2, 1.0, 3.8, red, 0, 0.5, -13.3, altar);
  box(8.0, 0.04, 3.6, darkWood, 0, 1.03, -13.3, altar); box(8.3, 0.07, 0.06, gold, 0, 0.97, -11.38, altar);

  const buddha = new THREE.Group();
  buddha.position.set(0, 1.04, -13.7);
  altar.add(buddha);
  const bGold = new THREE.MeshStandardMaterial({ color: 0xdc9f22, metalness: 0.9, roughness: 0.34, envMapIntensity: 0.85, emissive: 0x3a2200, emissiveIntensity: 0.35 });
  const lathe = (pts: Array<[number, number]>, mat: THREE.Material, seg = 28) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat);
  const throne = makeLotus(2.2, [14, 18, 22], 0xf3b9c8, 0.08);
  throne.position.y = 0.1;
  buddha.add(throne);
  const throneBase = lathe([[0.01, 0], [1.7, 0], [1.6, 0.35], [1.25, 0.55], [0.01, 0.6]], bGold);
  throneBase.position.y = 0.2;
  buddha.add(throneBase);
  const legs = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16).scale(1.65, 0.42, 1.05), bGold);
  legs.position.y = 1.0;
  buddha.add(legs);
  const torso = lathe([[0.01, 0], [0.95, 0.05], [0.78, 0.7], [0.62, 1.4], [0.74, 1.95], [0.55, 2.35], [0.28, 2.45], [0.01, 2.5]], bGold);
  torso.scale.z = 0.7;
  torso.position.y = 1.15;
  buddha.add(torso);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 1.0, 6, 12), bGold);
    arm.position.set(s * 0.88, 2.35, 0.1);
    arm.rotation.z = s * -0.28;
    buddha.add(arm);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bGold);
    knee.position.set(s * 1.25, 1.35, 0.55);
    buddha.add(knee);
  }
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10).scale(1.4, 0.7, 1), bGold);
  hands.position.set(0, 1.42, 0.72);
  buddha.add(hands);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 14), bGold);
  neck.position.y = 3.62;
  buddha.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 28, 20).scale(0.95, 1.12, 1), bGold);
  head.position.y = 4.18;
  buddha.add(head);
  const bump = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 12), bGold);
  bump.position.set(0, 4.78, -0.02);
  buddha.add(bump);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 10), new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false }));
  flame.position.set(0, 5.1, -0.02);
  buddha.add(flame);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), bGold);
    ear.position.set(s * 0.5, 4.05, 0.02);
    buddha.add(ear);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a1c04 }));
    eye.position.set(s * 0.2, 4.25, 0.5);
    eye.rotation.z = Math.PI;
    buddha.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x6a2a10 }));
  smile.position.set(0, 3.98, 0.5);
  smile.rotation.z = Math.PI;
  buddha.add(smile);
  // halo and slow rays
  const haloTex = glowTex([[0, 'rgba(255,238,170,0.55)'], [0.5, 'rgba(255,200,90,0.28)'], [1, 'rgba(255,170,40,0)']]);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.1, 48), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.position.set(0, 4.2, -0.7);
  buddha.add(halo);
  const rayTex = canvasTex(512, 512, (g, w, h) => {
    g.translate(w / 2, h / 2);
    for (let k = 0; k < 28; k++) {
      g.rotate((Math.PI * 2) / 28);
      const gr = g.createLinearGradient(0, 0, 0, -240);
      gr.addColorStop(0, 'rgba(255,225,140,0.55)');
      gr.addColorStop(1, 'rgba(255,225,140,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(6, 0);
      g.lineTo(2, -240);
      g.lineTo(-2, -240);
      g.fill();
    }
  });
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.22 }));
  rays.position.set(0, 4.2, -0.9);
  buddha.add(rays);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.05, 8, 64), gold);
  ring.position.set(0, 4.2, -0.65);
  buddha.add(ring);

  // The procedural statue is only a fallback: the owner's golden Buddha painting stands on the altar instead,
  // cropped to the statue, halo and lotus throne, with soft edges so it melts into the wall behind it.
  buddha.visible = false;
  const altarArt = new THREE.TextureLoader().load('/assets/altar.webp');
  altarArt.colorSpace = THREE.SRGBColorSpace;
  altarArt.anisotropy = 8;
  altarArt.repeat.set(684 / 1480, 720 / 2400);
  altarArt.offset.set(396 / 1480, 1 - 1200 / 2400);
  const fade = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const edge = (horizontal: boolean) => {
      const gr = horizontal ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#000');
      gr.addColorStop(0.16, '#fff');
      gr.addColorStop(0.84, '#fff');
      gr.addColorStop(1, '#000');
      return gr;
    };
    g.fillStyle = edge(true);
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = edge(false);
    g.fillRect(0, 0, w, h);
  }, false);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(6.8, 7.1),
    new THREE.MeshBasicMaterial({ map: altarArt, alphaMap: fade, transparent: true, depthWrite: false, fog: false, color: 0xf2ebe0 })
  );
  art.position.set(0, 1.05 + 3.55, -14.9);
  root.add(art);

  // spot on the Buddha, warm fills
  const spot = new THREE.SpotLight(0xffe2a6, 70, 22, 0.42, 0.8, 1.4);
  spot.position.set(0, 7.2, -6);
  spot.target.position.set(0, 3.4, -13.7);
  root.add(spot, spot.target);
  const altarLight = new THREE.PointLight(0xffa850, 36, 16, 2);
  altarLight.position.set(0, 3, -9);
  const sideL = new THREE.PointLight(0xff9a50, 30, 15, 2);
  sideL.position.set(-4.5, 4.8, 1);
  const sideR = sideL.clone();
  sideR.position.x = 4.5;
  const backL = new THREE.PointLight(0xffb070, 16, 14, 2);
  backL.position.set(0, 4.5, 8);
  root.add(altarLight, sideL, sideR, backL, new THREE.HemisphereLight(0x7a5a40, 0x1a0e08, 0.5));

  // vases, fruit, candles
  const flameTex = glowTex([[0, 'rgba(255,250,210,1)'], [0.3, 'rgba(255,190,80,0.8)'], [1, 'rgba(255,120,20,0)']]);
  const flames: THREE.Sprite[] = [];
  for (const x of [-4.2, -2.6, 2.6, 4.2]) {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.5 }));
    candle.position.set(x, 0.95, -10.9);
    altar.add(candle);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    f.scale.set(0.38, 0.55, 1);
    f.position.set(x, 1.28, -10.9);
    altar.add(f);
    flames.push(f);
  }
  const vaseMat = new THREE.MeshStandardMaterial({ color: 0x4a9a92, roughness: 0.25, metalness: 0.2 });
  for (const x of [-3.4, 3.4]) {
    const vase = lathe([[0.01, 0], [0.22, 0], [0.3, 0.3], [0.16, 0.65], [0.2, 0.8], [0.01, 0.8]], vaseMat, 18);
    vase.position.set(x, 0.72, -10.9);
    altar.add(vase);
    for (const [dx, dy] of [[0, 1.5], [-0.35, 1.2], [0.35, 1.25]]) {
      const l = makeLotus(0.3, [8, 10], 0xf6b3c4, 0.3);
      l.position.set(x + dx, 0.72 + dy, -10.9);
      altar.add(l);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, dy, 5), new THREE.MeshStandardMaterial({ color: 0x3f6b2a }));
      stem.position.set(x + dx / 2, 0.72 + dy / 2, -10.9);
      altar.add(stem);
    }
  }
  for (const x of [-1.6, 1.6]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.12, 20), gold);
    plate.position.set(x, 0.74, -10.8);
    altar.add(plate);
    [0xd64a2a, 0xf0a23a, 0x8fb04a, 0xe86a4a, 0xf3c24a].forEach((c, i) => {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
      const a = (i / 5) * Math.PI * 2;
      fruit.position.set(x + Math.cos(a) * 0.28, 0.9 + (i % 2) * 0.05, -10.8 + Math.sin(a) * 0.28);
      altar.add(fruit);
    });
  }

  // ---- incense table with bronze burner ----
  const table = new THREE.Group();
  table.position.copy(INCENSE_TABLE);
  root.add(table);
  box(2.6, 0.9, 1.1, red, 0, 0.45, 0, table);
  box(2.7, 0.06, 1.2, gold, 0, 0.93, 0, table);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, metalness: 0.9, roughness: 0.38, envMapIntensity: 1.3 });
  const urn = lathe([[0.01, 0], [0.4, 0], [0.5, 0.12], [0.56, 0.4], [0.5, 0.7], [0.58, 0.78], [0.5, 0.82], [0.01, 0.7]], bronze, 24);
  urn.position.y = 0.96;
  table.add(urn);
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x6a645e, roughness: 1 }));
  ash.position.y = 1.7;
  table.add(ash);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 14, Math.PI), bronze);
    handle.position.set(s * 0.56, 1.5, 0);
    handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    table.add(handle);
  }
  const ember = new THREE.PointLight(0xff7a2a, 3, 4, 2);
  ember.position.set(0, 1.9, 0.2);
  table.add(ember);
  const URN_TOP = new THREE.Vector3(0, 1.72, 0).add(INCENSE_TABLE);

  // planted incense sticks
  type Stick = { g: THREE.Group; born: number };
  const sticks: Stick[] = [];
  const stickMat = new THREE.MeshBasicMaterial({ color: 0xa8321a });
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false });
  let now = 0;
  const plantIncense = () => {
    if (sticks.length >= 36) {
      const old = sticks.shift()!;
      table.remove(old.g);
    }
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 5), stickMat);
    s.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), tipMat);
    tip.position.y = 0.6;
    tip.name = 'tip';
    g.add(s, tip);
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.36;
    g.position.set(Math.cos(a) * r, 1.72, Math.sin(a) * r);
    g.rotation.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
    table.add(g);
    sticks.push({ g, born: now });
    petalBurst(URN_TOP.clone().add(new THREE.Vector3(0, 0.6, 0)), 22);
  };

  // ---- bell and wooden fish ----
  const bellFrame = new THREE.Group();
  bellFrame.position.set(-7.7, 0, -6.4);
  root.add(bellFrame);
  box(0.18, 3.1, 0.18, darkWood, -0.9, 1.55, 0, bellFrame);
  box(0.18, 3.1, 0.18, darkWood, 0.9, 1.55, 0, bellFrame);
  box(2.2, 0.2, 0.22, red, 0, 3.1, 0, bellFrame);
  const bellPivot = new THREE.Group();
  bellPivot.position.y = 3.0;
  bellFrame.add(bellPivot);
  const bell = lathe([[0.04, 0.0], [0.2, -0.04], [0.3, -0.3], [0.4, -0.75], [0.52, -1.15], [0.62, -1.4], [0.58, -1.45], [0.3, -1.3], [0.01, -1.1]], bronze, 24);
  bellPivot.add(bell);
  const bellRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  bellRing.position.y = -1.4;
  bellPivot.add(bellRing);
  let bellT = 99;

  const fishStand = new THREE.Group();
  fishStand.position.set(7.4, 0, -6.4);
  root.add(fishStand);
  box(0.9, 0.5, 0.9, red, 0, 0.25, 0, fishStand);
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 14).scale(1, 0.82, 0.9), new THREE.MeshStandardMaterial({ color: 0xb5652a, roughness: 0.45, emissive: 0x2a1000 }));
  fish.position.y = 0.88;
  fishStand.add(fish);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a1204 }));
  slit.position.set(0, 0.86, 0.34);
  fishStand.add(slit);
  let fishT = 99;

  // ---- information boards: live numbers and the latest wishes, drawn on the wall plaques ----
  const makeBoard = () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.6), new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d0c0 }));
    return { c, tex, mesh };
  };
  const boardL = makeBoard();
  const boardR = makeBoard();
  boardL.mesh.position.set(-6.2, 3.4, -15.7);
  boardR.mesh.position.set(6.2, 3.4, -15.7);
  root.add(boardL.mesh, boardR.mesh);
  for (const x of [-6.2, 6.2]) {
    box(2.5, 0.12, 0.2, gold, x, 5.75, -15.75);
    box(2.5, 0.12, 0.2, gold, x, 1.05, -15.75);
  }
  const frame = (g: CanvasRenderingContext2D, title: string) => {
    const gr = g.createLinearGradient(0, 0, 0, 1024);
    gr.addColorStop(0, '#2a0b09');
    gr.addColorStop(1, '#120403');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 1024);
    g.strokeStyle = '#e0b04a';
    g.lineWidth = 6;
    g.strokeRect(14, 14, 484, 996);
    g.lineWidth = 2;
    g.strokeRect(30, 30, 452, 964);
    g.fillStyle = '#f2cf7a';
    g.textAlign = 'center';
    g.font = '700 44px Lora, serif';
    g.fillText(title, 256, 110);
    g.fillRect(120, 135, 272, 3);
  };
  const wrap = (g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) => {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y);
        y += lh;
        if (++lines >= maxLines) return y;
        line = w;
      } else line = test;
    }
    if (line) g.fillText(line, x, y);
    return y + lh;
  };
  const setBoards: Hall['setBoards'] = (s, feed) => {
    const gl = boardL.c.getContext('2d')!;
    frame(gl, 'HÔM NAY');
    gl.textAlign = 'center';
    const rows: Array<[string, number]> = [['đang ở chánh điện', s.online], ['lượt ghé thăm', s.visitors], ['nén hương đã thắp', s.incense], ['lời nguyện đã gửi', s.wishes]];
    rows.forEach(([label, n], i) => {
      gl.fillStyle = '#fff1c4';
      gl.font = '700 92px Lora, serif';
      gl.fillText(String(n), 256, 280 + i * 190);
      gl.fillStyle = '#d9b36a';
      gl.font = '500 30px "Be Vietnam Pro", sans-serif';
      gl.fillText(label, 256, 330 + i * 190);
    });
    boardL.tex.needsUpdate = true;
    const gr = boardR.c.getContext('2d')!;
    frame(gr, 'LỜI NGUYỆN');
    gr.textAlign = 'center';
    let y = 215;
    feed.slice(-5).reverse().forEach((f) => {
      gr.fillStyle = '#f2cf7a';
      gr.font = '700 28px Lora, serif';
      gr.fillText(f.name.length > 18 ? `${f.name.slice(0, 17)}…` : f.name, 256, y);
      gr.fillStyle = '#f6ead2';
      gr.font = '500 27px "Be Vietnam Pro", sans-serif';
      y = wrap(gr, f.text, 256, y + 36, 400, 34, 3) + 22;
    });
    if (!feed.length) {
      gr.fillStyle = '#c9a868';
      gr.font = 'italic 500 28px "Be Vietnam Pro", sans-serif';
      wrap(gr, 'Hãy là người đầu tiên gửi một lời nguyện lành.', 256, 300, 400, 38, 4);
    }
    boardR.tex.needsUpdate = true;
  };
  setBoards({ online: 0, incense: 0, wishes: 0, visitors: 0 }, []);

  // ---- particles ----
  // smoke (custom shader so size and fade follow each particle's age)
  const SN = low ? 120 : 260;
  const smokePos = new Float32Array(SN * 3).fill(-100);
  const smokeVel = new Float32Array(SN * 3);
  const smokeLife = new Float32Array(SN).fill(1);
  const smokeSize = new Float32Array(SN);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute('aLife', new THREE.BufferAttribute(smokeLife, 1));
  smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(smokeSize, 1));
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: glowTex([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]) }, uScale: { value: 500 } },
    vertexShader: `attribute float aLife; attribute float aSize; varying float vLife; uniform float uScale;
      void main(){ vLife=aLife; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*(1.0+aLife*2.4)*uScale/(-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vLife;
      void main(){ vec4 t=texture2D(uMap,gl_PointCoord); gl_FragColor=vec4(0.86,0.82,0.76,t.a*(1.0-vLife)*smoothstep(0.0,0.08,vLife)*0.16); }`,
    transparent: true,
    depthWrite: false,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  root.add(smoke);
  let smokeNext = 0;
  const emitSmoke = (x: number, y: number, z: number) => {
    const i = smokeNext++ % SN;
    smokePos.set([x, y, z], i * 3);
    smokeVel.set([(rnd() - 0.5) * 0.06, 0.28 + rnd() * 0.2, (rnd() - 0.5) * 0.06], i * 3);
    smokeLife[i] = 0;
    smokeSize[i] = 0.22 + rnd() * 0.12;
  };

  // lotus petals falling slowly from the ceiling, burst upward when someone lights incense
  const PN = low ? 50 : 110;
  const petalPos = new Float32Array(PN * 3);
  const petalVy = new Float32Array(PN);
  const petalSeed = new Float32Array(PN);
  for (let i = 0; i < PN; i++) {
    petalPos.set([(rnd() - 0.5) * 15, rnd() * 7.5, (rnd() - 0.5) * 24], i * 3);
    petalVy[i] = -(0.18 + rnd() * 0.22);
    petalSeed[i] = rnd() * 10;
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petals = new THREE.Points(
    petalGeo,
    new THREE.PointsMaterial({
      size: 0.2,
      map: canvasTex(64, 64, (g) => {
        g.fillStyle = '#f7b9c9';
        g.beginPath();
        g.ellipse(32, 32, 12, 26, 0.5, 0, Math.PI * 2);
        g.fill();
      }),
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  petals.frustumCulled = false;
  root.add(petals);
  const petalBurst = (at: THREE.Vector3, n = 24) => {
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * PN);
      petalPos.set([at.x + (rnd() - 0.5) * 1.2, at.y + rnd() * 0.8, at.z + (rnd() - 0.5) * 1.2], i * 3);
      petalVy[i] = 0.7 + rnd() * 1.1;
    }
  };

  // dust motes
  const DN = low ? 80 : 220;
  const dustPos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) dustPos.set([(rnd() - 0.5) * 16, 0.5 + rnd() * 6.5, -14 + rnd() * 26], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ size: 0.05, map: glowTex([[0, 'rgba(255,235,190,1)'], [1, 'rgba(255,235,190,0)']]), color: 0xffe2a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 })
  );
  dust.frustumCulled = false;
  root.add(dust);

  // ---- floating wish lanterns ----
  type Floater = { g: THREE.Group; born: number; x0: number; seed: number };
  const floaters: Floater[] = [];
  const lanternGlow = glowTex([[0, 'rgba(255,245,200,1)'], [0.3, 'rgba(255,170,90,0.85)'], [1, 'rgba(255,110,40,0)']]);
  const releaseLantern = (from: THREE.Vector3, name: string) => {
    if (floaters.length >= 14) {
      const old = floaters.shift()!;
      scene.remove(old.g);
    }
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10).scale(1, 1.2, 1), new THREE.MeshBasicMaterial({ color: 0xffc27a, toneMapped: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lanternGlow, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.setScalar(1.6);
    const label = canvasTex(256, 64, (c, w, h) => {
      c.font = '600 26px Lora, serif';
      c.textAlign = 'center';
      c.fillStyle = '#ffe9b8';
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 6;
      c.fillText(name.length > 16 ? `${name.slice(0, 15)}…` : name, w / 2, h / 2 + 8);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = -0.55;
    g.add(core, glow, sprite);
    g.position.copy(from).add(new THREE.Vector3(0, 1.4, 0));
    scene.add(g);
    floaters.push({ g, born: now, x0: g.position.x, seed: rnd() * 10 });
  };

  // ---- per-frame ----
  const update = (t: number, dt: number) => {
    now = t;
    lantern(t);
    altarLight.intensity = 36 + Math.sin(t * 7) * 3 + Math.sin(t * 13.1) * 2;
    flames.forEach((f, i) => {
      const k = 1 + Math.sin(t * 9 + i * 2) * 0.08 + Math.sin(t * 17 + i) * 0.05;
      f.scale.set(0.38 * k, 0.55 * k, 1);
    });
    rays.rotation.z = t * 0.03;
    halo.scale.setScalar(1 + Math.sin(t * 0.9) * 0.025);
    shafts.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 0.4 + i) * 0.015));

    // smoke from the burner and the lit sticks
    for (let n = 0; n < 1 + Math.random() * 0.4; n++) if (Math.random() < dt * 6) emitSmoke(URN_TOP.x + (rnd() - 0.5) * 0.3, URN_TOP.y + 0.05, URN_TOP.z + (rnd() - 0.5) * 0.3);
    for (const s of sticks) {
      const burn = Math.min(1, (t - s.born) / 110);
      s.g.scale.y = 1 - burn * 0.7;
      if (Math.random() < dt * 5 && burn < 1) {
        const w = s.g.localToWorld(new THREE.Vector3(0, 0.6, 0));
        emitSmoke(w.x, w.y, w.z);
      }
    }
    for (let i = sticks.length - 1; i >= 0; i--) {
      if (t - sticks[i].born > 118) {
        table.remove(sticks[i].g);
        sticks.splice(i, 1);
      }
    }
    for (let i = 0; i < SN; i++) {
      if (smokeLife[i] >= 1) continue;
      smokeLife[i] += dt / 4.5;
      smokePos[i * 3] += smokeVel[i * 3] * dt + Math.sin(t * 0.8 + i) * 0.04 * dt;
      smokePos[i * 3 + 1] += smokeVel[i * 3 + 1] * dt;
      smokePos[i * 3 + 2] += smokeVel[i * 3 + 2] * dt;
      if (smokeLife[i] >= 1) smokePos[i * 3 + 1] = -100;
    }
    smokeGeo.attributes.position.needsUpdate = true;
    smokeGeo.attributes.aLife.needsUpdate = true;
    smokeGeo.attributes.aSize.needsUpdate = true;

    for (let i = 0; i < PN; i++) {
      const fall = -(0.18 + (petalSeed[i] % 1) * 0.22);
      petalVy[i] += (fall - petalVy[i]) * Math.min(1, dt * 0.9);
      petalPos[i * 3 + 1] += petalVy[i] * dt;
      petalPos[i * 3] += Math.sin(t * 0.6 + petalSeed[i]) * 0.18 * dt;
      if (petalPos[i * 3 + 1] < 0.05) {
        petalPos[i * 3 + 1] = 7.5;
        petalPos[i * 3] = (rnd() - 0.5) * 15;
        petalPos[i * 3 + 2] = (rnd() - 0.5) * 24;
      }
    }
    petalGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < DN; i++) {
      dustPos[i * 3] += Math.sin(t * 0.3 + i) * 0.05 * dt;
      dustPos[i * 3 + 1] += Math.cos(t * 0.25 + i * 1.3) * 0.04 * dt;
    }
    dustGeo.attributes.position.needsUpdate = true;

    if (bellT < 8) {
      bellT += dt;
      bellPivot.rotation.z = Math.sin(bellT * 5) * 0.16 * Math.exp(-bellT * 0.7);
      const rt = Math.min(1, bellT / 1.6);
      bellRing.scale.setScalar(1 + rt * 2.2);
      (bellRing.material as THREE.MeshBasicMaterial).opacity = (1 - rt) * 0.7;
    }
    if (fishT < 1) {
      fishT += dt * 5;
      fish.scale.setScalar(1 - Math.sin(Math.min(1, fishT) * Math.PI) * 0.08);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const age = t - f.born;
      f.g.position.y += dt * 0.55;
      f.g.position.x = f.x0 + Math.sin(age * 0.7 + f.seed) * 0.5;
      const fade = f.g.position.y > 5.8 ? Math.max(0, 1 - (f.g.position.y - 5.8) / 1.5) : 1;
      f.g.children.forEach((c) => {
        const m = (c as THREE.Mesh | THREE.Sprite).material as THREE.Material;
        m.transparent = true;
        m.opacity = fade;
      });
      if (fade <= 0) {
        scene.remove(f.g);
        floaters.splice(i, 1);
      }
    }
  };

  return {
    update,
    plantIncense,
    ringBell: () => (bellT = 0),
    tapFish: () => (fishT = 0),
    releaseLantern,
    petalBurst,
    setBoards,
    setSeatNumbers: (taken) => {
      occupied = taken;
      drawAtlas();
    },
    setViewport: (h, fov) => (smokeMat.uniforms.uScale.value = h / (2 * Math.tan(fov / 2))),
    dispose: () => {
      pmrem.dispose();
      envMap.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
    },
  };
}

