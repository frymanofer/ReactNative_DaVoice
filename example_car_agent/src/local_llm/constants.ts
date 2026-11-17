import type { LocalLLMModelConfig, ModelId } from './types';
import { CHAT_TEMPLATE_PRESETS } from './chatTemplates';

// Built-in models the user can pick from (src/local_llm/ModelPicker.tsx).
// Users can add more at runtime — see ModelRegistry.ts. The native engine and
// TTSLLM bridge never see this list; they only receive whichever resolved
// path ModelManager hands them.
/** The car-agent example's models: the DaVoice Automotive Agent g3c_it3639 (the default) and r8d_it150 (a backup, picked explicitly).
 * Exactly one model is loaded. Car actions stay simulated. */
export const LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C: ModelId = 'davoice-automotive-agent-0.6b-g3c-it3639';
export const LOCAL_LLM_DAVOICE_AUTOMOTIVE_R8D: ModelId = 'davoice-automotive-agent-0.6b-r8d-it150';

export const BUILTIN_LOCAL_LLM_MODELS: LocalLLMModelConfig[] = [
  {
    // Automotive Agent g3c_it3639, the car demo's default since 2026-11-17 (see LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C): same settings as r8d.
    // R2 upload verified 2026-11-17: HTTP 200, 381,565,920 bytes, sha256 of the full download = the training artifact's.
    id: LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C,
    displayName: 'DaVoice Automotive Agent 0.6B',
    filename: 'davoice-automotive-qwen3-0.6b-g3c-it3639-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/auto16_g3c_it3639-q4_0.gguf',
    sizeBytes: 381_565_920,
    sha256: 'c39fbd65b259573d67dfb7da1935f1d0087156d7eefd97e131536a436c4d0ba8',
    // 6144 (2026-11-13): with the 6-turn history the prompt stays under ~4.7k tokens; S20: same decisions as 8192 (150 / 150), peak
    // 1.59 vs 1.82 GB; the pre-warmed state (made at 8192) restores into it
    contextSize: 6144,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3d',
    callGuards: 'correct',
    historyAsRun: true,
    guidedToolCalls: true,
    promptOrder: 'cache',
    guardRetry: true,
    // two clear commands in one request run both (core 2026-11-13, Q3; older cores ignore it)
    maxOperations: 2,
    // latency (core 2026-11-13): only the last 6 user turns in the prompt (KV shift: no reprocessing) and {"ok":true} for tools that
    // answered with their own sentence. S20, 25-turn conversations: prompt time ~2.3 s flat (was 2.0 -> 3.2 s), no accuracy loss
    historyTurns: 6,
    compactToolResults: true,
    // Command scope + undo (core 2026-11-14, dev g29zh; older cores ignore both): only straightforward car commands reach the model
    // (<= 10 words; up to 15 when clear; up to 22 for a clear car request such as a dual zone with a preamble); general requests go
    // to the remote assistant, garbled / vague ones are asked again, car functions without a tool are declined, background speech is
    // ignored. "desfaz" / "undo" restores the car's previous state (src/car/undo.ts). Benchmarked on a
    // separate held-out test set.
    scope: { enabled: true, localMaxWords: 10, strictMaxWords: 15, hardMaxWords: 22 },
    undo: true,
    // Pre-warmed states made 2026-11-17 on the S20 by this app (g3c + h3d + cache order + agent_automotive pack, core g29zm). R2 upload
    // verified 2026-11-17 (size + sha256 of the full download match). Regenerate whenever the model, pack, tools or core prompt text change.
    prebuiltStates: {
      en: { url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/prewarm/g3c_it3639_prewarm_en.kvstate', sha256: '75a35e15c774b9b63223b4b71e3283f6abffbf3b52e6343f16b04d9f26cd325f', sizeBytes: 426_699_589 },
      'pt-BR': { url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/prewarm/g3c_it3639_prewarm_pt-BR.kvstate', sha256: 'f794a202844afdcb754678ce092da729dbdc66377c5e39c78d81300c683f11a0', sizeBytes: 429_681_893 },
    },
    isCustom: false,
  },
  {
    // Automotive Agent r8d_it150, the car demo's default until 2026-11-17, now a backup (explicit pick only; see LOCAL_LLM_DAVOICE_AUTOMOTIVE_R8D): h3d wording.
    // R2 upload verified 2026-11-13: HTTP 200, 381,565,920 bytes, sha256 of the full download = the training artifact's.
    id: LOCAL_LLM_DAVOICE_AUTOMOTIVE_R8D,
    displayName: 'DaVoice Automotive Agent 0.6B (r8d, backup)',
    filename: 'davoice-automotive-qwen3-0.6b-r8d-it150-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/auto8_r8d_it150-q4_0.gguf',
    sizeBytes: 381_565_920,
    sha256: 'a977c181c3af6aa49991d927e66256fba77502af76bf42291109e3c3c4b2a550',
    // 6144 (2026-11-13): with the 6-turn history the prompt stays under ~4.7k tokens; S20: same decisions as 8192 (150 / 150), peak
    // 1.59 vs 1.82 GB; the pre-warmed state (made at 8192) restores into it
    contextSize: 6144,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3d',
    callGuards: 'correct',
    historyAsRun: true,
    guidedToolCalls: true,
    promptOrder: 'cache',
    guardRetry: true,
    // two clear commands in one request run both (core 2026-11-13, Q3; older cores ignore it)
    maxOperations: 2,
    // latency (core 2026-11-13): only the last 6 user turns in the prompt (KV shift: no reprocessing) and {"ok":true} for tools that
    // answered with their own sentence. S20, 25-turn conversations: prompt time ~2.3 s flat (was 2.0 -> 3.2 s), no accuracy loss
    historyTurns: 6,
    compactToolResults: true,
    // Command scope + undo (core 2026-11-14, dev g29zh; older cores ignore both): only straightforward car commands reach the model
    // (<= 10 words; up to 15 when clear; up to 22 for a clear car request such as a dual zone with a preamble); general requests go
    // to the remote assistant, garbled / vague ones are asked again, car functions without a tool are declined, background speech is
    // ignored. "desfaz" / "undo" restores the car's previous state (src/car/undo.ts). Benchmarked on a
    // separate held-out test set.
    scope: { enabled: true, localMaxWords: 10, strictMaxWords: 15, hardMaxWords: 22 },
    undo: true,
    // Pre-warmed states made 2026-11-12 on the S20 by this app (r8d + h3d + cache order + agent_automotive pack; the prompt text is the
    // same in core g14-g28). R2 upload verified 2026-11-13 (HTTP 200, size + sha256 of the full download match). Regenerate whenever the
    // model, pack, tools or core prompt text change.
    prebuiltStates: {
      en: { url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/prewarm/r8d_it150_prewarm_en.kvstate', sha256: 'ae8ec4f6ce359d171faddc31d2195af8da4cf5b8b66e2d64fc0630058b58a6d9', sizeBytes: 426_699_589 },
      'pt-BR': { url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/prewarm/r8d_it150_prewarm_pt-BR.kvstate', sha256: 'e5fc93e1a3af51741a7748125452ef89e166b97f08aee58d7249575830d8007d', sizeBytes: 429_681_893 },
    },
    isCustom: false,
  },
];

// The default model (and the car demo's): g3c_it3639. Changing it switches every install to the new default once (ModelRegistry.ts).
export const LOCAL_LLM_DEFAULT_MODEL: ModelId = LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C;

/** The demo's model until the user picks another one (src/local_llm/demo.ts; this example has the car demo only). */
export const LOCAL_LLM_DEMO_DEFAULT_MODEL: Record<'calories' | 'car', ModelId> = {
  calories: LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C,
  car: LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C,
};

/** The default before the registry recorded it. */
export const LOCAL_LLM_EARLIER_DEFAULT_MODEL: ModelId = LOCAL_LLM_DAVOICE_AUTOMOTIVE_G3C;

/** Whether models with `remoteAssistant` hand over to Gemini (src/aichat/remote.ts). Off: the
 * model on the phone answers everything (web searches as before), e.g. without a working Gemini key. */
export const LOCAL_LLM_USE_REMOTE_ASSISTANT = true; // 2026-11-07: on for the phone test with real Gemini handoff

/** The "layer 2" of models with `remoteAssistant`: who answers what the DaVoice Agent model hands over
 * (knowledge, writing, small talk). 'none': no remote model is set up; the app says LOCAL_LLM_NO_REMOTE_MESSAGE
 * (src/aichat/remote.ts); 'device': LOCAL_LLM_LAYER2_MODEL, a second, general model on the phone (no internet
 * needed; loaded after the agent model's warm-up); 'cloud': Gemini (src/aichat/remote.ts). */
export type LocalLLMLayer2 = 'none' | 'device' | 'cloud';
// 2026-11-09 (user): no second model on the phone (slow next to the agent model, mixed saved facts into actions);
// hand-overs say LOCAL_LLM_NO_REMOTE_MESSAGE until a remote model is set up.
export const LOCAL_LLM_LAYER2: LocalLLMLayer2 = 'none';

/** What the agent says instead of the model's "That's not available here" (agent.json remote.cannotReplies: the request was
 * understood but this demo can't do it), by app language; English otherwise. */
export const LOCAL_LLM_NOT_IN_DEMO_MESSAGE: Record<string, string> = {
  en: 'This is not available in this demo, to make it available please contact info@davoice.io',
  'pt-BR': 'Isso não está disponível nesta demonstração. Para disponibilizar, entre em contato com info@davoice.io',
  'pt-PT': 'Isto não está disponível nesta demonstração. Para o disponibilizar, contacte info@davoice.io',
  he: 'זה לא זמין בהדגמה הזאת. כדי לקבל את זה, צרו איתנו קשר בכתובת info@davoice.io',
  da: 'Det er ikke tilgængeligt i denne demo. Kontakt info@davoice.io for at få det.',
  sv: 'Det är inte tillgängligt i den här demon. Kontakta info@davoice.io för att få det.',
  el: 'Αυτό δεν είναι διαθέσιμο σε αυτή την επίδειξη. Για να το αποκτήσετε, επικοινωνήστε με το info@davoice.io.',
};

/** What the agent says for a handed-over request when LOCAL_LLM_LAYER2 is 'none' (by app language; English otherwise). */
export const LOCAL_LLM_NO_REMOTE_MESSAGE: Record<string, string> = {
  en: 'I need to send this to a remote Model. To make this work, please setup a remote model in the App.',
  'pt-BR': 'Preciso enviar isso para um modelo remoto. Para isso funcionar, configure um modelo remoto no aplicativo.',
  'pt-PT': 'Preciso de enviar isto para um modelo remoto. Para isto funcionar, configure um modelo remoto na aplicação.',
  he: 'אני צריך לשלוח את זה למודל מרוחק. כדי שזה יעבוד, הגדירו מודל מרוחק באפליקציה.',
  da: 'Jeg skal sende det her til en ekstern model. Konfigurer en ekstern model i appen, så det virker.',
  sv: 'Jag behöver skicka det här till en fjärrmodell. Ställ in en fjärrmodell i appen så att det fungerar.',
  el: 'Πρέπει να το στείλω σε ένα απομακρυσμένο μοντέλο. Για να λειτουργήσει, ρυθμίστε ένα απομακρυσμένο μοντέλο στην εφαρμογή.',
};

/** The car tools the agent gets: 'vw_demo' = the Volkswagen Brazil demo's 17 (climate, windows, navigation, media/radio, seats,
 * vehicle status: shorter prompt, faster, fewer confusions), 'all' = the whole catalog (30, Automotive_Voice_Commands.docx). */
export const LOCAL_LLM_CAR_TOOLS: 'vw_demo' | 'all' = 'vw_demo';

/** The on-device layer 2 model: plain Qwen3-0.6B (the agent model before fine-tuning), which still answers
 * general questions; the fine-tuned model no longer does. 4,096 tokens of context (its prompt is short)
 * keeps the second KV cache at ~0.45 GB. */
export const LOCAL_LLM_LAYER2_MODEL: LocalLLMModelConfig = {
  id: 'qwen3-0.6b-layer2',
  displayName: 'Qwen3 0.6B (layer 2)',
  filename: 'qwen3-0.6b-q4_0.gguf',
  url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/qwen3-0.6b-q4_0.gguf',
  contextSize: 4096,
  chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
  sizeBytes: 469_081_472,
  sha256: 'f49664ab5eb883046499fc6bdcee54f013b74ea83f455c6a610f532e5981071d',
  isCustom: false,
};

/** Context size prefilled for a user-added model. */
export const LOCAL_LLM_DEFAULT_CUSTOM_CONTEXT_SIZE = 4096;

/** Subdirectory of RNFS.DocumentDirectoryPath models and settings are cached under. */
export const LOCAL_LLM_STORAGE_DIR = 'local_llm';

/** The car demo's "Local confidence" choices (2026-11-17): the minimum probability the on-device model must have for a car action to run
 * locally; below it the request goes to the remote assistant. 0 = off (every call is decided by the guards alone). Measured with
 * g3c_it3639 on commands it was never trained on: 0.8 stops ~40% of the wrong actions and sends ~13% of valid commands to the remote
 * assistant; 0.9 stops ~2/3 and sends ~20%; 0.95 stops ~70% and sends ~27%. */
export const LOCAL_LLM_CONFIDENCE_CHOICES: number[] = [0, 0.8, 0.9, 0.95];

/** What the user hears when a command was below the confidence minimum and no remote model is set up (LOCAL_LLM_LAYER2 'none'). */
export const LOCAL_LLM_LOW_CONFIDENCE_MESSAGE: Record<string, string> = {
  en: 'For this command I need a remote agent.',
  'pt-BR': 'Para esse comando eu preciso de um agente remoto.',
};
