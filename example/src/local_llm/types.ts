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
  /** Opens the reply being generated (not earlier replies), e.g. Qwen3's
   * empty `<think>\n\n</think>\n\n`: thinking off, as its own template does. */
  generationPrefix?: string;
  /** Tool calls as JSON with spaces after ':' and ',' (Qwen3's own template). */
  spacedToolJson?: boolean;
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
  /** When set, a download whose SHA-256 differs is deleted and reported as failed. */
  sha256?: string;
  /** Hands what it can't do well to the remote assistant (Gemini, src/aichat/remote.ts):
   * everything but the tool actions (agent.json "remote"). Offline, it answers itself. */
  remoteAssistant?: boolean;
  /** false: saved facts about the user are not added to every request whose words match them ("my car is red" was
   * attached to every car command: ~35 extra tokens per turn and the 0.6B model sometimes answered with the fact).
   * The profile (name) and "what do you remember about me" still work. Default: on. */
  relevantMemory?: boolean;
  /** False: no intent router; the model itself decides every turn (which tool, a question, the
   * remote assistant or a reply), as the fine-tuned DaVoice Agent is trained to. Default true. */
  usesRouter?: boolean;
  /** The model's own information tools: web_search (the app's web search engine,
   * local.config.ts WEB_SEARCH_ENGINE) and get_time (the phone's clock). For a model trained
   * to call them (the DaVoice Agent, which decides every turn itself). Default false. */
  modelTools?: boolean;
  /** How the local model picks tokens for agent turns (agent configure "sampling"). 0 = greedy:
   * reproducible tool choice and arguments. Unset = the engine's default (0.7). Gemini's sampling is separate
   * (GEMINI_TEMPERATURE in src/aichat/index.ts). */
  temperature?: number;
  /** The car tools' descriptions this model sees (src/car/carTools.ts): 'v1' (default) = the wording ft7c was trained on,
   * 'h2' = the same tools without example values. A model must get the wording it was trained / benchmarked with. */
  toolWording?: 'v1' | 'h2' | 'h3';
  /** The core's call guards (agent configure "guards": polarity, direction, absRel, zone, capability, numberGround, opposite):
   * 'off' (default), 'shadow' = recorded in the chat log only (the call runs as the model made it), 'correct' = a wrong call is
   * fixed when the fix is unambiguous, otherwise blocked. Every guard decision is a "guard ..." line in the chat log. */
  callGuards?: 'off' | 'shadow' | 'correct';
  /** False for the app's built-in entries; user-added models can be removed. */
  isCustom: boolean;
}

export interface GenerateOptions {
  contextSize?: number;
  maxTokens?: number;
  temperature?: number;
}
