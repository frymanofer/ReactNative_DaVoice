// Shared vocabulary for the local-LLM feature. No dependency on any other
// file in src/local_llm/ — everything else imports from here.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Set on a 'tool' message: which tool call this is the result of. */
  toolCallId?: string;
}

/** Identifies an entry in the model registry (built-in or user-added — see
 * ModelRegistry.ts). The native engine (DavoiceLLMIOSPrivate/
 * DavoiceLLMAndroidPrivate) never sees this; it only receives a resolved
 * file path. */
export type ModelId = string;

/**
 * How a model expects a conversation to be rendered into its single prompt
 * string. Every instruction-tuned model family is trained on one specific
 * format; a mismatch produces rambling replies that never stop. Rendered by
 * PromptAssembler.ts only — native code never parses this.
 *
 * Do not include a BOS token (e.g. `<bos>`, `<|begin_of_text|>`): the native
 * tokenizer adds it itself (`add_special=true`) and parses the special-token
 * markers used below (`parse_special=true`).
 */
export interface ChatTemplate {
  systemPrefix: string;
  userPrefix: string;
  assistantPrefix: string;
  /** Closes every turn, whatever its role. */
  turnSuffix: string;
  /**
   * `'role'`: the system prompt is its own turn under `systemPrefix`.
   * `'merge-into-first-user'`: the model has no system role (Gemma), so the
   * system prompt is prepended to the first user turn instead.
   */
  systemMode: 'role' | 'merge-into-first-user';
  /** Generated text is cut at the first of these. Native generation already
   * stops on the model's end-of-generation token; this catches models whose
   * GGUF metadata doesn't mark the turn-end marker as one. */
  stopSequences: string[];
}

export interface LocalLLMModelConfig {
  id: ModelId;
  displayName: string;
  /** File name the GGUF is stored under in the app's documents directory. */
  filename: string;
  /** Where the GGUF is downloaded from. */
  url: string;
  /** Context window the model is loaded with (KV-cache memory grows linearly with it). */
  contextSize: number;
  chatTemplate: ChatTemplate;
  /** Approximate download size, for display only. */
  sizeBytes?: number;
  /** False for the app's built-in entries; user-added models can be removed. */
  isCustom: boolean;
}

export interface GenerateOptions {
  contextSize?: number;
  maxTokens?: number;
  temperature?: number;
}
