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
export const LOCAL_LLM_DAVOICE_AGENT_FT1: ModelId = 'davoice-agent-qwen3-0.6b-ft3';
/** Phone test candidate (2026-11-08): ft6 at step 1,650. NOT the default. */
export const LOCAL_LLM_DAVOICE_AGENT_TEST: ModelId = 'davoice-agent-qwen3-0.6b-ft6-it1650';

// URLs are real, verified-reachable files. The Gemma entries use the same
// unsloth GGUF repos the AmigoLocal reference app uses in production. Sizes
// are the servers' content-length (checked 2026-09-28 for Gemma, 2026-10-04
// for Qwen, 2026-11-05 for the DaVoice Agent).
export const BUILTIN_LOCAL_LLM_MODELS: LocalLLMModelConfig[] = [
  {
    // Qwen3-0.6B fine-tuned (LoRA, ft3: whole app conversations) for on-device tool calling:
    // picking the tool, taking its arguments from the user's words, asking
    // for a missing one, short replies. Hosted on DaVoice's Cloudflare R2.
    // Conversation, questions and current events go to Gemini
    // (remoteAssistant): the model is weak at those.
    id: LOCAL_LLM_DAVOICE_AGENT_FT1,
    displayName: 'DaVoice Agent 0.6B',
    filename: 'davoice-agent-qwen3-0.6b-ft3-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft3-q4_0.gguf',
    // Trained window is 32768; 8192 as for the other small models.
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    sizeBytes: 381_565_920,
    sha256: 'c709742ceb871c7be52cc740a7b711fe09ce5e565f0e92c38bd2060859957da2',
    remoteAssistant: true,
    // Trained to decide every turn itself: no intent router.
    usesRouter: false,
    // Trained to call web_search for current facts and get_time for the time.
    modelTools: true,
    isCustom: false,
  },
  {
    // Test candidate: ft6 at step 1,650 (best ft6 checkpoint so far: arguments, Portuguese, clarification and safety up vs
    // ft4.5 iteration 2,500). For phone testing with temperature 0 and Gemini; not the default. On R2 since 2026-11-08 (sha256 checked).
    id: LOCAL_LLM_DAVOICE_AGENT_TEST,
    displayName: 'DaVoice Agent 0.6B (test ft6-1650)',
    filename: 'davoice-agent-qwen3-0.6b-ft6-it1650-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft6_it1650-q4_0.gguf',
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    sizeBytes: 381_565_920,
    sha256: 'c988a238276f56facb7ff62c7d9ff817292542895b1fa1287204fe847660679c',
    remoteAssistant: true,
    usesRouter: false,
    modelTools: true,
    temperature: 0,
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

// The DaVoice Agent (382 MB): smallest and fastest, the tool actions on the
// phone and Gemini for the rest. The others stay in the picker as backups
// (they answer everything on the phone, as before). Changing this switches
// every install to the new default once (see ModelRegistry.ts); the user can
// pick another model afterwards.
export const LOCAL_LLM_DEFAULT_MODEL: ModelId = LOCAL_LLM_DAVOICE_AGENT_FT1;

/** The default before the registry recorded it (files written until 2026-11-05). */
export const LOCAL_LLM_EARLIER_DEFAULT_MODEL: ModelId = LOCAL_LLM_QWEN25_1_5B;

/** Whether models with `remoteAssistant` hand over to Gemini (src/aichat/remote.ts). Off: the
 * model on the phone answers everything (web searches as before), e.g. without a working Gemini key. */
export const LOCAL_LLM_USE_REMOTE_ASSISTANT = true; // 2026-11-07: on for the phone test with real Gemini handoff

/** Context size prefilled for a user-added model. */
export const LOCAL_LLM_DEFAULT_CUSTOM_CONTEXT_SIZE = 4096;

/** Subdirectory of RNFS.DocumentDirectoryPath models and settings are cached under. */
export const LOCAL_LLM_STORAGE_DIR = 'local_llm';
