import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Generic mid-size sedan built to real proportions (traced side / top / front silhouettes of a mid-size sedan,
// scaled to 4.57 m x 1.78 m x 1.44 m, wheelbase 2.70 m, 225/45 R17). Faces +z; its left side (driver, LHD) is +x.
const L = 4.57, HALF = L / 2;
const zOf = (u) => -HALF + L * u;
function curve(pts) {
  return (u) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, va] = pts[i], [b, vb] = pts[i + 1];
      if (u <= b) {
        // Catmull-Rom style smoothing using neighbours
        const p0 = pts[Math.max(0, i - 1)][1], p3 = pts[Math.min(pts.length - 1, i + 2)][1];
        const t = (u - a) / (b - a), t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * va) + (-p0 + vb) * t + (2 * p0 - 5 * va + 4 * vb - p3) * t2 + (-p0 + 3 * va - 3 * vb + p3) * t3);
      }
    }
    return pts[pts.length - 1][1];
  };
}
// half width (plan view)
const width = curve([[0, 0.10], [0.012, 0.42], [0.023, 0.52], [0.046, 0.68], [0.069, 0.785], [0.092, 0.82], [0.115, 0.84], [0.16, 0.85], [0.23, 0.87], [0.30, 0.89], [0.40, 0.875], [0.55, 0.89], [0.65, 0.875], [0.80, 0.865], [0.85, 0.86], [0.871, 0.845], [0.894, 0.82], [0.917, 0.795], [0.94, 0.75], [0.963, 0.62], [0.986, 0.43], [1, 0.16]]);
// centre-line top of the lower body (trunk deck / hood)
const crown = curve([[0, 0.60], [0.012, 0.92], [0.025, 1.07], [0.05, 1.09], [0.075, 1.10], [0.10, 1.125], [0.125, 1.16], [0.15, 1.20], [0.40, 1.12], [0.70, 1.06], [0.725, 1.077], [0.75, 1.03], [0.775, 1.005], [0.80, 1.0], [0.825, 0.98], [0.85, 0.957], [0.875, 0.932], [0.90, 0.905], [0.925, 0.87], [0.95, 0.83], [0.975, 0.76], [0.99, 0.66], [1, 0.54]]);
// beltline / shoulder height at the sides
const belt = curve([[0, 0.58], [0.015, 0.90], [0.04, 1.02], [0.10, 1.06], [0.20, 1.075], [0.30, 1.065], [0.45, 1.04], [0.60, 1.005], [0.70, 0.985], [0.75, 0.97], [0.85, 0.915], [0.92, 0.86], [0.96, 0.79], [0.985, 0.68], [1, 0.52]]);
// roof centre height over the cabin
const roofH = curve([[0.15, 1.20], [0.175, 1.247], [0.20, 1.27], [0.225, 1.32], [0.25, 1.343], [0.275, 1.368], [0.30, 1.391], [0.325, 1.404], [0.35, 1.416], [0.375, 1.428], [0.425, 1.44], [0.45, 1.44], [0.50, 1.428], [0.525, 1.416], [0.55, 1.404], [0.575, 1.368], [0.60, 1.331], [0.625, 1.295], [0.65, 1.234], [0.675, 1.187], [0.70, 1.138], [0.725, 1.077]]);
export const AXLE = 0.317, ARCH = 0.385, TRACK = 0.78;
export const WHEEL_Z = [zOf(0.2085), zOf(0.2085) + 2.70]; // rear, front
const sillBase = curve([[0, 0.43], [0.025, 0.31], [0.05, 0.27], [0.075, 0.245], [0.10, 0.23], [0.15, 0.215], [0.5, 0.215], [0.9, 0.195], [0.925, 0.215], [0.95, 0.22], [0.975, 0.24], [1, 0.40]]);
function sill(u) {
  let y = sillBase(u); const z = zOf(u);
  for (const zw of WHEEL_Z) { const dz = z - zw; if (Math.abs(dz) < ARCH) y = Math.max(y, AXLE + Math.sqrt(ARCH * ARCH - dz * dz)); }
  return y;
}

// ---------- cross-sections as resampled polylines ----------
function resample(pts, n) {
  const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = []; const T = d[d.length - 1] || 1;
  for (let k = 0; k <= n; k++) {
    const s = T * k / n; let i = 1; while (i < d.length - 1 && d[i] < s) i++;
    const f = d[i] === d[i - 1] ? 0 : (s - d[i - 1]) / (d[i] - d[i - 1]);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
  }
  return out;
}
const sideX = curve([[0, 0.965], [0.1, 1.0], [0.6, 1.0], [0.8, 0.975], [0.9, 0.94], [1, 0.90]]);
const N_SIDE = 24, N_TOP = 24, N_CAB = 40;
const cacheL = new Map(), cacheC = new Map();
// lower body half-section: index 0..N_SIDE = side (sill -> belt), N_SIDE..N_SIDE+N_TOP = top (belt -> centre)
function lowerSection(u) {
  const key = u.toFixed(5); if (cacheL.has(key)) return cacheL.get(key);
  const w = width(u), b = belt(u), h = Math.max(crown(u), b + 0.005), s = Math.min(sill(u), b - 0.03);
  const side = []; for (let k = 0; k <= 30; k++) { const f = k / 30; side.push([w * sideX(f), s + (b - s) * f]); }
  const top = []; const xe = 0.9 * w; for (let k = 0; k <= 30; k++) { const q = k / 30; top.push([xe * (1 - q), b + (h - b) * (1 - Math.pow(1 - q, 2.4))]); }
  const sec = resample(side, N_SIDE).concat(resample(top, N_TOP).slice(1));
  cacheL.set(key, sec); return sec;
}
const cabX = curve([[0, 0.864], [0.45, 0.753], [0.74, 0.675], [0.88, 0.62], [0.93, 0.56], [0.97, 0.40], [1, 0.0]]);
function cabinSection(u) {
  const key = u.toFixed(5); if (cacheC.has(key)) return cacheC.get(key);
  const w = width(u), b = belt(u) + 0.004, R = Math.max(roofH(u), b + 0.01);
  const pts = []; for (let k = 0; k <= 60; k++) { const g = Math.sin((k / 60) * Math.PI / 2); pts.push([w * cabX(g), b + (R - b) * g]); }
  const sec = resample(pts, N_CAB); cacheC.set(key, sec); return sec;
}
// surface points: v in [0, 2]; v<1 left half (x>0) from bottom up to centre, v>1 right half mirrored
function surf(sectionFn, n) {
  return (u, v) => {
    const sec = sectionFn(u); const left = v <= 1; const p = left ? v : 2 - v;
    const fi = p * n; const i = Math.min(n - 1, Math.floor(fi)); const f = fi - i;
    const x = sec[i][0] + (sec[i + 1][0] - sec[i][0]) * f, y = sec[i][1] + (sec[i + 1][1] - sec[i][1]) * f;
    return new THREE.Vector3(left ? x : -x, y, zOf(u));
  };
}
const NL = N_SIDE + N_TOP;
const lowerS = surf(lowerSection, NL), cabinS = surf(cabinSection, N_CAB);
const BELT_V = N_SIDE / NL; // v of the belt line in the lower surface

function patch(fn, u0, u1, v0, v1, nu, nv) {
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) { const u = u0 + (u1 - u0) * i / nu; for (let j = 0; j <= nv; j++) { const p = fn(u, v0 + (v1 - v0) * j / nv); pos.push(p.x, p.y, p.z); } }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const nU = (a, b) => Math.max(2, Math.round((b - a) * 260));
const nV = (a, b, per) => Math.max(2, Math.round((b - a) * per));

function lockTexture(locked) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const PI = Math.PI;
  const col = locked ? '#34D399' : '#E5E7EB';
  g.fillStyle = locked ? 'rgba(4,20,13,0.88)' : 'rgba(20,24,23,0.88)'; g.beginPath(); g.arc(64, 64, 60, 0, PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = col; g.beginPath(); g.arc(64, 64, 57, 0, PI * 2); g.stroke();
  g.lineWidth = 9; g.lineCap = 'round'; g.beginPath();
  if (locked) { g.arc(64, 54, 17, PI, 0); g.lineTo(81, 62); g.moveTo(47, 54); g.lineTo(47, 62); }
  else { g.arc(80, 44, 17, PI, 0); g.lineTo(97, 52); g.moveTo(63, 44); g.lineTo(63, 62); }
  g.stroke(); g.fillStyle = col; g.beginPath(); g.roundRect(38, 60, 52, 40, 8); g.fill();
  g.fillStyle = locked ? '#04140D' : '#141A18'; g.beginPath(); g.arc(64, 78, 5, 0, PI * 2); g.fill(); g.fillRect(61, 80, 6, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildSedan2() {
  const car = new THREE.Group();
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: '#1E2624', metalness: 0.6, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.5, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#050B09', metalness: 0.3, roughness: 0.03, transparent: true, opacity: 0.82, clearcoat: 1, envMapIntensity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    // transparent so the engine can fade it while the roof is open (parts.roofGlassMat), letting the cabin show
    roofGlass: new THREE.MeshPhysicalMaterial({ color: '#030706', metalness: 0.4, roughness: 0.03, clearcoat: 1, envMapIntensity: 1.3, side: THREE.DoubleSide, transparent: true, opacity: 1 }),
    black: new THREE.MeshStandardMaterial({ color: '#08090A', metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide }),
    gloss: new THREE.MeshPhysicalMaterial({ color: '#050606', metalness: 0.3, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: '#D5DBD9', metalness: 1, roughness: 0.15 }),
    tire: new THREE.MeshStandardMaterial({ color: '#141716', roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: '#B8BFBD', metalness: 1, roughness: 0.22 }),
    rimDark: new THREE.MeshStandardMaterial({ color: '#1B2021', metalness: 0.7, roughness: 0.35 }),
    head: new THREE.MeshStandardMaterial({ color: '#0B1512', emissive: '#CFFAEA', emissiveIntensity: 1.6 }),
    drl: new THREE.MeshStandardMaterial({ color: '#0B1512', emissive: '#34D399', emissiveIntensity: 2.4 }),
    tail: new THREE.MeshStandardMaterial({ color: '#2A0606', emissive: '#EF4444', emissiveIntensity: 1.3 }),
    // interior: mid tones (not black) so it reads through the open roof / windows, lit by its own cabin light (see ---- interior ----)
    seat: new THREE.MeshStandardMaterial({ color: '#6E7A76', roughness: 0.8 }),
    seatInsert: new THREE.MeshStandardMaterial({ color: '#3C4744', roughness: 0.9 }),
    stitch: new THREE.MeshStandardMaterial({ color: '#0B1512', emissive: '#34D399', emissiveIntensity: 0.7 }),
    interior: new THREE.MeshStandardMaterial({ color: '#1D2422', roughness: 0.85 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#262E2B', roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({ color: '#36403D', roughness: 0.7 }),
    dashTop: new THREE.MeshStandardMaterial({ color: '#2C3533', roughness: 0.8 }),
    display: new THREE.MeshStandardMaterial({ color: '#05110D', emissive: '#10B981', emissiveIntensity: 0.55 })
  };
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };
  const parts = { doors: {}, windows: {}, handles: {}, locks: {} };
  const group = (pos) => { const g = new THREE.Group(); g.position.copy(pos); car.add(g); return g; };
  const local = (g, geo) => geo.translate(-g.position.x, -g.position.y, -g.position.z);

  // ---- lower body, cut into panels ----
  const DOOR = { R: [0.300, 0.476], F: [0.481, 0.700] };
  const uB = [0, 0.02, 0.15, 0.300, 0.476, 0.481, 0.700, 0.725, 0.985, 1];
  const doorG = {};
  for (const side of ['L', 'R']) for (const k of ['F', 'R']) {
    const hinge = lowerS(DOOR[k][1], side === 'L' ? BELT_V * 0.55 : 2 - BELT_V * 0.55);
    doorG[k + side] = group(hinge);
  }
  for (let i = 0; i < uB.length - 1; i++) {
    const u0 = uB[i], u1 = uB[i + 1];
    const regions = { L: [0, BELT_V], top: [BELT_V, 2 - BELT_V], R: [2 - BELT_V, 2] };
    for (const [k, [v0, v1]] of Object.entries(regions)) {
      const geo = patch(lowerS, u0, u1, v0, v1, nU(u0, u1), nV(v0, v1, k === 'top' ? 40 : 60));
      if (k !== 'top') {
        const d = u0 === DOOR.R[0] ? 'R' : u0 === DOOR.F[0] ? 'F' : null;
        if (d) { const g = doorG[d + k]; add(g, local(g, geo), M.paint); continue; }
      } else {
        if (u0 === 0.725) { parts.hoodGeo = geo; continue; }
        if (u0 === 0.02) { parts.trunkGeo = geo; continue; }
        // over the cabin (rear seats to windshield base) the deck surface would be a lid over the seats: keep only a narrow
        // shoulder along each side (the window ledge), so the interior shows through the open sunroof and windows
        if (u0 >= 0.300 && u0 < 0.700) {
          const SH = 0.25 * (1 - BELT_V);
          add(car, patch(lowerS, u0, u1, BELT_V, BELT_V + SH, nU(u0, u1), 10), M.paint);
          add(car, patch(lowerS, u0, u1, 2 - BELT_V - SH, 2 - BELT_V, nU(u0, u1), 10), M.paint);
          continue;
        }
      }
      add(car, geo, M.paint);
    }
  }
  const hood = group(lowerS(0.725, 1)); add(hood, local(hood, parts.hoodGeo), M.paint); parts.hood = hood;
  const trunk = group(lowerS(0.15, 1)); add(trunk, local(trunk, parts.trunkGeo), M.paint); parts.trunk = trunk;

  // ---- cabin ----
  const cab = (u0, u1, v0, v1, mat, parent = car) => { const geo = patch(cabinS, u0, u1, v0, v1, nU(u0, u1), nV(v0, v1, 60)); return add(parent, parent === car ? geo : local(parent, geo), mat); };
  const S = 0.60; // roof edge (v) on each half
  // rear glass and C-pillars
  cab(0.15, 0.255, S * 0.55, 2 - S * 0.55, M.glass);
  for (const [a, b] of [[0, S * 0.55], [2 - S * 0.55, 2]]) cab(0.15, 0.255, a, b, M.paint);
  // roof: painted frame around a panoramic glass sunroof covering most of the roof
  cab(0.255, 0.30, S, 2 - S, M.paint); cab(0.585, 0.655, S, 2 - S, M.paint);
  cab(0.30, 0.585, S, 0.72, M.paint); cab(0.30, 0.585, 1.28, 2 - S, M.paint);
  const sunroof = new THREE.Group(); car.add(sunroof);
  add(sunroof, patch((u, v) => cabinS(u, v).add(new THREE.Vector3(0, 0.004, 0)), 0.30, 0.585, 0.72, 1.28, 60, 24), M.roofGlass);
  parts.sunroof = sunroof;
  // side glass (part of the doors), frames, pillars
  for (const side of ['L', 'R']) {
    const m = (a, b) => side === 'L' ? [a, b] : [2 - b, 2 - a];
    const [g0, g1] = m(0.05, S - 0.03);
    parts.windows['R' + side] = cab(0.262, 0.472, g0, g1, M.glass, doorG['R' + side]);
    parts.windows['F' + side] = cab(0.488, 0.645, g0, g1, M.glass, doorG['F' + side]);
    const [f0, f1] = m(0, 0.05); cab(0.255, 0.655, f0, f1, M.black);                    // belt trim
    const [t0, t1] = m(S - 0.03, S); cab(0.255, 0.655, t0, t1, M.gloss);                 // upper window frame
    const [p0, p1] = m(0.05, S - 0.03);
    cab(0.255, 0.262, p0, p1, M.gloss); cab(0.472, 0.488, p0, p1, M.gloss); cab(0.645, 0.655, p0, p1, M.gloss); // pillars
    const [a0, a1] = m(0, 0.30); cab(0.655, 0.725, a0, a1, M.gloss);                    // A-pillar
  }
  parts.windshield = cab(0.655, 0.725, 0.30, 1.70, M.glass);

  // ---- lights ----
  const tube = (pts, r, mat) => add(car, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, r, 10, false), mat);
  const out = (p, k = 0.006) => { const n = new THREE.Vector3(p.x, 0, p.z * 0.6).normalize(); return [p.x + n.x * k, p.y, p.z + n.z * k]; };
  const overlay = (mat) => { const m = mat.clone(); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; return m; };
  // headlights: wrap around the front corners just under the hood line
  for (const sgn of [1, -1]) {
    const hp = []; for (let k = 0; k <= 12; k++) { const u = 0.93 + 0.055 * k / 12; const p = lowerS(u, sgn > 0 ? BELT_V * 0.9 : 2 - BELT_V * 0.9); hp.push(out(p, 0.01)); }
    tube(hp, 0.03, M.head);
    tube(hp.map(([x, y, z]) => [x, y - 0.045, z]), 0.008, M.drl);
  }
  // slim light bar across the nose joining the headlights
  { const bar = []; for (let k = 0; k <= 10; k++) bar.push(out(lowerS(0.985 + 0.015 * k / 10, BELT_V * 0.9 - 0.045 / 1), 0.012));
    const full = bar.slice().reverse().map(([x, y, z]) => [-x, y, z]).concat(bar.slice(1).reverse().reverse());
    const pts = bar.slice().reverse().concat(bar.slice(1).map(([x, y, z]) => [-x, y, z]));
    tube(pts.map(([x, y, z]) => [x, y - 0.045, z]), 0.008, M.drl); }
  // full-width taillight along the trunk edge, wrapping onto the rear quarters
  { const tl = [];
    for (let k = 0; k <= 8; k++) tl.push(out(lowerS(0.075 - 0.05 * k / 8, BELT_V * 0.93), 0.01));
    for (let k = 1; k < 20; k++) tl.push(out(lowerS(0.025, BELT_V * 0.93 + (2 - 2 * BELT_V * 0.93) * k / 20), 0.01));
    for (let k = 0; k <= 8; k++) tl.push(out(lowerS(0.025 + 0.05 * k / 8, 2 - BELT_V * 0.93), 0.01));
    tube(tl.map(([x, y, z]) => [x, y - 0.03, z]), 0.022, M.tail); }
  // lower front intake and rear diffuser as dark panels on the body
  add(car, patch(lowerS, 0.972, 1, 0.0, BELT_V * 0.5, 14, 20), overlay(M.gloss));
  add(car, patch(lowerS, 0.972, 1, 2 - BELT_V * 0.5, 2, 14, 20), overlay(M.gloss));
  add(car, patch(lowerS, 0.0, 0.02, 0.0, BELT_V * 0.32, 8, 14), overlay(M.black));
  add(car, patch(lowerS, 0.0, 0.02, 2 - BELT_V * 0.32, 2, 8, 14), overlay(M.black));

  // ---- underbody and wheel wells ----
  const under = add(car, new THREE.BoxGeometry(1.62, 0.12, 4.0), M.black); under.position.set(0, 0.27, 0);
  for (const z of WHEEL_Z) for (const s of [1, -1]) { const w = add(car, new THREE.BoxGeometry(0.34, ARCH + 0.05, ARCH * 2), M.black); w.position.set(s * 0.64, AXLE + ARCH / 2, z); }

  // ---- wheels: 225/45 R17 ----
  parts.wheels = [];
  const prof = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + Math.PI * i / 20; prof.push(new THREE.Vector2(0.236 + 0.076 * Math.pow(Math.cos(a), 0.6), 0.112 * Math.sin(a))); }
  const tireGeo = new THREE.LatheGeometry(prof, 64); tireGeo.rotateZ(Math.PI / 2);
  for (const z of WHEEL_Z) for (const s of [1, -1]) {
    const g = new THREE.Group(); g.position.set(s * TRACK, AXLE, z); car.add(g);
    add(g, tireGeo, M.tire);
    const barrel = add(g, new THREE.CylinderGeometry(0.212, 0.212, 0.2, 48, 1, true), M.rimDark); barrel.rotation.z = Math.PI / 2;
    const lip = add(g, new THREE.TorusGeometry(0.212, 0.012, 10, 64), M.rim); lip.rotation.y = Math.PI / 2; lip.position.x = s * 0.095;
    const back = add(g, new THREE.CircleGeometry(0.21, 48), M.rimDark); back.rotation.y = s * Math.PI / 2; back.position.x = s * 0.04;
    for (let k = 0; k < 5; k++) {
      const a = k * 2 * Math.PI / 5;
      for (const off of [-0.11, 0.11]) {
        const sp = add(g, new THREE.BoxGeometry(0.03, 0.17, 0.028), M.rim);
        sp.position.set(s * 0.085, Math.cos(a + off) * 0.115, Math.sin(a + off) * 0.115); sp.rotation.x = -(a + off);
      }
    }
    const hub = add(g, new THREE.CylinderGeometry(0.05, 0.055, 0.04, 24), M.rim); hub.rotation.z = Math.PI / 2; hub.position.x = s * 0.09;
    parts.wheels.push(g);
  }

  // ---- interior: a simple, readable cabin (seen through the open sunroof and windows) ----
  // its own soft light, so it is not black inside the closed body; the effects' lights (seat heat, ambient) add to it
  const cabinFill = new THREE.PointLight('#E6F4EE', 4.5, 3.6, 1.2); cabinFill.position.set(0, 1.25, -0.15); car.add(cabinFill);
  const floor = add(car, new THREE.BoxGeometry(1.5, 0.04, 2.3), M.carpet); floor.position.set(0, 0.42, -0.1);
  // dashboard: dark lower part, lighter top, centre screen, instrument display behind the wheel, a thin mint trim line
  const dash = add(car, new RoundedBoxGeometry(1.55, 0.24, 0.45, 3, 0.07), M.interior); dash.position.set(0, 0.88, 0.98);
  const dashTop = add(car, new RoundedBoxGeometry(1.5, 0.05, 0.4, 2, 0.02), M.dashTop); dashTop.position.set(0, 1.0, 1.0);
  add(car, new THREE.BoxGeometry(1.36, 0.012, 0.012), M.stitch).position.set(0, 0.95, 0.755);
  const scr = add(car, new THREE.BoxGeometry(0.4, 0.17, 0.02), M.display); scr.position.set(0, 1.02, 0.84); scr.rotation.x = -0.3;
  const cluster = add(car, new THREE.BoxGeometry(0.3, 0.1, 0.02), M.display); cluster.position.set(0.37, 1.04, 0.87); cluster.rotation.x = -0.3;
  // centre console between the front seats: gear selector and armrest
  add(car, new RoundedBoxGeometry(0.24, 0.3, 0.9, 3, 0.05), M.trim).position.set(0, 0.59, 0.4);
  add(car, new RoundedBoxGeometry(0.2, 0.012, 0.6, 2, 0.005), M.interior).position.set(0, 0.745, 0.5);
  const gear = add(car, new THREE.CylinderGeometry(0.025, 0.03, 0.1, 16), M.chrome); gear.position.set(0, 0.8, 0.62);
  add(car, new RoundedBoxGeometry(0.22, 0.08, 0.3, 3, 0.03), M.seat).position.set(0, 0.77, 0.08);
  // seats: two-tone with a mint stitch line; rear seats joined by a middle section into a bench
  const seats = { FL: [0.37, 0.32], FR: [-0.37, 0.32], RL: [0.38, -0.62], RR: [-0.38, -0.62] };
  parts.seatPos = {}; parts.seatMats = {}; parts.seatBase = M.seat.color.clone();
  for (const [k, [x, z]] of Object.entries(seats)) {
    const g = new THREE.Group(); g.position.set(x, 0.44, z); car.add(g);
    // each seat its own material: the engine tints it by heater / ventilation level
    const sm = M.seat.clone(); parts.seatMats[k] = sm;
    add(g, new RoundedBoxGeometry(0.5, 0.13, 0.5, 3, 0.05), sm).position.y = 0.1;
    add(g, new RoundedBoxGeometry(0.3, 0.02, 0.4, 2, 0.008), M.seatInsert).position.set(0, 0.17, 0.01);
    const bk = add(g, new RoundedBoxGeometry(0.5, 0.56, 0.13, 3, 0.05), sm); bk.position.set(0, 0.42, -0.24); bk.rotation.x = -0.2;
    const ins = add(g, new RoundedBoxGeometry(0.28, 0.44, 0.02, 2, 0.008), M.seatInsert); ins.position.set(0, 0.42, -0.165); ins.rotation.x = -0.2;
    for (const sx of [-0.15, 0.15]) { const st = add(g, new THREE.BoxGeometry(0.008, 0.44, 0.008), M.stitch); st.position.set(sx, 0.42, -0.165); st.rotation.x = -0.2; }
    add(g, new RoundedBoxGeometry(0.26, 0.15, 0.1, 3, 0.04), sm).position.set(0, 0.77, -0.31);
    parts.seatPos[k] = new THREE.Vector3(x, 0.7, z);
  }
  add(car, new RoundedBoxGeometry(0.28, 0.13, 0.5, 3, 0.05), M.seat).position.set(0, 0.54, -0.62);
  const midBack = add(car, new RoundedBoxGeometry(0.28, 0.5, 0.13, 3, 0.05), M.seat); midBack.position.set(0, 0.83, -0.86); midBack.rotation.x = -0.2;
  // parcel shelf under the rear window
  add(car, new THREE.BoxGeometry(1.3, 0.03, 0.32), M.interior).position.set(0, 1.0, -1.12);
  const sw = new THREE.Group(); sw.position.set(0.37, 0.93, 0.74); sw.rotation.x = -0.45; car.add(sw);
  const swMat = new THREE.MeshStandardMaterial({ color: '#2A3230', roughness: 0.5 });
  add(sw, new THREE.TorusGeometry(0.18, 0.024, 12, 48), swMat); add(sw, new THREE.BoxGeometry(0.32, 0.03, 0.02), swMat);
  add(sw, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 20), M.trim).rotation.x = Math.PI / 2;
  const column = add(car, new THREE.CylinderGeometry(0.03, 0.04, 0.3, 12), M.interior); column.position.set(0.37, 0.92, 0.86); column.rotation.x = Math.PI / 2 - 0.45;
  parts.steering = { group: sw, mat: swMat };

  // ---- mirrors, handles ----
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1; const g = doorG['F' + side];
    const p = lowerS(0.655, side === 'L' ? BELT_V : 2 - BELT_V);
    const arm = add(g, new RoundedBoxGeometry(0.1, 0.05, 0.08, 2, 0.02), M.gloss); arm.position.set(p.x + s * 0.05 - g.position.x, p.y + 0.04 - g.position.y, p.z - g.position.z);
    const head = add(g, new RoundedBoxGeometry(0.2, 0.13, 0.1, 3, 0.045), M.paint); head.position.set(p.x + s * 0.16 - g.position.x, p.y + 0.08 - g.position.y, p.z - 0.02 - g.position.z);
    for (const k of ['F', 'R']) {
      const dg = doorG[k + side]; const [u0, u1] = DOOR[k];
      const hp = lowerS(u0 + (u1 - u0) * 0.3, side === 'L' ? BELT_V * 0.86 : 2 - BELT_V * 0.86);
      const h = add(dg, new RoundedBoxGeometry(0.03, 0.03, 0.19, 2, 0.012), M.chrome);
      h.position.set(hp.x + s * 0.008 - dg.position.x, hp.y - dg.position.y, hp.z - dg.position.z);
      parts.handles[k + side] = { mesh: h, pos: new THREE.Vector3(hp.x, hp.y, hp.z), group: dg };
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lockTexture(false), transparent: true, depthWrite: false }));
      sp.scale.set(0.19, 0.19, 1); sp.renderOrder = 5;
      sp.position.set(hp.x + s * 0.09 - dg.position.x, hp.y - 0.12 - dg.position.y, hp.z - dg.position.z); dg.add(sp);
      parts.locks[k + side] = sp;
    }
  }
  // inner door panels (move with the doors): trim panel, armrest, a mint line along the top
  for (const side of ['L', 'R']) for (const k of ['F', 'R']) {
    const s = side === 'L' ? 1 : -1; const dg = doorG[k + side]; const [u0, u1] = DOOR[k];
    // the skin tucks in to 0.9 x width at the belt line (sideX), so the panel sits inside that
    const um = (u0 + u1) / 2, len = (u1 - u0) * L - 0.08, x = s * (width(um) * 0.9 - 0.06), top = belt(um) - 0.04;
    const at = (mesh, px, py, pz) => { mesh.position.set(px - dg.position.x, py - dg.position.y, pz - dg.position.z); return mesh; };
    at(add(dg, new RoundedBoxGeometry(0.04, top - 0.5, len, 2, 0.015), M.trim), x, (top + 0.5) / 2, zOf(um));
    at(add(dg, new RoundedBoxGeometry(0.08, 0.04, len * 0.55, 2, 0.015), M.interior), x - s * 0.04, 0.78, zOf(um) - len * 0.1);
    at(add(dg, new THREE.BoxGeometry(0.01, 0.01, len * 0.9), M.stitch), x - s * 0.022, top - 0.03, zOf(um));
  }
  parts.doors = doorG;
  parts.lockTex = { locked: lockTexture(true), unlocked: lockTexture(false) };
  parts.headMat = M.drl; parts.tailMat = M.tail; parts.roofGlassMat = M.roofGlass;
  return { car, parts, materials: M };
}
