/**
 * A question about the car's state is answered from the car itself (2026-11-21 reply review, the real model + this app's tools):
 * the model RAN the action for a question. "Is the car locked?" locked it, "Are the windows closed?" closed them, "Is the sunroof open?"
 * opened it, "O aquecimento do meu banco tá ligado?" turned it on; "What's the temperature in here?" / "What's the volume?" asked back
 * or failed. The answer says the state, and offers the obvious change when there is one ("No, the car is unlocked. Want me to lock
 * it?"): a yes sends that request to the agent (followUp.ts), so the model runs a request it handles, nothing runs here.
 *
 * Accuracy: only a question (question words, a state word and a part of the car together) is answered; anything else goes to the agent
 * as before. Pure: the language and the car state are parameters. The tuned languages (en, pt-BR) only.
 */
import type { CarState, Seat } from './CarState';
import { resolve, name, adj, type Pos, type Target } from './positions';

type Lang = 'en' | 'pt';
/** The reply, and the request a plain yes sends to the agent (null: nothing offered). `askDestination`: the reply asks where to go. */
export type StateAnswer = { reply: string; offer: string | null; askDestination?: boolean };

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const has = (f: string, re: RegExp) => re.test(f);
/** A position as the driver says it: the driver's / passenger window (door) by the car's steering side, else its place. */
function posName(p: Pos, obj: 'window' | 'door', L: 'en' | 'pt-BR', s: CarState): string {
  const [driver] = resolve('driver', s.vehicle.steering) ?? [];
  const [passenger] = resolve('passenger', s.vehicle.steering) ?? [];
  return name(p === driver ? 'driver' : p === passenger ? 'passenger' : p, obj, L).text;
}
function list(items: string[], lang: Lang): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'e'} ${items[items.length - 1]}`;
}

// ---- question words (the start of the folded text, after a filler) ----
const FILLER = /^(?:(?:hey|so|um|uh|hmm|ok|okay|oi|ei|e ai|hum|entao|tipo) )*/;
const EN_Q = /^(?:is|are|was|were|did|do|does|have|has|what|what s|whats|where|how|which|can you (?:check|tell me|see)|could you (?:check|tell me|see)|do you know|i wonder|tell me)\b/;
const PT_Q = /^(?:sera que|voce sabe|vc sabe|sabe|qual|quais|quanto|quantos|em quanto|que|o que|pra onde|para onde|onde|como|eu (?:tranquei|fechei|deixei|travei)|tranquei|fechei|deixei|travei|(?:(?:o|a|os|as) )?(?:meu |minha |meus |minhas )?(?:carro|vidro|vidros|janela|janelas|porta|portas|teto|aquecimento|ventilacao|banco|volume|som|temperatura|ar)\b)/;
const EN_WH = /^(?:what s|whats|what is|what|how|which|tell me|can you tell me|could you tell me|do you know)\b/;
const PT_WH = /^(?:qual|quais|em quanto|quanto|como|sera que|voce sabe|vc sabe|sabe|(?:ta|esta) em quanto)\b/;
/** A question with a request after it ("What's the temperature? Set it to 22") goes to the agent. */
const EN_AND_DO = /\b(?:set it|turn it|make it|put it|change it|lock it|close it|open it|close them|open them|and (?:set|turn|make|open|close|lock|unlock|play|raise|lower)|then)\b/;
const PT_AND_DO = /\b(?:coloca|poe|bota|muda|aumenta|abaixa|abre|fecha|tranca|destranca|liga|desliga|toca|esquenta|refresca)\b/;
/** Polite requests are requests ("Can you open the window?"): not questions about the state. */
const EN_REQUEST = /^(?:can|could|would|will) you (?!check|tell me|see)|^would you mind|^please\b/;

function isQuestion(raw: string, f: string, lang: Lang): boolean {
  const t = f.replace(FILLER, '');
  if (lang === 'en') return !EN_REQUEST.test(t) && (EN_Q.test(t) || /\?\s*$/.test(raw));
  // pt: a command starts with its verb ("Fecha o vidro", "Deixa o vidro aberto"), a question with a question word or the thing itself
  return PT_Q.test(t) || (/\?\s*$/.test(raw) && !/^(?:abre|fecha|tranca|destranca|liga|desliga|deixa|coloca|poe|bota|aumenta|abaixa|esquenta|refresca|pode|voce pode|vc pode|da pra)\b/.test(t));
}

// ---- which part of the car ----
function windowTarget(f: string, lang: Lang): Target {
  if (lang === 'en') {
    if (has(f, /\b(my window|my side|driver s|drivers|driver)\b/)) return 'driver';
    if (has(f, /\b(passenger|passenger s)\b/)) return 'passenger';
    if (has(f, /\b(rear|back)\b/)) return 'rear';
    if (has(f, /\bfront\b/)) return 'front';
    return 'all';
  }
  if (has(f, /\b(meu vidro|minha janela|meu lado|motorista)\b/)) return 'driver';
  if (has(f, /\b(passageiro|carona)\b/)) return 'passenger';
  if (has(f, /\b(de tras|traseiros?|traseiras?)\b/)) return 'rear';
  if (has(f, /\bda frente\b/)) return 'front';
  return 'all';
}
function seatOf(f: string, lang: Lang): Seat {
  return (lang === 'en' ? /\b(passenger|passenger s)\b/ : /\b(passageiro|carona)\b/).test(f) ? 'passenger' : 'driver';
}

// ---- the answers ----
const EN_LEVEL: Record<string, string> = { low: 'low', medium: 'medium', high: 'high' };
const PT_LEVEL: Record<string, string> = { low: 'baixo', medium: 'médio', high: 'alto' };
const EN_SEAT_NAME: Record<string, string> = { driver: "the driver's seat", passenger: 'the passenger seat' };
const PT_SEAT_NAME: Record<string, string> = { driver: 'do banco do motorista', passenger: 'do banco do passageiro' };

function lockAnswer(s: CarState, lang: Lang, askedUnlocked: boolean): StateAnswer {
  const open = (Object.keys(s.doorLocks) as Pos[]).filter((p) => !s.doorLocks[p]);
  const all = open.length === 0;
  const none = open.length === 4;
  const offer = lang === 'en' ? 'Lock the car' : 'Tranca o carro';
  if (lang === 'en') {
    const yes = askedUnlocked ? !all : all;
    if (all) return { reply: `${yes ? 'Yes' : 'No'}, the car is locked.`, offer: null };
    if (none) return { reply: `${yes ? 'Yes' : 'No'}, the car is unlocked. Want me to lock it?`, offer };
    const doors = open.map((p) => posName(p, 'door', 'en', s));
    return { reply: `Not completely: ${list(doors, lang)} ${doors.length > 1 ? 'are' : 'is'} unlocked. Want me to lock the car?`, offer };
  }
  const yes = askedUnlocked ? !all : all;
  if (all) return { reply: `${yes ? 'Sim' : 'Não'}, o carro está trancado.`, offer: null };
  if (none) return { reply: `${yes ? 'Sim' : 'Não'}, o carro está destrancado. Quer que eu tranque?`, offer };
  const doors = open.map((p) => posName(p, 'door', 'pt-BR', s));
  return { reply: `Não totalmente: ${list(doors, lang)} ${doors.length > 1 ? 'estão destrancadas' : 'está destrancada'}. Quer que eu tranque o carro?`, offer };
}

function windowAnswer(s: CarState, lang: Lang, target: Target, askedOpen: boolean): StateAnswer {
  const L = lang === 'en' ? 'en' : 'pt-BR';
  const ps = resolve(target, s.vehicle.steering) ?? [];
  const open = ps.filter((p) => s.windows[p] !== 'close');
  const n = name(target, 'window', L);
  if (ps.length === 1) {
    const isOpen = open.length === 1;
    const yes = askedOpen === isOpen;
    if (lang === 'en') {
      return isOpen
        ? { reply: `${yes ? 'Yes' : 'No'}, ${n.text} is open. Want me to close it?`, offer: `Close ${n.text}` }
        : { reply: `${yes ? 'Yes' : 'No'}, ${n.text} is closed.`, offer: null };
    }
    return isOpen
      ? { reply: `${yes ? 'Sim' : 'Não'}, ${n.text} está aberto. Quer que eu feche?`, offer: `Fecha ${n.text}` }
      : { reply: `${yes ? 'Sim' : 'Não'}, ${n.text} está fechado.`, offer: null };
  }
  if (open.length === 0) {
    return lang === 'en'
      ? { reply: `${askedOpen ? 'No' : 'Yes'}, ${n.text.replace(/^the /, 'all the ').replace(/^all the all the/, 'all the')} are closed.`, offer: null }
      : { reply: `${askedOpen ? 'Não' : 'Sim'}, ${n.text.replace(/^os /, 'todos os ').replace(/^todos os todos os/, 'todos os')} estão fechados.`, offer: null };
  }
  const names = open.map((p) => posName(p, 'window', L, s));
  const one = open.length === 1;
  const close = one ? `${lang === 'en' ? 'Close' : 'Fecha'} ${names[0]}` : lang === 'en' ? `Close ${n.text}` : `Fecha ${n.text}`;
  const yes = askedOpen; // some are open: "are the windows open?" yes, "closed?" no
  const allOpen = open.length === ps.length;
  if (lang === 'en') {
    const what = allOpen ? `${n.text.replace(/^the /, 'all the ').replace(/^all the all the/, 'all the')} are open` : `${list(names, lang)} ${one ? 'is' : 'are'} open`;
    return { reply: `${yes ? 'Yes' : 'No'}, ${what}. Want me to close ${one ? 'it' : 'them'}?`, offer: close };
  }
  const what = allOpen ? `${n.text.replace(/^os /, 'todos os ').replace(/^todos os todos os/, 'todos os')} estão abertos` : `${list(names, lang)} ${one ? 'está aberto' : 'estão abertos'}`;
  return { reply: `${yes ? 'Sim' : 'Não'}, ${what}. Quer que eu feche?`, offer: close };
}

function doorsAnswer(s: CarState, lang: Lang, askedOpen: boolean): StateAnswer {
  const open = (Object.keys(s.doors) as Pos[]).filter((p) => s.doors[p] === 'open');
  if (open.length === 0) {
    return { reply: lang === 'en' ? `${askedOpen ? 'No' : 'Yes'}, all the doors are closed.` : `${askedOpen ? 'Não' : 'Sim'}, todas as portas estão fechadas.`, offer: null };
  }
  const L = lang === 'en' ? 'en' : 'pt-BR';
  const names = open.map((p) => posName(p, 'door', L, s));
  const one = open.length === 1;
  if (lang === 'en') {
    return { reply: `${askedOpen ? 'Yes' : 'No'}, ${list(names, lang)} ${one ? 'is' : 'are'} open. Want me to close ${one ? 'it' : 'them'}?`, offer: 'Close the doors' };
  }
  const n = name(open[0], 'door', L);
  return { reply: `${askedOpen ? 'Sim' : 'Não'}, ${list(names, lang)} ${one ? `está ${adj('abert', n)}` : 'estão abertas'}. Quer que eu feche?`, offer: 'Fecha as portas' };
}

function sunroofAnswer(s: CarState, lang: Lang, askedOpen: boolean): StateAnswer {
  const isOpen = s.sunroof !== 'close';
  const yes = askedOpen === isOpen;
  if (lang === 'en') {
    if (!isOpen) return { reply: `${yes ? 'Yes' : 'No'}, the sunroof is closed.`, offer: null };
    return { reply: `${yes ? 'Yes' : 'No'}, the sunroof is ${s.sunroof === 'tilt' ? 'tilted open' : 'open'}. Want me to close it?`, offer: 'Close the sunroof' };
  }
  if (!isOpen) return { reply: `${yes ? 'Sim' : 'Não'}, o teto solar está fechado.`, offer: null };
  return { reply: `${yes ? 'Sim' : 'Não'}, o teto solar está ${s.sunroof === 'tilt' ? 'inclinado' : 'aberto'}. Quer que eu feche?`, offer: 'Fecha o teto solar' };
}

function seatAnswer(s: CarState, lang: Lang, seat: Seat, feature: 'heater' | 'ventilation', askedOn: boolean): StateAnswer {
  const level = (feature === 'heater' ? s.seatHeater : s.seatVentilation)[seat];
  const on = level !== 'off';
  const yes = askedOn === on;
  if (lang === 'en') {
    const what = `${EN_SEAT_NAME[seat]} ${feature === 'heater' ? 'heater' : 'ventilation'}`;
    if (on) return { reply: `${yes ? 'Yes' : 'No'}, ${what} is on ${EN_LEVEL[level]}.`, offer: null };
    const verb = feature === 'heater' ? 'Heat' : 'Cool';
    return { reply: `${yes ? 'Yes' : 'No'}, ${what} is off. Want me to turn it on?`, offer: `${verb} ${EN_SEAT_NAME[seat]}` };
  }
  const what = `${feature === 'heater' ? 'o aquecimento' : 'a ventilação'} ${PT_SEAT_NAME[seat]}`;
  const ligado = feature === 'heater' ? 'ligado' : 'ligada';
  if (on) return { reply: `${yes ? 'Sim' : 'Não'}, ${what} está ${ligado} no ${PT_LEVEL[level]}.`, offer: null };
  const verb = feature === 'heater' ? 'Esquenta' : 'Refresca';
  return { reply: `${yes ? 'Sim' : 'Não'}, ${what} está ${feature === 'heater' ? 'desligado' : 'desligada'}. Quer que eu ligue?`, offer: `${verb} o banco do ${seat === 'driver' ? 'motorista' : 'passageiro'}` };
}

function temperatureAnswer(s: CarState, lang: Lang): StateAnswer {
  const u = s.temperature.unit === 'fahrenheit' ? '°F' : '°C';
  const { driver, passenger } = s.temperature;
  const n = (v: number) => (lang === 'pt' ? String(v).replace('.', ',') : String(v));
  if (driver === passenger) return { reply: lang === 'en' ? `It's set to ${n(driver)}${u}.` : `Está em ${n(driver)}${u}.`, offer: null };
  return {
    reply: lang === 'en' ? `The driver's side is set to ${n(driver)}${u} and the passenger side to ${n(passenger)}${u}.`
      : `O lado do motorista está em ${n(driver)}${u} e o do passageiro em ${n(passenger)}${u}.`,
    offer: null,
  };
}

function mediaAnswer(s: CarState, lang: Lang): StateAnswer {
  const muted = s.muted ? (lang === 'en' ? ', but the sound is muted' : ', mas o som está no mudo') : '';
  if (s.media) return { reply: lang === 'en' ? `You're listening to ${s.media}${muted}.` : `Você está ouvindo ${s.media}${muted}.`, offer: null };
  if (s.radio) return { reply: lang === 'en' ? `You're listening to ${s.radio}${muted}.` : `Você está ouvindo a rádio ${s.radio}${muted}.`, offer: null };
  return { reply: lang === 'en' ? "Nothing's playing right now." : 'Não tem nada tocando agora.', offer: null };
}

function destinationAnswer(s: CarState, lang: Lang): StateAnswer {
  const d = s.destination;
  if (!d) {
    return { reply: lang === 'en' ? "There's no active route. Where do you want to go?" : 'Não há nenhuma rota ativa. Para onde você quer ir?', offer: null, askDestination: true };
  }
  if (lang === 'en') {
    if (d === 'home') return { reply: "We're heading home.", offer: null };
    const p = /^[a-z]/.test(d) && !/^(the|a|an|my|your|our|work|downtown)\b/.test(d) ? `the ${d}` : d;
    return { reply: `We're heading to ${p}.`, offer: null };
  }
  if (d === 'casa') return { reply: 'Estamos indo para casa.', offer: null };
  const p = /^[a-zà-ü]/.test(d) && !/^(o|a|os|as|um|uma|meu|minha)\b/.test(d) ? `${/(a|ção|dade|gem)$/.test(d.split(' ')[0]) ? 'a' : 'o'} ${d}` : d;
  return { reply: `Estamos indo para ${p}.`, offer: null };
}

/** The answer to a question about the car's state, or null (not such a question: the agent gets it). */
export function answerCarQuestion(userText: string, language: string, s: CarState): StateAnswer | null {
  const lang: Lang | null = language === 'en' ? 'en' : language === 'pt-BR' ? 'pt' : null;
  if (!lang) return null;
  const f = fold(userText);
  if (!f || f.split(' ').length > 14 || !isQuestion(userText, f, lang)) return null;
  // a second sentence ("Is the car locked? Lock it") or a request in it: the agent decides
  if (/[.?!;]\s*\S/.test(userText.trim().replace(/[.?!]+$/, '')) || (lang === 'en' ? EN_AND_DO : PT_AND_DO).test(f)) return null;
  const t = f.replace(FILLER, '');
  if (lang === 'en') {
    const outside = /\b(outside|outdoors?|out there|weather|today|tomorrow|tonight|forecast)\b/.test(f);
    if (/\b(locked|unlocked)\b/.test(f) || /\b(?:did|have) (?:i|you) lock\b/.test(f)) {
      return lockAnswer(s, lang, /\bunlocked\b/.test(f));
    }
    if (/\bwindows?\b/.test(f) && /\b(open|opened|closed|shut|up|down|cracked)\b/.test(f)) {
      return windowAnswer(s, lang, windowTarget(f, lang), /\b(open|opened|down|cracked)\b/.test(f));
    }
    if (/\bdoors?\b/.test(f) && /\b(open|opened|closed|shut|ajar)\b/.test(f)) return doorsAnswer(s, lang, /\b(open|opened|ajar)\b/.test(f));
    if (/\bsun ?roof\b/.test(f) && /\b(open|opened|closed|shut)\b/.test(f)) return sunroofAnswer(s, lang, /\b(open|opened)\b/.test(f));
    if (/\bseats?\b/.test(f) && /\b(heater|heaters|heating|heated|warmer|warmers)\b/.test(f) && /\b(on|off|running|working)\b/.test(f)) {
      return seatAnswer(s, lang, seatOf(f, lang), 'heater', !/\boff\b/.test(f));
    }
    if (/\bseats?\b/.test(f) && /\b(ventilation|ventilated|cooling|cooler|fans?)\b/.test(f) && /\b(on|off|running|working)\b/.test(f)) {
      return seatAnswer(s, lang, seatOf(f, lang), 'ventilation', !/\boff\b/.test(f));
    }
    if (!outside && (/\b(temperature|temp)\b/.test(f) && EN_WH.test(t) || /^how (?:warm|hot|cold) is it (?:set|in here)\b/.test(t))) return temperatureAnswer(s, lang);
    if (EN_WH.test(t) && /\bvolume\b|^how loud\b/.test(t)) {
      return { reply: s.muted ? 'The sound is muted.' : `The volume is at ${s.volume}.`, offer: null };
    }
    if (EN_WH.test(t) && /\bfan\b/.test(f) && !/\bseat\b/.test(f)) {
      return { reply: `The fan is at level ${s.fan}.`, offer: null };
    }
    if (/^(?:what s playing|whats playing|what is playing|what song is (?:this|playing)|what am i listening to|what station is (?:this|on)|what s on the radio|who s (?:singing|playing)|who is (?:singing|playing)|what music is (?:this|playing))\b/.test(t)) {
      return mediaAnswer(s, lang);
    }
    if (/^(?:where are we (?:going|headed|heading)|what s (?:my|our|the) destination|what is (?:my|our|the) destination|where am i (?:going|headed|heading))\b/.test(t)) {
      return destinationAnswer(s, lang);
    }
    return null;
  }
  // pt-BR
  const outside = /\b(la fora|fora|lado de fora|tempo|clima|hoje|amanha|previsao)\b/.test(f);
  if (/\b(trancad[oa]s?|destrancad[oa]s?|travad[oa]s?|destravad[oa]s?|tranquei|travei|trancou|travou)\b/.test(f)) {
    return lockAnswer(s, lang, /\b(destrancad|destravad)/.test(f));
  }
  if (/\bcarro\b/.test(f) && /\b(abert[oa]|fechad[oa])\b/.test(f) && !/\b(vidros?|janelas?|portas?|teto)\b/.test(f)) {
    return lockAnswer(s, lang, /\babert/.test(f));
  }
  if (/\b(vidros?|janelas?)\b/.test(f) && /\b(abert[oa]s?|fechad[oa]s?|abaixad[oa]s?|levantad[oa]s?|fechei)\b/.test(f)) {
    return windowAnswer(s, lang, windowTarget(f, lang), /\b(abert|abaixad)/.test(f));
  }
  if (/\bportas?\b/.test(f) && /\b(abert[oa]s?|fechad[oa]s?|fechei)\b/.test(f)) return doorsAnswer(s, lang, /\babert/.test(f));
  if (/\bteto( solar)?\b/.test(f) && /\b(abert[oa]|fechad[oa])\b/.test(f)) return sunroofAnswer(s, lang, /\babert/.test(f));
  if (/\bbancos?\b/.test(f) && /\b(aquecimento|aquecid[oa]|esquentando)\b/.test(f) && /\b(ligad[oa]|desligad[oa]|esquentando|funcionando)\b/.test(f)) {
    return seatAnswer(s, lang, seatOf(f, lang), 'heater', !/\bdesligad/.test(f));
  }
  if (/\bbancos?\b/.test(f) && /\b(ventilacao|ventilad[oa])\b/.test(f) && /\b(ligad[oa]|desligad[oa]|funcionando)\b/.test(f)) {
    return seatAnswer(s, lang, seatOf(f, lang), 'ventilation', !/\bdesligad/.test(f));
  }
  if (!outside && (/\btemperatura\b/.test(f) && PT_WH.test(t) || /^(?:ta|esta) em quantos graus\b|^quantos graus\b/.test(t))) {
    return temperatureAnswer(s, lang);
  }
  if (/\b(volume|som)\b/.test(f) && PT_WH.test(t) && !/\b(musica|tocando)\b/.test(f)) {
    return { reply: s.muted ? 'O som está no mudo.' : `O volume está em ${s.volume}.`, offer: null };
  }
  if (PT_WH.test(t) && /\b(ventilacao|ventilador)\b/.test(f) && !/\bbanco/.test(f)) {
    return { reply: `A ventilação está no nível ${s.fan}.`, offer: null };
  }
  if (/^(?:o que (?:ta|esta) tocando|que musica (?:e essa|e esta|ta tocando|esta tocando)|qual (?:e )?(?:a )?musica|que radio (?:e essa|e esta)|qual (?:e )?(?:a )?radio|qual (?:e )?(?:a )?estacao|o que (?:eu )?(?:to|tou|estou) ouvindo|quem (?:ta|esta) cantando|quem canta)\b/.test(t)) {
    return mediaAnswer(s, lang);
  }
  if (/^(?:pra onde|para onde|onde) (?:a gente |nos )?(?:ta|esta|estamos|tamos|vamos|vai)(?: indo)?\b|^qual (?:e )?o (?:meu |nosso )?destino\b/.test(t)) {
    return destinationAnswer(s, lang);
  }
  return null;
}

