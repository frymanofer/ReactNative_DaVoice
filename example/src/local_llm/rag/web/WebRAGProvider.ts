/**
 * Interface + stub for fetching fresh info from the web. No search API has
 * been chosen yet, so this never imports from local.config.ts directly
 * (avoids assuming a WEB_SEARCH_API_KEY export exists there — that file is
 * git-ignored, per-developer, and not something to edit speculatively).
 * Instead the app calls `configure()` once it has picked a provider and a
 * key, following the same "secret lives in local.config.ts, never
 * hardcoded" pattern already used for GEMINI_API_KEY in src/aichat/index.ts.
 */

export interface WebRAGPassage {
  text: string;
  url: string;
  retrievedAt: number;
}

export interface WebRAGProvider {
  isAvailable(): boolean;
  search(query: string): Promise<WebRAGPassage[]>;
}

let configuredApiKey: string | undefined;

export function configure(apiKey: string | undefined): void {
  configuredApiKey = apiKey;
}

export const webRAGProvider: WebRAGProvider = {
  isAvailable: () => !!configuredApiKey,
  search: async (_query: string) => {
    if (!configuredApiKey) return [];
    // TODO: no search API chosen yet — wire one in once configure() has a
    // real key to work with.
    return [];
  },
};
