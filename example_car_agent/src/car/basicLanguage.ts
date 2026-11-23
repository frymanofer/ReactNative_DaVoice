// Basic language support for the car agent (2026-11-21). The on-device model and the agent core's word lists are tuned for English
// and Brazilian Portuguese only. In every other language ("Basic") the agent never acts on its own reading of the request: each car
// action is first ASKED in the user's language ("Soll ich das Fahrerfenster öffnen?") and runs only after a plain yes. Read-only lookups
// (fuel, ETA, places) answer directly. The sentences come from basic_languages.json (shared with the Flutter car demo).
//
// How the yes reaches the action: the car tool refuses with an "offer" (the call itself); the agent core runs an offered call when the
// next request is a plain yes. The core's yes / no words are English + Portuguese, so the app turns a plain "ja" / "sí" / "oui" ... into
// "yes" / "no" before the request goes to the agent (normalizeYesNo). The offered call then reaches the tool again and runs (takeConfirmed).

import data from './basic_languages.json';

type Args = Record<string, any>;
export type OfferCall = { name: string; arguments: Args };

type Entry = {
  q: string;
  capitalize: boolean;
  done: string;
  cannot: string;
  driving: string;
  and: string;
  yes: string[];
  no: string[];
  window: Record<string, string>;
  door: Record<string, string>;
  seat: Record<string, string>;
  zone: Record<string, string>;
  feature: Record<string, string>;
  level: Record<string, string>;
  air: Record<string, string>;
  source: Record<string, string>;
  avoid: Record<string, string>;
  place: Record<string, string>;
  t: Record<string, string>;
  answer: Record<string, string>;
  messages: Record<string, string>;
  pack: Record<string, string | string[]>;
  /** [pattern on the folded text, English words] */
  hints?: [string, string][];
};

const LANGS = (data as unknown as { languages: Record<string, Entry> }).languages;

/** The languages the model and the agent core were tuned for: they act directly. */
export const TUNED_LANGUAGES = new Set(['en', 'pt-BR']);
export function isBasicLanguage(language: string | null | undefined): boolean {
  return !TUNED_LANGUAGES.has(language ?? 'en');
}
function entry(language: string): Entry {
  return LANGS[language] ?? LANGS.en;
}

/** The app's own sentence in a Basic language (whichSeat, didNotCatch, notInDemo, noRemote, lowClarify, lowDecline, lowNoRemote). */
export function basicMessage(language: string, key: string): string | undefined {
  return isBasicLanguage(language) ? LANGS[language]?.messages?.[key] : undefined;
}
/** The agent pack's spoken prompts in a Basic language (see AgentPack.ts). */
export function basicPackTexts(language: string): Record<string, string | string[]> | undefined {
  return isBasicLanguage(language) ? LANGS[language]?.pack : undefined;
}

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: unknown, language: string) => {
  const v = Number(n);
  const s = Number.isFinite(v) ? String(Math.round(v * 10) / 10) : String(n);
  return language === 'en' ? s : s.replace('.', ',');
};
const deg = (t: unknown, unit: unknown, language: string) => `${num(t, language)} °${unit === 'fahrenheit' ? 'F' : 'C'}`;

/** The action a call stands for, as a short phrase ("das Fahrerfenster öffnen"). Never null: unknown calls get the generic phrase. */
export function describeCall(name: string, args: Args, language: string): string {
  const E = entry(language);
  const a = args ?? {};
  const T = (key: string, vars: Record<string, string> = {}) => fill(E.t[key] ?? E.t.generic, vars);
  const pick = (table: Record<string, string>, key: unknown, fallback: string) => table[String(key)] ?? table[fallback] ?? String(key ?? '');
  switch (name) {
    case 'set_window': {
      const pos = ['open', 'close', 'half', 'crack'].includes(a.position) ? a.position : 'open';
      return T(`window.${pos}`, { window: pick(E.window, a.window ?? 'all', 'all') });
    }
    case 'open_door':
      return T('door.open', { door: pick(E.door, a.door ?? 'all', 'all') });
    case 'close_doors':
      return T('door.close', { door: pick(E.door, a.door ?? 'all', 'all') });
    case 'lock_car':
    case 'unlock_car': {
      const door = a.door && a.door !== 'all' ? pick(E.door, a.door, 'car') : E.door.car;
      return T(name === 'lock_car' ? 'lock' : 'unlock', { door });
    }
    case 'set_sunroof':
      return T(`sunroof.${['open', 'tilt', 'close'].includes(a.action) ? a.action : 'open'}`);
    case 'set_trunk':
      return T(`${a.which === 'frunk' ? 'frunk' : 'trunk'}.${a.action === 'close' ? 'close' : 'open'}`);
    case 'set_temperature': {
      if (a.temperature !== undefined && a.temperature !== null) {
        const t = deg(a.temperature, a.unit, language);
        return a.zone && a.zone !== 'all' ? T('temp.setZone', { t, zone: pick(E.zone, a.zone, 'all') }) : T('temp.set', { t });
      }
      const c = Number(a.change ?? 1);
      return T(c >= 0 ? 'temp.up' : 'temp.down', { n: num(Math.abs(c) || 1, language) });
    }
    case 'set_dual_zone_temperature':
      return T('dual', { d: deg(a.driver, a.unit, language), p: deg(a.passenger, a.unit, language) });
    case 'comfort_feeling':
      return T(a.feeling === 'hot' ? 'feel.hot' : 'feel.cold');
    case 'set_fan_speed':
      if (a.level !== undefined && a.level !== null) return T('fan.set', { n: num(a.level, language) });
      return T(Number(a.change ?? 1) >= 0 ? 'fan.up' : 'fan.down');
    case 'set_airflow':
      return T('air', { mode: pick(E.air, a.mode, 'face') });
    case 'set_defrost':
      return T(`defrost.${a.target === 'rear' ? 'rear' : 'windshield'}.${a.on === false ? 'off' : 'on'}`);
    case 'set_seat_climate': {
      const vars = { feature: pick(E.feature, a.feature ?? 'heater', 'heater'), seat: pick(E.seat, a.seat ?? 'driver', 'driver') };
      return a.level === 'off' ? T('seat.off', vars) : T('seat.set', { ...vars, level: pick(E.level, a.level ?? 'medium', 'medium') });
    }
    case 'set_steering_wheel_heater':
      return T(a.on === false ? 'wheel.off' : 'wheel.on');
    case 'play_media':
      return T('media', { q: String(a.query ?? '') });
    case 'tune_radio':
      return T('radio', { band: String(a.band ?? 'fm').toUpperCase(), f: num(a.frequency, language) });
    case 'set_audio_source':
      return T('source', { source: pick(E.source, a.source, 'radio') });
    case 'set_volume': {
      const act = String(a.action ?? (Number(a.change ?? 0) < 0 ? 'down' : 'up'));
      if (act === 'set') return T('vol.set', { n: num(a.level, language) });
      return T(`vol.${['up', 'down', 'mute', 'unmute'].includes(act) ? act : 'up'}`);
    }
    case 'navigate_to': {
      const dest = String(a.destination ?? '').trim();
      if (/^home$/i.test(dest)) return T('nav.home');
      if (/^work$/i.test(dest)) return T('nav.work');
      return T('nav', { dest });
    }
    case 'set_route_avoid':
      return T('avoid', { avoid: pick(E.avoid, a.avoid, 'traffic') });
    default:
      return T('generic');
  }
}

/** One question for one or more calls: "Soll ich das Fahrerfenster öffnen und das Gebläse auf Stufe 3 stellen?" */
export function confirmQuestion(calls: OfferCall[], language: string): string {
  const E = entry(language);
  const parts = calls.map((c) => describeCall(c.name, c.arguments, language));
  const body = parts.length <= 1 ? parts[0] ?? E.t.generic : `${parts.slice(0, -1).join(', ')} ${E.and} ${parts[parts.length - 1]}`;
  return fill(E.q, { a: E.capitalize ? capFirst(body) : body });
}

export const basicDone = (language: string) => entry(language).done;
export const basicCannot = (language: string) => entry(language).cannot;
export const basicDriving = (language: string) => entry(language).driving;

/** A read-only lookup answered in the Basic language, or undefined (then the tool's own sentence is used). */
export function basicAnswer(name: string, args: Args, language: string, s: { destination?: string | null; fuelPercent: number }): string | undefined {
  const E = entry(language);
  const A = (key: string, vars: Record<string, string> = {}) => (E.answer[key] ? fill(E.answer[key], vars) : undefined);
  switch (name) {
    case 'get_trip_eta':
      return s.destination ? A('eta', { min: '24' }) : A('eta.none');
    case 'find_along_route':
      return A('find', { place: E.place[String(args?.place_type)] ?? String(args?.place_type ?? '') });
    case 'get_vehicle_status': {
      const item = String(args?.item ?? '');
      const vars: Record<string, string> = {
        range: '312', km: item === 'fuel' ? String(Math.round(s.fuelPercent * 5)) : '312',
        pct: item === 'fuel' ? String(s.fuelPercent) : '76', v: num(12.4, language),
      };
      return A(`status.${item}`, vars);
    }
    default:
      return undefined;
  }
}

// ---- what waits for a yes ----------------------------------------------------------------------------------------------------------

const keyOf = (name: string, args: Args) => `${name}|${stable(args ?? {})}`;
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as Args).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Args)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

let turn = 0;
let pending: { key: string; call: OfferCall; turn: number }[] = [];

/** Call before each request (after normalizeYesNo). Calls asked in the previous request stay confirmable for this one only. */
export function beginBasicTurn(): void {
  turn += 1;
  pending = pending.filter((p) => p.turn >= turn - 1);
}

/** True (and consumed) when this call was asked in the previous request: the user's yes ran it. */
export function takeConfirmed(name: string, args: Args): boolean {
  const k = keyOf(name, args);
  const i = pending.findIndex((p) => p.key === k && p.turn === turn - 1);
  if (i < 0) return false;
  pending.splice(i, 1);
  return true;
}

/** Remembers calls to ask about; returns every call asked in this request (the core keeps one offer per request). */
export function addPending(calls: OfferCall[]): OfferCall[] {
  for (const call of calls) {
    const k = keyOf(call.name, call.arguments);
    if (!pending.some((p) => p.key === k && p.turn === turn)) pending.push({ key: k, call, turn });
  }
  return pending.filter((p) => p.turn === turn).map((p) => p.call);
}

export function clearBasicPending(): void {
  pending = [];
}

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = new Map<string, RegExp>();
function onlyPhrases(text: string, phrases: string[], cacheKey: string): boolean {
  let re = phraseRe.get(cacheKey);
  if (!re) {
    const alts = [...new Set(phrases.map(fold).filter(Boolean))].sort((x, y) => y.length - x.length).map(escape);
    re = new RegExp(`^((${alts.join('|')})( |$))+$`, 'u');
    phraseRe.set(cacheKey, re);
  }
  return re.test(fold(text));
}

/** A plain yes / no to the agent's question in a Basic language -> "yes" / "no" (what the agent core understands), else null. */
export function normalizeYesNo(text: string, language: string): 'yes' | 'no' | null {
  if (!isBasicLanguage(language) || !pending.some((p) => p.turn === turn)) return null;
  const E = entry(language);
  if (onlyPhrases(text, E.yes, `${language}|yes`)) return 'yes';
  if (onlyPhrases(text, E.no, `${language}|no`)) return 'no';
  return null;
}

// ---- English hints for the model ---------------------------------------------------------------------------------------------------

/** Lower case, no accents (ß, ø, æ stay), anything between words one space: what the hint patterns match. */
const foldWords = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}_]+/gu, ' ').trim();

/** A hint pattern for the folded text: words are separated by single spaces, so \w = any non-space and \b = a space or the end. */
function hintRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\' && pattern[i + 1] === 'b') {
      const next = pattern.slice(i + 2);
      const end = next === '' || next[0] === '|' || next[0] === ')' || next.startsWith('(?!') || next.startsWith('(?=');
      out += end ? '(?= |$)' : '(?:^| )';
      i++;
    } else if (pattern[i] === '\\' && pattern[i + 1] === 'w') {
      out += '[^ ]';
      i++;
    } else {
      out += pattern[i];
    }
  }
  return new RegExp(out, 'u');
}
const hintCache = new Map<string, [RegExp, string][]>();

/**
 * Basic language: the car words the user said, in English, added in brackets for the model ("Mach die Musik leiser" ->
 * "Mach die Musik leiser (music, volume down)"). Tuned languages and sentences without a car word stay as they are.
 */
export function withCarHints(text: string, language: string): string {
  if (!isBasicLanguage(language)) return text;
  let rules = hintCache.get(language);
  if (!rules) {
    rules = (LANGS[language]?.hints ?? []).map(([p, en]) => [hintRegex(p), en] as [RegExp, string]);
    hintCache.set(language, rules);
  }
  const folded = foldWords(text);
  const words: string[] = [];
  for (const [re, en] of rules) if (re.test(folded) && !words.includes(en)) words.push(en);
  return words.length ? `${text.trim()} (${words.join(', ')})` : text;
}

/**
 * Basic language: the model was tuned on Brazilian Portuguese, so its own words (a question, a "can't") sometimes come out in
 * Portuguese ("O que você quer ouvir?" to a Swedish driver). Such a sentence is replaced by "Sorry, could you say it again?" in the
 * user's language; anything else is kept. null = keep the sentence.
 */
export function basicReplyFix(sentence: string, language: string): string | null {
  if (!isBasicLanguage(language) || language.startsWith('pt')) return null;
  if (!/(?:^|[^\p{L}])(você|voce|não|desculpe|ouvir|isso|quer|obrigad[oa]|disponível)(?=$|[^\p{L}])/iu.test(sentence)) return null;
  return LANGS[language]?.messages?.didNotCatch ?? null;
}
