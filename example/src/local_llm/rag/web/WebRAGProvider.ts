/**
 * Web search for Local AI Chat's time-sensitive questions, with a replaceable
 * search engine.
 *
 * Built in: Wikipedia (default, free, no key), Tavily and Brave (API keys).
 * Any other search API works too: implement `WebSearchEngine` (see types.ts)
 * and pass it as `engine`.
 *
 *   configureWebSearch();                                          // Wikipedia
 *   configureWebSearch({ engine: 'tavily', tavilyApiKey });        // Tavily
 *   configureWebSearch({ engine: 'brave', braveApiKey });          // Brave
 *   configureWebSearch({ engine: myEngine });                      // your own
 *
 * Keys never live in this file: the demo app reads them from the git-ignored
 * local.config.ts, like GEMINI_API_KEY.
 */
import { BraveSearchEngine } from './engines/BraveSearchEngine';
import { TavilySearchEngine } from './engines/TavilySearchEngine';
import { WikipediaSearchEngine } from './engines/WikipediaSearchEngine';
import type { WebRAGPassage, WebSearchEngine } from './types';

export type { WebRAGPassage, WebSearchEngine, WebSearchOptions } from './types';
export { BraveSearchEngine, TavilySearchEngine, WikipediaSearchEngine };

export type BuiltInWebSearchEngine = 'wikipedia' | 'tavily' | 'brave';

export interface WebSearchConfig {
  /** A built-in engine's id or your own engine. Default 'wikipedia'. */
  engine?: BuiltInWebSearchEngine | WebSearchEngine;
  tavilyApiKey?: string;
  braveApiKey?: string;
  /** Try Wikipedia when the engine fails or finds nothing. Default true. */
  fallbackToWikipedia?: boolean;
  /** Passages per search. Default 3; small models answer best from 1–3. */
  maxResults?: number;
  /** Per-engine time limit. Default 5000 ms. */
  timeoutMs?: number;
}

export interface WebRAGProvider {
  isAvailable(): boolean;
  /** Name of the engine that produced the last successful result. */
  readonly lastSource: string;
  search(query: string): Promise<WebRAGPassage[]>;
}

const wikipedia = new WikipediaSearchEngine();
let engine: WebSearchEngine = wikipedia;
let fallbackToWikipedia = true;
let maxResults = 3;
let timeoutMs = 5000;
let lastSource = wikipedia.name;

/** Builds a built-in engine; throws if its API key is missing. */
export function createWebSearchEngine(
  id: BuiltInWebSearchEngine,
  keys: { tavilyApiKey?: string; braveApiKey?: string } = {},
): WebSearchEngine {
  switch (id) {
    case 'wikipedia':
      return wikipedia;
    case 'tavily':
      return new TavilySearchEngine(keys.tavilyApiKey ?? '');
    case 'brave':
      return new BraveSearchEngine(keys.braveApiKey ?? '');
    default:
      throw new Error(`Unknown web search engine "${String(id)}"`);
  }
}

/**
 * Chooses the search engine. Call once at startup; calling again replaces the
 * previous settings. A built-in engine whose key is missing falls back to
 * Wikipedia with a warning, so the app still works.
 */
export function configureWebSearch(config: WebSearchConfig = {}): void {
  fallbackToWikipedia = config.fallbackToWikipedia ?? true;
  maxResults = Math.max(1, config.maxResults ?? 3);
  timeoutMs = Math.max(500, config.timeoutMs ?? 5000);
  const choice = config.engine ?? 'wikipedia';
  if (typeof choice !== 'string') {
    engine = choice;
    return;
  }
  try {
    engine = createWebSearchEngine(choice, config);
  } catch (error) {
    console.log(`[LocalLLM] web search engine "${choice}" unavailable (${String(error)}); using Wikipedia`);
    engine = wikipedia;
  }
}

/** The engine `configureWebSearch` selected. */
export function getWebSearchEngine(): WebSearchEngine {
  return engine;
}

async function runEngine(searchEngine: WebSearchEngine, query: string): Promise<WebRAGPassage[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const passages = await searchEngine.search(query, { maxResults, signal: controller.signal });
    return passages.slice(0, maxResults);
  } finally {
    clearTimeout(timer);
  }
}

export const webRAGProvider: WebRAGProvider = {
  isAvailable: () => true,
  get lastSource() {
    return lastSource;
  },
  /** Searches with the configured engine, then Wikipedia if allowed. Throws
   * only when every engine tried failed. */
  search: async (query: string) => {
    let firstError: unknown;
    try {
      const passages = await runEngine(engine, query);
      if (passages.length > 0 || engine === wikipedia || !fallbackToWikipedia) {
        lastSource = engine.name;
        return passages;
      }
    } catch (error) {
      firstError = error;
      console.log(`[LocalLLM] ${engine.name} search failed:`, String(error));
      if (engine === wikipedia || !fallbackToWikipedia) throw error;
    }
    try {
      const passages = await runEngine(wikipedia, query);
      lastSource = wikipedia.name;
      return passages;
    } catch (error) {
      throw firstError ?? error;
    }
  },
};
