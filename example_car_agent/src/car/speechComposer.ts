/**
 * What the driver HEARS when one request did several car actions (2026-11-19, user: "I closed all the doors. I locked the car." sounds
 * robotic). The car tools' own sentences (carTools.ts `say`) that ran in a row become one natural sentence:
 *   "I closed all the doors. I locked the car."  ->  "All set. I closed all the doors and locked the car. Everything is secure."
 *   "Fechei todas as portas. Tranquei o carro."  ->  "Pronto, já está! Fechei todas as portas e tranquei o carro. Está tudo seguro."
 * Accuracy: nothing here decides an action. Only sentences of actions that really ran (recorded by the tool handlers in this turn) are
 * merged, word for word; anything else (a question, a refusal, an undo, a status answer that is not "I did X") is said as it was.
 * The conversation history the model sees keeps the original sentences (the wording it was trained on): only speech and the screen change.
 */

import { beginBasicTurn } from './basicLanguage';

export interface CarTurnAction {
  tool: string;
  say: string;
  /** false: refused / failed / an undo: never merged */
  merge: boolean;
  /** the call's arguments (picks the friendly closing line) */
  args?: Record<string, unknown>;
  /** did = changed the car; already = it was already so; answer = a lookup. Only "did" gets the friendly words. */
  kind?: 'did' | 'already' | 'answer';
  /** the calls a plain "yes" to this reply runs (the result's offer, handled by the agent core), by name */
  offer?: string[];
}

let turnActions: CarTurnAction[] = [];
let variant = 0;

/** Call before each request. */
export function beginCarTurn(): void {
  turnActions = [];
  beginBasicTurn();
}

/** Called by the car tool handlers with the sentence they return. */
export function noteCarSay(tool: string, say: string, merge: boolean, extra: { args?: Record<string, unknown>; kind?: CarTurnAction['kind']; offer?: string[] } = {}): void {
  if (say) turnActions.push({ tool, say: say.trim(), merge, ...extra });
}

export function carTurnActions(): CarTurnAction[] {
  return turnActions;
}

/** Before beginCarTurn: the calls the previous request's offer runs on a plain "yes" (the agent core keeps it for one request), or null. */
export function pendingOfferCalls(): string[] | null {
  const a = [...turnActions].reverse().find((x) => x.offer && x.offer.length);
  return a?.offer ?? null;
}

const OPENERS: Record<'en' | 'pt', string[]> = {
  en: ['All set.', 'Done.', 'You got it.'],
  pt: ['Pronto, já fiz isso para você.', 'Certo, já resolvi isso para você.', 'Tudo certo, já cuidei disso para você.'],
};
const SECURE: Record<'en' | 'pt', string> = { en: 'Everything is secure.', pt: 'Agora o carro está todo seguro.' };
const CLOSING_TOOLS = new Set(['close_doors', 'set_window', 'set_sunroof', 'set_trunk']);
const LOOKUP_TOOLS = new Set(['get_vehicle_status', 'get_trip_eta', 'find_along_route']);

// ---- a friendlier voice (2026-11-21, user: "more like Otto", VW's assistant): the same facts, word for word, with a warm opener and,
// every other time, a short closing line that fits the action. Only for actions that really ran, only in the tuned languages.
const FRIENDLY_OPENERS: Record<'en' | 'pt', string[]> = {
  en: ['Sure, you got it.', 'You got it!', 'Consider it done!', 'Alright, all set!', 'There you go!'],
  pt: ['Claro, já fiz isso para você.', 'Pronto, já fiz isso para você.', 'Certo, já resolvi isso para você.', 'Tudo certo, já cuidei disso para você.', 'Feito, já está tudo certinho agora.'],
};
// pt-BR wording (2026-11-22, temporary until the pt-BR voice model is fixed): the speech library speaks one sentence at a time and the
// pt-BR model drops or garbles short sentences said alone ("Claro!", "Tranquei o carro."). Every pt sentence here was synthesized 5
// times with the app's model and voice and understood 5/5 by speech-to-text; keep new ones at about six words and test them the same way.
/** What the car says while a request takes a moment (Otto's "Entendido."). */
const ACKS: Record<'en' | 'pt', string[]> = { en: ['Got it.', 'On it.', 'One moment.'], pt: ['Entendido, só um instante, por favor.', 'Só um instante, já vou fazer isso.', 'Pode deixar, só um instante, por favor.'] };
let ackVariant = 0;
/** A short acknowledgement for a request that takes a moment, or null (Basic languages keep their own flow). */
export function carAck(language: string): string | null {
  const lang = language === 'pt-BR' ? 'pt' : language === 'en' ? 'en' : null;
  return lang ? ACKS[lang][ackVariant++ % ACKS[lang].length] : null;
}
/** The closing line for an action that ran, or null. */
function friendlyTail(a: CarTurnAction, lang: 'en' | 'pt', driving = false): string | null {
  const g = a.args ?? {};
  const T = (en: string, pt: string) => (lang === 'pt' ? pt : en);
  const num = (v: unknown) => Number(v ?? 0);
  switch (a.tool) {
    case 'unlock_car': return driving ? null : T('Come on in!', 'Pode entrar, o carro já está aberto.');
    case 'lock_car': return T("You're good to go.", 'Pode ficar tranquilo, está tudo seguro.');
    case 'set_window': return g.position === 'close' ? null : T('Enjoy the fresh air.', 'Aproveite o vento fresco da estrada.');
    case 'set_sunroof': return g.action === 'close' ? null : T('Enjoy the view!', 'Aproveite a vista lá de cima.');
    case 'comfort_feeling': return g.feeling === 'hot' ? T("It'll cool down in a minute.", 'O carro vai refrescar em um minutinho.') : T("It'll feel cozier in a minute.", 'Já já o carro fica mais quentinho.');
    case 'set_temperature':
      if (g.temperature !== undefined && g.temperature !== null) return null;
      return num(g.change) > 0 ? T("It'll warm up soon.", 'O carro vai esquentar em um minutinho.') : num(g.change) < 0 ? T("It'll cool down soon.", 'O carro vai refrescar em um minutinho.') : null;
    case 'set_seat_climate':
      if (g.level === 'off') return null;
      return g.feature === 'ventilation' ? T('That should cool you down.', 'A ventilação do banco vai refrescar você.') : T('Nice and cozy.', 'O assento vai ficar quentinho rapidinho.');
    case 'set_steering_wheel_heater': return g.on === false ? null : T('Warm hands coming up.', 'O volante vai ficar quentinho rapidinho.');
    case 'navigate_to': return T("Let's go!", 'Vamos lá, tenha uma ótima viagem!');
    case 'play_media':
    case 'tune_radio': return T('Enjoy the music!', 'Aproveite a música durante a viagem.');
    case 'set_defrost': return g.on === false ? null : T("You'll see clearly in a moment.", 'O vidro vai desembaçar em um minutinho.');
    default: return null;
  }
}
const did = (a: CarTurnAction) => (a.kind ?? (LOOKUP_TOOLS.has(a.tool) ? 'answer' : 'did')) === 'did';

// ---- how a tool sentence is SAID (2026-11-21 reply review): the tools' sentences stay as they are in the history (the model was trained
// with them, Davoice_LLM_Training tools/say_what_done.py); only the spoken wording is smoother. Same facts, same numbers; tuned languages.
/** "airport" -> "the airport" (a common noun the model wrote without its article); names, "home" and "my office" stay as they are. */
function enPlace(d: string): string {
  const p = d.replace(/_/g, ' ').trim();
  return /^[a-z]/.test(p) && !/^(the|a|an|my|your|our|his|her|their|work|downtown)\b/.test(p) && !/'s\b/.test(p) ? `the ${p}` : p;
}
/** "aeroporto" -> {to: "o aeroporto", at: "no aeroporto"}; "casa" -> {to: "casa", at: "em casa"}; "São Paulo" stays. */
function ptPlace(d: string): { to: string; at: string } {
  const p = d.replace(/_/g, ' ').trim();
  if (/^casa$/i.test(p)) return { to: 'casa', at: 'em casa' };
  const art = /^(o|a|os|as) (.+)$/i.exec(p);
  if (art) return { to: p, at: `${{ o: 'no', a: 'na', os: 'nos', as: 'nas' }[art[1].toLowerCase() as 'o' | 'a' | 'os' | 'as']} ${art[2]}` };
  if (/^[a-zà-ü]/.test(p) && !/^(um|uma|meu|minha|meus|minhas|seu|sua|nosso|nossa)\b/i.test(p)) {
    const fem = /(a|ção|dade|gem)$/i.test(p.split(' ')[0]);
    return { to: `${fem ? 'a' : 'o'} ${p}`, at: `${fem ? 'na' : 'no'} ${p}` };
  }
  return { to: p, at: `em ${p}` };
}
/** The sentence as the driver hears it (or the tool's own sentence when nothing reads better). */
export function spokenSay(a: CarTurnAction, language: string): string {
  const s = a.say;
  // an undo (carTools.ts "Undone. <the tool's sentence>"): said as putting it back, the sentence said like any other
  const undo = /^(Undone|Desfeito)\. (.+)$/s.exec(s);
  if (undo && (language === 'en' || language === 'pt-BR')) {
    return `${language === 'en' ? 'Okay, I put it back.' : 'Pronto, voltei tudo como estava antes.'} ${spokenSay({ ...a, say: undo[2] }, language)}`;
  }
  const g = a.args ?? {};
  const change = Number(g.change ?? 0);
  // a found place with its navigation offer (carTools.ts find_along_route): the question a plain "yes" answers
  if (a.tool === 'find_along_route' && a.offer?.includes('navigate_to') && (language === 'en' || language === 'pt-BR')) {
    return `${s} ${language === 'en' ? 'Want me to take you there?' : 'Quer que eu te leve até lá?'}`;
  }
  if (language === 'en') {
    const sub: [RegExp, string | ((...m: string[]) => string)][] = [
      [/^I set the whole cabin to (.+)$/, 'I set the temperature to $1'],
      [/^I raised the whole cabin to (.+)$/, 'I turned the temperature up to $1'],
      [/^I lowered the whole cabin to (.+)$/, 'I turned the temperature down to $1'],
      [/^The whole cabin is already at (.+)$/, 'The temperature is already at $1'],
      [/^I set the fan to level (\d+)\.$/, (_m, n) => (change > 0 ? `I turned the fan up to level ${n}.` : change < 0 ? `I turned the fan down to level ${n}.` : `I set the fan to level ${n}.`)],
      [/^I set the (heater|ventilation) in (the .+? seat) to (\w+)\.$/, 'I set $2 $1 to $3.'],
      [/^I turned off the (heater|ventilation) in (the .+? seat)\.$/, 'I turned off $2 $1.'],
      [/^The (heater|ventilation) in (the .+? seat) is already (.+)$/, (_m, f, seat, rest) => `${seat.charAt(0).toUpperCase()}${seat.slice(1)} ${f} is already ${rest}`],
      [/^I turned the (rear defogger|windshield defrost) (on|off)\.$/, 'I turned $2 the $1.'],
      [/^Navigating to (.+?): (.*)$/, (_m, d, rest) => (d === 'home' ? `Navigating home: ${rest}` : `Navigating to ${enPlace(d)}: ${rest}`)],
      [/^You'll get to (.+?) in about (.*)$/, (_m, d, rest) => (d === 'home' ? `You'll get home in about ${rest}` : `You'll get to ${enPlace(d)} in about ${rest}`)],
      [/ Close them first\?$/, ' Want me to close them first?'],
      [/ Close it first\?$/, ' Want me to close it first?'],
      [/^I didn't change it: (.+) must be between (\S+) and (\S+)\.$/, (_m, w, lo, hi) => `Sorry, ${/^(am|fm)$/.test(w) ? w.toUpperCase() : w === 'volume' ? 'the volume' : w} only goes from ${lo} to ${hi}.`],
      [/^I didn't change the temperature: both values must be between (\S+) and (\S+)\.$/, 'Sorry, the temperature only goes from $1 to $2.'],
      [/^I can't do that while the car is moving\.$/, "Sorry, I can't do that while we're moving."],
    ];
    for (const [re, to] of sub) if (re.test(s)) return s.replace(re, to as any);
    return s;
  }
  if (language === 'pt-BR') {
    const sub: [RegExp, string | ((...m: string[]) => string)][] = [
      [/^Coloquei a cabine toda em (.+)$/, 'Coloquei a temperatura em $1'],
      [/^Subi a cabine toda para (.+)$/, 'Subi a temperatura para $1'],
      [/^Baixei a cabine toda para (.+)$/, 'Baixei a temperatura para $1'],
      [/^A cabine toda já está em (.+)$/, 'A temperatura já está em $1'],
      [/^Coloquei a ventilação no nível (\d+)\.$/, (_m, n) => (change > 0 ? `Aumentei a ventilação para o nível ${n}.` : change < 0 ? `Baixei a ventilação para o nível ${n}.` : `Coloquei a ventilação no nível ${n}.`)],
      [/^Coloquei (o aquecimento|a ventilação) do banco (.+)$/, 'Liguei $1 do banco $2'],
      [/^Indo para (.+?): (.*)$/, (_m, d, rest) => `Indo para ${ptPlace(d).to}: ${rest}`],
      [/^Você chega em (.+?) em cerca de (.*)$/, (_m, d, rest) => `Você chega ${ptPlace(d).at} em cerca de ${rest}`],
      [/^Não mudei: (.+) precisa ficar entre (\S+) e (\S+)\.$/, (_m, w, lo, hi) => `Desculpe, ${/^(am|fm)$/.test(w) ? w.toUpperCase() : w} só vai de ${lo} a ${hi}.`],
      [/^Não mudei a temperatura: os dois valores precisam ficar entre (\S+) e (\S+)\.$/, 'Desculpe, a temperatura só vai de $1 a $2.'],
      [/^Não posso fazer isso com o carro em movimento\.$/, 'Desculpe, não dá pra fazer isso com o carro em movimento.'],
    ];
    for (const [re, to] of sub) if (re.test(s)) return s.replace(re, to as any);
    return s;
  }
  return s;
}

/** pt-BR: a short tool sentence said ON ITS OWN is said longer (tested wording, see FRIENDLY_OPENERS); a merged sentence stays as it is.
 * "vidros" is said as "janelas" here (the pt-BR model's "vidros" is heard as "vídeos"). */
const PT_LONGER: [RegExp, string][] = [
  [/^Tranquei o carro\.$/, 'Tranquei todas as portas do carro.'],
  [/^Destranquei o carro\.$/, 'Destranquei todas as portas do carro.'],
  [/^Abri todas as portas\.$/, 'Abri todas as portas do carro.'],
  [/^Fechei todas as portas\.$/, 'Fechei todas as portas para você.'],
  [/^Abri todos os vidros\.$/, 'Abri todas as janelas do carro para você.'],
  [/^Fechei todos os vidros\.$/, 'Fechei todas as janelas do carro.'],
  [/^Abri o teto solar\.$/, 'Deixei o teto solar aberto para você.'],
  [/^Fechei o teto solar\.$/, 'Fechei o teto solar para você.'],
  [/^Inclinei o teto solar\.$/, 'Deixei o teto solar inclinado, como você pediu.'],
  [/^Tocando (.+)\.$/, 'Agora tocando $1 para você.'],
  [/^Sintonizei a rádio (\S+)\.$/, 'Sintonizei a rádio $1 para você.'],
  [/^(Liguei|Desliguei) o desembaçador traseiro\.$/, '$1 o desembaçador traseiro para você.'],
];
/** "A. B! C" -> ["A.", "B!", "C"]: a sentence ends at a word ending in . ! or ? ("2,1 km." and "87.5" stay whole). */
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of text.split(/\s+/)) {
    if (!w) continue;
    cur.push(w);
    if (/[.!?]$/.test(w)) {
      out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}
function ptLonger(sentence: string): string {
  for (const [re, to] of PT_LONGER) if (re.test(sentence)) return sentence.replace(re, to);
  return sentence;
}

/** "I closed all the doors." -> "closed all the doors" (en); "Fechei todas as portas." -> "fechei todas as portas" (pt); else null. */
function clause(say: string, pt: boolean): string | null {
  const s = say.trim();
  if (!/[.!]$/.test(s) || /[.!?]\s/.test(s.slice(0, -1))) return null;   // one sentence only
  const body = s.slice(0, -1);
  if (!pt) {
    const m = /^I (?:'ve |have )?([a-z].*)$/.exec(body);
    return m ? m[1] : null;
  }
  // pt-BR: the tools speak in the first person of the past ("Fechei", "Abri", "Tranquei", "Liguei", "Deixei", "Coloquei")
  const first = body.split(' ')[0];
  if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]*i$/.test(first)) return null;
  return body.charAt(0).toLowerCase() + body.slice(1);
}

function join(parts: string[], pt: boolean): string {
  const and = pt ? 'e' : 'and';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
}

/** One sentence for a run of 2+ mergeable action sentences, or null (then they are said as they were). */
function merged(run: CarTurnAction[], pt: boolean, friendly: boolean, driving = false): string | null {
  const parts = run.map((a) => clause(a.say, pt));
  const lang = pt ? 'pt' : 'en';
  const secures = run.some((a) => a.tool === 'lock_car') && run.some((a) => CLOSING_TOOLS.has(a.tool));
  if (parts.some((p) => p === null)) {
    // sentences that don't merge ("All the windows are already closed.", "Navigating to ..."): one after the other after the opener,
    // when at least one action ran and the rest were already so (2026-11-21: "I locked the car. All the windows are already closed.")
    if (!friendly || !run.some(did) || !run.every((a) => did(a) || a.kind === 'already')) return null;
    return `${OPENERS[lang][variant++ % OPENERS[lang].length]} ${run.map((a) => a.say).join(' ')}${secures ? ` ${SECURE[lang]}` : ''}`;
  }
  const opener = OPENERS[lang][variant++ % OPENERS[lang].length];
  const body = join(parts as string[], pt);
  const sentence = pt ? body.charAt(0).toUpperCase() + body.slice(1) : `I ${body}`;
  // the friendly closing line of the last action that has one ("I unlocked the car and opened all the doors. Come on in!")
  const tail = !secures && friendly && run.every(did) ? [...run].reverse().map((a) => friendlyTail(a, lang, driving)).find(Boolean) ?? null : null;
  return `${opener} ${sentence}.${secures ? ` ${SECURE[lang]}` : ''}${tail ? ` ${tail}` : ''}`;
}

/** One action that ran, said with a warm opener (none when the car already said "Got it.") and, every other time, its closing line. */
function friendlyOne(a: CarTurnAction, lang: 'en' | 'pt', acked: boolean, driving = false): string {
  const v = variant++;
  const opener = acked ? '' : `${FRIENDLY_OPENERS[lang][v % FRIENDLY_OPENERS[lang].length]} `;
  const tail = v % 2 === 0 ? friendlyTail(a, lang, driving) : null;
  return `${opener}${a.say}${tail ? ` ${tail}` : ''}`;
}

/**
 * The reply text as the driver should hear it. `text` = what the agent said (core order); `actions` = this turn's tool sentences in order.
 * Sentences of actions that ran are matched word for word from the start of what is left; everything else passes through unchanged.
 */
export function composeCarSpeech(text: string, actions: CarTurnAction[], language: string, options: { acked?: boolean; driving?: boolean } = {}): string {
  const pt = language.toLowerCase().startsWith('pt');
  // the friendlier voice: the tuned languages only (a Basic language says its own short "done")
  const friendly = language === 'en' || language === 'pt-BR';
  const pending = [...actions];
  type Seg = { text: string; action?: CarTurnAction };
  const segs: Seg[] = [];
  let rest = text.trim();
  while (rest) {
    const i = pending.findIndex((a) => rest.startsWith(a.say));
    if (i >= 0) {
      const found = pending.splice(i, 1)[0];
      rest = rest.slice(found.say.length).trimStart();
      // the action as it is said (spokenSay): the same facts in smoother words; merging and the friendly words work on it
      const a = { ...found, say: spokenSay(found, language) };
      segs.push({ text: a.say, action: a });
      continue;
    }
    const m = /^.*?[.!?](?:\s+|$)/s.exec(rest);
    const piece = m ? m[0] : rest;
    segs.push({ text: piece.trim() });
    rest = rest.slice(piece.length).trimStart();
  }
  // friendly words only when everything said is the sentences of actions that ran (no refusal, question, undo or model text)
  const plain = segs.every((g) => g.action?.merge);
  const warm = friendly && plain;
  const out: string[] = [];
  for (let i = 0; i < segs.length; ) {
    if (segs[i].action?.merge) {
      let j = i;
      while (j < segs.length && segs[j].action?.merge) j++;
      const run = segs.slice(i, j).map((s) => s.action as CarTurnAction);
      const one = run.length >= 2 ? merged(run, pt, warm, options.driving === true)
        : warm && run.length === 1 && did(run[0]) ? friendlyOne(run[0], pt ? 'pt' : 'en', options.acked === true, options.driving === true) : null;
      out.push(one ?? segs.slice(i, j).map((s) => s.text).filter((t, k, all) => k === 0 || t !== all[k - 1]).join(' '));
      i = j;
    } else {
      out.push(segs[i].text);
      i++;
    }
  }
  // two confirmed actions in a Basic language both say "Erledigt.": once is enough
  const said = out.filter((t, i) => i === 0 || t !== out[i - 1]).join(' ');
  return language === 'pt-BR' ? sentencesOf(said).map(ptLonger).join(' ') : said;
}

/** For tests: start the openers from the first one. */
export function resetSpeechVariant(): void {
  variant = 0;
  ackVariant = 0;
}
