// local_llm.md Stage 5 — provider abstraction. New file; src/aichat/index.ts
// itself is NOT modified this pass (wiring an active provider into the real
// chat loop is Stage 6 app-flow work, deferred along with App.tsx changes —
// see the scaffolding plan). GeminiProvider wraps the existing
// generateGeminiReply/generateGeminiReplyStream unchanged.

import type { AIChatHistoryMessage, GeminiChatMessage } from './index';
import { generateGeminiReply, generateGeminiReplyStream } from './index';

import type { ChatMessage, LocalLLMModelConfig } from '../local_llm/types';
import { ensureModelLoaded, isModelReady } from '../local_llm/LocalLLMLoader';
import { getSelectedModel } from '../local_llm/ModelRegistry';
import { StopSequenceFilter } from '../local_llm/StopSequenceFilter';
import { VOICE_ASSISTANT_PERSONA } from '../local_llm/persona/Persona';
import { getProfile } from '../local_llm/profile/ProfileStore';
import { listFacts } from '../local_llm/memory/LongTermMemoryStore';
import { retrieve as retrieveLocalRag } from '../local_llm/rag/local/Retriever';
import { webRAGProvider } from '../local_llm/rag/web/WebRAGProvider';
import type { ToolDefinition } from '../local_llm/tools/types';
import { assemblePrompt, assemblePromptPrefix } from '../local_llm/PromptAssembler';
import type { AssembleInput } from '../local_llm/PromptAssembler';

// Untyped, lazy require — deliberately not a static import and not `typeof
// import(...)` either: react-native-davoice-llm is linked from the sibling
// TTSLLM repo rather than declared in this app's package.json, and this file
// must still type-check on its own. Its real shape is TTSLLM/local_llm/index.ts.
interface LocalLLMModule {
  generateStream: (prompt: string, onToken: (token: string, done: boolean) => void) => Promise<void>;
  prefill: (prompt: string) => void;
  cancel: () => void;
}

function localLLMModule(): LocalLLMModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-davoice-llm');
}

export interface LLMProvider {
  generateReply(history: AIChatHistoryMessage[], userText: string): Promise<string>;
  generateReplyStream(
    history: AIChatHistoryMessage[],
    userText: string,
    onDelta: (delta: string, done: boolean) => void,
  ): Promise<void>;
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

function toShortTermMemory(history: AIChatHistoryMessage[]): ChatMessage[] {
  return history.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.text,
  }));
}

/**
 * Speaks to the local model via react-native-davoice-llm. `speakerId` scopes
 * profile/memory lookups; pass whatever src/speaker_verification/ currently
 * has active (or a stable "anonymous" id when speaker verification was
 * skipped). `licenseKey` is whatever the app already uses to license the
 * other DaVoice native libraries (see `DAVOICE_DEMO_LICENSE` in `App.tsx`) —
 * not hardcoded here, since licensing is an app-level concern.
 */
export class LocalLLMProvider implements LLMProvider {
  constructor(
    private readonly speakerId: string,
    private readonly licenseKey: string,
    private readonly tools: ToolDefinition[] = [],
  ) {}

  isAvailable(): boolean {
    // Real availability (model downloaded + license set) is determined by
    // the caller before constructing this provider — see
    // example/src/local_llm/ModelManager.ts's isModelDownloaded(). Kept
    // simple here since wiring that check into app flow is Stage 6 work.
    return true;
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
      // No web search for a speculative prefill: it would run on every
      // partial transcript.
      const input = await this.buildAssembleInput(model, history, partialUserText, false);
      localLLMModule().prefill(assemblePromptPrefix(input));
    } catch (error) {
      console.log('[LocalLLM] prefill skipped:', error);
    }
  }

  private async buildAssembleInput(
    model: LocalLLMModelConfig,
    history: AIChatHistoryMessage[],
    userText: string,
    includeWebRag = true,
  ): Promise<AssembleInput> {
    const [profile, longTermFacts, localRagPassages] = await Promise.all([
      getProfile(this.speakerId),
      listFacts(this.speakerId),
      retrieveLocalRag(this.speakerId, userText),
    ]);
    const webRagPassages = includeWebRag && webRAGProvider.isAvailable()
      ? await webRAGProvider.search(userText)
      : [];

    return {
      persona: VOICE_ASSISTANT_PERSONA,
      profile,
      shortTermMemory: toShortTermMemory(history),
      longTermFacts,
      localRagPassages,
      webRagPassages,
      toolSchemas: this.tools,
      chatTemplate: model.chatTemplate,
      userText,
    };
  }

  async generateReply(history: AIChatHistoryMessage[], userText: string): Promise<string> {
    let full = '';
    await this.generateReplyStream(history, userText, (delta, done) => {
      if (!done) full += delta;
    });
    return full;
  }

  async generateReplyStream(
    history: AIChatHistoryMessage[],
    userText: string,
    onDelta: (delta: string, done: boolean) => void,
  ): Promise<void> {
    // Downloads (if needed) + licenses + loads the model at most once, even
    // if generateReplyStream is somehow called again before the first load
    // finishes — see LocalLLMLoader.ts's doc comment for why that guard
    // matters (loading the same GGUF twice concurrently is what pushed a
    // reference app's process into swap).
    // The model (and with it the chat template) is whatever the user last
    // picked in ModelPicker; a change takes effect on the next turn.
    const model = await getSelectedModel();
    await ensureModelLoaded(model, this.licenseKey);

    const { prompt } = assemblePrompt(await this.buildAssembleInput(model, history, userText));
    const localLLM = localLLMModule();
    const stopFilter = new StopSequenceFilter(model.chatTemplate.stopSequences);
    await localLLM.generateStream(prompt, (token, done) => {
      if (!done) {
        const wasStopped = stopFilter.isStopped;
        const text = stopFilter.push(token);
        if (text) onDelta(text, false);
        // Stop generating as soon as the template's turn-end marker shows
        // up; native still sends the final done=true after cancel.
        if (!wasStopped && stopFilter.isStopped) localLLM.cancel();
        return;
      }
      const rest = stopFilter.flush();
      if (rest) onDelta(rest, false);
      onDelta('', true);
    });
  }
}
