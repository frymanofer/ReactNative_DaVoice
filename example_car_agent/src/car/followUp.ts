/**
 * What the driver says right after the agent's own question or offer (2026-11-21 reply review, the real model + this app's tools):
 *
 *  - an answer to the agent's question goes to the agent WITH the request it answers. Alone, "The driver's one" after "Which window
 *    should I open?" was blocked ("Sorry, I'm not sure I got that right"); "Open the window, the driver's one" opens the driver's window.
 *    "Where do you want to go?" -> "The airport" = "Navigate to the airport"; "What do you want to hear?" -> "Coldplay" = "Play Coldplay".
 *  - "never mind", "cancel", "stop", "no" with nothing pending: a short "Okay." (the model answered "Sorry, I didn't catch that").
 *    With an offer pending they go to the agent core, which declines the offer (nothing runs).
 *  - an offer pending ("Should I unlock it?", "Want me to take you there?"): more ways to say yes ("tá bom", "sounds good") reach the core
 *    as its plain "yes"; "take me there" / "me leva lá" accepts a navigation offer ("me leva lá" alone navigated to "lateral").
 *
 *  - a question about the car ("Is the car locked?", "What's the volume?") is answered from the car (stateAnswers.ts): the model RAN
 *    the action for such questions. A yes to the answer's offer ("Want me to lock it?") sends that request to the agent.
 *  - "Say that again" / "What?" / "Repete": the last reply again ("Say that again" re-ran the last action; "Repete" was "didn't catch").
 *  - requests the model gets wrong every time are said the way it handles them: "Turn on the seat heater" (the level came out "on")
 *    -> "Heat the seat"; "Liga o aquecimento do banco" (level off) -> "Esquenta o banco"; "Max volume" (level 7 or none) -> "Set the
 *    volume to 30". "Esquenta os bancos" (declined) asks which seat, as the agent does in English.
 *
 * Accuracy: nothing here runs an action. A combined text is the driver's own words after the request they answer, and the model decides
 * as for any request; a "yes" only reaches the core's own offer (what the app said the yes means). The tuned languages (en, pt-BR) only:
 * the Basic languages have their own yes / no flow (basicLanguage.ts).
 */
import { normalizeYesNo, withCarHints } from './basicLanguage';
import type { CarState } from './CarState';
import { answerCarQuestion } from './stateAnswers';
import { LOCAL_LLM_NOT_IN_DEMO_MESSAGE } from '../local_llm/constants';

/** Lower case, no accents, anything between words one space ("Tá bom!" -> "ta bom"). */
export const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The text is only these phrases (repeated or combined: "no no", "okay, never mind"). */
function only(text: string, phrases: string[]): boolean {
  const t = fold(text);
  if (!t) return false;
  const alt = [...phrases].sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`^(?:(?:${alt})(?: |$))+$`, 'u').test(t);
}

type Lang = 'en' | 'pt';
const tuned = (language: string): Lang | null => (language === 'en' ? 'en' : language === 'pt-BR' ? 'pt' : null);

const DISMISS: Record<Lang, string[]> = {
  en: ['never mind', 'nevermind', 'forget it', 'forget about it', 'forget that', 'cancel', 'cancel that', 'cancel it', 'stop', 'stop it',
    'nothing', 'no', 'nope', 'nah', 'no thanks', 'no thank you', 'not now', 'leave it', 'that s all', 'that s it', 'all good', 'i m good',
    'i m fine', 'no worries', 'don t', 'don t bother', 'thanks', 'okay', 'ok', 'oh'],
  pt: ['deixa pra la', 'deixa para la', 'deixa', 'deixa assim', 'esquece', 'esquece isso', 'cancela', 'cancelar', 'cancela isso', 'para',
    'pare', 'nada', 'nada nao', 'nao', 'nao precisa', 'nao obrigado', 'nao obrigada', 'agora nao', 'melhor nao', 'so isso', 'e so isso',
    'obrigado', 'obrigada', 'valeu', 'ok', 'ta'],
};
/** A dismissal must hold one of these (a lone "okay" / "thanks" is not one; they are answered as before). */
const DISMISS_CORE: Record<Lang, string[]> = {
  en: ['never mind', 'nevermind', 'forget it', 'forget about it', 'forget that', 'cancel', 'cancel that', 'cancel it', 'stop', 'stop it',
    'nothing', 'no', 'nope', 'nah', 'no thanks', 'no thank you', 'not now', 'leave it', 'that s all', 'that s it', 'don t', 'don t bother'],
  pt: ['deixa pra la', 'deixa para la', 'deixa', 'deixa assim', 'esquece', 'esquece isso', 'cancela', 'cancelar', 'cancela isso', 'para',
    'pare', 'nada', 'nada nao', 'nao', 'nao precisa', 'nao obrigado', 'nao obrigada', 'agora nao', 'melhor nao', 'so isso', 'e so isso'],
};
const DISMISS_REPLY: Record<Lang, string[]> = { en: ['Okay.', 'No problem.'], pt: ['Tudo bem, então não vou fazer nada.', 'Sem problema, fica para uma próxima vez.'] };
const YES: Record<Lang, string[]> = {
  en: ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'please', 'go ahead', 'do it', 'sounds good', 'go for it', 'please do',
    'sure thing', 'why not', 'let s do it', 'of course', 'absolutely', 'alright', 'all right', 'perfect', 'great', 'cool',
    'that would be great', 'yes please'],
  pt: ['sim', 'claro', 'pode', 'isso', 'bora', 'por favor', 'faz isso', 'pode ser', 'com certeza', 'certo', 'quero', 'ta bom', 'ta',
    'beleza', 'fechado', 'manda', 'manda ver', 'vai', 'uhum', 'aham', 'pode sim', 'ok', 'perfeito', 'otimo', 'show', 'demorou',
    'quero sim'],
};
/** Yes to a navigation offer said as the place ("take me there"). */
const GO_THERE: Record<Lang, string[]> = {
  en: ['take me there', 'go there', 'navigate there', 'let s go there', 'let s go', 'drive there', 'navigate to it', 'take me', 'go',
    'yes take me there', 'sure take me there', 'ok take me there', 'okay take me there', 'yes please take me there'],
  pt: ['me leva la', 'me leva', 'leva eu la', 'me leve la', 'vamos la', 'vai la', 'navega pra la', 'navega para la', 'bora la', 'quero ir',
    'partiu', 'sim me leva la', 'pode me levar', 'pode me levar la', 'me leva ate la'],
};
/** First words that start a new request, not an answer ("Close it" after "Which window?" is a new request). */
const COMMAND_START: Record<Lang, RegExp> = {
  en: /^(open|close|shut|turn|set|play|lock|unlock|navigate|take|find|raise|lower|increase|decrease|put|make|start|stop|switch|tune|mute|unmute|call|what|how|where|when|who|why|is|are|can|could|do|does|please|i|it|its|undo|cancel|show|tell|give|heat|cool|warm|defrost|avoid|go)( |$)/,
  pt: /^(abre|abra|abrir|fecha|feche|fechar|liga|ligue|ligar|desliga|desligue|coloca|coloque|poe|bota|toca|toque|tocar|tranca|tranque|destranca|navega|navegue|leva|me|acha|procura|aumenta|abaixa|baixa|diminui|sobe|muda|troca|sintoniza|silencia|o que|como|onde|quando|quem|quanto|quantos|quantas|por que|pode|voce|vc|eu|esta|ta|to|faz|deixa|desfaz|esquenta|esfria|desembaca|evita|vai)( |$)/,
};

/** First words that start an answer, written in lower case inside the combined request. */
const LOWER_FIRST: Record<Lang, Set<string>> = {
  en: new Set(['the', 'a', 'an', 'to', 'my', 'mine', 'both', 'yours', 'your', 'his', 'her', 'our', 'all', 'front', 'rear', 'back', 'left',
    'right', 'passenger', 'driver', 'driver s', 'just', 'only', 'some', 'everyone', 'everybody']),
  pt: new Set(['o', 'a', 'os', 'as', 'pro', 'pra', 'para', 'pros', 'pras', 'meu', 'minha', 'dois', 'ambos', 'todos', 'todas', 'do', 'da',
    'no', 'na', 'so', 'apenas', 'frente', 'tras', 'esquerdo', 'direito', 'passageiro', 'motorista', 'um', 'uma', 'algum', 'alguma']),
};

/** "Stop" while music plays means the music (en: the model mutes it; pt "Para" alone was "didn't catch that"). */
const STOP_MUSIC: Record<Lang, string[]> = {
  en: ['stop', 'stop it', 'pause', 'pause it', 'stop the music', 'pause the music', 'stop music', 'stop playing', 'enough', 'please stop', 'stop please'],
  pt: ['para', 'pare', 'pausa', 'pausar', 'para a musica', 'para o som', 'pausa a musica', 'para de tocar', 'chega', 'para por favor', 'por favor para'],
};
/** The seat in an answer to "Which seat: yours, the passenger's, or both?" (checked in this order on the folded answer). */
type SeatKey = 'driver' | 'passenger' | 'both';
const SEAT_ANSWER: Record<Lang, [RegExp, SeatKey][]> = {
  en: [[/\b(both|everyone|all|the two|both of us)\b/, 'both'], [/\b(passenger|passenger s|his|hers|her|him|the other one|my wife s|my husband s)\b/, 'passenger'],
    [/\b(mine|me|my|myself|driver|driver s|yours)\b/, 'driver']],
  pt: [[/\b(os dois|ambos|todos|dos dois|nos dois|as duas)\b/, 'both'], [/\b(carona|passageiro|dele|dela|o outro)\b/, 'passenger'],
    [/\b(meu|o meu|eu|mim|motorista|o seu)\b/, 'driver']],
};
const SEAT_WORDS: Record<Lang, Record<SeatKey, string>> = {
  en: { driver: "the driver's seat", passenger: 'the passenger seat', both: 'both front seats' },
  pt: { driver: 'o banco do motorista', passenger: 'o banco do passageiro', both: 'os dois bancos da frente' },
};
/**
 * The request with the seat put in. Turning a seat's heat / cooling ON is said the way the model handles it (measured 2026-11-21:
 * "Heat the driver's seat" runs, "Turn on the driver's seat heater" put the seat in the level; for both seats the verb is said twice).
 * Turning off, or a request with its own level, keeps the driver's words with the seat put in. Null: no seat word to replace.
 */
function withSeat(request: string, seat: SeatKey, lang: Lang): string | null {
  const r = request.trim().replace(/[.!?]+$/, '');
  const f = fold(r);
  const off = lang === 'en' ? /\b(off|stop|disable|deactivate)\b/.test(f) : /\b(desliga|desligar|desligue|desativa|para)\b/.test(f);
  const level = /\b(low|medium|high|max|maximum|min|minimum|level|baixo|medio|alto|maximo|minimo|nivel|\d+)\b/.test(f);
  const heat = lang === 'en' ? /\b(heat|heater|heaters|heated|heating|warm|warmer)\b/.test(f) : /\b(esquent\w*|aquec\w*|quent\w*)\b/.test(f);
  const cool = lang === 'en' ? /\b(cool|cooler|cooling|vent|ventilate|ventilation|ventilated)\b/.test(f) : /\b(ventil\w*|refresc\w*|esfri\w*|fresc\w*)\b/.test(f);
  if (!off && !level && heat !== cool) {
    const verb = lang === 'en' ? (heat ? 'heat' : 'cool') : heat ? 'esquenta' : 'refresca';
    const one = (k: 'driver' | 'passenger') => `${verb} ${SEAT_WORDS[lang][k]}`;
    const said = seat === 'both' ? `${one('driver')} ${lang === 'en' ? 'and' : 'e'} ${one('passenger')}` : one(seat);
    return said.charAt(0).toUpperCase() + said.slice(1);
  }
  const words = SEAT_WORDS[lang][seat];
  if (lang === 'en') {
    if (/\b(the |my |our )?seats\b/i.test(r)) return r.replace(/\b(the |my |our )?seats\b/i, words);
    if (/\b(the |my )?seat (heaters?|ventilation)\b/i.test(r)) return r.replace(/\b(the |my )?seat (heaters?|ventilation)\b/i, (_m, _a, what) => (seat === 'both' ? `both front seat ${/^heater/.test(what) ? 'heaters' : 'ventilation'}` : `${words} ${what.replace(/s$/, '')}`));
    if (/\b(the |my )?seat\b/i.test(r)) return r.replace(/\b(the |my )?seat\b/i, words);
    return null;
  }
  if (/\b(os|o|meus|meu) bancos?\b/i.test(r)) return r.replace(/\b(os|o|meus|meu) bancos?\b/i, words);
  if (/\bdos? bancos?\b/i.test(r)) return r.replace(/\bdos? bancos?\b/i, seat === 'both' ? 'dos dois bancos da frente' : `d${words}`);
  return null;
}

/** "Say that again": the last reply again. */
const REPEAT: Record<Lang, string[]> = {
  en: ['what', 'what did you say', 'what was that', 'say that again', 'say it again', 'repeat', 'repeat that', 'repeat it', 'come again',
    'pardon', 'pardon me', 'sorry what', 'huh', 'i didn t hear you', 'i didn t hear that', 'i didn t catch that', 'can you repeat that',
    'could you repeat that', 'can you say that again', 'could you say that again', 'please repeat', 'one more time', 'what was that again'],
  pt: ['o que', 'o que voce disse', 'o que vc disse', 'o que foi', 'o que foi que voce disse', 'repete', 'repete ai', 'repete por favor',
    'pode repetir', 'fala de novo', 'fala de novo por favor', 'como', 'como e que e', 'hein', 'nao ouvi', 'nao escutei', 'nao entendi',
    'fala outra vez', 'repete isso'],
};
/** "Next song" while music plays: this demo has no track control (pt "Próxima música" unmuted, "Pula" asked where to go). */
const SKIP: Record<Lang, string[]> = {
  en: ['skip', 'skip it', 'skip this', 'skip this song', 'skip the song', 'skip song', 'next', 'next song', 'next track', 'next one',
    'play the next song', 'play the next one', 'previous song', 'previous track', 'go back a song', 'last song'],
  pt: ['pula', 'pula essa', 'pula essa musica', 'pula a musica', 'proxima', 'proxima musica', 'proxima faixa', 'passa', 'passa essa',
    'passa a musica', 'musica anterior', 'volta a musica', 'toca a proxima'],
};
/** A bare "Turn it off" / "Desliga" with nothing to refer to (pt "Desliga" after a declined request muted the sound). */
const BARE_SWITCH: Record<Lang, { off: string[]; on: string[] }> = {
  en: { off: ['turn it off', 'turn that off', 'switch it off', 'turn off', 'switch off', 'shut it off', 'off'],
    on: ['turn it on', 'turn that on', 'switch it on', 'turn on', 'switch on', 'on'] },
  pt: { off: ['desliga', 'desliga isso', 'desliga ele', 'desliga ela', 'desligar', 'desliga ai', 'apaga', 'apaga isso'],
    on: ['liga', 'liga isso', 'liga ele', 'liga ela', 'ligar', 'liga ai', 'acende', 'acende isso'] },
};
const ASK_WHAT: Record<Lang, { off: [string, string]; on: [string, string] }> = {
  en: { off: ['What should I turn off?', 'Turn off'], on: ['What should I turn on?', 'Turn on'] },
  pt: { off: ['O que você quer que eu desligue?', 'Desliga'], on: ['O que você quer que eu ligue?', 'Liga'] },
};
const WHICH_SEAT: Record<Lang, string> = { en: "Which seat: yours, the passenger's, or both?", pt: 'Qual banco: o seu, o do carona ou os dois?' };

/** The driver's words, said the way the model handles them (null: as they are). Measured 2026-11-21 with the app's model. */
function canonical(userText: string, lang: Lang): string | null {
  const f = fold(userText);
  const t = userText.replace(/[’]/g, "'");
  if (lang === 'en') {
    if (/^(?:please )?(?:turn |put |set |crank )?(?:the )?(?:volume|music|sound|it) (?:all the way up|(?:up )?to (?:the )?max(?:imum)?|(?:at |on )?max(?:imum)?)(?: please)?$|^(?:please )?max(?:imum)? volume(?: please)?$/.test(f)) {
      return 'Set the volume to 30';
    }
    if (/^(?:please )?turn on (?:the |our )?seat heaters (?:for )?(?:both of us|both|everyone)(?: please)?$/.test(f)) return "Heat the driver's seat and heat the passenger seat";
    // measured 2026-11-21: "Lock up" went remote, "Close everything" / "Turn on the lights" were "didn't catch that", "Warmer" alone
    // invented 18 °C, "Is everything ok with the car?" went remote; the rewritten requests run (lights: "can't control that in this car")
    if (/^(?:please )?lock (?:it )?(?:up|everything)(?: please)?$/.test(f)) return 'Lock the car';
    if (/^(?:please )?close (?:everything|it all|all of it|up everything)(?: please)?$/.test(f)) return 'Close all the windows and the sunroof';
    if (/^(?:please )?turn (?:on|off) the lights(?: please)?$/.test(f)) return f.includes(' off ') ? 'Turn off the cabin lights' : 'Turn on the cabin lights';
    const warm = /^(?:a bit |a little |slightly )?(warmer|hotter|cooler|colder)(?: please)?$/.exec(f);
    if (warm) return /warmer|hotter/.test(warm[1]) ? 'Make it warmer' : 'Make it cooler';
    if (/^(?:is )?(?:everything|all) (?:ok|okay|alright|all right|fine|good) with the car$|^is the car (?:ok|okay|alright|all right|fine)$|^how s the car(?: doing)?$|^car status$/.test(f)) {
      return 'Are there any warning lights?';
    }
    // "No, I said the passenger window" was ignored (no reply at all); "No, the passenger window" runs
    const said = /^(?:no,? |nope,? )?i (?:said|meant|mean)\s+(.+)$/i.exec(t.trim());
    if (said && fold(said[1]).split(' ').length <= 8) return `No, ${said[1]}`;
    const seat = /\bturn(ing)? on (the |my |our )?(driver's |drivers |passenger's |passenger )?seat (heater|heating|warmer)(s?)\b/i;
    if (seat.test(t) && !/\b(low|medium|high|max|maximum|level|\d+)\b/.test(f)) {
      return t.replace(seat, (_m, ing, det, who, _w, pl) => {
        const whose = who ? (/^driver/i.test(who) ? "the driver's " : 'the passenger ') : (det ?? 'the ').toLowerCase();
        return `heat${ing ? 'ing' : ''} ${whose}seat${pl && !who ? 's' : ''}`;
      }).replace(/^heat/, 'Heat');
    }
    return null;
  }
  if (/^(?:coloca |poe |bota |deixa |aumenta )?(?:o )?(?:volume|som)(?: (?:no|ao|ate o|em|pro|para o) (?:maximo|talo)| maximo)(?: por favor)?$|^aumenta (?:o volume |o som |tudo )?(?:no|ao|ate o) (?:maximo|talo)(?: por favor)?$/.test(f)) {
    return 'Coloca o volume em 30';
  }
  // measured 2026-11-21: "Fecha tudo" / "Acende as luzes" were "didn't catch that", "Deixa mais fresco" too (or remote), "Tá tudo
  // certo com o carro?" went remote; the rewritten requests run (lights: "não consigo controlar neste carro")
  if (/^(?:por favor )?fecha tudo(?: por favor)?$/.test(f)) return 'Fecha todos os vidros e o teto solar';
  if (/^(?:por favor )?(?:acende|liga) as luzes(?: por favor)?$/.test(f)) return 'Liga a luz ambiente';
  if (/^(?:da pra |pode |voce pode |vc pode )?deixa(?:r)? (?:o carro |aqui )?(?:um pouco |um pouquinho )?mais fresco(?: por favor)?$/.test(f)) return 'Esfria um pouco';
  if (/^(?:(?:ta|esta) tudo (?:certo|bem|ok|em ordem) com o carro|o carro (?:ta|esta) (?:bem|ok|certo)|como (?:ta|esta) o carro)$/.test(f)) {
    return 'Tem alguma luz de alerta?';
  }
  // the "Você …?" rule runs last, so "Você liga o aquecimento do meu banco?" (first rewritten to "Você esquenta …") also loses its
  // question form (measured 2026-11-22: as a question the model answered "já está desligado")
  const pt = t
    .replace(/\b(?:liga|ligar|ligue|ativa) o aquecimento do (meu |seu )?banco( do motorista| do passageiro| do carona)?\b/i, (_m, mine, who) =>
      `esquenta o ${mine ?? ''}banco${who ? (/carona/i.test(who) ? ' do passageiro' : who) : ''}`)
    .replace(/\b(?:liga|ligar|ligue) o banco aquecido\b/i, 'esquenta o banco')
    .replace(/\b(?:liga|ligar|ligue) o aquecimento dos dois bancos( da frente)?\b|\besquenta os dois bancos( da frente)?\b/i,
      'esquenta o banco do motorista e esquenta o banco do passageiro')
    .replace(/^(?:você|voce|vc) (esquenta|refresca)(.*?)\?*$/i, '$1$2');
  if (pt !== t) return pt.charAt(0).toUpperCase() + pt.slice(1);
  return null;
}
/** A heat / cool request for "the seats" with no seat said: asked here (pt-BR "Esquenta os bancos" was declined). The request to complete. */
function pluralSeats(userText: string, lang: Lang): string | null {
  if (lang !== 'pt') return null;
  const f = fold(userText).replace(/ por favor$/, '');
  if (/^(?:liga|ligar|ligue|ativa) o aquecimento dos bancos$|^esquenta os bancos$|^(?:liga|ligar) os bancos aquecidos$/.test(f)) return 'Esquenta os bancos';
  if (/^(?:liga|ligar|ligue|ativa) a ventilacao dos bancos$|^refresca os bancos$/.test(f)) return 'Refresca os bancos';
  return null;
}

type Pending = { kind: 'merge' | 'destination' | 'media' | 'seat' | 'command' | 'verb'; request: string };
let pending: Pending | null = null;
let dismissVariant = 0;
let lastSpoken = '';

/** For tests. */
export function resetFollowUp(): void {
  pending = null;
  dismissVariant = 0;
  lastSpoken = '';
}

/** What the driver last heard (said again for "Say that again"). */
export function noteCarSpoken(text: string): void {
  if (text.trim()) lastSpoken = text.trim();
}

/** What goes to the agent for what the driver said, or the app's own short reply (nothing goes to the agent).
 * `offer`: the names of the calls a plain yes would run now (the previous request's offer), or null. */
export function carTurnInput(userText: string, language: string, offer: string[] | null, car: { musicOn?: boolean; state?: CarState; lastActed?: boolean } = {}): { text: string } | { reply: string } {
  const lang = tuned(language);
  if (!lang) return { text: normalizeYesNo(userText, language) ?? withCarHints(userText, language) };
  const asked = pending;
  pending = null;
  // "Say that again": what was said, and the question in it still waits for its answer
  if (lastSpoken && only(userText, REPEAT[lang])) {
    pending = asked;
    return { reply: lastSpoken };
  }
  // the app's own offer (an answer about the car: "Want me to lock it?"): a yes is that request
  if (asked?.kind === 'command' && (only(userText, YES[lang]) || sameRequest(userText, asked.request, lang))) return { text: asked.request };
  // a question about the car: answered from the car (the model ran the action)
  const known = car.state ? answerCarQuestion(userText, language, car.state) : null;
  if (known) {
    if (known.offer) pending = { kind: 'command', request: known.offer };
    else if (known.askDestination) pending = { kind: 'destination', request: '' };
    return { reply: known.reply };
  }
  // music playing, "next song": not in this demo (the app's own sentence for that)
  if (car.musicOn && only(userText, SKIP[lang])) return { reply: LOCAL_LLM_NOT_IN_DEMO_MESSAGE[language] ?? LOCAL_LLM_NOT_IN_DEMO_MESSAGE.en };
  // music playing: "stop" / "para" means the music (what the model understands: "Stop the music" / "Desliga o som" -> mute)
  if (car.musicOn && !(offer && offer.length) && only(userText, STOP_MUSIC[lang])) return { text: lang === 'pt' ? 'Desliga o som' : 'Stop the music' };
  if (offer && offer.length) {
    if (only(userText, YES[lang])) return { text: lang === 'pt' ? 'sim' : 'yes' };
    if (offer.includes('navigate_to') && only(userText, GO_THERE[lang])) return { text: lang === 'pt' ? 'sim' : 'yes' };
    if (only(userText, DISMISS[lang]) && containsAny(userText, DISMISS_CORE[lang])) return { text: lang === 'pt' ? 'não' : 'no' };
    return { text: userText };
  }
  if (only(userText, DISMISS[lang]) && containsAny(userText, DISMISS_CORE[lang])) {
    const list = DISMISS_REPLY[lang];
    return { reply: list[dismissVariant++ % list.length] };
  }
  // "Turn it off" with nothing it can mean (no music, the last request changed nothing): asked, not guessed
  if (!car.musicOn && car.lastActed === false && !asked) {
    const which = only(userText, BARE_SWITCH[lang].off) ? 'off' : only(userText, BARE_SWITCH[lang].on) ? 'on' : null;
    if (which) {
      pending = { kind: 'verb', request: ASK_WHAT[lang][which][1] };
      return { reply: ASK_WHAT[lang][which][0] };
    }
  }
  if (asked) {
    const a = fold(userText);
    const words = a ? a.split(' ').length : 0;
    if (words > 0 && words <= 5 && !COMMAND_START[lang].test(a) && !only(userText, YES[lang])) {
      // "The driver's one" -> "the driver's one" inside the request (a name such as "Coldplay" keeps its capital)
      const said = userText.trim().replace(/[.!?]+$/, '');
      const answer = LOWER_FIRST[lang].has(fold(said.split(' ')[0])) ? said.charAt(0).toLowerCase() + said.slice(1) : said;
      if (asked.kind === 'destination') {
        return { text: lang === 'pt' ? (/^(pra|pro|para|pras|pros)\b/i.test(answer) ? `Navega ${answer}` : `Navega para ${answer}`)
          : /^to\b/i.test(answer) ? `Navigate ${answer}` : `Navigate to ${answer}` };
      }
      if (asked.kind === 'media') return { text: `${lang === 'pt' ? 'Toca' : 'Play'} ${answer}` };
      if (asked.kind === 'verb') return { text: `${asked.request} ${answer}` };
      if (asked.kind === 'seat') {
        // the core asks again unless the request names one seat: the seat goes into the request ("Heat the driver's seat")
        const seat = SEAT_ANSWER[lang].find(([re]) => re.test(a))?.[1];
        const rewritten = seat ? withSeat(asked.request, seat, lang) : null;
        if (rewritten) return { text: rewritten };
      }
      if (asked.kind !== 'command') return { text: `${asked.request.trim().replace(/[.!?,;:]+$/, '')}, ${answer}` };
    }
  }
  const seats = pluralSeats(userText, lang);
  if (seats) {
    pending = { kind: 'seat', request: seats };
    return { reply: WHICH_SEAT[lang] };
  }
  // something the car can't do, with the action it can ("Lock the sunroof" -> close it): asked, nothing runs without a yes
  const near = nearMiss(userText, lang);
  if (near) {
    pending = { kind: 'command', request: near.request };
    return { reply: near.reply };
  }
  return { text: canonical(userText, lang) ?? userText };
}

/**
 * "Lock the sunroof" / "Unlock the windows": the car has no such lock (2026-11-25 iPhone: the model declined and the driver heard "not
 * available in this demo"). The app says what it can do instead and asks; a yes ("Yes", "Close it") sends that request to the agent.
 */
function nearMiss(userText: string, lang: Lang): { reply: string; request: string } | null {
  const f = fold(userText);
  if (lang === 'en') {
    const m = /^(?:(?:can|could|would|will) you |please )*(lock|unlock) (?:up )?(?:the |my |our |all the |all )?(sunroof|moonroof|roof|windows)(?: please| for me)?$/.exec(f);
    if (!m) return null;
    const lock = m[1] === 'lock';
    const roof = m[2] !== 'windows';
    const what = roof ? 'the sunroof' : 'the windows';
    const verb = lock ? 'close' : 'open';
    return {
      reply: `I can't ${m[1]} ${what}, but I can ${verb} ${roof ? 'it' : 'them'}. Want me to ${verb} ${roof ? 'it' : 'them'}?`,
      request: roof ? `${lock ? 'Close' : 'Open'} the sunroof` : `${lock ? 'Close' : 'Open'} all the windows`,
    };
  }
  // pt-BR: every sentence about six words or more; both tested 2026-11-25 (brv3 voice, 5/5 heard right; "Quer que eu feche..." was 3/5) (src/car/speechComposer.ts, the pt-BR voice)
  const m = /^(?:(?:voce|vc) pode |pode |por favor )*(tranca|trancar|tranque|destranca|destrancar|destranque) (?:o |os |as |todos os |todas as )?(teto solar|teto|vidros|janelas)(?: do carro)?(?: por favor| pra mim)?$/.exec(f);
  if (!m) return null;
  const lock = !m[1].startsWith('des');
  const roof = m[2].startsWith('teto');
  const said = roof ? 'o teto solar do carro' : 'as janelas do carro';
  return {
    reply: `Não consigo ${lock ? 'trancar' : 'destrancar'} ${said}. Posso ${lock ? 'fechar' : 'abrir'} ${roof ? 'o teto solar' : 'todas as janelas'} para você?`,
    request: roof ? `${lock ? 'Fecha' : 'Abre'} o teto solar` : `${lock ? 'Fecha' : 'Abre'} todos os vidros`,
  };
}

/** The driver says the offered request short ("Close it", "Lock it", "Turn it on", "Fecha", "Pode trancar"): the offer itself. */
const OFFER_VERBS: Record<Lang, [RegExp, RegExp][]> = {
  en: [[/^close\b/i, /^(?:close|shut)$/], [/^open\b/i, /^open$/], [/^lock\b/i, /^lock$/], [/^(?:heat|cool)\b/i, /^(?:turn on|switch on|heat|cool|turn on)$/]],
  pt: [[/^fecha\b/i, /^(?:fecha|fechar|feche|pode fechar)$/], [/^abre\b/i, /^(?:abre|abrir|abra|pode abrir)$/], [/^tranca\b/i, /^(?:tranca|trancar|tranque|pode trancar)$/],
    [/^(?:esquenta|refresca)\b/i, /^(?:liga|ligar|ligue|pode ligar|esquenta|refresca)$/]],
};
function sameRequest(userText: string, request: string, lang: Lang): boolean {
  const verb = OFFER_VERBS[lang].find(([re]) => re.test(request))?.[1];
  if (!verb) return false;
  const f = fold(userText)
    .replace(/^(?:yes|yeah|sure|ok|okay|please|sim|claro|pode|ok|beleza) /, '')
    .replace(/ (?:please|por favor|pra mim|para mim)$/, '')
    .replace(/^(turn|switch) (?:it|them) on$/, '$1 on')
    .replace(/ (?:it|them|that|ele|eles|ela|elas|isso)$/, '');
  return verb.test(f);
}

function containsAny(text: string, phrases: string[]): boolean {
  const t = ` ${fold(text)} `;
  return phrases.some((p) => t.includes(` ${p} `));
}

/** After the agent's reply: remember a question the next short answer completes. `sent` = what went to the agent for this request. */
export function noteCarReply(sent: string, reply: string, language: string): void {
  pending = null;
  const lang = tuned(language);
  if (!lang) return;
  const r = reply.trim();
  if (!r.endsWith('?')) return;
  const last = (r.match(/[^.!?]*\?$/) ?? [r])[0].trim();
  if (/where (?:do you want|would you like) to go\?$|para onde (?:você |vc )?quer ir\?$/i.test(last)) pending = { kind: 'destination', request: sent };
  else if (/what (?:do you want|would you like) to (?:hear|listen to)\?$|o que (?:você |vc )?quer ouvir\?$/i.test(last)) pending = { kind: 'media', request: sent };
  else if (/^(?:which seat|qual banco)\b/i.test(last)) pending = { kind: 'seat', request: sent };
  else if (/\b(?:which|qual|quais)\b/i.test(last) && !/\b(?:again|repetir|de novo)\b/i.test(last)) pending = { kind: 'merge', request: sent };
}
