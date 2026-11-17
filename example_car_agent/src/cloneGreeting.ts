import type { AppLanguage } from './appflow';

/** What a new cloned voice says when the user listens to it (the voice-clone screen). */
const CLONE_GREETING: Record<AppLanguage, (voice: string) => string> = {
  en: (voice) => `Hello! I am ${voice}. This is my new cloned voice.`,
  'pt-BR': (voice) => `Olá, meu nome é ${voice}! Não sou uma voz sintética comum. Quer ouvir algo interessante? Eu gosto do gosto deste café, almoço um bom almoço e chego à reunião às dez e meia.`,
  'pt-PT': (voice) => `Olá, o meu nome é ${voice}! Não sou uma voz sintética comum. Quer ouvir algo interessante? Eu gosto do gosto deste café, almoço um bom almoço e chego à reunião às dez e meia.`,
  de: (voice) => `Hallo! Ich bin ${voice}. Das ist meine neue geklonte Stimme.`,
  es: (voice) => `¡Hola! Soy ${voice}. Esta es mi nueva voz clonada.`,
  fr: (voice) => `Bonjour ! Je suis ${voice}. Voici ma nouvelle voix clonée.`,
  it: (voice) => `Ciao! Sono ${voice}. Questa è la mia nuova voce clonata.`,
  nl: (voice) => `Hallo! Ik ben ${voice}. Dit is mijn nieuwe gekloonde stem.`,
  he: (voice) => `שלום! אני ${voice}. זה הקול המשוכפל החדש שלי.`,
  da: (voice) => `Hej! Jeg er ${voice}. Dette er min nye klonede stemme.`,
  sv: (voice) => `Hej! Jag är ${voice}. Det här är min nya klonade röst.`,
  el: (voice) => `Γεια σας! Αυτή είναι η νέα κλωνοποιημένη φωνή μου, ${voice}.`,
};

export function cloneGreeting(language: AppLanguage, voice: string): string {
  return (CLONE_GREETING[language] ?? CLONE_GREETING.en)(voice);
}
