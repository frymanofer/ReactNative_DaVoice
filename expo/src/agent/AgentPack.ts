// The agent pack: Local AI Chat's behavior as data, in example/agent/ (the
// Flutter example ships the same files); example/agent/pt-BR/ is the same pack
// for Brazilian Portuguese (what the user hears in Portuguese, Portuguese words
// in the patterns, the same instructions to the model). agent.json holds the persona, prompt
// templates, web-search rules and filler phrases; each skill folder holds a
// skill's tools, routing rules, messages and data (skills/calories/foods.json).
// The native agent core interprets them (see LocalAgent.ts); the types below
// document their shape. Change behavior by editing the files.

import type { ToolChoice } from 'react-native-davoice-llm';

import type { AppLanguage } from '../appflow';
import { basicPackTexts } from '../car/basicLanguage';

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

export interface CaloriesSkillConfig {
  id: string;
  instructions: string;
  missingToolReply: string;
  routing: { rules: RoutingRule[]; default: ToolChoice };
  tools: ToolSpec[];
  matching: {
    foodStopWords: Pattern;
    servingWords: string[];
    notFoodWords: string[];
    lastEntry: Pattern;
    grams: Pattern;
    justCalories: Pattern;
  };
  onlineLookup: { timeoutMs: number; fillers: string[] };
  messages: Record<string, string>;
}

export interface FoodsSeed {
  version: number;
  description?: string;
  foods: Array<{ name: string; calories: number }>;
}

export interface AgentPackFiles {
  agent: AgentConfig;
  caloriesSkill: CaloriesSkillConfig;
  caloriesFoods: FoodsSeed;
}

const englishAgentPack: AgentPackFiles = {
  agent: require('../../agent/agent.json'),
  caloriesSkill: require('../../agent/skills/calories/skill.json'),
  caloriesFoods: require('../../agent/skills/calories/foods.json'),
};

const agentPacks: Partial<Record<AppLanguage, AgentPackFiles>> = {
  en: englishAgentPack,
  'pt-BR': {
    agent: require('../../agent/pt-BR/agent.json'),
    caloriesSkill: require('../../agent/pt-BR/skills/calories/skill.json'),
    caloriesFoods: require('../../agent/pt-BR/skills/calories/foods.json'),
  },
};

/** The Automotive Agent's pack (agent_automotive/: the app pack without the calorie skill, the prompt the automotive model is
 * trained with; 2026-11-10). */
const automotivePacks: Partial<Record<AppLanguage, AgentConfig>> = {
  en: require('../../agent_automotive/agent.json'),
  'pt-BR': require('../../agent_automotive/pt-BR/agent.json'),
};

/** A Basic language (src/car/basicLanguage.ts: not tuned): the English pack (the instructions the model was trained with) with the
 * sentences the user hears translated (basic_languages.json "pack"). Built once per language. */
const basicPacks: Partial<Record<AppLanguage, AgentConfig>> = {};
function basicPackFor(language: AppLanguage): AgentConfig | undefined {
  const t = basicPackTexts(language);
  if (!t || !Object.keys(t).length) return undefined;
  if (basicPacks[language]) return basicPacks[language];
  const pack = JSON.parse(JSON.stringify(automotivePacks.en)) as any;
  const str = (k: string) => (typeof t[k] === 'string' ? (t[k] as string) : undefined);
  const list = (k: string) => (Array.isArray(t[k]) ? (t[k] as string[]) : undefined);
  pack.prompts = pack.prompts ?? {};
  // "ok" is said in every language: the English "Okay!" (fixed reply "ack", 2026-11-21) is for the tuned languages only
  if (Array.isArray(pack.fixedReplies)) pack.fixedReplies = pack.fixedReplies.filter((r: any) => r?.id !== 'ack');
  for (const k of ['noReply', 'notDoneRest', 'done', 'failed', 'notConfirmed', 'notAuthorized', 'unsupported', 'invalidArgs', 'guardConflict',
    'outOfRange', 'outOfRangeAsk', 'scopeClarify', 'scopeUnsupported', 'scopeNoRemote']) {
    if (str(k)) pack.prompts[k] = str(k);
  }
  if (pack.remote) {
    if (str('remoteFailed')) pack.remote.failed = str('remoteFailed');
    pack.remote.errors = {
      ...(pack.remote.errors ?? {}),
      ...(str('remoteOffline') ? { offline: str('remoteOffline') } : {}),
      ...(str('remoteBusy') ? { busy: str('remoteBusy') } : {}),
      ...(str('remoteTimeout') ? { timeout: str('remoteTimeout') } : {}),
      ...(str('remoteUnavailable') ? { unavailable: str('remoteUnavailable') } : {}),
    };
    if (list('remoteFillers')) pack.remote.fillers = list('remoteFillers');
  }
  if (list('remoteFillers')) pack.onlineToolFillers = list('remoteFillers');
  if (pack.webSearch?.fillers) {
    if (list('searchFillers')) pack.webSearch.fillers.general = list('searchFillers');
    if (list('searchFailed')) pack.webSearch.fillers.searchFailed = list('searchFailed');
    pack.webSearch.fillers.topics = [];   // topic fillers are English sentences
  }
  basicPacks[language] = pack as AgentConfig;
  return basicPacks[language];
}

export function automotiveAgentFor(language: AppLanguage): AgentConfig {
  return automotivePacks[language] ?? basicPackFor(language) ?? automotivePacks.en!;
}

/** The agent pack of the app's language. */
export function agentPackFor(language: AppLanguage): AgentPackFiles {
  // Translated agent data is currently available for English and pt-BR. The
  // language instruction still makes every supported language reply in the
  // selected language while the shared skill data remains English.
  return agentPacks[language] ?? englishAgentPack;
}
