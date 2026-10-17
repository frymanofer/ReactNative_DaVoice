/** A short piece of text a web search returned, ready to go into the prompt. */
export interface WebRAGPassage {
  text: string;
  url: string;
  title?: string;
  retrievedAt: number;
}

export interface WebSearchOptions {
  /** Upper bound on passages to return. Small models answer best from 1–3. */
  maxResults: number;
  /** Aborted when the search takes too long; pass it to `fetch`. */
  signal: AbortSignal;
}

/**
 * A search backend for Local AI Chat's time-sensitive questions. Implement this
 * to use any search API (Bing, SerpAPI, Exa, your own server...) and pass the
 * object to `configureWebSearch({ engine })`.
 *
 * Return short plain-text passages (no HTML, a few hundred characters each),
 * most relevant first. Throw on failure; the caller falls back to Wikipedia or
 * tells the user it couldn't search.
 */
export interface WebSearchEngine {
  /** Shown in the app's status line and logs, e.g. "Wikipedia". */
  readonly name: string;
  search(query: string, options: WebSearchOptions): Promise<WebRAGPassage[]>;
}
