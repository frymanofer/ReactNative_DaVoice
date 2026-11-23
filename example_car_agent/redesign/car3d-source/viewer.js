// car3d_viewer: the 3D car only. The app sends the car state; the viewer animates it.
// In:  postMessage(JSON.stringify({ type: 'state', state: <CarState from src/car/CarState.ts>, lastAction: <CarAction|null> }))
// In:  postMessage(JSON.stringify({ type: 'pause', on: true|false })) — no rendering while on (the agent is working).
// Out: { type: 'ready' } once loaded.
import './engine.js';

const canvas = document.getElementById('car');
const tag = document.getElementById('tag');
const engine = window.DV3D.mount(canvas, tag);

const POS = { front_left: 'FL', front_right: 'FR', rear_left: 'RL', rear_right: 'RR' };
const WIN = { open: 1, half: 0.5, crack: 0.2, close: 0 };
const COLORS = { white: '#F9FAFB', blue: '#60A5FA', red: '#F87171', green: '#34D399', purple: '#C084FC', orange: '#FB923C', yellow: '#FACC15', pink: '#F472B6', teal: '#2DD4BF', azul: '#60A5FA', vermelho: '#F87171', verde: '#34D399', roxo: '#C084FC', laranja: '#FB923C', amarelo: '#FACC15', rosa: '#F472B6', branco: '#F9FAFB' };
const color = (c) => (c && (COLORS[String(c).toLowerCase()] || (/^#/.test(c) ? c : null))) || '#2DD4BF';
const seat = (heat, vent) => (vent && vent !== 'off' ? 'vent' : heat && heat !== 'off' ? 'heat' : null);
// seat heater / ventilation level (set_seat_climate: off, low = 1, medium = 2, high = 3) for each of the four seats
const LEVEL = { off: 0, low: 1, medium: 2, high: 3 };
const SEAT_OF = { FL: 'driver', FR: 'passenger', RL: 'rear_left', RR: 'rear_right' };

// CarState (app) -> viewer state
function fromCarState(cs) {
  if (cs.win) return cs; // already in viewer shape
  const win = {}, doors = {};
  Object.entries(POS).forEach(([p, k]) => { win[k] = WIN[(cs.windows || {})[p]] ?? 0; doors[k] = (cs.doors || {})[p] === 'open' ? 1 : 0; });
  const sh = cs.seatHeater || {}, sv = cs.seatVentilation || {};
  return {
    win, doors, locked: !!cs.locked,
    roof: cs.sunroof || 'close', trunk: cs.trunk || 'close', frunk: cs.frunk === 'open', port: cs.chargePort === 'open',
    seatD: seat(sh.driver, sv.driver), seatP: seat(sh.passenger, sv.passenger),
    seats: Object.fromEntries(Object.entries(SEAT_OF).map(([k, n]) => [k, { heat: LEVEL[sh[n]] || 0, vent: LEVEL[sv[n]] || 0 }])),
    wheel: !!cs.wheelHeater, defrost: !!(cs.defrost && (cs.defrost.windshield || cs.defrost.rear)),
    ambient: cs.ambient && cs.ambient.on ? color(cs.ambient.color) : null,
    focus: !!cs.call, driving: !!cs.driving
  };
}
// CarAction (app) -> viewer action
function fromAction(a) {
  if (!a) return null;
  if (a.call) return a;
  const args = Object.entries(a.args || {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ');
  const title = a.ok === false ? 'Blocked' : (a.summary || a.tool).replace(/^./, (c) => c.toUpperCase());
  return { call: `${a.tool}(${args})`, ok: a.ok !== false, title };
}
function onMessage(e) {
  let m = e.data; try { if (typeof m === 'string') m = JSON.parse(m); } catch (_) { return; }
  // {type:'pause', on}: the app pauses rendering while the agent works (the model needs every CPU core)
  if (m && m.type === 'pause') { if (engine.pause) engine.pause(!!m.on); return; }
  if (!m || m.type !== 'state' || !m.state) return;
  engine.apply(fromCarState(m.state), fromAction(m.lastAction));
  // the first state is where the car already is: show it at once instead of animating from the default
  if (!gotState) { gotState = true; if (engine.snap) engine.snap(); }
}
let gotState = false;
window.addEventListener('message', onMessage);
document.addEventListener('message', onMessage); // Android WebView
const post = (o) => { const s = JSON.stringify(o); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if (window.parent !== window) window.parent.postMessage(s, '*'); };
window.addEventListener('resize', () => engine.resize && engine.resize());
post({ type: 'ready' });
window.viewerReady = true;
