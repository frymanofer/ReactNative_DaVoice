/**
 * How the car agent answers GENERAL questions ("who is the president of the US", "tell me a joke", "quem é o presidente do Brasil").
 * The car model never acts on them (the command scope sends them away before any car decision), so this setting changes only what
 * the driver hears, never how car commands are handled. Change the value and reload the app.
 *
 *   'gemini'   (a) The cloud assistant (Gemini; key GEMINI_API_KEY in local.config.ts). The question leaves the phone; text-only answers,
 *                  they can never run a car action. Without a key it behaves like 'message'.
 *   'message'  (b) No remote assistant: the driver hears GENERAL_QUESTIONS_MESSAGE below.
 *   'local'    (c) No remote assistant: the question is looked up on Wikipedia, then the car model on the phone answers from the page,
 *                  after GENERAL_QUESTIONS_LOCAL_INTRO (no second
 *                  model, no tools). Needs react-native-davoice-llm with the agent core of 2026-11-19 or later; an older one behaves like
 *                  'message'. The car model was trained for car commands: expect mostly GENERAL_QUESTIONS_LOCAL_NO_ANSWER or a refusal.
 */
export type GeneralQuestionsMode = 'gemini' | 'message' | 'local';

export const GENERAL_QUESTIONS_MODE: GeneralQuestionsMode = 'local';

/** (b) What the driver hears when there is no remote assistant. */
export const GENERAL_QUESTIONS_MESSAGE: Record<string, string> = {
  en: "General questions go to a remote assistant, which isn't set up in this demo. I can help you with the car.",
  'pt-BR': 'Perguntas gerais vão para um assistente remoto, que não está configurado nesta demonstração. Posso te ajudar com o carro.',
};

/** (c) Said before the car model's own attempt, and when it has no answer. */
export const GENERAL_QUESTIONS_LOCAL_INTRO: Record<string, string> = {
  en: 'Since there is no remote agent configured, I will try to answer that.',
  'pt-BR': 'Como não há um agente remoto configurado, vou tentar responder.',
};
/** (c) A general question is first looked up on Wikipedia (the app's language); when the car model cannot answer from the page, the
 * page's own first sentences are said after this lead (nothing made up). */
export const GENERAL_QUESTIONS_SOURCE_LEAD: Record<string, string> = {
  en: 'Here is what Wikipedia says:',
  'pt-BR': 'Segundo a Wikipédia:',
};
export const GENERAL_QUESTIONS_LOCAL_NO_ANSWER: Record<string, string> = {
  en: "I'm not sure about that one.",
  'pt-BR': 'Não tenho certeza sobre isso.',
};
