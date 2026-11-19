/**
 * What the driver HEARS when one request did several car actions (2026-11-19, user: "I closed all the doors. I locked the car." sounds
 * robotic). The car tools' own sentences (carTools.ts `say`) that ran in a row become one natural sentence:
 *   "I closed all the doors. I locked the car."  ->  "All set. I closed all the doors and locked the car. Everything is secure."
 *   "Fechei todas as portas. Tranquei o carro."  ->  "Pronto! Fechei todas as portas e tranquei o carro. Está tudo seguro."
 * Accuracy: nothing here decides an action. Only sentences of actions that really ran (recorded by the tool handlers in this turn) are
 * merged, word for word; anything else (a question, a refusal, an undo, a status answer that is not "I did X") is said as it was.
 * The conversation history the model sees keeps the original sentences (the wording it was trained on): only speech and the screen change.
 */

export interface CarTurnAction {
  tool: string;
  say: string;
  /** false: refused / failed / an undo: never merged */
  merge: boolean;
}

let turnActions: CarTurnAction[] = [];
let variant = 0;

/** Call before each request. */
export function beginCarTurn(): void {
  turnActions = [];
}

/** Called by the car tool handlers with the sentence they return. */
export function noteCarSay(tool: string, say: string, merge: boolean): void {
  if (say) turnActions.push({ tool, say: say.trim(), merge });
}

export function carTurnActions(): CarTurnAction[] {
  return turnActions;
}

const OPENERS: Record<'en' | 'pt', string[]> = {
  en: ['All set.', 'Done.', 'You got it.'],
  pt: ['Pronto!', 'Feito!', 'Tudo certo!'],
};
const SECURE: Record<'en' | 'pt', string> = { en: 'Everything is secure.', pt: 'Está tudo seguro.' };
const CLOSING_TOOLS = new Set(['close_doors', 'set_window', 'set_sunroof', 'set_trunk']);

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
function merged(run: CarTurnAction[], pt: boolean): string | null {
  const parts = run.map((a) => clause(a.say, pt));
  if (parts.some((p) => p === null)) return null;
  const lang = pt ? 'pt' : 'en';
  const opener = OPENERS[lang][variant++ % OPENERS[lang].length];
  const body = join(parts as string[], pt);
  const sentence = pt ? body.charAt(0).toUpperCase() + body.slice(1) : `I ${body}`;
  const secures = run.some((a) => a.tool === 'lock_car') && run.some((a) => CLOSING_TOOLS.has(a.tool));
  return `${opener} ${sentence}.${secures ? ` ${SECURE[lang]}` : ''}`;
}

/**
 * The reply text as the driver should hear it. `text` = what the agent said (core order); `actions` = this turn's tool sentences in order.
 * Sentences of actions that ran are matched word for word from the start of what is left; everything else passes through unchanged.
 */
export function composeCarSpeech(text: string, actions: CarTurnAction[], language: string): string {
  const pt = language.toLowerCase().startsWith('pt');
  const pending = [...actions];
  type Seg = { text: string; action?: CarTurnAction };
  const segs: Seg[] = [];
  let rest = text.trim();
  while (rest) {
    const i = pending.findIndex((a) => rest.startsWith(a.say));
    if (i >= 0) {
      const a = pending.splice(i, 1)[0];
      segs.push({ text: a.say, action: a });
      rest = rest.slice(a.say.length).trimStart();
      continue;
    }
    const m = /^.*?[.!?](?:\s+|$)/s.exec(rest);
    const piece = m ? m[0] : rest;
    segs.push({ text: piece.trim() });
    rest = rest.slice(piece.length).trimStart();
  }
  const out: string[] = [];
  for (let i = 0; i < segs.length; ) {
    if (segs[i].action?.merge) {
      let j = i;
      while (j < segs.length && segs[j].action?.merge) j++;
      const run = segs.slice(i, j).map((s) => s.action as CarTurnAction);
      const one = run.length >= 2 ? merged(run, pt) : null;
      out.push(one ?? segs.slice(i, j).map((s) => s.text).join(' '));
      i = j;
    } else {
      out.push(segs[i].text);
      i++;
    }
  }
  return out.join(' ');
}

/** For tests: start the openers from the first one. */
export function resetSpeechVariant(): void {
  variant = 0;
}
