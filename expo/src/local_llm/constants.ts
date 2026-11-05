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
export const LOCAL_LLM_DAVOICE_AGENT_FT1: ModelId = 'davoice-agent-qwen3-0.6b-ft1';

// URLs are real, verified-reachable files. The Gemma entries use the same
// unsloth GGUF repos the AmigoLocal reference app uses in production. Sizes
// are the servers' content-length (checked 2026-09-28 for Gemma, 2026-10-04
// for Qwen, 2026-11-05 for the DaVoice Agent).
export const BUILTIN_LOCAL_LLM_MODELS: LocalLLMModelConfig[] = [
  {
    // Qwen3-0.6B fine-tuned (LoRA, first run) for on-device tool calling:
    // picking the tool, taking its arguments from the user's words, asking
    // for a missing one, short replies. Hosted on DaVoice's Cloudflare R2.
    id: LOCAL_LLM_DAVOICE_AGENT_FT1,
    displayName: 'DaVoice Agent 0.6B',
    filename: 'davoice-agent-qwen3-0.6b-ft1-q4_0.gguf',
    url: 'https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/agent-llm/ft1-q4_0.gguf',
    // Trained window is 32768; 8192 as for the other small models.
    contextSize: 8192,
    chatTemplate: CHAT_TEMPLATE_PRESETS.qwen3.template,
    sizeBytes: 381_565_920,
    sha256: '2013946d5878d11a141ab6f71eccdbc5a5a21b00311dc952a224c511c318dcb1',
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

// Smallest general built-in (1.07 GB): fastest to download, load and generate
// with. The DaVoice Agent is not the default yet: it was trained on tool
// decisions only, and stays silent after a tool result or web search and on
// memory questions. Changing this switches every install to the new default
// once (see ModelRegistry.ts); the user can pick another model afterwards.
export const LOCAL_LLM_DEFAULT_MODEL: ModelId = LOCAL_LLM_QWEN25_1_5B;

/** The default before the registry recorded it (files written until 2026-11-05). */
export const LOCAL_LLM_EARLIER_DEFAULT_MODEL: ModelId = LOCAL_LLM_QWEN25_1_5B;

/** Context size prefilled for a user-added model. */
export const LOCAL_LLM_DEFAULT_CUSTOM_CONTEXT_SIZE = 4096;

/** Subdirectory of RNFS.DocumentDirectoryPath models and settings are cached under. */
export const LOCAL_LLM_STORAGE_DIR = 'local_llm';
