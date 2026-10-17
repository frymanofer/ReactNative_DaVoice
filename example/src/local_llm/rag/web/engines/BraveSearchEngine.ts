import { clip, fetchJson, stripHtml } from '../http';
import type { WebRAGPassage, WebSearchEngine, WebSearchOptions } from '../types';

/**
 * Brave Search API (https://brave.com/search/api): independent web index.
 * Plans include monthly free credit but need a payment method on file.
 * Uses each result's description plus up to two extra snippets.
 */
export class BraveSearchEngine implements WebSearchEngine {
  readonly name = 'Brave';

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) throw new Error('Brave Search needs an API key');
  }

  async search(query: string, { maxResults, signal }: WebSearchOptions): Promise<WebRAGPassage[]> {
    const url =
      'https://api.search.brave.com/res/v1/web/search' +
      `?q=${encodeURIComponent(query)}&count=${maxResults}&extra_snippets=true`;
    const json = await fetchJson(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey.trim() },
      signal,
    });
    const now = Date.now();
    const passages: WebRAGPassage[] = [];
    for (const result of Array.isArray(json?.web?.results) ? json.web.results : []) {
      if (passages.length >= maxResults) break;
      const snippets = Array.isArray(result?.extra_snippets) ? result.extra_snippets.slice(0, 2) : [];
      const text = stripHtml([result?.description ?? '', ...snippets].join(' '));
      if (!text.trim()) continue;
      passages.push({ text: clip(text), url: String(result.url ?? ''), title: result.title, retrievedAt: now });
    }
    return passages;
  }
}
