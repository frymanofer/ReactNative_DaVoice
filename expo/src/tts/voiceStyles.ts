// Emotion / style tags for voices that have style variants ("abilities").
// Speech.getVoiceAbilities(voice) lists a voice's abilities (e.g. "whisper",
// "military_sergeant_hard"); [] when it has none. To use one, put free text in
// square brackets before the words it applies to, until the next tag:
//   "[drill sergeant] Give me 50 push-ups! [regular] Thanks."
// Tags in Portuguese work too ("[sussurrando] ..."), and are never spoken.

import type { AppLanguage } from '../appflow';

export type VoiceStyleExample = { ability: string; label: string; text: string };

type ExampleText = { label: string; text: string };

// One example per known ability, per language. Every tag below is checked to
// select its own ability when the voice has all of them.
const STYLE_EXAMPLES: Record<string, Record<AppLanguage, ExampleText>> = {
  whisper: {
    en: { label: 'Whisper', text: '[whispering confidentially] Quiet, this is a secret! Do not tell anyone!' },
    'pt-BR': { label: 'Sussurro', text: '[sussurrando em segredo] Silêncio, isso é um segredo! Não conte para ninguém!' },
  },
  soft_whisper: {
    en: { label: 'Soft whisper', text: '[soft gentle whisper] Close your eyes and rest. Everything is going to be fine.' },
    'pt-BR': { label: 'Sussurro suave', text: '[sussurro suave e terno] Feche os olhos e descanse. Vai ficar tudo bem.' },
  },
  strong_whisper: {
    en: { label: 'Strong whisper', text: '[strong urgent whisper] Get down, now! They are right behind the door!' },
    'pt-BR': { label: 'Sussurro forte', text: '[sussurro forte e urgente] Abaixe agora! Eles estão atrás da porta!' },
  },
  extremly_quiet_whisper: {
    en: { label: 'Very quiet whisper', text: '[barely audible whisper] Shh... the baby is finally asleep.' },
    'pt-BR': { label: 'Sussurro bem baixo', text: '[sussurro quase inaudível] Psiu... o bebê finalmente dormiu.' },
  },
  angry_whisper: {
    en: { label: 'Angry whisper', text: '[angry whisper] I told you not to touch that. Put it back right now.' },
    'pt-BR': { label: 'Sussurro bravo', text: '[sussurrando com raiva] Eu falei para não mexer nisso. Coloque de volta agora.' },
  },
  happy_laughing: {
    en: { label: 'Happy', text: '[happy mode enjoying life] What a funny joke! I could not stop laughing.' },
    'pt-BR': { label: 'Feliz', text: '[feliz e sorrindo] Que piada engraçada! Eu não consegui parar de rir.' },
  },
  strong_happy_laughing: {
    en: { label: 'Laughing hard', text: '[laughing hysterically] Oh no, you did not just say that! That is hilarious!' },
    'pt-BR': { label: 'Gargalhada', text: '[gargalhando histericamente] Não acredito que você disse isso! Que hilário!' },
  },
  motivating: {
    en: { label: 'Motivating', text: '[motivating coach] You are stronger than you think. One more step, you can do it!' },
    'pt-BR': { label: 'Motivador', text: '[treinador motivador] Você é mais forte do que imagina. Só mais um passo, você consegue!' },
  },
  shouting_encouraging: {
    en: { label: 'Shouting encouragement', text: '[shouting encouragement] Come on! Faster! You are almost there!' },
    'pt-BR': { label: 'Gritando incentivo', text: '[gritando e encorajando] Vamos lá! Mais rápido! Você está quase lá!' },
  },
  disappointed: {
    en: { label: 'Disappointed', text: '[disappointed and sad] I really thought you would come today. Oh well.' },
    'pt-BR': { label: 'Decepcionado', text: '[decepcionado e triste] Eu realmente achei que você viria hoje. Que pena.' },
  },
  military_sergeant_hard: {
    en: { label: 'Drill sergeant', text: '[drill sergeant] Get down and give me 50 push-ups!' },
    'pt-BR': { label: 'Sargento', text: '[sargento militar durão] Para o chão e me pague 50 flexões!' },
  },
  military_sergeant_soft: {
    en: { label: 'Friendly sergeant', text: '[friendly army sergeant] Good work, soldier. Take five and drink some water.' },
    'pt-BR': { label: 'Sargento gentil', text: '[sargento do exército gentil] Bom trabalho, soldado. Descanse um pouco e beba água.' },
  },
};

// An ability without a written example: its own name works as the tag.
function genericExample(ability: string, language: AppLanguage): ExampleText {
  const words = ability.replace(/_/g, ' ').trim();
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return language === 'pt-BR'
    ? { label, text: `[${words}] Olá! Esta é a minha voz com este estilo.` }
    : { label, text: `[${words}] Hello! This is my voice in this style.` };
}

// Shown first, in this order; the other abilities follow in the voice's order.
const FIRST_ABILITIES = ['military_sergeant_hard', 'whisper'];
// Shown last.
const LAST_ABILITIES = ['disappointed'];
// Abilities without examples in a language.
const HIDDEN_ABILITIES: Record<AppLanguage, string[]> = {
  en: [],
  'pt-BR': ['angry_whisper'],
};

function abilityRank(ability: string): number {
  const name = ability.toLowerCase();
  if (FIRST_ABILITIES.includes(name)) return FIRST_ABILITIES.indexOf(name) - FIRST_ABILITIES.length;
  return LAST_ABILITIES.includes(name) ? 1 + LAST_ABILITIES.indexOf(name) : 0;
}

/** One example per ability of the voice, in the app's language. */
export function voiceStyleExamples(abilities: string[], language: AppLanguage): VoiceStyleExample[] {
  return abilities
    .filter((ability) => !HIDDEN_ABILITIES[language].includes(ability.toLowerCase()))
    .map((ability, index) => ({ ability, index }))
    .sort((a, b) => abilityRank(a.ability) - abilityRank(b.ability) || a.index - b.index)
    .map(({ ability }) => {
      const example = STYLE_EXAMPLES[ability.toLowerCase()]?.[language] ?? genericExample(ability, language);
      return { ability, ...example };
    });
}

/** The abilities of each voice (voices without any are left out). */
export async function loadVoiceAbilities(
  Speech: { getVoiceAbilities?: (name: string) => Promise<string[]> },
  voices: string[],
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  if (typeof Speech.getVoiceAbilities !== 'function') return result;
  for (const voice of voices) {
    try {
      const abilities = await Speech.getVoiceAbilities(voice);
      if (abilities.length > 0) result[voice] = abilities;
    } catch {
      // A voice that can't be queried is listed without styles.
    }
  }
  return result;
}

export const STYLE_TAG_HINT: Record<AppLanguage, string> = {
  en: 'Put a tag in square brackets before the words it applies to, e.g. [happy] Hello! or [whispering] Listen. [regular] goes back to the normal voice.',
  'pt-BR': 'Coloque uma etiqueta entre colchetes antes das palavras, por exemplo [feliz] Olá! ou [sussurrando] Escute. [normal] volta à voz normal.',
};
