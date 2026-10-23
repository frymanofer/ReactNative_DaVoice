// local_llm.md Stage 5 — provider abstraction. New file; src/aichat/index.ts
// itself is NOT modified this pass (wiring an active provider into the real
// chat loop is Stage 6 app-flow work, deferred along with App.tsx changes —
// see the scaffolding plan). GeminiProvider wraps the existing
// generateGeminiReply/generateGeminiReplyStream unchanged.

import type { AIChatHistoryMessage, GeminiChatMessage } from './index';
import { generateGeminiReply, generateGeminiReplyStream } from './index';

import type { LocalLLMModelConfig } from '../local_llm/types';
import { ensureModelLoaded, isModelReady } from '../local_llm/LocalLLMLoader';
import { getSelectedModel } from '../local_llm/ModelRegistry';
import { getProfile } from '../local_llm/profile/ProfileStore';
import { listFacts } from '../local_llm/memory/LongTermMemoryStore';
import { retrieve as retrieveLocalRag } from '../local_llm/rag/local/Retriever';
import type { Agent, AgentEvent, AgentHistoryMessage, ToolDefinition, ToolTurnMessage, TurnResult } from 'react-native-davoice-llm';
import { getLocalAgent } from '../agent/LocalAgent';

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
  private chatTemplateSet: Promise<void> = Promise.resolve();

  constructor(
    private readonly speakerId: string,
    private readonly licenseKey: string,
  ) {}

  /**
   * Tools of a remote MCP server, next to the calorie tracker's. They run
   * online, so a filler is said while they run. Set before `warmUp`: the tool
   * list is part of the system prompt the engine caches.
   */
  async setExternalTools(tools: ToolDefinition[], note?: string): Promise<void> {
    const agent = await getLocalAgent();
    await agent.setTools(tools, { online: () => true, note });
  }

  isAvailable(): boolean {
    // Real availability (model downloaded + license set) is determined by
    // the caller before constructing this provider — see
    // example/src/local_llm/ModelManager.ts's isModelDownloaded().
    return true;
  }

  /** The agent, set up for `model`'s chat template. */
  private async agentFor(model: LocalLLMModelConfig): Promise<Agent> {
    const agent = await getLocalAgent();
    // Set once per model, even when calls race (warm-up and a prefill).
    if (this.chatTemplateFor !== model.id) {
      this.chatTemplateFor = model.id;
      this.chatTemplateSet = agent.configure({ chatTemplate: model.chatTemplate });
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
  ): Promise<LocalLLMModelConfig> {
    const model = await getSelectedModel();
    await ensureModelLoaded(model, this.licenseKey, undefined, onDownloadProgress);
    await this.prefillForTurn(history, '');
    return model;
  }

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
    return { toolMessages: result.toolMessages, webSearch: result.webSearch };
  }
}
