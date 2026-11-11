import type { LocalLLMModelConfig, ModelId } from './types';
import { CHAT_TEMPLATE_PRESETS } from './chatTemplates';

// Built-in models the user can pick from (src/local_llm/ModelPicker.tsx).
// Users can add more at runtime — see ModelRegistry.ts. The native engine and
// TTSLLM bridge never see this list; they only receive whichever resolved
// path ModelManager hands them.
export const LOCAL_LLM_E2B: ModelId = 'gemma-3n-e2b-it';
export const LOCAL_LLM_E4B: ModelId = 'gemma-3n-e4b-it';
export const LOCAL_LLM_QWEN25_1_5B: ModelId = 'qwen2.5-1.5b-instruct';
export const LOCAL_LLM_QWEN25_3B: ModelId = 'qwen2.5-3b-instruct';
/** VW Brazil fallback model (2026-11-09): ft7c at step 750 (Qwen3-0.6B fine-tuned for the agent + automotive pt-BR). The default until
 * 2026-11-10, now the selectable fallback. (The ft3 / ft6 DaVoice Agent entries were removed 2026-11-09: their files were deleted from R2.) */
export const LOCAL_LLM_DAVOICE_AGENT_VW_DEMO: ModelId = 'davoice-agent-qwen3-0.6b-vw-demo-ft7c-it750';
/** VW demo model, THE DEFAULT since 2026-11-10 (user decision): ft7e at step 600 with the h2 tool wording and the call guards on
 * (frozen-binary benchmark: pt-BR VW 74/106 executed correctly vs ft7c 66/106, unsupported 16/16, opposite 0). ft7c stays in the
 * picker as the fallback. Car actions stay simulated. */
export const LOCAL_LLM_DAVOICE_AGENT_VW_FT7E: ModelId = 'davoice-agent-qwen3-0.6b-vw-demo-ft7e-it600';
/** EXPERIMENTAL (2026-11-10, user: selectable, clearly marked, NOT the default, NOT safety-qualified): ft7f2 at step 900. Better VW pt-BR
 * and multi-turn than ft7e on the S20 (103/132 vs 81/132) but it fails the safety gate on the full car catalog (opposite 1 vs 0, incorrect
 * 53 vs limit 51). Car actions stay simulated. */
export const LOCAL_LLM_DAVOICE_AGENT_VW_FT7F2_EXP: ModelId = 'davoice-agent-qwen3-0.6b-vw-ft7f2-it900-experimental';
/** The two demo models (2026-11-10, two-model strategy). Today both are ft7f2_it900 (one shared file): the best automotive checkpoint on
 * the S20 and the provisional Personal Agent baseline (user decision). Each gets its own replacement as its training finishes. */
export const LOCAL_LLM_DAVOICE_PERSONAL: ModelId = 'davoice-personal-agent-0.6b';
export const LOCAL_LLM_DAVOICE_AUTOMOTIVE: ModelId = 'davoice-automotive-agent-0.6b';
/** EXPERIMENTAL Automotive Agent candidates (2026-11-11, user: C3 preferred, A fallback; both experimental until the full in-app test,
 * NOT defaults). Same h3 tools, guards correcting + the follow-up guard (historyAsRun), guided tool calls. Not hosted: the files are
 * sideloaded into the models folder for the test (an existing file is never downloaded). Car actions stay simulated. */
export const LOCAL_LLM_DAVOICE_AUTOMOTIVE_C3_EXP: ModelId = 'davoice-automotive-agent-0.6b-c3-auto3-h3-it300-experimental';
export const LOCAL_LLM_DAVOICE_AUTOMOTIVE_A_EXP: ModelId = 'davoice-automotive-agent-0.6b-a-auto1-h3-it1050-experimental';
/** Automotive Agent r4b_it100 (2026-11-11 evening, user): round 4b from C3, the car demo's model. Core g9 frozen sets: pt-BR acceptance 139/161
 * (C3 136), correct executed 320/370 (C3 312), wrong executed 38 (= C3), 0 opposite / unsupported executed, follow-ups 36/39 (C3 35), valid
 * requests declined 3 (C3 7). Final g10 comparison pending. C3 stays in the list as the fallback. Car actions stay simulated. */
export const LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B: ModelId = 'davoice-automotive-agent-0.6b-r4b-it100';

// URLs are real, verified-reachable files (checked 2026-11-09). The Gemma entries use the same unsloth GGUF repos the AmigoLocal
// reference app uses in production. Sizes are the servers' content-length.
const FT7F2_IT900_FILE = {
  filename: 'davoice-agent-qwen3-0.6b-vw-ft7f2-it900-q4_0.gguf',
  url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft7f2_it900-q4_0.gguf',
  sizeBytes: 381_565_920,
  sha256: '2826a24b9391a40c2933370a15deb342d530ddee904687c649a898738bdbcf6b',
};

export const BUILTIN_LOCAL_LLM_MODELS: LocalLLMModelConfig[] = [
  {
    // The calories demo's model: calories, memory, notes, developer tools, handoff (no car tools in that demo).
    id: LOCAL_LLM_DAVOICE_PERSONAL,
    displayName: 'DaVoice Personal Agent 0.6B',
    ...FT7F2_IT900_FILE,
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    callGuards: 'correct',
    isCustom: false,
  },
  {
    // The car demo's model: the simulated VW car's tools (h3: positions + dual zone), guards correcting / blocking.
    id: LOCAL_LLM_DAVOICE_AUTOMOTIVE,
    displayName: 'DaVoice Automotive Agent 0.6B',
    ...FT7F2_IT900_FILE,
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3',
    callGuards: 'correct',
    isCustom: false,
  },
  {
    // Automotive Agent r4b_it100: the car demo's model (see LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B). C3 below is a backup, explicit pick only.
    // URL uploaded by the user; verified 2026-11-11: HTTP 200, 381,565,920 bytes, sha256 of the download = the training artifact's.
    id: LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B,
    displayName: 'DaVoice Automotive Agent 0.6B (r4b)',
    filename: 'davoice-automotive-qwen3-0.6b-r4b-it100-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/auto5_r4b_it100-q4_0.gguf',
    sizeBytes: 381_565_920,
    sha256: '1c078e961c5f4e16ae0f667d213fa06de53f3f4bc92c9248427bdb37237bd205',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3',
    callGuards: 'correct',
    historyAsRun: true,
    guidedToolCalls: true,
    isCustom: false,
  },
  {
    // EXPERIMENTAL Automotive Agent C3 (see LOCAL_LLM_DAVOICE_AUTOMOTIVE_C3_EXP). Not hosted (url empty): sideloaded for the in-app test.
    id: LOCAL_LLM_DAVOICE_AUTOMOTIVE_C3_EXP,
    displayName: 'DaVoice Automotive Agent 0.6B (C3, EXPERIMENTAL)',
    filename: 'davoice-automotive-qwen3-0.6b-auto3-h3-it300-q4_0.gguf',
    url: '',
    sizeBytes: 381_565_920,
    sha256: '2fa0cbf7d0c1d258d8f218a228685efdff2ae5ecce2cdd899908ab3b805e7b1d',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3',
    callGuards: 'correct',
    historyAsRun: true,
    guidedToolCalls: true,
    isCustom: false,
  },
  {
    // EXPERIMENTAL Automotive Agent A (fallback; see LOCAL_LLM_DAVOICE_AUTOMOTIVE_A_EXP). Not hosted: sideloaded for the in-app test.
    id: LOCAL_LLM_DAVOICE_AUTOMOTIVE_A_EXP,
    displayName: 'DaVoice Automotive Agent 0.6B (A, EXPERIMENTAL)',
    filename: 'davoice-automotive-qwen3-0.6b-auto1-h3-it1050-q4_0.gguf',
    url: '',
    sizeBytes: 381_565_920,
    sha256: '008bb5ca2efaf184f1b510f0a348a4542a11388b9b5a7148636a62c9275ac598',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3',
    callGuards: 'correct',
    historyAsRun: true,
    guidedToolCalls: true,
    isCustom: false,
  },
  {
    // ft7e_it600 (ft7c + h1-worded automotive round + general replay): the default, see LOCAL_LLM_DAVOICE_AGENT_VW_FT7E.
    id: LOCAL_LLM_DAVOICE_AGENT_VW_FT7E,
    displayName: 'DaVoice Agent 0.6B (VW demo ft7e)',
    filename: 'davoice-agent-qwen3-0.6b-vw-demo-ft7e-it600-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft7e_it600-q4_0.gguf',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    sizeBytes: 381_565_920,
    sha256: 'e9378c83492dcf933ba0f73b1d1acf4d96a58a5a1508d83443cabc607ec4e443',
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    // h3 (2026-11-10): the benchmarked h2 wording + window / door positions + set_dual_zone_temperature; call guards correcting / blocking.
    toolWording: 'h3',
    callGuards: 'correct',
    isCustom: false,
  },
  {
    // ft7f2_it900: EXPERIMENTAL, see LOCAL_LLM_DAVOICE_AGENT_VW_FT7F2_EXP. Same setup as ft7e for a fair comparison.
    id: LOCAL_LLM_DAVOICE_AGENT_VW_FT7F2_EXP,
    displayName: 'DaVoice Agent 0.6B (VW ft7f2 it900, EXPERIMENTAL)',
    filename: 'davoice-agent-qwen3-0.6b-vw-ft7f2-it900-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft7f2_it900-q4_0.gguf',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    sizeBytes: 381_565_920,
    sha256: '2826a24b9391a40c2933370a15deb342d530ddee904687c649a898738bdbcf6b',
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
    relevantMemory: false,
    toolWording: 'h3',
    callGuards: 'correct',
    isCustom: false,
  },
  {
    // ft7c_it750 (universal Qwen3-0.6B + VW automotive): decides every turn itself (tools: car, calories, memory, web search;
    // asks for a missing value; declines what it can't do) and hands knowledge / small talk to layer 2 (LOCAL_LLM_LAYER2).
    // Car actions stay simulated (src/car). Hosted on DaVoice's Cloudflare R2 (sha256 checked on download).
    id: LOCAL_LLM_DAVOICE_AGENT_VW_DEMO,
    displayName: 'DaVoice Agent 0.6B (VW demo ft7c fallback)',
    filename: 'davoice-agent-qwen3-0.6b-vw-demo-ft7c-it750-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft7c_it750-q4_0.gguf',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    sizeBytes: 381_565_920,
    sha256: '136a03cd21ce1d4a8f943c1c5ab39006fece4ede3c1d8509b760de7c88e49111',
    remoteAssistant: true,
    // Trained to decide every turn itself: no intent router.
    usesRouter: false,
    // Trained to call web_search for current facts and get_time for the time.
    modelTools: true,
    temperature: 0,
    // Car commands: no saved facts attached (see LocalLLMModelConfig.relevantMemory).
    relevantMemory: false,
    // The wording ft7c was trained on; guards only logged (behaviour unchanged: the fallback stays as released).
    toolWording: 'v1',
    callGuards: 'shadow',
    isCustom: false,
  },
  {
    id: LOCAL_LLM_E2B,
    displayName: 'Gemma 3n E2B',
    filename: 'gemma-3n-E2B-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/gemma-3n-E2B-it-GGUF/resolve/main/gemma-3n-E2B-it-Q4_K_M.gguf',
    // Gemma 3n's trained window is 32768 (Google model card). AmigoLocal
    // deliberately loads at half that: KV-cache size grows linearly with
    // context, and they flag the full window as "untested on older phones".
    contextSize: 16384,
    chatTemplate: CHAT_TEMPLATE_PRESETS.gemma.template,
    sizeBytes: 3_030_000_000,
    isCustom: false,
  },
  {
    id: LOCAL_LLM_E4B,
    displayName: 'Gemma 3n E4B',
    filename: 'gemma-3n-E4B-it-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/gemma-3n-E4B-it-GGUF/resolve/main/gemma-3n-E4B-it-Q4_K_M.gguf',
    // Same window as E2B per Google's model card (E2B/E4B differ in active
    // params, not context length).
    contextSize: 16384,
    chatTemplate: CHAT_TEMPLATE_PRESETS.gemma.template,
    sizeBytes: 4_540_000_000,
    isCustom: false,
  },
  {
    id: LOCAL_LLM_QWEN25_1_5B,
    displayName: 'Qwen2.5 1.5B',
    // Q4_0, not Q4_K_M: llama.cpp repacks Q4_0 into ARM-optimized kernels at
    // load. Measured on the SD865 test phone: prompt processing 122 vs 87
    // tok/s, generation 24 vs 23 tok/s.
    filename: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf',
    // Trained window is 32768; 8192 keeps the KV cache small on low-RAM phones.
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.chatml.template,
    sizeBytes: 1_066_227_232,
    isCustom: false,
  },
  {
    // Better at tool calling and calorie knowledge than 1.5B (91% vs 86% on
    // the calorie-tool test set before the food table), but about twice as
    // slow on phone CPUs. Fast on iPhones with Metal (A14+).
    id: LOCAL_LLM_QWEN25_3B,
    displayName: 'Qwen2.5 3B',
    filename: 'qwen2.5-3b-instruct-q4_0.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_0.gguf',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.chatml.template,
    sizeBytes: 1_997_879_712,
    isCustom: false,
  },
];

// The VW demo DaVoice Agent ft7e (382 MB; 2026-11-10, was ft7c): smallest and fastest, the tool actions on the phone, layer 2 for the rest. The others stay in
// the picker as backups (they answer everything on the phone). Changing this switches every install to the new default once (see
// ModelRegistry.ts); the user can pick another model afterwards.
export const LOCAL_LLM_DEFAULT_MODEL: ModelId = LOCAL_LLM_DAVOICE_AGENT_VW_FT7E;

/** Each Local AI Chat demo's model until the user picks another one in that demo (src/local_llm/demo.ts). */
export const LOCAL_LLM_DEMO_DEFAULT_MODEL: Record<'calories' | 'car', ModelId> = {
  calories: LOCAL_LLM_DAVOICE_PERSONAL,
  car: LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B,   // 2026-11-11 evening (user): r4b_it100; was LOCAL_LLM_DAVOICE_AUTOMOTIVE (ft7f2_it900)
};

/** The default before the registry recorded it (files written until 2026-11-05). */
export const LOCAL_LLM_EARLIER_DEFAULT_MODEL: ModelId = LOCAL_LLM_QWEN25_1_5B;

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
