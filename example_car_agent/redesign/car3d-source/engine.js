import * as THREE from 'three';
import { buildSedan2 } from './sedan2.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fresh } from './agent.js';

function mount(canvas, tagEl) {
const W = canvas.clientWidth || 390, H = canvas.clientHeight || 450;

// ---------- renderer / scene ----------
// Memory (the agent model runs on the same phone): no preserveDrawingBuffer (an extra copy of every frame, only needed for
// screenshots) and at most 1.5x pixel density; with antialias the car still looks smooth at the card's size.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0B0F0E');
scene.fog = new THREE.Fog('#0B0F0E', 12, 22);
{ // the reflections' environment map; the generator's own render targets are freed once it is made
  const pmrem = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture; pmrem.dispose(); room.dispose && room.dispose();
}

const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 60);
const CENTER = new THREE.Vector3(0, 0.6, 0);
camera.position.set(6.4, 3.1, 6.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CENTER);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6.2;
controls.maxDistance = 13;
controls.maxPolarAngle = 1.48;
// No idle movement: the car stands still until a command (or a drag) moves it, so the WebView does not render while idle and
// leaves the phone's CPU/GPU to the agent. The render loop runs only while something changes (see wake() / settling()).
controls.autoRotate = false;

// floor: dark disc + emerald ring
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 96), new THREE.MeshBasicMaterial({
  map: radialTexture([[0, 'rgba(0,0,0,0.95)'], [0.42, 'rgba(0,0,0,0.75)'], [0.62, 'rgba(10,22,18,0.6)'], [0.86, 'rgba(16,185,129,0.0)'], [0.93, 'rgba(52,211,153,0.55)'], [0.96, 'rgba(16,185,129,0.12)'], [1, 'rgba(0,0,0,0)']]),
  transparent: true, depthWrite: false }));
floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005; scene.add(floor);
const ringMat = floor.material;

// road stripes (visible while driving)
const stripeCanvas = document.createElement('canvas'); stripeCanvas.width = 64; stripeCanvas.height = 512;
{ const g = stripeCanvas.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 64, 512);
  g.fillStyle = 'rgba(110,231,183,0.55)'; for (let y = 0; y < 512; y += 128) g.fillRect(26, y, 12, 64); }
const stripeTex = new THREE.CanvasTexture(stripeCanvas); stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.repeat.set(1, 3);
const stripes = [];
[-1.7, 1.7].forEach((x) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 9), new THREE.MeshBasicMaterial({ map: stripeTex, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, 0); scene.add(m); stripes.push(m);
});

// ---------- effects that are not part of the model ----------
function glowSprite(color) {
  const t = radialTexture([[0, color], [0.35, color.replace(/[\d.]+\)$/, '0.35)')], [1, 'rgba(0,0,0,0)']]);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  s.scale.set(0.9, 0.9, 1); scene.add(s); return s;
}
const SEATS = {
  D: new THREE.Vector3(0.37, 0.72, 0.30),
  P: new THREE.Vector3(-0.37, 0.72, 0.30)
};
const seatFx = {};
Object.entries(SEATS).forEach(([k, p]) => {
  const light = new THREE.PointLight('#F59E0B', 0, 1.6, 1.5); light.position.copy(p); scene.add(light);
  const heat = glowSprite('rgba(245,158,11,0.9)'); heat.position.copy(p);
  const vent = glowSprite('rgba(96,165,250,0.9)'); vent.position.copy(p);
  seatFx[k] = { light, heat, vent };
});
const cabinLight = new THREE.PointLight('#2DD4BF', 0, 2.6, 1.2); cabinLight.position.set(0, 1.05, -0.05); scene.add(cabinLight);
const rings = [0, 1, 2].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 48), new THREE.MeshBasicMaterial({ color: '#34D399', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  r.position.set(0.37, 1.22, 0.30); r.rotation.x = -Math.PI / 2; scene.add(r); return r;
});

// ---------- model ----------
const parts = {};
const target = {};
const cur = {};
let model = null;
{
  const built = buildSedan2(); model = built.car; scene.add(model); Object.assign(parts, built.parts);
  const own = (o) => o && o.traverse((m) => { if (m.isMesh && !m.userData.own) { m.material = m.material.clone(); m.userData.own = true; } });
  own(parts.trunk); own(parts.hood); own(parts.windshield);
  Object.values(parts.doors).forEach(own);
  setTimeout(() => { ready = true; apply(state, null); }, 0);
}

function setEmissive(obj, color, intensity) {
  if (!obj) return;
  obj.traverse((m) => { if (m.isMesh && m.userData.own) { m.material.emissive = new THREE.Color(color); m.material.emissiveIntensity = intensity; } });
}

// ---------- state ----------
let state = fresh(); let ready = false;
let last = null;
let blinkUntil = 0, blinkPart = null, lockFlashUntil = 0, focusUntil = 0;

const VIEWS = {
  front: [4.4, 3.0, 7.9], rear: [-8.2, 3.0, -4.2], left: [9.0, 2.6, 1.0], right: [-9.0, 2.6, 1.0],
  top: [3.0, 8.6, 3.2], cabin: [5.4, 5.2, 5.0]
};
const ANCHORS = {
  front: [0, 1.15, 1.9], rear: [0, 1.3, -1.9], left: [0.95, 1.5, 0.1], right: [-0.95, 1.5, 0.1],
  top: [0, 1.6, -0.1], cabin: [0.37, 1.5, 0.3]
};
let camGoal = null;

function partFor(call) {
  if (/set_trunk/.test(call)) return /frunk/.test(call) ? 'front' : 'rear';
  if (/set_window|open_door|close_doors/.test(call)) return /passenger|right/.test(call) ? 'right' : 'left';
  if (/set_sunroof/.test(call)) return 'top';
  if (/defrost/.test(call)) return 'front';
  if (/lock_car|unlock_car/.test(call)) return 'left';
  if (/seat|comfort|steering|cabin_lights|temperature|fan/.test(call)) return 'cabin';
  if (/charge_port/.test(call)) return 'rear';
  return null;
}

function apply(s, act) {
  const D = (v) => (v ? 1 : 0);
  ['FL', 'FR', 'RL', 'RR'].forEach((k) => { target['door' + k] = D(s.doors[k]); target['win' + k] = s.win[k]; });
  if (parts.locks) Object.values(parts.locks).forEach((sp) => { sp.material.map = s.locked ? parts.lockTex.locked : parts.lockTex.unlocked; sp.material.needsUpdate = true; });
  target.hood = D(s.frunk); target.hatch = D(s.trunk === 'open');
  target.roofOpen = s.roof === 'open' ? 1 : 0; target.roofTilt = s.roof === 'tilt' ? 1 : 0;
  // seat heat / ventilation as 0..1 per seat (level / 3); without levels (older callers) on = level 3
  const lv = (k, f, legacy) => (s.seats && s.seats[k] ? (s.seats[k][f] || 0) / 3 : legacy ? 1 : 0);
  ['FL', 'FR', 'RL', 'RR'].forEach((k) => {
    target['heat' + k] = lv(k, 'heat', (k === 'FL' && s.seatD === 'heat') || (k === 'FR' && s.seatP === 'heat'));
    target['vent' + k] = lv(k, 'vent', (k === 'FL' && s.seatD === 'vent') || (k === 'FR' && s.seatP === 'vent'));
  });
  target.heatD = target.heatFL; target.ventD = target.ventFL;
  target.heatP = target.heatFR; target.ventP = target.ventFR;
  target.wheel = D(s.wheel); target.defrost = D(s.defrost);
  target.ambient = s.ambient ? 1 : 0; if (s.ambient) cabinLight.color.set(s.ambient);
  target.focus = D(s.focus); target.driving = D(s.driving);
  if (act) {
    const p = partFor(act.call);
    if (!act.ok && /trunk/.test(act.call)) { blinkUntil = performance.now() + 2600; blinkPart = /frunk/.test(act.call) ? parts.hood : parts.trunk; }
    if (/lock_car\(\)/.test(act.call) && act.ok) lockFlashUntil = performance.now() + 1400;
    if (p) {
      camGoal = new THREE.Vector3(...VIEWS[p]).add(CENTER);
      focusUntil = performance.now() + 7000;
      showTag(act.ok ? act.title : 'Blocked', ANCHORS[p], act.ok);
    }
  }
  // Any state change animates briefly (parts ease in ~1 s; effects such as the driving stripes play), then stops.
  wake(act ? 1600 : 1200);
}

// ---------- on-demand rendering ----------
// The agent model runs on the same CPU cores with threads that wait for each other on every token, so even a short burst of
// rendering during a turn slows its answer several times over (measured on a Pixel 8, 2026-11-23). Hence: no frames while idle,
// none at all while paused (the app pauses the viewer while the agent works), and at most 30 frames per second otherwise.
const FRAME_MS = 1000 / 30;
let rafId = 0, activeUntil = 0, paused = false, lastDraw = 0;
function wake(ms) {
  activeUntil = Math.max(activeUntil, performance.now() + ms);
  if (!rafId && !paused) { clock.getDelta(); rafId = requestAnimationFrame(frame); }
}
function setPaused(on) {
  paused = !!on;
  if (paused) { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
  else wake(300); // plays whatever changed while paused (the reply's action), then stops again
}
function settling(now) {
  if (!ready || dragging || camGoal || tagAnchor) return true;
  if (now < activeUntil || now < blinkUntil || now < lockFlashUntil) return true;
  return Object.keys(target).some((key) => Math.abs((cur[key] ?? 0) - target[key]) > 0.002);
}

// ---------- floating tag ----------
const tag = tagEl || document.createElement('div'); let tagAnchor = null, tagUntil = 0;
function showTag(text, anchor, ok) {
  tag.textContent = text; tag.dataset.kind = ok ? 'ok' : 'warn';
  tagAnchor = new THREE.Vector3(...anchor); tagUntil = performance.now() + 2600; tag.style.opacity = '1';
}

// ---------- animation loop ----------
const lerp = (a, b, t) => a + (b - a) * t;
// seat tint per level (1 low, 2 medium, 3 high): a distinct colour per level, so the three are easy to tell apart
const SEAT_WARM = ['#FDBA74', '#F97316', '#DC2626'].map((c) => new THREE.Color(c));
const SEAT_COOL = ['#93C5FD', '#3B82F6', '#1D4ED8'].map((c) => new THREE.Color(c));
const seatTint = (ramp, t) => { const x = Math.min(2, Math.max(0, t * 3 - 1)); const i = Math.min(1, Math.floor(x)); return ramp[i].clone().lerp(ramp[i + 1], x - i); };
const clock = new THREE.Clock();
function frame() {
  if (paused) { rafId = 0; return; }
  // 30 fps cap: skip display refreshes until a frame's time has passed
  if (performance.now() - lastDraw < FRAME_MS - 2) { rafId = requestAnimationFrame(frame); return; }
  lastDraw = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05); const now = performance.now(); const k = 1 - Math.pow(0.002, dt);
  Object.keys(target).forEach((key) => { cur[key] = lerp(cur[key] ?? target[key], target[key], k); });
  if (!ready) { rafId = requestAnimationFrame(frame); return; }
  if (model && parts.doors) {
    parts.doors.FL.rotation.y = -1.0 * cur.doorFL; parts.doors.RL.rotation.y = -1.0 * cur.doorRL;
    parts.doors.FR.rotation.y = 1.0 * cur.doorFR; parts.doors.RR.rotation.y = 1.0 * cur.doorRR;
    ['FL', 'FR', 'RL', 'RR'].forEach((k) => { parts.windows[k].position.y = -0.38 * cur['win' + k]; });
    parts.hood.rotation.x = -0.85 * cur.hood; parts.trunk.rotation.x = 1.0 * cur.hatch;
    parts.sunroof.position.z = -0.55 * cur.roofOpen; parts.sunroof.position.y = 0.045 * cur.roofOpen + 0.035 * cur.roofTilt;
    // open roof: the glass also turns see-through, so the cabin shows from above
    if (parts.roofGlassMat) parts.roofGlassMat.opacity = 1 - 0.7 * cur.roofOpen;
    // seats
    ['D', 'P'].forEach((s) => {
      const h = cur['heat' + s], v = cur['vent' + s]; const f = seatFx[s];
      f.heat.material.opacity = h * (0.75 + 0.25 * Math.sin(now / 300)); f.vent.material.opacity = v * (0.75 + 0.25 * Math.sin(now / 300));
      f.light.color.set(h >= v ? '#F59E0B' : '#60A5FA'); f.light.intensity = Math.max(h, v) * 2.2;
    });
    // seat colour: warmer per heater level (orange), cooler per ventilation level (blue); all four seats
    if (parts.seatMats) ['FL', 'FR', 'RL', 'RR'].forEach((k) => {
      const m = parts.seatMats[k]; if (!m) return;
      const h = cur['heat' + k] || 0, v = cur['vent' + k] || 0, t = Math.max(h, v);
      const tint = seatTint(h >= v ? SEAT_WARM : SEAT_COOL, t);
      // off -> level 1 fades the tint in; above level 1 the colour itself changes along the ramp
      m.color.copy(parts.seatBase).lerp(tint, Math.min(1, t * 3) * 0.85);
      m.emissive.copy(tint); m.emissiveIntensity = Math.min(1, t * 3) * (0.25 + 0.3 * t);
    });
    parts.steering.mat.emissive = new THREE.Color('#F59E0B'); parts.steering.mat.emissiveIntensity = cur.wheel * 1.8;
    setEmissive(parts.windshield, '#FB923C', cur.defrost * 0.5);
    cabinLight.intensity = cur.ambient * 3.2;
    ringMat.color.set(state.ambient && cur.ambient > 0.5 ? state.ambient : '#FFFFFF');
    // blocked blink
    if (blinkPart === null && false) {}
    if (blinkPart && now < blinkUntil) setEmissive(blinkPart, '#F59E0B', 0.6 * (0.5 + 0.5 * Math.sin(now / 90)));
    else if (blinkPart) { setEmissive(blinkPart, '#000000', 0); blinkPart = null; }
    // lock flash
    const flash = now < lockFlashUntil ? (Math.sin(now / 70) > 0 ? 1 : 0) : 0;
    parts.tailMat.emissiveIntensity = 1.4 + flash * 6; parts.headMat.emissiveIntensity = 2.6 + flash * 5;
    if (parts.locks) Object.values(parts.locks).forEach((sp) => { sp.material.opacity = 0.75 + (state.locked ? 0.25 * Math.sin(now / 400) : 0); });
    // driving
    parts.wheels.forEach((w) => w.rotateX((cur.driving || 0) * dt * 9));
    stripeTex.offset.y -= cur.driving * dt * 1.6; stripes.forEach((m) => { m.material.opacity = cur.driving * 0.9; });
    // call waves
    rings.forEach((r, i) => { const p = ((now / 1600) + i / 3) % 1; r.scale.setScalar(0.6 + p * 2.2); r.material.opacity = cur.focus * (1 - p) * 0.8; });
  }
  if (camGoal) {
    const a = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const b = new THREE.Spherical().setFromVector3(camGoal.clone().sub(controls.target));
    let dth = b.theta - a.theta; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    const f = 1 - Math.pow(0.008, dt); // camera turns to the part in about a second
    a.theta += dth * f; a.phi += (b.phi - a.phi) * f; a.radius += (b.radius - a.radius) * f;
    camera.position.copy(new THREE.Vector3().setFromSpherical(a).add(controls.target));
    if (Math.abs(dth) < 0.01 && Math.abs(b.phi - a.phi) < 0.01) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
  if (tagAnchor) {
    const p = tagAnchor.clone().project(camera);
    tag.style.transform = `translate(${(p.x * 0.5 + 0.5) * W}px, ${(-p.y * 0.5 + 0.5) * H}px) translate(-50%, -130%)`;
    if (now > tagUntil) { tag.style.opacity = '0'; tagAnchor = null; }
  }
  rafId = settling(now) ? requestAnimationFrame(frame) : 0;
}
let dragging = false;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; camGoal = null; wake(500); });
// OrbitControls eases out after a drag (damping): keep rendering briefly after the finger lifts.
window.addEventListener('pointerup', () => { dragging = false; focusUntil = performance.now() + 5000; wake(1500); });
controls.addEventListener('change', () => wake(300));
wake(1000);


let stopped = false;
return {
  apply: (st, act) => { state = st; last = act; apply(st, act || null); },
  reset: () => { camGoal = new THREE.Vector3(6.4, 3.1, 6.8); },
  // Stops all rendering (true) until resumed (false); state changes meanwhile are kept and animate on resume.
  pause: setPaused,
  // Jumps every part to its target at once (no easing): the car shows its current state immediately.
  snap: () => { Object.keys(target).forEach((key) => { cur[key] = target[key]; }); wake(300); },
  // Puts the camera at [x, y, z] at once (no easing), looking at the car; used by the design previews.
  view: (p) => { camGoal = null; camera.position.set(p[0], p[1], p[2]); controls.update(); wake(300); },
  stop: () => { stopped = true; renderer.dispose(); }
};
}
window.DV3D = { mount };
