import type { ChatMessage, ChatTemplate } from './types';
import type { PersonaConfig } from './persona/Persona';
import type { UserProfile } from './profile/ProfileStore';
import type { MemoryFact } from './memory/LongTermMemoryStore';
import type { WebRAGPassage } from './rag/web/WebRAGProvider';
import type { ToolDefinition } from './tools/types';

/**
 * The one function every other layer (persona, profile, memory, RAG, tools)
 * feeds into, and the only thing that ever reaches the native engine. This
 * is what "keep the local LLM generic, inject per-user context at runtime"
 * means concretely: LocalLLMEngine (native) and react-native-davoice-llm
 * (bridge) only ever see the `prompt` string this produces — they never see
 * a PersonaConfig, a UserProfile, or a MemoryFact.
 *
 * Pure function, fully real (not a stub) — unit-testable without any native
 * module, since it's just string templating.
 */
export interface AssembleInput {
  persona: PersonaConfig;
  profile: UserProfile | null;
  shortTermMemory: ChatMessage[];
  longTermFacts: MemoryFact[];
  localRagPassages: string[];
  /** Fresh web results for this turn's question (see needsWebSearch.ts). */
  webRagPassages: WebRAGPassage[];
  /** A web search was attempted for this turn but failed (e.g. offline). */
  webSearchFailed?: boolean;
  /** e.g. "Saturday, October 17, 2026" — lets the model reason about "now". */
  currentDate?: string;
  toolSchemas: ToolDefinition[];
  /** The selected model's template — see ModelRegistry.ts. */
  chatTemplate: ChatTemplate;
  userText: string;
}

export interface AssembledPrompt {
  prompt: string;
  toolSchemas: ToolDefinition[];
}

function buildSystemBlock(input: AssembleInput): string {
  const parts: string[] = [input.persona.systemPromptFragment];
  if (input.currentDate) parts.push(`Today's date is ${input.currentDate}.`);

  if (input.profile) {
    const prefBits: string[] = [];
    if (input.profile.displayName) prefBits.push(`The user's name is ${input.profile.displayName}.`);
    if (input.profile.preferredTone) prefBits.push(`Preferred tone: ${input.profile.preferredTone}.`);
    if (input.profile.language) prefBits.push(`Respond in ${input.profile.language}.`);
    if (prefBits.length > 0) parts.push(prefBits.join(' '));
  }

  if (input.longTermFacts.length > 0) {
    const facts = input.longTermFacts.map((f) => `- ${f.text}`).join('\n');
    parts.push(`Known facts about this user:\n${facts}`);
  }

  if (input.localRagPassages.length > 0) {
    parts.push(`Relevant context from the user's own documents:\n${input.localRagPassages.join('\n---\n')}`);
  }

  if (input.toolSchemas.length > 0) {
    const tools = input.toolSchemas
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
    parts.push(`You may call the following tools when appropriate:\n${tools}`);
  }

  return parts.join('\n\n');
}

/**
 * Web results are appended to this turn's question, not put in the system
 * block: the system prompt and earlier turns then stay identical between
 * turns, so the engine's cache (and the prefill done while the user spoke)
 * is still reused. They go after the question so that prefill still matches.
 */
function buildWebBlock(input: AssembleInput): string {
  if (input.webRagPassages.length > 0) {
    const results = input.webRagPassages.map((p) => `- ${p.text}`).join('\n');
    return (
      `\n\nWeb search results, newer than your training data:\n${results}\n` +
      'Answer my question using these results; they override what you remember. ' +
      'Do not mention the search, sources or URLs.'
    );
  }
  if (input.webSearchFailed) {
    return (
      '\n\n(A web search for this question failed, for example because the device is offline. ' +
      'The app already told the user that. Say what was true as of your training data, ' +
      'using words like "as of my training". Never say it is true today, and never put today\'s date on it. Keep it to two sentences.)'
    );
  }
  return '';
}

export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const { chatTemplate } = input;
  const systemBlock = buildSystemBlock(input);
  const turns: ChatMessage[] = [
    ...input.shortTermMemory,
    { role: 'user', content: input.userText + buildWebBlock(input) },
  ];
  const segments: string[] = [];

  // Models without a system role (Gemma) get the system block prepended to
  // the first user turn, the way their official chat template does it.
  let pendingSystemText = '';
  if (chatTemplate.systemMode === 'role') {
    segments.push(chatTemplate.systemPrefix + systemBlock + chatTemplate.turnSuffix);
  } else {
    pendingSystemText = systemBlock;
  }

  for (const turn of turns) {
    if (turn.role === 'assistant') {
      segments.push(chatTemplate.assistantPrefix + turn.content + chatTemplate.turnSuffix);
      continue;
    }
    if (turn.role === 'user') {
      const content = pendingSystemText ? `${pendingSystemText}\n\n${turn.content}` : turn.content;
      pendingSystemText = '';
      segments.push(chatTemplate.userPrefix + content + chatTemplate.turnSuffix);
      continue;
    }
    // 'system' and 'tool' turns: their own turn where the template has a
    // system role, otherwise rendered as a user turn.
    const prefix = chatTemplate.systemMode === 'role' ? chatTemplate.systemPrefix : chatTemplate.userPrefix;
    segments.push(prefix + turn.content + chatTemplate.turnSuffix);
  }

  segments.push(chatTemplate.assistantPrefix);

  return {
    prompt: segments.join(''),
    toolSchemas: input.toolSchemas,
  };
}

const PARTIAL_CUT_MARKER = '\u0000partial-cut\u0000';

/**
 * The beginning of the prompt `assemblePrompt` will produce once the user
 * finishes speaking: everything up to and including `input.userText` treated
 * as the (possibly partial) user turn, without the closing turn suffix and
 * assistant prefix. Fed to the native prefill while the user is still talking
 * (and with an empty userText right after loading), so the final request only
 * processes what changed.
 */
export function assemblePromptPrefix(input: AssembleInput): string {
  const { prompt } = assemblePrompt({ ...input, userText: input.userText + PARTIAL_CUT_MARKER });
  return prompt.slice(0, prompt.indexOf(PARTIAL_CUT_MARKER));
}
