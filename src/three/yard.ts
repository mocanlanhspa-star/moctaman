/**
 * Everything outside the hall: a night garden with a paved axis path, two lotus ponds (leaves, flowers, koi,
 * moonlit water), roofed corridors on both sides, trimmed pines, round trees, cypress and bodhi trees, bamboo
 * along the wall, stone lanterns, fireflies, the tiled roof and sign of the hall, and the gate at the far end.
 */
import * as THREE from 'three';
import { canvasTex, glowTex, mulberry32 } from './hall';
import { PONDS, addObstacles, type Circle } from './walk';

export type Yard = { update(t: number, dt: number): void; dispose(): void };

const Z0 = 15; // the garden ground starts where the hall floor ends
const Z1 = 64;
const XH = 22;
const GATE_Z = 60.4;

export function buildYard(scene: THREE.Scene, low: boolean): Yard {
  const rnd = mulberry32(2024);
  const root = new THREE.Group();
  scene.add(root);
  const colliders: Circle[] = [];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  scene.background = new THREE.Color(0x0a1022);
  scene.fog = new THREE.FogExp2(0x131018, 0.012);

  const stone = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 0.92 });
  const plaster = new THREE.MeshStandardMaterial({ color: 0x5a2a20, roughness: 0.95 });
  const red = new THREE.MeshPhysicalMaterial({ color: 0x8e1512, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe2b13c, metalness: 1, roughness: 0.3, emissive: 0x2a1a02 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2b1408, roughness: 0.65 });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  };

  // ---------------------------------------------------------------- sky, moon, far ground
  const skyTex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#04081a');
    gr.addColorStop(0.45, '#101a38');
    gr.addColorStop(0.58, '#2b2c52');
    gr.addColorStop(0.62, '#3a2b3e');
    gr.addColorStop(0.63, '#0b0a10');
    gr.addColorStop(1, '#0b0a10');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      g.fillRect(rnd() * w, rnd() * h * 0.55, rnd() < 0.12 ? 2 : 1, 1);
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  root.add(sky);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, '#fffbe8'], [0.22, '#fff2c8'], [0.27, 'rgba(255,240,190,0.3)'], [1, 'rgba(255,240,190,0)']]), toneMapped: false, fog: false, depthWrite: false }));
  moon.scale.setScalar(26);
  moon.position.set(40, 58, 120);
  root.add(moon);
  const moonLight = new THREE.DirectionalLight(0x8aa4e6, 0.5);
  moonLight.position.set(-20, 40, 60);
  root.add(moonLight);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x070a08, roughness: 1 }));
  far.position.y = -0.03;
  root.add(far);

  // ---------------------------------------------------------------- ground painted from above
  const GW = 1024;
  const GH = Math.round((GW * (Z1 - Z0)) / (2 * XH));
  const u = (x: number) => ((x + XH) / (2 * XH)) * GW;
  const v = (z: number) => ((z - Z0) / (Z1 - Z0)) * GH;
  const groundTex = canvasTex(GW, GH, (g) => {
    g.fillStyle = '#6f6a60';
    g.fillRect(0, 0, GW, GH);
    for (let i = 0; i < 26000; i++) {
      const k = 90 + rnd() * 90;
      g.fillStyle = `rgba(${k},${k - 6},${k - 14},0.28)`;
      g.fillRect(rnd() * GW, rnd() * GH, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    const lawn = (x0: number, x1: number, z0: number, z1: number) => {
      for (let i = 0; i < 1500; i++) {
        const x = x0 + rnd() * (x1 - x0);
        const z = z0 + rnd() * (z1 - z0);
        g.fillStyle = ['#1f3a26', '#254528', '#1b3322', '#2a4e2d'][(rnd() * 4) | 0];
        g.beginPath();
        g.arc(u(x), v(z), 6 + rnd() * 14, 0, Math.PI * 2);
        g.fill();
      }
    };
    for (const s of [-1, 1]) {
      lawn(Math.min(s * 12.4, s * 15.2), Math.max(s * 12.4, s * 15.2), Z0, 58);
      lawn(Math.min(s * 3.6, s * 12.4), Math.max(s * 3.6, s * 12.4), 45, 58);
      lawn(Math.min(s * 7, s * 12.4), Math.max(s * 7, s * 12.4), Z0, 23);
    }
    // ponds: dark bed under the water
    g.fillStyle = '#0a1a1c';
    for (const p of PONDS) g.fillRect(u(p.x0), v(p.z0), u(p.x1) - u(p.x0), v(p.z1) - v(p.z0));
    // axis path and plaza: paving
    const paving = (x0: number, x1: number, z0: number, z1: number) => {
      g.fillStyle = '#8c867a';
      g.fillRect(u(x0), v(z0), u(x1) - u(x0), v(z1) - v(z0));
      for (let x = Math.ceil(x0); x <= x1; x++) {
        for (let z = Math.ceil(z0); z <= z1; z++) {
          g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
          g.fillRect(u(x), v(z), u(1) - u(0), v(1) - v(0));
        }
      }
      g.strokeStyle = 'rgba(40,36,30,0.7)';
      g.lineWidth = 2;
      for (let x = Math.ceil(x0); x <= x1; x++) {
        g.beginPath();
        g.moveTo(u(x), v(z0));
        g.lineTo(u(x), v(z1));
        g.stroke();
      }
      for (let z = Math.ceil(z0); z <= z1; z++) {
        g.beginPath();
        g.moveTo(u(x0), v(z));
        g.lineTo(u(x1), v(z));
        g.stroke();
      }
    };
    paving(-2.6, 2.6, Z0, 59.4);
    paving(-6.5, 6.5, Z0, 22);
    paving(-4.5, 4.5, 55, 59.4);
    // corridor floors: wood
    for (const s of [-1, 1]) {
      const x0 = Math.min(s * 15.2, s * 19.6);
      const x1 = Math.max(s * 15.2, s * 19.6);
      g.fillStyle = '#4a2e1a';
      g.fillRect(u(x0), v(15.5), u(x1) - u(x0), v(59.4) - v(15.5));
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      for (let x = x0; x <= x1; x += 0.45) {
        g.beginPath();
        g.moveTo(u(x), v(15.5));
        g.lineTo(u(x), v(59.4));
        g.stroke();
      }
    }
    // pond rims
    g.strokeStyle = '#9a948a';
    g.lineWidth = 8;
    for (const p of PONDS) g.strokeRect(u(p.x0) - 4, v(p.z0) - 4, u(p.x1) - u(p.x0) + 8, v(p.z1) - v(p.z0) + 8);
  });
  groundTex.anisotropy = 12;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * XH, Z1 - Z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9 }));
  ground.position.set(0, 0, (Z0 + Z1) / 2);
  root.add(ground);

  // ---------------------------------------------------------------- walls
  box(0.5, 3.2, GATE_Z - 14.6, plaster, -20.2, 1.6, (GATE_Z + 14.6) / 2);
  box(0.5, 3.2, GATE_Z - 14.6, plaster, 20.2, 1.6, (GATE_Z + 14.6) / 2);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x4a2018, roughness: 0.8 });
  box(1.0, 0.2, GATE_Z - 14.6, capMat, -20.2, 3.3, (GATE_Z + 14.6) / 2);
  box(1.0, 0.2, GATE_Z - 14.6, capMat, 20.2, 3.3, (GATE_Z + 14.6) / 2);

  // ---------------------------------------------------------------- tiled roofs
  const tileTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a2018';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, y, w, 3);
      for (let x = (y / 16) % 2 ? 0 : 8; x < w; x += 16) {
        g.fillStyle = `rgba(${150 + rnd() * 50},${60 + rnd() * 30},40,0.25)`;
        g.fillRect(x, y + 3, 14, 12);
      }
    }
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  const roofMat = (rx: number, ry: number) => {
    const t = tileTex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  };
  const hallZ = -0.8;
  const slope = Math.atan2(12 - 8, 16.8);
  const slopeLen = Math.hypot(16.8, 4);
  for (const s of [1, -1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.34, slopeLen), roofMat(8, 7));
    slab.position.set(0, 10, hallZ + s * 8.4);
    slab.rotation.x = s * slope;
    root.add(slab);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(22.2, 0.35, 0.3), darkWood);
    fascia.position.set(0, 7.95, hallZ + s * 16.75);
    root.add(fascia);
    const goldLine = new THREE.Mesh(new THREE.BoxGeometry(22.2, 0.08, 0.34), gold);
    goldLine.position.set(0, 7.75, hallZ + s * 16.78);
    root.add(goldLine);
  }
  box(22.4, 0.45, 0.6, new THREE.MeshStandardMaterial({ color: 0x5a1a12, roughness: 0.6 }), 0, 12.12, hallZ);
  for (const sx of [-1, 1]) {
    const orn = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.3, 8), gold);
    orn.position.set(sx * 11.3, 12.6, hallZ);
    orn.rotation.z = -sx * 0.35;
    root.add(orn);
    for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.0, 6), gold);
      corner.position.set(sx * 10.9, 8.5, hallZ + sz * 16.7);
      corner.rotation.set(sz * 0.5, 0, -sx * 0.5);
      root.add(corner);
    }
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-16.8, 0);
    gableShape.lineTo(16.8, 0);
    gableShape.lineTo(0, 4);
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), new THREE.MeshStandardMaterial({ color: 0x5a2a20, roughness: 0.95, side: THREE.DoubleSide }));
    gable.rotation.y = sx * Math.PI / 2;
    gable.position.set(sx * 10.1, 8, hallZ);
    root.add(gable);
  }

  // sign board over the doorway
  const signTex = canvasTex(1024, 200, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2a0b09');
    gr.addColorStop(1, '#120403');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e0b04a';
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 2;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = '#f2cf7a';
    g.textAlign = 'center';
    g.font = '700 92px Lora, serif';
    g.fillText('TÂM TỊNH TÂM AN', w / 2, h / 2 + 32);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.1), new THREE.MeshBasicMaterial({ map: signTex, color: 0xdcd2c0 }));
  sign.position.set(0, 6.1, 14.63);
  root.add(sign);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 7.6, 18), red);
    post.position.set(sx * 2.45, 3.8, 15.1);
    root.add(post);
    for (const y of [0.4, 7.3]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20).rotateX(Math.PI / 2), gold);
      ring.position.set(sx * 2.45, y, 15.1);
      root.add(ring);
    }
  }

  // ---------------------------------------------------------------- corridors
  const corridorZ0 = 15.6;
  const corridorZ1 = 59;
  const corrLen = corridorZ1 - corridorZ0;
  const corrCols: number[] = [];
  for (let z = 17; z < corridorZ1; z += 3.6) corrCols.push(z);
  const colGeo = new THREE.CylinderGeometry(0.2, 0.24, 3.8, 14);
  const colMesh = new THREE.InstancedMesh(colGeo, red, corrCols.length * 2);
  corrCols.forEach((z, i) => {
    [-1, 1].forEach((s, k) => {
      dummy.position.set(s * 15.3, 1.9, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      colMesh.setMatrixAt(i * 2 + k, dummy.matrix);
      colliders.push({ x: s * 15.3, z, r: 0.32 });
    });
  });
  root.add(colMesh);
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.26, corrLen + 1), roofMat(3, 14));
    roof.position.set(s * 17.8, 3.82, (corridorZ0 + corridorZ1) / 2);
    roof.rotation.z = s * 0.09;
    root.add(roof);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, corrLen + 1), darkWood);
    beam.position.set(s * 15.3, 3.7, (corridorZ0 + corridorZ1) / 2);
    root.add(beam);
  }

  // red hanging lanterns: corridors, doorway, gate (all one instanced mesh)
  const lanternSpots: Array<[number, number, number]> = [];
  for (const s of [-1, 1]) for (let z = 18.8; z < corridorZ1; z += 3.6) lanternSpots.push([s * 16.2, 3.0, z]);
  for (const s of [-1, 1]) lanternSpots.push([s * 3.7, 4.4, 15.4]);
  for (const s of [-1, 1]) lanternSpots.push([s * 2.0, 4.6, GATE_Z - 0.9]);
  const lanternMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 9).scale(0.3, 0.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x6a0e0a, emissive: 0xff3b12, emissiveIntensity: 2.2, roughness: 0.6 }),
    lanternSpots.length
  );
  lanternSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lanternMesh.setMatrixAt(i, dummy.matrix);
  });
  root.add(lanternMesh);

  // ---------------------------------------------------------------- stone lanterns along the path
  const stoneSpots: Array<[number, number]> = [];
  for (const z of [17.5, 26, 34, 42, 50, 57]) for (const s of [-1, 1]) stoneSpots.push([s * 3.0, z]);
  const parts: Array<[THREE.BufferGeometry, THREE.Material, number]> = [
    [new THREE.BoxGeometry(0.6, 0.2, 0.6), stone, 0.1],
    [new THREE.CylinderGeometry(0.13, 0.16, 0.85, 8), stone, 0.62],
    [new THREE.BoxGeometry(0.52, 0.4, 0.52), new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0xffa84a, emissiveIntensity: 2.2 }), 1.25],
    [new THREE.ConeGeometry(0.62, 0.4, 4).rotateY(Math.PI / 4), stone, 1.65],
    [new THREE.SphereGeometry(0.09, 8, 6), stone, 1.92],
  ];
  for (const [geo, mat, y] of parts) {
    const mesh = new THREE.InstancedMesh(geo, mat, stoneSpots.length);
    stoneSpots.forEach(([x, z], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    root.add(mesh);
  }
  stoneSpots.forEach(([x, z]) => colliders.push({ x, z, r: 0.4 }));

  // soft glow around every lantern (one Points object)
  const glowPts: number[] = [];
  stoneSpots.forEach(([x, z]) => glowPts.push(x, 1.25, z));
  lanternSpots.forEach(([x, y, z]) => glowPts.push(x, y, z));
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
  const glowMat = new THREE.PointsMaterial({
    size: 2.1,
    map: glowTex([[0, 'rgba(255,200,120,0.9)'], [0.35, 'rgba(255,150,70,0.35)'], [1, 'rgba(255,120,40,0)']]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.frustumCulled = false;
  root.add(glow);

  // ---------------------------------------------------------------- ponds
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: new THREE.Vector3(0.25, 0.8, 0.55).normalize() } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uMoon; varying vec3 vW;
      void main(){
        vec2 p=vW.xz;
        vec3 n=normalize(vec3(sin(p.x*2.3+uTime*0.9)*0.05+sin(p.y*3.1-uTime*0.7)*0.04,1.0,cos(p.y*2.1+uTime*0.8)*0.05+cos(p.x*3.7+uTime*0.6)*0.03));
        vec3 v=normalize(cameraPosition-vW);
        float f=pow(1.0-max(dot(n,v),0.0),3.0);
        vec3 col=mix(vec3(0.015,0.07,0.075),vec3(0.16,0.22,0.38),f*0.9);
        col+=vec3(0.9,0.95,1.0)*pow(max(dot(reflect(-v,n),uMoon),0.0),120.0)*1.2;
        gl_FragColor=vec4(col,0.74);
      }`,
  });
  for (const p of PONDS) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), waterMat);
    water.position.set(cx, 0.14, cz);
    water.renderOrder = 2;
    root.add(water);
    box(w + 1, 0.34, 0.5, stone, cx, 0.17, p.z0 - 0.25);
    box(w + 1, 0.34, 0.5, stone, cx, 0.17, p.z1 + 0.25);
    box(0.5, 0.34, d, stone, p.x0 - 0.25, 0.17, cz);
    box(0.5, 0.34, d, stone, p.x1 + 0.25, 0.17, cz);
  }
  const inPond = (inset: number) => {
    const p = PONDS[rnd() < 0.5 ? 0 : 1];
    return { p, x: p.x0 + inset + rnd() * (p.x1 - p.x0 - 2 * inset), z: p.z0 + inset + rnd() * (p.z1 - p.z0 - 2 * inset) };
  };
  // lotus leaves
  const LEAVES = low ? 50 : 100;
  const leafMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2d6b34, roughness: 0.6, side: THREE.DoubleSide }), LEAVES);
  for (let i = 0; i < LEAVES; i++) {
    const { x, z } = inPond(0.6);
    const r = 0.3 + rnd() * 0.4;
    dummy.position.set(x, 0.17, z);
    dummy.rotation.set((rnd() - 0.5) * 0.12, rnd() * 6, (rnd() - 0.5) * 0.12);
    dummy.scale.set(r, 1, r);
    dummy.updateMatrix();
    leafMesh.setMatrixAt(i, dummy.matrix);
    leafMesh.setColorAt(i, col.setHex([0x2d6b34, 0x28602f, 0x357a3a][(rnd() * 3) | 0]));
  }
  root.add(leafMesh);
  // lotus flowers: every petal is one instance of a single mesh
  const FLOWERS = low ? 12 : 26;
  const RINGS = [8, 10];
  const petalMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf6b3c6, roughness: 0.5, emissive: 0xf08aa8, emissiveIntensity: 0.28 }), FLOWERS * 18);
  const heartMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2c94a, emissive: 0xf2c94a, emissiveIntensity: 0.6 }), FLOWERS);
  const mat4 = new THREE.Matrix4();
  let pi = 0;
  for (let f = 0; f < FLOWERS; f++) {
    const { x, z } = inPond(0.7);
    const r = 0.2 + rnd() * 0.12;
    const tint = rnd() < 0.3 ? 0xfff0f4 : 0xf6a8c0;
    RINGS.forEach((count, ring) => {
      const tilt = 0.35 + ring * 0.4;
      const len = r * (1 - ring * 0.18);
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2 + ring * 0.4;
        mat4
          .makeTranslation(x, 0.17, z)
          .multiply(new THREE.Matrix4().makeRotationY(ang))
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, r * 0.1))
          .multiply(new THREE.Matrix4().makeRotationX(tilt))
          .multiply(new THREE.Matrix4().makeTranslation(0, len * 0.5, 0))
          .multiply(new THREE.Matrix4().makeScale(r * 0.3, len * 0.5, r * 0.09));
        petalMesh.setMatrixAt(pi, mat4);
        petalMesh.setColorAt(pi, col.setHex(tint));
        pi++;
      }
    });
    heartMesh.setMatrixAt(f, mat4.makeTranslation(x, 0.3, z));
  }
  petalMesh.count = pi;
  root.add(petalMesh, heartMesh);
  // koi under the surface
  const KOI = low ? 6 : 10;
  const koiMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x331a08, emissiveIntensity: 0.4 }), KOI);
  const koi = Array.from({ length: KOI }, (_, i) => {
    const p = PONDS[i % 2];
    koiMesh.setColorAt(i, col.setHex([0xff7a2a, 0xf4efe6, 0xf0b030, 0xe8502a][i % 4]));
    return { cx: (p.x0 + p.x1) / 2, cz: (p.z0 + p.z1) / 2, rx: 2.5 + rnd() * 1.8, rz: 4 + rnd() * 5, sp: 0.12 + rnd() * 0.12, ph: rnd() * 6 };
  });
  root.add(koiMesh);

  // ---------------------------------------------------------------- trees
  type Blob = { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number };
  const GREENS = [0x1c4a28, 0x245a30, 0x2e6b38, 0x1a3f26, 0x35703c];
  const trunks: Array<{ x: number; z: number; r: number; h: number; lean: number }> = [];
  const blobs: Blob[] = [];
  const nearPond = (x: number, z: number, m: number) => PONDS.some((p) => x > p.x0 - m && x < p.x1 + m && z > p.z0 - m && z < p.z1 + m);
  const plant = (x: number, z: number, type: 'pine' | 'round' | 'cypress' | 'bodhi', s: number) => {
    const c = () => GREENS[(rnd() * GREENS.length) | 0];
    const r = (a: number) => (rnd() - 0.5) * a;
    if (type === 'pine') {
      trunks.push({ x, z, r: 0.2 * s, h: 3.4 * s, lean: r(0.3) });
      for (let i = 0; i < 5; i++) blobs.push({ x: x + r(1.4) * s, y: (1.5 + i * 0.5) * s, z: z + r(1.4) * s, sx: (1.5 - i * 0.14) * s, sy: 0.5 * s, sz: (1.5 - i * 0.14) * s, c: c() });
    } else if (type === 'round') {
      trunks.push({ x, z, r: 0.22 * s, h: 2.6 * s, lean: 0 });
      for (let i = 0; i < 4; i++) blobs.push({ x: x + r(1.6) * s, y: (3.2 + rnd() * 1.1) * s, z: z + r(1.6) * s, sx: (1.3 + rnd() * 0.5) * s, sy: (1.2 + rnd() * 0.4) * s, sz: (1.3 + rnd() * 0.5) * s, c: c() });
    } else if (type === 'cypress') {
      trunks.push({ x, z, r: 0.14 * s, h: 1.2 * s, lean: 0 });
      for (let i = 0; i < 3; i++) blobs.push({ x, y: (2.2 + i * 1.2) * s, z, sx: (0.8 - i * 0.12) * s, sy: 1.5 * s, sz: (0.8 - i * 0.12) * s, c: c() });
    } else {
      trunks.push({ x, z, r: 0.5 * s, h: 3.4 * s, lean: 0 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        blobs.push({ x: x + Math.cos(a) * 2.3 * s, y: (4.8 + rnd() * 1.4) * s, z: z + Math.sin(a) * 2.3 * s, sx: 2.1 * s, sy: 1.5 * s, sz: 2.1 * s, c: c() });
      }
      blobs.push({ x, y: 6.6 * s, z, sx: 2.6 * s, sy: 1.6 * s, sz: 2.6 * s, c: c() });
    }
    colliders.push({ x, z, r: type === 'bodhi' ? 0.9 * s : 0.5 * s });
  };
  plant(-9.8, 18.8, 'bodhi', 1.1);
  plant(9.8, 18.8, 'bodhi', 1.0);
  plant(-8, 50, 'pine', 1.2);
  plant(8, 50, 'pine', 1.2);
  const planted: Array<[number, number]> = [[-9.8, 18.8], [9.8, 18.8], [-8, 50], [8, 50]];
  let tries = 0;
  while (planted.length < (low ? 16 : 30) && tries++ < 600) {
    const x = (rnd() * 2 - 1) * 14.3;
    const z = 17 + rnd() * 41;
    if (Math.abs(x) < 3.5 || nearPond(x, z, 1.3) || planted.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.4)) continue;
    if (z < 24 && Math.abs(x) < 7.2) continue;
    planted.push([x, z]);
    const t = rnd();
    plant(x, z, t < 0.4 ? 'pine' : t < 0.7 ? 'round' : 'cypress', 0.85 + rnd() * 0.5);
  }
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 }), trunks.length);
  trunks.forEach((t, i) => {
    dummy.position.set(t.x, t.h / 2, t.z);
    dummy.rotation.set(0, 0, t.lean);
    dummy.scale.set(t.r, t.h, t.r);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
  });
  const leafBlobs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), blobs.length);
  blobs.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.scale.set(b.sx, b.sy, b.sz);
    dummy.updateMatrix();
    leafBlobs.setMatrixAt(i, dummy.matrix);
    leafBlobs.setColorAt(i, col.setHex(b.c));
  });
  root.add(trunkMesh, leafBlobs);

  // bamboo along both outer walls
  const stalks: Array<{ x: number; z: number; h: number }> = [];
  for (const s of [-1, 1]) {
    for (let z = 17; z < 58; z += low ? 3.2 : 1.7) {
      for (let k = 0; k < 4; k++) stalks.push({ x: s * (19.4 + rnd() * 0.6) + (rnd() - 0.5) * 0.5, z: z + (rnd() - 0.5) * 1.2, h: 6 + rnd() * 2.8 });
    }
  }
  const stalkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.065, 1, 5), new THREE.MeshStandardMaterial({ color: 0x7ba444, roughness: 0.7 }), stalks.length);
  const puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ color: 0x3f7a30, roughness: 0.9 }), stalks.length * 2);
  stalks.forEach((s, i) => {
    dummy.position.set(s.x, s.h / 2, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, s.h, 1);
    dummy.updateMatrix();
    stalkMesh.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 2; k++) {
      dummy.position.set(s.x - Math.sign(s.x) * k * 0.3, s.h - 0.4 - k * 1.3, s.z);
      dummy.scale.set(0.9, 0.38, 0.9);
      dummy.updateMatrix();
      puffMesh.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  });
  root.add(stalkMesh, puffMesh);

  // ---------------------------------------------------------------- the gate at the far end
  for (const s of [-1, 1]) {
    const big = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 7, 16), red);
    big.position.set(s * 3.6, 3.5, GATE_Z);
    root.add(big);
    const small = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 5.2, 14), red);
    small.position.set(s * 7.6, 2.6, GATE_Z);
    root.add(small);
    box(3.6, 0.6, 0.8, red, s * 5.6, 4.9, GATE_Z);
    box(12.2, 3.2, 0.6, plaster, s * 13.7, 1.6, GATE_Z);
    box(12.2, 0.2, 1.0, capMat, s * 13.7, 3.3, GATE_Z);
    for (const x of [s * 3.6]) for (const y of [0.4, 6.8]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 20).rotateX(Math.PI / 2), gold);
      ring.position.set(x, y, GATE_Z);
      root.add(ring);
    }
  }
  box(8.4, 0.9, 1.1, red, 0, 6.6, GATE_Z);
  box(8.6, 0.1, 1.2, gold, 0, 6.1, GATE_Z);
  for (const s of [1, -1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 3.4), roofMat(4, 1.5));
    slab.position.set(0, 7.7, GATE_Z + s * 1.5);
    slab.rotation.x = -s * 0.32;
    root.add(slab);
  }
  box(11.2, 0.4, 0.5, new THREE.MeshStandardMaterial({ color: 0x5a1a12 }), 0, 8.5, GATE_Z);
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.05), new THREE.MeshBasicMaterial({ map: signTex, color: 0xdcd2c0 }));
  gateSign.position.set(0, 6.6, GATE_Z - 0.62);
  gateSign.rotation.y = Math.PI;
  root.add(gateSign);
  box(8, 7.2, 0.3, new THREE.MeshBasicMaterial({ color: 0x03060a }), 0, 3.6, GATE_Z + 3);
  colliders.push(...[-1, 1].map((s) => ({ x: s * 3.6, z: GATE_Z - 0.2, r: 0.7 })));

  // ---------------------------------------------------------------- fireflies
  const FN = low ? 30 : 70;
  const fx = new Float32Array(FN * 3);
  const fseed = new Float32Array(FN);
  for (let i = 0; i < FN; i++) {
    const near = rnd() < 0.6 ? PONDS[(rnd() * 2) | 0] : null;
    fx.set(near ? [near.x0 - 1 + rnd() * (near.x1 - near.x0 + 2), 0.6 + rnd() * 1.6, near.z0 - 1 + rnd() * (near.z1 - near.z0 + 2)] : [(rnd() * 2 - 1) * 14, 0.8 + rnd() * 2.2, 17 + rnd() * 40], i * 3);
    fseed[i] = rnd() * 20;
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(fx, 3));
  const flyMat = new THREE.PointsMaterial({
    size: 0.2,
    map: glowTex([[0, 'rgba(230,255,140,1)'], [0.4, 'rgba(190,240,90,0.5)'], [1, 'rgba(160,230,60,0)']]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.frustumCulled = false;
  root.add(flies);

  addObstacles(colliders);

  // ---------------------------------------------------------------- per frame
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const update = (t: number, dt: number) => {
    waterMat.uniforms.uTime.value = t;
    koi.forEach((k, i) => {
      const a = k.ph + t * k.sp;
      const x = k.cx + Math.cos(a) * k.rx;
      const z = k.cz + Math.sin(a * 1.3) * k.rz;
      const dx = -Math.sin(a) * k.rx;
      const dz = Math.cos(a * 1.3) * 1.3 * k.rz;
      dummy.position.set(x, 0.1, z);
      dummy.quaternion.copy(q.setFromAxisAngle(up, Math.atan2(dx, dz)));
      dummy.scale.set(0.09, 0.06, 0.3);
      dummy.updateMatrix();
      koiMesh.setMatrixAt(i, dummy.matrix);
    });
    koiMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < FN; i++) {
      const s = fseed[i];
      fx[i * 3] += Math.sin(t * 0.5 + s) * 0.25 * dt;
      fx[i * 3 + 1] += Math.cos(t * 0.7 + s * 1.3) * 0.2 * dt;
      fx[i * 3 + 2] += Math.cos(t * 0.4 + s * 0.7) * 0.25 * dt;
    }
    flyGeo.attributes.position.needsUpdate = true;
    flyMat.opacity = 0.7 + Math.sin(t * 3) * 0.3;
    glowMat.opacity = 0.85 + Math.sin(t * 5.3) * 0.06;
  };

  return {
    update,
    dispose: () =>
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      }),
  };
}
