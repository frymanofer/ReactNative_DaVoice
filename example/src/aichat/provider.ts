// local_llm.md Stage 5 — provider abstraction. New file; src/aichat/index.ts
// itself is NOT modified this pass (wiring an active provider into the real
// chat loop is Stage 6 app-flow work, deferred along with App.tsx changes —
// see the scaffolding plan). GeminiProvider wraps the existing
// generateGeminiReply/generateGeminiReplyStream unchanged.

import type { AIChatHistoryMessage, GeminiChatMessage } from './index';
import { generateGeminiReply, generateGeminiReplyStream } from './index';

import type { LocalLLMModelConfig } from '../local_llm/types';
import { ensureLayer2Loaded, ensureModelLoaded, isModelReady, nativeLoadCount } from '../local_llm/LocalLLMLoader';
import { getSelectedModel } from '../local_llm/ModelRegistry';
import { LOCAL_LLM_LAYER2, LOCAL_LLM_LAYER2_MODEL, LOCAL_LLM_USE_REMOTE_ASSISTANT } from '../local_llm/constants';
import { getProfile } from '../local_llm/profile/ProfileStore';
import { listFacts } from '../local_llm/memory/LongTermMemoryStore';
import { retrieve as retrieveLocalRag } from '../local_llm/rag/local/Retriever';
import type { Agent, AgentEvent, AgentHistoryMessage, ToolDefinition, ToolTurnMessage, TurnResult } from 'react-native-davoice-llm';
import { cancel as cancelGeneration, generateStream, loadState, saveState } from 'react-native-davoice-llm';
import RNFS from 'react-native-fs';
import { kvStatePath } from '../local_llm/ModelManager';
import { getLocalAgent } from '../agent/LocalAgent';
import { clearHeardSpeakers } from '../speaker_verification/currentSpeaker';

export interface LLMProvider {
  generateReply(history: AIChatHistoryMessage[], userText: string): Promise<string>;
  generateReplyStream(
    history: AIChatHistoryMessage[],
    userText: string,
    onDelta: (delta: string, done: boolean) => void,
  ): Promise<void | LocalTurnOutcome>;
  isAvailable(): boolean;
}

function toGeminiHistory(history: AIChatHistoryMessage[]): GeminiChatMessage[] {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

export class GeminiProvider implements LLMProvider {
  private nextRequestId = 1;

  isAvailable(): boolean {
    return true;
  }

  async generateReply(history: AIChatHistoryMessage[], userText: string): Promise<string> {
    return generateGeminiReply(toGeminiHistory(history), {
      requestId: this.nextRequestId++,
      userText,
    });
  }

  async generateReplyStream(
    history: AIChatHistoryMessage[],
    userText: string,
    onDelta: (delta: string, done: boolean) => void,
  ): Promise<void> {
    await generateGeminiReplyStream(
      toGeminiHistory(history),
      { requestId: this.nextRequestId++, userText },
      (deltaText) => {
        onDelta(deltaText, false);
      },
    );
    onDelta('', true);
  }
}

/** e.g. "Saturday, October 17, 2026". Changes once a day, so the system
 * prompt (and the engine's cache of it) stays the same within a day. */
function currentDateText(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** agent configure "guards" for a model's callGuards setting. */
function callGuardSettings(mode: 'off' | 'shadow' | 'correct') {
  const opposite = mode === 'correct' ? 'enforce' : mode;
  return { polarity: mode, direction: mode, absRel: mode, zone: mode, capability: mode, numberGround: mode, opposite } as const;
}

function toAgentHistory(history: AIChatHistoryMessage[]): AgentHistoryMessage[] {
  return history.map((m) => ({ role: m.role, text: m.text, toolMessages: m.toolMessages }));
}

/** What a local turn did besides speaking (see `generateReplyStream`). */
export interface LocalTurnOutcome {
  /** Keep these in the history with the reply (AIChatHistoryMessage.toolMessages). */
  toolMessages: ToolTurnMessage[];
  /** Set when the turn searched the web. */
  webSearch: TurnResult['webSearch'];
}

/**
 * Speaks to the local model through the shared native agent core
 * (react-native-davoice-llm's `Agent`, set up in src/agent/LocalAgent.ts):
 * web search, fillers, the calorie tracker's tools, prompt assembly and the
 * model all run natively, the same as in the Flutter example. `speakerId`
 * scopes profile/memory lookups; `licenseKey` licenses the engine.
 */
export class LocalLLMProvider implements LLMProvider {
  private chatTemplateFor: string | null = null;
  private configuredAgent: Agent | null = null;
  private chatTemplateSet: Promise<void> = Promise.resolve();

  constructor(
    private readonly speakerId: string,
    private readonly licenseKey: string,
  ) {}

  /**
   * The app's own tools (the DaVoice Car's) and a remote MCP server's, next to
   * the calorie tracker's. `online` tools run on a server, so a filler is said
   * while they run (default: all). Set before `warmUp`: the tool list is part
   * of the system prompt the engine caches.
   */
  async setExternalTools(tools: ToolDefinition[], note?: string, online: (tool: ToolDefinition) => boolean = () => true): Promise<void> {
    const agent = await getLocalAgent();
    await agent.setTools(tools, { online, note });
  }

  isAvailable(): boolean {
    // Real availability (model downloaded + license set) is determined by
    // the caller before constructing this provider — see
    // example/src/local_llm/ModelManager.ts's isModelDownloaded().
    return true;
  }

  /** The agent, set up for `model`'s chat template and remote assistant. */
  private async agentFor(model: LocalLLMModelConfig): Promise<Agent> {
    const agent = await getLocalAgent();
    // Set once per model AND per agent, even when calls race (warm-up and a prefill). A new agent (a JS reload,
    // a retry after a failed create) starts with the defaults (router on, no model tools, engine sampling): without
    // this it ran the fine-tuned model in the wrong setup.
    if (this.chatTemplateFor !== model.id || this.configuredAgent !== agent) {
      this.chatTemplateFor = model.id;
      this.configuredAgent = agent;
      const handsOver = model.remoteAssistant === true && LOCAL_LLM_USE_REMOTE_ASSISTANT;
      this.chatTemplateSet = agent.configure({
        chatTemplate: model.chatTemplate,
        // Layer 2 (constants.ts LOCAL_LLM_LAYER2): the on-device general model, or the app's onRequest
        // (src/aichat/remote.ts: Gemini, 15 s; or with 'none' the "set up a remote model" message).
        remote: !handsOver
          ? false
          : LOCAL_LLM_LAYER2 === 'device'
            ? { enabled: true, answer: 'layer2' }
            : { enabled: true, timeoutMs: 15000 },
        // false: the model decides every turn with every tool (no router, no skill rules).
        intentRouter: model.usesRouter !== false,
        // web_search + get_time for a model trained to call them (as in the benchmark).
        webSearchTool: model.modelTools === true,
        timeTool: model.modelTools === true,
        // Saved facts: the pack's 'small' profile; without the per-request facts for models that opt out
        // (relevantMemory: false). Sent every time: the agent is shared, the previous model's setting must not stick.
        memory: { profile: 'small', ...(model.relevantMemory === false ? { relevantMax: 0 } : {}) },
        // Local sampling for agent turns (0 = greedy); unset keeps the engine's default.
        ...(model.temperature !== undefined ? { sampling: { temperature: model.temperature } } : {}),
        // Call guards (model.callGuards): sent every time, so switching models never keeps the previous model's guards.
        // 'correct' fixes / blocks; the split-tool opposite check can only block ('enforce'). Every decision is logged.
        guards: callGuardSettings(model.callGuards ?? 'off'),
      });
    }
    await this.chatTemplateSet;
    return agent;
  }

  /**
   * Downloads (if needed) and loads the selected model ahead of time, then
   * processes the system prompt into the model's cache, so the first chat
   * turn pays for neither. Call when Local AI Chat opens and after the user
   * picks another model. A turn that starts while this is still running joins
   * the same load (see LocalLLMLoader.ensureModelLoaded).
   */
  async warmUp(
    history: AIChatHistoryMessage[] = [],
    onDownloadProgress?: (fractionComplete: number) => void,
    onWarming?: () => void,
  ): Promise<LocalLLMModelConfig> {
    const model = await getSelectedModel();
    await ensureModelLoaded(model, this.licenseKey, undefined, onDownloadProgress);
    // The system prompt processed at an earlier start (saved below): restored in about a second instead of
    // processing ~3k tokens again (~40 s on the S20's CPU). Only once per load; a broken file is deleted.
    const statePath = kvStatePath(model);
    const stateExists = await RNFS.exists(statePath).catch(() => false);
    const load = `${model.id}#${nativeLoadCount()}`;
    if (this.stateRestoredFor !== load && stateExists) {
      const t0 = Date.now();
      try {
        const restored = await loadState(statePath);
        console.log(`[LocalLLM] KV state restored: ${restored} tokens in ${Date.now() - t0} ms`);
      } catch (error) {
        console.log('[LocalLLM] KV state not usable, deleted:', error);
        await RNFS.unlink(statePath).catch(() => undefined);
      }
    }
    this.stateRestoredFor = load;
    onWarming?.();
    // Answer once, on the agent's real prompt for a short "Hello": the system
    // prompt (persona, tools) is in the model's cache and the first decode has
    // run, so the user's first turn starts right away. A few tokens are enough.
    // A turn waits for this (generateReplyStream): the cancel() that ends the
    // warm-up bumps the engine's generate epoch, and a turn that had already
    // taken its epoch while queued behind the warm-up was cancelled before its
    // first token (2026-11-09 phone: empty reply, handed to layer 2).
    const generation = (async () => {
      try {
        const agent = await this.agentFor(model);
        const prompt = await agent.call<string>('prompt', {
          text: 'Hello',
          history: toAgentHistory(history),
          date: currentDateText(),
        });
        const started = Date.now();
        let tokens = 0;
        await generateStream(prompt, (_token, done) => {
          if (!done && ++tokens === 4) cancelGeneration();
        });
        const warmMs = Date.now() - started;
        console.log(`[LocalLLM] warm-up answered (${tokens} tokens) in ${warmMs} ms`);
        // Save the processed prompt for the next start: when there is no saved state yet, or the prompt changed enough
        // that the warm-up had to do real work (new tools, persona, language). Not every start: the file is ~380 MB.
        if (!stateExists || warmMs > 5000) {
          const t0 = Date.now();
          await saveState(statePath)
            .then((n) => console.log(`[LocalLLM] KV state saved: ${n} tokens in ${Date.now() - t0} ms`))
            .catch((error) => console.log('[LocalLLM] KV state not saved:', error));
        }
      } catch (error) {
        // Only a speed-up: a failure here must not block the chat.
        console.log('[LocalLLM] warm-up generation skipped:', error);
        await this.prefillForTurn(history, '');
      }
    })();
    this.warmUpGeneration = generation;
    try {
      await generation;
    } finally {
      if (this.warmUpGeneration === generation) this.warmUpGeneration = null;
    }
    // The layer 2 model loads in the background AFTER the warm-up (both models compute on the same CPU cores: loaded side by side,
    // the 3.3k-token warm-up and layer 2's own warm-up slowed each other down, 2026-11-09 phone). Until it is ready, a handed-over
    // request hears agent.json "remote.layer2.unavailable".
    if (model.remoteAssistant && LOCAL_LLM_USE_REMOTE_ASSISTANT && LOCAL_LLM_LAYER2 === 'device') {
      ensureLayer2Loaded(LOCAL_LLM_LAYER2_MODEL).catch(() => undefined);
    }
    return model;
  }

  /** The warm-up generation while it runs: a turn starts only after it (see warmUp). */
  private warmUpGeneration: Promise<void> | null = null;
  /** The native load (model id + load count) whose saved KV state was already tried: once per load. */
  private stateRestoredFor: string | null = null;

  /**
   * Processes the prompt-so-far into the model's cache in the background:
   * the conversation plus `partialUserText`, the user's words as recognized
   * so far. Called on every partial transcript while the user is talking, so
   * that when they stop, only the last few words remain to be processed.
   * No-op until the selected model is loaded; never throws.
   */
  async prefillForTurn(history: AIChatHistoryMessage[], partialUserText: string): Promise<void> {
    try {
      const model = await getSelectedModel();
      if (!isModelReady(model.id)) return;
      (await this.agentFor(model)).prefill(toAgentHistory(history), partialUserText);
    } catch (error) {
      console.log('[LocalLLM] prefill skipped:', error);
    }
  }

  async generateReply(history: AIChatHistoryMessage[], userText: string): Promise<string> {
    let full = '';
    await this.generateReplyStream(history, userText, (delta, done) => {
      if (!done) full += delta;
    });
    return full;
  }

  /**
   * One turn. Reply text streams to `onDelta`; `onEvent` gets everything else
   * the agent reports while working: `filler` (say it while waiting: web
   * search, food lookup, MCP tool), `status`, `webSearch`, `toolResult`.
   */
  async generateReplyStream(
    history: AIChatHistoryMessage[],
    userText: string,
    onDelta: (delta: string, done: boolean) => void,
    onEvent?: (event: AgentEvent) => void,
  ): Promise<LocalTurnOutcome> {
    // Downloads (if needed) + licenses + loads the model at most once, even
    // if a turn starts before warm-up finished (LocalLLMLoader's guard).
    // The model (and with it the chat template) is whatever the user last
    // picked in ModelPicker; a change takes effect on the next turn.
    const model = await getSelectedModel();
    await ensureModelLoaded(model, this.licenseKey);
    const agent = await this.agentFor(model);
    // Never start while the warm-up runs: its cancel() would stop this turn too (see warmUp).
    if (this.warmUpGeneration) {
      console.log('[LocalLLM] turn waits for the warm-up to finish');
      await this.warmUpGeneration;
    }

    const [profile, longTermFacts, localPassages] = await Promise.all([
      getProfile(this.speakerId),
      listFacts(this.speakerId),
      retrieveLocalRag(this.speakerId, userText),
    ]);
    const result = await agent.turn(
      {
        text: userText,
        history: toAgentHistory(history),
        profile,
        longTermFacts,
        localPassages,
        date: currentDateText(),
      },
      (event) => {
        if (event.type === 'text') onDelta(event.text, false);
        else onEvent?.(event);
      },
    );
    onDelta('', true);
    clearHeardSpeakers(); // the next request is checked on its own voice
    return { toolMessages: result.toolMessages, webSearch: result.webSearch };
  }
}
