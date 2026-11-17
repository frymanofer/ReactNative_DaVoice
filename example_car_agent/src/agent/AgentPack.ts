// The agent pack: the car agent's behavior as data, in agent_automotive/ (English) and agent_automotive/pt-BR/
// (Brazilian Portuguese: what the user hears in Portuguese, Portuguese words in the patterns, the same instructions to
// the model). agent.json holds the persona, prompt templates and messages. The native agent core interprets it (see
// LocalAgent.ts); the types below document its shape. Change behavior by editing the files.

import type { ToolChoice } from 'react-native-davoice-llm';

import type { AppLanguage } from '../appflow';

/** Regex patterns are strings, matched case-insensitively. */
type Pattern = string;

export interface AgentConfig {
  version: number;
  persona: { systemPrompt: string };
  prompts: { currentDate: string; webResults: string; webResultLine: string; webSearchFailed: string };
  webSearch: {
    rules: {
      timeWords: Pattern;
      newsy: Pattern;
      recentYear: Pattern;
      whoRuns: Pattern;
      officeWords: Pattern;
      whoQuestion: Pattern;
      yesNoQuestion: Pattern;
      asksWho: Pattern;
    };
    officePages: {
      fixed: Array<{ pattern: Pattern; page: string }>;
      offices: Array<{ pattern: Pattern; title: string }>;
      places: Array<{ pattern: Pattern; name: string }>;
      whoRunsPages: Record<string, string>;
      placeAfterOf: Pattern;
      defaultPlaces: Record<string, string>;
      neutralQuestion: string;
    };
    fillers: {
      topicProbability: number;
      general: string[];
      topics: Array<{ pattern: Pattern; fillers: string[] }>;
      searchFailed: string[];
    };
  };
  onlineToolFillers: string[];
}

/** A routing rule matches when every `all` pattern matches, at least one
 * `any` pattern matches (if given) and no `none` pattern matches. */
export interface RoutingRule {
  comment?: string;
  all?: Pattern[];
  any?: Pattern[];
  none?: Pattern[];
  choice: ToolChoice;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** The Automotive Agent's pack (agent_automotive/: the app pack without the calorie skill, the prompt the automotive model is
 * trained with; 2026-11-10). */
const automotivePacks: Partial<Record<AppLanguage, AgentConfig>> = {
  en: require('../../agent_automotive/agent.json'),
  'pt-BR': require('../../agent_automotive/pt-BR/agent.json'),
};

export function automotiveAgentFor(language: AppLanguage): AgentConfig {
  return automotivePacks[language] ?? automotivePacks.en!;
}
