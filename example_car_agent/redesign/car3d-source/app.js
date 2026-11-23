import * as THREE from 'three';
import { buildSedan2 } from './sedan2.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fresh, understand } from './agent.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const W = view.clientWidth, H = view.clientHeight;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0B0F0E');
scene.fog = new THREE.Fog('#0B0F0E', 12, 22);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

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
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;

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
  setTimeout(() => { $('loading').style.opacity = '0'; window.ready = true; apply(state, null); }, 0);
}

function setEmissive(obj, color, intensity) {
  if (!obj) return;
  obj.traverse((m) => { if (m.isMesh && m.userData.own) { m.material.emissive = new THREE.Color(color); m.material.emissiveIntensity = intensity; } });
}

// ---------- state ----------
let state = fresh();
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
  if (/set_trunk\(target: trunk/.test(call)) return 'rear';
  if (/set_trunk\(target: frunk/.test(call)) return 'front';
  if (/set_window|open_door|close_doors/.test(call)) return /passenger|rear_right|position: rear\b|position: all/.test(call) ? (/passenger|rear_right/.test(call) ? 'right' : 'left') : 'left';
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
  target.heatD = s.seatD === 'heat' ? 1 : 0; target.ventD = s.seatD === 'vent' ? 1 : 0;
  target.heatP = s.seatP === 'heat' ? 1 : 0; target.ventP = s.seatP === 'vent' ? 1 : 0;
  target.wheel = D(s.wheel); target.defrost = D(s.defrost);
  target.ambient = s.ambient ? 1 : 0; if (s.ambient) cabinLight.color.set(s.ambient);
  target.focus = D(s.focus); target.driving = D(s.driving);
  if (act) {
    const p = partFor(act.call);
    if (!act.ok && /trunk/.test(act.call)) { blinkUntil = performance.now() + 2600; blinkPart = /frunk/.test(act.call) ? parts.hood : parts.trunk; }
    if (/lock_car\(\)/.test(act.call) && act.ok) lockFlashUntil = performance.now() + 1400;
    if (p) {
      camGoal = new THREE.Vector3(...VIEWS[p]).add(CENTER);
      controls.autoRotate = false; focusUntil = performance.now() + 7000;
      showTag(act.ok ? act.title : 'Blocked', ANCHORS[p], act.ok);
    }
  }
}

// ---------- floating tag ----------
const tag = $('tag'); let tagAnchor = null, tagUntil = 0;
function showTag(text, anchor, ok) {
  tag.textContent = text; tag.dataset.kind = ok ? 'ok' : 'warn';
  tagAnchor = new THREE.Vector3(...anchor); tagUntil = performance.now() + 4200; tag.style.opacity = '1';
}

// ---------- animation loop ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); const now = performance.now(); const k = 1 - Math.pow(0.002, dt);
  Object.keys(target).forEach((key) => { cur[key] = lerp(cur[key] ?? target[key], target[key], k); });
  if (!window.ready) { requestAnimationFrame(frame); return; }
  if (model && parts.doors) {
    parts.doors.FL.rotation.y = -1.0 * cur.doorFL; parts.doors.RL.rotation.y = -1.0 * cur.doorRL;
    parts.doors.FR.rotation.y = 1.0 * cur.doorFR; parts.doors.RR.rotation.y = 1.0 * cur.doorRR;
    ['FL', 'FR', 'RL', 'RR'].forEach((k) => { parts.windows[k].position.y = -0.38 * cur['win' + k]; });
    parts.hood.rotation.x = -0.85 * cur.hood; parts.trunk.rotation.x = 1.0 * cur.hatch;
    parts.sunroof.position.z = -0.55 * cur.roofOpen; parts.sunroof.position.y = 0.045 * cur.roofOpen + 0.035 * cur.roofTilt;
    // seats
    ['D', 'P'].forEach((s) => {
      const h = cur['heat' + s], v = cur['vent' + s]; const f = seatFx[s];
      f.heat.material.opacity = h * (0.75 + 0.25 * Math.sin(now / 300)); f.vent.material.opacity = v * (0.75 + 0.25 * Math.sin(now / 300));
      f.light.color.set(h >= v ? '#F59E0B' : '#60A5FA'); f.light.intensity = Math.max(h, v) * 2.2;
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
    const f = 1 - Math.pow(0.03, dt);
    a.theta += dth * f; a.phi += (b.phi - a.phi) * f; a.radius += (b.radius - a.radius) * f;
    camera.position.copy(new THREE.Vector3().setFromSpherical(a).add(controls.target));
    if (Math.abs(dth) < 0.01 && Math.abs(b.phi - a.phi) < 0.01) camGoal = null;
  }
  if (!controls.autoRotate && now > focusUntil && !dragging) controls.autoRotate = true;
  controls.update();
  renderer.render(scene, camera);
  if (tagAnchor) {
    const p = tagAnchor.clone().project(camera);
    tag.style.transform = `translate(${(p.x * 0.5 + 0.5) * W}px, ${(-p.y * 0.5 + 0.5) * H}px) translate(-50%, -130%)`;
    if (now > tagUntil) { tag.style.opacity = '0'; tagAnchor = null; }
  }
  requestAnimationFrame(frame);
}
let dragging = false;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; controls.autoRotate = false; camGoal = null; $('hint').style.opacity = '0'; });
window.addEventListener('pointerup', () => { dragging = false; focusUntil = performance.now() + 5000; });
requestAnimationFrame(frame);

// ---------- UI ----------
const pool = ['Abre o vidro do motorista', 'Tranca o carro', 'Abre o porta-malas', 'Abre o teto', 'Abre a porta traseira direita', 'Tô com frio', 'Destranca o carro', 'Abre todos os vidros', 'Luz ambiente azul', 'Abre o capô', 'Liga pra Ana', 'Desembaça o vidro', 'Fecha as portas', 'Me leva pra casa'];
let tick = 0;
function renderUI() {
  const s = state;
  $('parked').dataset.on = String(!s.driving); $('driving').dataset.on = String(s.driving);
  $('tempD').textContent = s.tempD + '°'; $('tempP').textContent = s.tempP + '°'; $('fan').textContent = s.fan;
  $('vol').textContent = s.muted ? 'Muted' : s.vol;
  const openDoors = Object.values(s.doors).filter(Boolean).length;
  $('lock').textContent = openDoors ? openDoors + ' open' : s.locked ? 'Locked' : 'Unlocked';
  $('pop').dataset.on = String(!!s.pop); $('popText').textContent = s.pop ? s.pop.text : (s.driving ? 'Driving · all on-device' : 'Parked · all on-device'); $('popMeta').textContent = s.pop ? s.pop.meta : '';
  const l = last || { heard: '—', title: 'Ready for a command', call: 'Tap a suggestion or type below', reply: 'Say “Hey Coach”, then speak.', ok: true };
  $('card').dataset.kind = last ? (l.ok ? 'ok' : 'warn') : 'idle';
  $('heard').textContent = l.heard; $('title').textContent = l.title; $('call').textContent = l.call; $('reply').textContent = l.reply;
  const chips = $('chips'); chips.innerHTML = '';
  [0, 1, 2].forEach((i) => { const t = pool[(tick * 3 + i) % pool.length]; const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.onclick = () => run(t); chips.appendChild(b); });
}
function run(text) {
  const raw = (text || '').trim(); if (!raw) return;
  const r = understand(raw, state); state = r.car; last = r.last; tick++;
  $('say').value = ''; renderUI(); apply(state, last);
}
$('send').onclick = () => run($('say').value);
$('say').addEventListener('keydown', (e) => { if (e.key === 'Enter') run($('say').value); });
$('parked').onclick = () => { state = Object.assign({}, state, { driving: false }); renderUI(); apply(state, null); };
$('driving').onclick = () => { state = Object.assign({}, state, { driving: true }); renderUI(); apply(state, null); };
$('reset').onclick = () => { state = fresh(); last = null; tick = 0; renderUI(); apply(state, null); camGoal = new THREE.Vector3(6.4, 3.1, 6.8); };
renderUI();
window.runCommand = run;
window.setCam = (v) => { camGoal = null; controls.autoRotate = false; focusUntil = performance.now() + 1e9; camera.position.set(v[0], v[1], v[2]); };
