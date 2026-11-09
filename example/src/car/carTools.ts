// The DaVoice Car tools for the agent (Agent.setTools): definitions from
// carToolDefinitions.json (identical to the benchmark's and training's
// apps/automotive/app.json), handlers that change the simulated car
// (CarState.ts). Each call is recorded for CarCard, so the user sees which tool
// the AI chose and with which values. Results are short JSON the model reads
// back ("status" says what was done).
//
// Safety is the app's, not the model's: before anything changes, the app
// checks the vehicle state (some actions are refused while driving) and the
// value ranges. A refused call changes nothing, shows as blocked on the card,
// and the model is told why. The core already refuses duplicate calls in a
// turn and asks for confirmation where a tool declares it (send_message).

import type { ToolDefinition } from 'react-native-davoice-llm';
import { toolReply } from 'react-native-davoice-llm';

import { getTTSLanguage } from '../tts';
import carToolsJson from './carToolDefinitions.json'; // not "carTools.json": Metro resolves './carTools' to a .json before a .ts
import { getCarState, recordCarAction, updateCar } from './CarState';
import type { CarState, Level, Seat, WindowPosition } from './CarState';

type Args = Record<string, any>;
type Outcome = { summary: string; result: Record<string, unknown> };
type Handler = (args: Args) => Outcome;

/** The car card speaks the app's language (Brazilian Portuguese for the VW demo). */
const pt = () => getTTSLanguage() === 'pt-BR';
const L = (en: string, ptText: string) => (pt() ? ptText : en);

/** Refused by the app: nothing changes, the model is told why. */
class Refused extends Error {}

const WINDOWS = ['driver', 'passenger', 'rear_left', 'rear_right'] as const;
const PT_WINDOW: Record<string, string> = { all: 'todos os vidros', driver: 'vidro do motorista', passenger: 'vidro do passageiro', rear_left: 'vidro traseiro esquerdo', rear_right: 'vidro traseiro direito' };
const PT_DOOR: Record<string, string> = { driver: 'do motorista', passenger: 'do passageiro', rear_left: 'traseira esquerda', rear_right: 'traseira direita' };
const PT_SEAT: Record<string, string> = { driver: 'motorista', passenger: 'passageiro', rear_left: 'traseiro esquerdo', rear_right: 'traseiro direito' };
const PT_LEVEL: Record<string, string> = { off: 'desligado', low: 'baixo', medium: 'médio', high: 'alto' };
const PT_PLACE: Record<string, string> = { gas_station: 'posto de combustível', ev_charger: 'carregador', parking: 'estacionamento', restaurant: 'restaurante', coffee: 'café', rest_area: 'parada' };
const PT_AVOID: Record<string, string> = { tolls: 'pedágios', traffic: 'trânsito', highways: 'rodovias', ferries: 'balsas' };
const PT_AIR: Record<string, string> = { face: 'rosto', feet: 'pés', face_and_feet: 'rosto e pés', windshield: 'para-brisa' };
const words = (s: string) => s.replace(/_/g, ' ');
const done = (summary: string, extra: Record<string, unknown> = {}) => ({ summary, result: { status: `Done: ${summary}`, ...extra } });

/** Not while the car moves (the demo's Parked / Driving switch). */
const NOT_WHILE_DRIVING: Record<string, (args: Args) => boolean> = {
  set_trunk: () => true,
  set_charge_port: () => true,
  rotate_screen: () => true,
  activate_scenario: (a) => a.mode === 'car_wash' || a.mode === 'rest',
  set_window: (a) => a.window === 'all' && a.position === 'open',
  open_door: () => true,
};

function range(value: unknown, min: number, max: number, what: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Refused(L(`${what} must be between ${min} and ${max}`, `${what} precisa ficar entre ${min} e ${max}`));
  return n;
}

const DEMO_STATUS = {
  range: { km: 312 },
  battery: { percent: 76 },
  energy_consumption: { km_per_liter: 12.4 },
  tire_pressure: { front_left_psi: 32, front_right_psi: 32, rear_left_psi: 31, rear_right_psi: 32 },
  warnings: { warnings: [] as string[] },
};

const HANDLERS: Record<string, Handler> = {
  navigate_to: ({ destination }) => {
    const d = String(destination);
    const shown = d === 'home' ? L('home', 'casa') : d === 'work' ? L('work', 'trabalho') : d;
    updateCar((s) => ({ ...s, destination: shown }));
    return done(L(`navigating to ${shown}`, `navegando para ${shown}`), { minutes: 24, km: 18 });
  },
  find_along_route: ({ place_type }) =>
    done(L(`found a ${words(String(place_type))} 2.1 km ahead`, `${PT_PLACE[place_type] ?? place_type} encontrado a 2,1 km`), { name: 'Nearest match', km: 2.1 }),
  get_trip_eta: () => {
    const s = getCarState();
    if (!s.destination) return { summary: L('no active route', 'nenhuma rota ativa'), result: { navigating: false } };
    return { summary: L(`arriving in 24 min`, `chegada em 24 min`), result: { destination: s.destination, minutes_left: 24, km_left: 18 } };
  },
  set_route_avoid: ({ avoid }) => {
    updateCar((s) => ({ ...s, avoid: [...new Set([...s.avoid, String(avoid)])] }));
    return done(L(`route avoids ${avoid}`, `rota evitando ${PT_AVOID[avoid] ?? avoid}`));
  },
  set_temperature: ({ temperature, change, unit, zone }) => {
    const s0 = getCarState();
    const u = (unit ?? s0.temperature.unit) as CarState['temperature']['unit'];
    const z = (zone ?? 'all') as string;
    const current = z === 'all' ? s0.temperature.driver : (s0.temperature as any)[z] ?? s0.temperature.driver;
    if (temperature === undefined && change === undefined) throw new Refused(L('no temperature given', 'nenhuma temperatura informada'));
    const target = temperature !== undefined ? Number(temperature) : current + Number(change);
    const t = u === 'fahrenheit' ? range(target, 60, 86, L('Temperature', 'A temperatura')) : range(target, 16, 30, L('Temperature', 'A temperatura'));
    updateCar((s) => {
      const next = { ...s.temperature, unit: u };
      if (z === 'all') next.driver = next.passenger = next.rear = t;
      else (next as any)[z] = t;
      return { ...s, temperature: next };
    });
    const zoneText = z === 'all' ? L('cabin', 'cabine') : L(words(z), PT_SEAT[z] ?? z);
    return done(L(`${zoneText} temperature ${t}°${u === 'fahrenheit' ? 'F' : 'C'}`, `temperatura ${zoneText} em ${t}°${u === 'fahrenheit' ? 'F' : 'C'}`), { temperature: t });
  },
  comfort_feeling: ({ feeling }) => {
    const cold = feeling === 'cold';
    updateCar((s) => ({
      ...s,
      temperature: { ...s.temperature, driver: Math.max(16, Math.min(30, s.temperature.driver + (cold ? 2 : -2))) },
      seatHeater: { ...s.seatHeater, driver: cold ? 'medium' : 'off' },
      seatVentilation: { ...s.seatVentilation, driver: cold ? 'off' : 'medium' },
    }));
    return done(cold ? L('warmer air, seat heater on medium', 'ar mais quente e aquecimento do banco no médio') : L('cooler air, seat ventilation on medium', 'ar mais frio e ventilação do banco no médio'));
  },
  set_fan_speed: ({ level, change }) => {
    if (level === undefined && change === undefined) throw new Refused(L('no fan level given', 'nenhum nível de ventilação informado'));
    const target = level !== undefined ? Number(level) : getCarState().fan + Number(change);
    const fan = range(Math.max(1, Math.min(7, target)), 1, 7, L('Fan level', 'O nível de ventilação'));
    updateCar((s) => ({ ...s, fan }));
    return done(L(`fan speed ${fan}`, `ventilação no nível ${fan}`), { fan_level: fan });
  },
  set_airflow: ({ mode }) => {
    updateCar((s) => ({ ...s, airflow: String(mode) }));
    return done(L(`air to ${words(String(mode))}`, `ar para ${PT_AIR[mode] ?? mode}`));
  },
  set_defrost: ({ target, on }) => {
    updateCar((s) => ({ ...s, defrost: { ...s.defrost, [target]: on !== false } }));
    const what = target === 'rear' ? L('rear defogger', 'desembaçador traseiro') : L('windshield defrost', 'desembaçador do para-brisa');
    return done(`${what} ${on === false ? L('off', 'desligado') : L('on', 'ligado')}`);
  },
  set_window: ({ window, position }) => {
    const which = window === 'all' ? WINDOWS : ([window] as const);
    updateCar((s) => {
      const w = { ...s.windows };
      which.forEach((k) => (w[k as keyof typeof w] = position as WindowPosition));
      return { ...s, windows: w };
    });
    const en = { open: 'open', close: 'closed', half: 'half open', crack: 'open a crack' }[String(position)] ?? position;
    const ptPos = { open: 'aberto', close: 'fechado', half: 'meio aberto', crack: 'com uma fresta' }[String(position)] ?? position;
    return done(L(`${window === 'all' ? 'all windows' : `${words(String(window))} window`} ${en}`, `${PT_WINDOW[window] ?? window} ${window === 'all' ? ptPos.replace(/o$/, 'os') : ptPos}`));
  },
  open_door: ({ door }) => {
    if (getCarState().locked) throw new Refused(L('the car is locked; unlock it first', 'o carro está trancado; destranque primeiro'));
    const which = !door || door === 'all' ? WINDOWS : ([door] as const);
    updateCar((s) => {
      const d = { ...s.doors };
      which.forEach((k) => (d[k as keyof typeof d] = 'open'));
      return { ...s, doors: d };
    });
    return done(L(!door || door === 'all' ? 'all doors open' : `${words(String(door))} door open`,
                  !door || door === 'all' ? 'todas as portas abertas' : `porta ${PT_DOOR[door] ?? door} aberta`));
  },
  close_doors: ({ door }) => {
    const which = !door || door === 'all' ? WINDOWS : ([door] as const);
    updateCar((s) => {
      const d = { ...s.doors };
      which.forEach((k) => (d[k as keyof typeof d] = 'closed'));
      return { ...s, doors: d };
    });
    return done(L(!door || door === 'all' ? 'all doors closed' : `${words(String(door))} door closed`,
                  !door || door === 'all' ? 'todas as portas fechadas' : `porta ${PT_DOOR[door] ?? door} fechada`));
  },
  lock_car: () => {
    updateCar((s) => ({ ...s, locked: true }));
    return done(L('car locked', 'carro trancado'));
  },
  unlock_car: () => {
    updateCar((s) => ({ ...s, locked: false }));
    return done(L('car unlocked', 'carro destrancado'));
  },
  set_sunroof: ({ action }) => {
    updateCar((s) => ({ ...s, sunroof: action }));
    return done(L(`sunroof ${action === 'close' ? 'closed' : action === 'tilt' ? 'tilted' : 'open'}`, `teto solar ${action === 'close' ? 'fechado' : action === 'tilt' ? 'inclinado' : 'aberto'}`));
  },
  set_sunshade: ({ action }) => {
    updateCar((s) => ({ ...s, sunshade: action }));
    return done(L(`sunshade ${action === 'close' ? 'closed' : 'open'}`, `cortina do teto ${action === 'close' ? 'fechada' : 'aberta'}`));
  },
  set_trunk: ({ which, action }) => {
    updateCar((s) => ({ ...s, [which === 'frunk' ? 'frunk' : 'trunk']: action }));
    return done(L(`${which} ${action === 'close' ? 'closed' : 'open'}`, `${which === 'frunk' ? 'porta-malas dianteiro' : 'porta-malas'} ${action === 'close' ? 'fechado' : 'aberto'}`));
  },
  set_charge_port: ({ action }) => {
    updateCar((s) => ({ ...s, chargePort: action }));
    return done(L(`charging port ${action === 'close' ? 'closed' : 'open'}`, `tampa de recarga ${action === 'close' ? 'fechada' : 'aberta'}`));
  },
  rotate_screen: ({ orientation }) => {
    const next = orientation ?? (getCarState().screen === 'landscape' ? 'portrait' : 'landscape');
    updateCar((s) => ({ ...s, screen: next }));
    return done(L(`screen in ${next}`, `tela na ${next === 'portrait' ? 'vertical' : 'horizontal'}`));
  },
  set_seat_climate: ({ seat, feature, level }) => {
    const st = (seat ?? 'driver') as Seat;
    const key = feature === 'ventilation' ? 'seatVentilation' : 'seatHeater';
    updateCar((s) => ({ ...s, [key]: { ...s[key], [st]: level as Level } }));
    return done(L(`${words(st)} seat ${feature === 'ventilation' ? 'ventilation' : 'heater'} ${level}`,
      `${feature === 'ventilation' ? 'ventilação' : 'aquecimento'} do banco do ${PT_SEAT[st]} ${PT_LEVEL[level] ?? level}`));
  },
  set_seat_massage: ({ seat, on, mode }) => {
    const st = (seat ?? 'driver') as Seat;
    updateCar((s) => ({ ...s, massage: { seat: st, on: on !== false, mode: Number(mode ?? s.massage.mode) } }));
    return done(on === false ? L('seat massage off', 'massagem desligada') : L(`seat massage on${mode ? `, mode ${mode}` : ''}`, `massagem ligada${mode ? `, modo ${mode}` : ''}`));
  },
  set_steering_wheel_heater: ({ on }) => {
    updateCar((s) => ({ ...s, wheelHeater: on !== false }));
    return done(L(`steering wheel heater ${on === false ? 'off' : 'on'}`, `volante aquecido ${on === false ? 'desligado' : 'ligado'}`));
  },
  set_cabin_lights: ({ light, on, color }) => {
    if (light === 'reading') {
      updateCar((s) => ({ ...s, readingLights: on !== false }));
      return done(L(`reading lights ${on === false ? 'off' : 'on'}`, `luz de leitura ${on === false ? 'apagada' : 'acesa'}`));
    }
    updateCar((s) => ({ ...s, ambient: { on: on !== false, color: color ? String(color) : s.ambient.color } }));
    return done(L(`ambient lighting ${on === false ? 'off' : 'on'}${color && on !== false ? `, ${color}` : ''}`, `luz ambiente ${on === false ? 'apagada' : 'acesa'}${color && on !== false ? `, ${color}` : ''}`));
  },
  play_media: ({ query }) => {
    updateCar((s) => ({ ...s, media: String(query), radio: null, muted: false }));
    return done(L(`playing ${query}`, `tocando ${query}`));
  },
  tune_radio: ({ band, frequency }) => {
    // FM said as digits ("1067", "985") arrives without the decimal point: 875-1080 can only mean 87.5-108.0 MHz.
    const fm = Number(frequency);
    const freq = String(band) !== 'am' && Number.isFinite(fm) && fm >= 875 && fm <= 1080 ? fm / 10 : frequency;
    const f = freq !== undefined ? (String(band) === 'am' ? range(freq, 520, 1710, 'AM') : range(freq, 87.5, 108, 'FM')) : undefined;
    const station = `${String(band).toUpperCase()}${f !== undefined ? ` ${pt() ? String(f).replace('.', ',') : f}` : ''}`;
    updateCar((s) => ({ ...s, radio: station, media: null, source: 'radio' }));
    return done(L(`radio ${station}`, `rádio ${station}`));
  },
  set_audio_source: ({ source }) => {
    updateCar((s) => ({ ...s, source: String(source) }));
    return done(L(`audio source ${source}`, `fonte de áudio: ${source}`));
  },
  set_audio_focus: ({ seat }) => {
    updateCar((s) => ({ ...s, audioFocus: String(seat) }));
    return done(seat === 'all' ? L('sound for everyone', 'som para todos') : L(`sound focused on ${words(String(seat))}`, `som focado no ${PT_SEAT[seat] ?? seat}`));
  },
  set_volume: ({ action, level }) => {
    const s0 = getCarState();
    let volume = s0.volume;
    if (action === 'set' || (level !== undefined && action !== 'mute' && action !== 'unmute')) volume = range(level, 0, 30, L('Volume', 'O volume'));
    else if (action === 'up') volume = Math.min(30, s0.volume + 3);
    else if (action === 'down') volume = Math.max(0, s0.volume - 3);
    const muted = action === 'mute' ? true : action === 'unmute' || action === 'up' || action === 'set' ? false : s0.muted;
    updateCar((s) => ({ ...s, volume, muted }));
    return done(muted ? L('muted', 'som mudo') : L(`volume ${volume}`, `volume ${volume}`), { volume, muted });
  },
  call_contact: ({ name, number_type }) => {
    updateCar((s) => ({ ...s, call: String(name) }));
    return done(L(`calling ${name}${number_type ? ` (${number_type})` : ''}`, `ligando para ${name}`));
  },
  manage_call: ({ action }) => {
    updateCar((s) => ({ ...s, call: action === 'answer' ? L('Incoming caller', 'Chamada recebida') : null }));
    const en = { answer: 'call answered', decline: 'call declined', hang_up: 'call ended' }[String(action)] ?? String(action);
    const ptText = { answer: 'chamada atendida', decline: 'chamada recusada', hang_up: 'chamada encerrada' }[String(action)] ?? String(action);
    return done(L(en, ptText));
  },
  send_message: ({ contact, message }) => done(L(`message sent to ${contact}: "${message}"`, `mensagem enviada para ${contact}: "${message}"`)),
  read_messages: () => ({
    summary: L('read 2 unread messages', '2 mensagens lidas'),
    result: { messages: [{ from: 'Daniel', text: 'Are we still on for dinner?' }, { from: 'Mom', text: 'Call me when you can.' }] },
  }),
  get_vehicle_status: ({ item }) => {
    const s = getCarState();
    const value = item === 'fuel' ? { percent: s.fuelPercent, km: Math.round(s.fuelPercent * 5) } : (DEMO_STATUS as any)[String(item)] ?? {};
    const shown = {
      range: L('312 km of range', 'autonomia de 312 km'),
      fuel: L(`fuel ${s.fuelPercent}%`, `combustível em ${s.fuelPercent}%`),
      battery: L('battery 76%', 'bateria em 76%'),
      energy_consumption: L('12.4 km/l average', 'média de 12,4 km/l'),
      tire_pressure: L('tires 31–32 psi', 'pneus entre 31 e 32 psi'),
      warnings: L('no warnings', 'nenhum alerta'),
    }[String(item)] ?? String(item);
    return { summary: shown, result: { item, ...value } };
  },
  activate_scenario: ({ mode }) => {
    updateCar((s) => {
      const closed = { driver: 'close', passenger: 'close', rear_left: 'close', rear_right: 'close' } as CarState['windows'];
      switch (mode) {
        case 'smoking':
          return { ...s, scenario: 'smoking', windows: { ...s.windows, driver: 'crack' }, airflow: 'face' };
        case 'rest':
          return { ...s, scenario: 'rest', sunshade: 'close', ambient: { on: true, color: 'warm white' }, temperature: { ...s.temperature, driver: 22, passenger: 22 } };
        case 'rain':
          return { ...s, scenario: 'rain', windows: closed, sunroof: 'close' };
        default:
          return { ...s, scenario: 'car_wash', windows: closed, sunroof: 'close' };
      }
    });
    const ptMode = { smoking: 'fumante', rest: 'descanso', rain: 'chuva', car_wash: 'lava-rápido' }[String(mode)] ?? mode;
    return done(L(`${words(String(mode))} mode on`, `modo ${ptMode} ativado`));
  },
};

function toTool(t: any): ToolDefinition {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.execution ? { execution: t.execution } : {}),
    handler: (rawArgs: Args) => {
      const args = rawArgs ?? {};
      const run = HANDLERS[t.name];
      try {
        if (!run) throw new Refused(L(`${t.name} is not available in this car`, `${t.name} não está disponível neste carro`));
        if (getCarState().driving && NOT_WHILE_DRIVING[t.name]?.(args)) {
          throw new Refused(L('not allowed while driving', 'não é permitido com o carro em movimento'));
        }
        const { summary, result } = run(args);
        recordCarAction(t.name, args, summary);
        console.log(`[Car] ${t.name} ${JSON.stringify(args)} -> ${summary}`);
        // An action (done(...)): the app says what it did and the turn ends there: no second model round to say
        // "Done." (~5 s on a phone CPU), and the user hears exactly what changed. Lookups (vehicle status, ETA, places)
        // stay with the model, which words the answer.
        if (typeof result?.status === 'string' && result.status.startsWith('Done: ')) {
          return toolReply({ ok: true, ...result }, L(`Done: ${summary}.`, `Pronto: ${summary}.`));
        }
        return { ok: true, ...result };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordCarAction(t.name, args, reason, false, reason);
        console.log(`[Car] REFUSED ${t.name} ${JSON.stringify(args)}: ${reason}`);
        // The model tells the user; nothing changed in the car.
        throw new Error(`Not done: ${reason}`);
      }
    },
  };
}

const ALL = (carToolsJson.tools as any[]).map(toTool);

/** The car tools for Agent.setTools: the VW Brazil demo's (constants.ts LOCAL_LLM_CAR_TOOLS), or the whole catalog. */
export function carTools(profile: 'vw_demo' | 'all'): ToolDefinition[] {
  if (profile === 'all') return ALL;
  const keep = new Set((carToolsJson as any).profiles.vw_demo as string[]);
  return ALL.filter((t) => keep.has(t.name));
}

export const CAR_TOOL_NAMES = new Set(ALL.map((t) => t.name));
