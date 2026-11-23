// Basic languages (2026-11-21, src/car/basicLanguage.ts): every car action is asked in the user's language and runs only after a yes;
// the tuned languages (en, pt-BR) act as before. Checks every language's sentences for every tool of the VW demo.

let mockLang = 'de';
jest.mock('../src/tts', () => ({ getTTSLanguage: () => mockLang }));
jest.mock('react-native-davoice-llm', () => ({ toolReply: (result: any, say: string) => ({ result, say }) }));

import data from '../src/car/basic_languages.json';
import {
  basicAnswer, beginBasicTurn, clearBasicPending, confirmQuestion, describeCall, isBasicLanguage, normalizeYesNo,
} from '../src/car/basicLanguage';
import { carTools } from '../src/car/carTools';
import { getCarState, resetCar, setDriving, setSteering } from '../src/car/CarState';
import { beginCarTurn, carTurnActions, composeCarSpeech } from '../src/car/speechComposer';

const LANGS = Object.keys((data as any).languages).filter((l) => l !== 'en');
const tools = () => Object.fromEntries(carTools('all', 'h3d').map((t: any) => [t.name, t]));
const run = (name: string, args: Record<string, unknown>, context?: Record<string, unknown>) =>
  (tools()[name] as any).handler(args, context) as { result: any; say: string };

const CALLS: [string, Record<string, unknown>][] = [
  ['set_window', { window: 'driver', position: 'open' }], ['set_window', { window: 'all', position: 'close' }],
  ['set_window', { window: 'rear_left', position: 'half' }], ['set_window', { window: 'passenger', position: 'crack' }],
  ['open_door', { door: 'rear_right' }], ['close_doors', { door: 'all' }], ['lock_car', {}], ['unlock_car', { door: 'driver' }],
  ['set_sunroof', { action: 'tilt' }], ['set_trunk', { which: 'trunk', action: 'open' }], ['set_temperature', { temperature: 21.5 }],
  ['set_temperature', { temperature: 22, zone: 'passenger' }], ['set_temperature', { change: -2 }], ['set_temperature', { change: 1 }],
  ['set_dual_zone_temperature', { driver: 20, passenger: 23 }], ['comfort_feeling', { feeling: 'cold' }], ['comfort_feeling', { feeling: 'hot' }],
  ['set_fan_speed', { level: 3 }], ['set_fan_speed', { change: -1 }], ['set_airflow', { mode: 'feet' }], ['set_defrost', { target: 'rear', on: true }],
  ['set_defrost', { target: 'windshield', on: false }], ['set_seat_climate', { seat: 'driver', feature: 'heater', level: 'high' }],
  ['set_seat_climate', { seat: 'passenger', feature: 'ventilation', level: 'off' }], ['set_steering_wheel_heater', { on: true }],
  ['play_media', { query: 'Anitta', kind: 'artist' }], ['tune_radio', { band: 'fm', frequency: 101.5 }], ['set_audio_source', { source: 'bluetooth' }],
  ['set_volume', { action: 'up' }], ['set_volume', { action: 'set', level: 12 }], ['set_volume', { action: 'mute' }],
  ['navigate_to', { destination: 'home' }], ['navigate_to', { destination: 'Madrid' }], ['set_route_avoid', { avoid: 'tolls' }],
];

beforeEach(() => {
  resetCar();
  setDriving(false);
  setSteering('left');
  clearBasicPending();
  mockLang = 'de';
});

test('tuned and Basic languages', () => {
  expect(isBasicLanguage('en')).toBe(false);
  expect(isBasicLanguage('pt-BR')).toBe(false);
  for (const l of ['de', 'es', 'it', 'fr', 'nl', 'el', 'sv', 'da', 'pt-PT', 'he']) expect(isBasicLanguage(l)).toBe(true);
});

test('every language describes every demo call with no placeholder left', () => {
  for (const lang of LANGS) {
    for (const [name, args] of CALLS) {
      const q = confirmQuestion([{ name, arguments: args }], lang);
      expect(q).not.toMatch(/[{}]|undefined|null/);
      expect(q.length).toBeGreaterThan(5);
    }
    const two = confirmQuestion([{ name: 'set_window', arguments: { window: 'driver', position: 'open' } }, { name: 'set_fan_speed', arguments: { level: 3 } }], lang);
    expect(two).not.toMatch(/[{}]/);
    for (const item of ['range', 'fuel', 'battery', 'energy_consumption', 'tire_pressure', 'warnings']) {
      expect(basicAnswer('get_vehicle_status', { item }, lang, getCarState())).toMatch(/\S/);
    }
    expect(basicAnswer('find_along_route', { place_type: 'parking' }, lang, getCarState())).not.toMatch(/[{}]/);
  }
});

test('a few sentences read naturally', () => {
  expect(confirmQuestion([{ name: 'set_window', arguments: { window: 'driver', position: 'open' } }], 'de')).toBe('Soll ich das Fahrerfenster öffnen?');
  expect(confirmQuestion([{ name: 'lock_car', arguments: {} }], 'es')).toBe('¿Bloquear el coche?');
  expect(confirmQuestion([{ name: 'set_temperature', arguments: { temperature: 21.5 } }], 'fr')).toBe('Régler la température à 21,5 °C ?');
  expect(confirmQuestion([{ name: 'set_volume', arguments: { action: 'down' } }], 'it')).toBe('Abbassare il volume?');
  expect(confirmQuestion([{ name: 'set_sunroof', arguments: { action: 'open' } }], 'el')).toBe('Να ανοίξω την ηλιοροφή;');
  expect(describeCall('navigate_to', { destination: 'work' }, 'nl')).toBe('naar het werk navigeren');
});

test('Basic: the action is asked, nothing changes; a yes runs exactly that call', () => {
  beginCarTurn();
  const asked = run('set_window', { window: 'driver', position: 'open' });
  expect(asked.say).toBe('Soll ich das Fahrerfenster öffnen?');
  expect(asked.result.ok).toBe(false);
  expect(asked.result.offer.calls).toEqual([{ name: 'set_window', arguments: { window: 'driver', position: 'open' } }]);
  expect(getCarState().windows.front_left).not.toBe('open');
  // the user's "Ja, bitte." reaches the agent as "yes"; the core then runs the offered call
  expect(normalizeYesNo('Ja, bitte.', 'de')).toBe('yes');
  beginCarTurn();
  const ran = run('set_window', { window: 'driver', position: 'open' });
  expect(ran.say).toBe('Erledigt.');
  expect(getCarState().windows.front_left).toBe('open');
  // asked once, confirmed once: the same call later is asked again
  beginCarTurn();
  expect(run('set_window', { window: 'driver', position: 'close' }).result.ok).toBe(false);
});

test('Basic: a no or a new request drops the question; a yes two requests later runs nothing', () => {
  beginCarTurn();
  run('lock_car', {});
  expect(normalizeYesNo('Nein danke', 'de')).toBe('no');
  beginCarTurn();
  beginCarTurn();
  expect(normalizeYesNo('ja', 'de')).toBeNull();
  expect(run('lock_car', {}).result.ok).toBe(false);
  expect(getCarState().locked).toBe(false);
});

test('Basic: two actions in one request are one offer', () => {
  beginCarTurn();
  run('set_window', { window: 'driver', position: 'open' });
  const second = run('set_fan_speed', { level: 3 });
  expect(second.result.offer.calls.map((c: any) => c.name)).toEqual(['set_window', 'set_fan_speed']);
  beginCarTurn();
  expect(run('set_window', { window: 'driver', position: 'open' }).result.ok).toBe(true);
  expect(run('set_fan_speed', { level: 3 }).result.ok).toBe(true);
  expect(composeCarSpeech('Erledigt. Erledigt.', carTurnActions(), 'de')).toBe('Erledigt.');
});

test('Basic: lookups answer at once in the language; driving refusals are in the language', () => {
  mockLang = 'es';
  beginCarTurn();
  expect(run('get_vehicle_status', { item: 'fuel' }).say).toMatch(/^El depósito está al \d+ %/);
  setDriving(true);
  expect(run('set_trunk', { which: 'trunk', action: 'open' }).say).toBe('No puedo hacer eso con el coche en marcha.');
});

test('Basic yes / no words: folded, repeated, only when something was asked', () => {
  expect(normalizeYesNo('sí', 'es')).toBeNull();   // nothing asked yet
  beginCarTurn();
  mockLang = 'es';
  run('lock_car', {});
  expect(normalizeYesNo('Sí, sí.', 'es')).toBe('yes');
  expect(normalizeYesNo('si por favor', 'es')).toBe('yes');
  expect(normalizeYesNo('no, gracias', 'es')).toBe('no');
  expect(normalizeYesNo('sí, y abre la ventana', 'es')).toBeNull();
  expect(normalizeYesNo('yes', 'en')).toBeNull();   // tuned languages: the core understands them itself
});

test('Basic yes words in every language', () => {
  const yes: Record<string, string> = { de: 'Ja', es: 'Vale', it: 'Sì, grazie', fr: "Oui, d'accord", nl: 'Ja graag', el: 'Ναι', sv: 'Ja tack', da: 'Ja tak', 'pt-PT': 'Sim, por favor' };
  for (const [lang, text] of Object.entries(yes)) {
    clearBasicPending();
    mockLang = lang;
    beginBasicTurn();
    run('lock_car', {});
    expect([lang, normalizeYesNo(text, lang)]).toEqual([lang, 'yes']);
  }
});

test('tuned languages act directly, as before', () => {
  mockLang = 'en';
  beginCarTurn();
  expect(run('set_window', { window: 'driver', position: 'open' }).say).toBe("I opened the driver's window.");
  mockLang = 'pt-BR';
  expect(run('lock_car', {}).result.ok).toBe(true);
});

// English hints (2026-11-21): the app adds the car words the user said, in English, for the model. The expected strings come from the
// Python version that was measured on 252 sentences in 9 languages (49% -> 78% right on fresh sentences); the app must match it exactly.
import hintFixture from './fixtures/basic_hints.json';
import { basicReplyFix, withCarHints } from '../src/car/basicLanguage';

test('hints: identical to the measured version for all 252 test sentences', () => {
  const diffs = (hintFixture as [string, string, string][]).filter(([lang, text, want]) => withCarHints(text, lang) !== want);
  expect(diffs).toEqual([]);
});

test('hints: a few by hand; tuned languages and non-car speech stay as they are', () => {
  expect(withCarHints('Mach die Musik leiser', 'de')).toBe('Mach die Musik leiser (volume down, music)');
  expect(withCarHints('Lås dørene op', 'da')).toBe('Lås dørene op (door, unlock)');
  expect(withCarHints('Lås bilen', 'da')).toBe('Lås bilen (lock, car)');
  expect(withCarHints('open the window', 'en')).toBe('open the window');
  expect(withCarHints('abre o vidro', 'pt-BR')).toBe('abre o vidro');
  expect(withCarHints('Meine Schwester kommt morgen', 'de')).toBe('Meine Schwester kommt morgen');
});

test('a Portuguese sentence from the model is replaced in other Basic languages only', () => {
  expect(basicReplyFix('O que você quer ouvir?', 'sv')).toBe('Förlåt, det uppfattade jag inte. Kan du säga det igen?');
  expect(basicReplyFix('Isso não está disponível aqui, desculpe.', 'it')).toBe('Scusa, non ho capito. Puoi ripetere?');
  expect(basicReplyFix('¿Qué quieres escuchar?', 'es')).toBeNull();
  expect(basicReplyFix('Was möchtest du hören?', 'de')).toBeNull();
  expect(basicReplyFix('O que você quer ouvir?', 'pt-PT')).toBeNull();
  expect(basicReplyFix('O que você quer ouvir?', 'pt-BR')).toBeNull();
  expect(basicReplyFix('What do you want to hear?', 'en')).toBeNull();
});
