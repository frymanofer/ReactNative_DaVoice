import RNFS from 'react-native-fs';
import { Agent } from 'react-native-davoice-llm';
import type { AgentConfig, AgentEvent } from 'react-native-davoice-llm';

import { agentConfig, caloriesFoodsSeed, caloriesSkill } from './AgentPack';
// Local AI Chat's web search engine and API keys, from the git-ignored
// local.config.ts: WEB_SEARCH_ENGINE = 'wikipedia' (default, no key) |
// 'tavily' | 'brave', plus TAVILY_API_KEY / BRAVE_API_KEY; USDA_API_KEY for
// the calorie demo's food lookup. All optional.
import * as LocalConfig from '../../local.config';

// Local AI Chat's assistant: the shared native agent core (the same one the
// Flutter example uses), driven by the agent pack in example/agent/. It
// decides when to search the web, says fillers while waiting, routes calorie
// requests to the tracker's tools, builds the prompt and runs the model. The
// calorie log and food list live in its SQLite database.

const config = LocalConfig as {
  WEB_SEARCH_ENGINE?: 'wikipedia' | 'tavily' | 'brave';
  TAVILY_API_KEY?: string;
  BRAVE_API_KEY?: string;
  USDA_API_KEY?: string;
};

function agentSettings(): AgentConfig {
  const usdaApiKey = config.USDA_API_KEY?.trim();
  return {
    pack: {
      agent: agentConfig,
      skills: [{ skill: caloriesSkill, data: { 'foods.json': caloriesFoodsSeed } }],
    },
    databasePath: `${RNFS.DocumentDirectoryPath}/davoice_agent.db`,
    webSearch: {
      engine: config.WEB_SEARCH_ENGINE ?? 'wikipedia',
      tavilyApiKey: config.TAVILY_API_KEY,
      braveApiKey: config.BRAVE_API_KEY,
    },
    // Foods missing from the list are looked up on Wikipedia, and first on
    // USDA FoodData Central when USDA_API_KEY is set.
    skillSettings: {
      calories: {
        sources: usdaApiKey ? [{ type: 'usda', apiKey: usdaApiKey }, { type: 'wikipedia' }] : [{ type: 'wikipedia' }],
      },
    },
  };
}

const listeners = new Set<(event: AgentEvent) => void>();
let agentPromise: Promise<Agent> | null = null;

/** The app's one agent, created on first use. */
export function getLocalAgent(): Promise<Agent> {
  agentPromise ??= Agent.create(agentSettings(), {
    onEvent: (event) => {
      if (event.type === 'log') console.log(`[DavoiceAgent] ${event.level}: ${event.message}`);
      for (const listener of [...listeners]) listener(event);
    },
  }).catch((error) => {
    agentPromise = null;
    throw error;
  });
  return agentPromise;
}

/** Every agent event (e.g. the calorie log's `skill` changes); returns an
 * unsubscribe function. */
export function onLocalAgentEvent(listener: (event: AgentEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
