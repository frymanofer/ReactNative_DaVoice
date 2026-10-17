import { clip, fetchJson } from '../http';
import type { WebRAGPassage, WebSearchEngine, WebSearchOptions } from '../types';

/**
 * Tavily (https://tavily.com): web search made for LLMs. Free plan: 1,000
 * searches a month, no credit card. Returns Tavily's short answer first, then
 * the top results' content.
 */
export class TavilySearchEngine implements WebSearchEngine {
  readonly name = 'Tavily';

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) throw new Error('Tavily needs an API key');
  }

  async search(query: string, { maxResults, signal }: WebSearchOptions): Promise<WebRAGPassage[]> {
    const json = await fetchJson('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey.trim()}` },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: maxResults, include_answer: true }),
      signal,
    });
    const now = Date.now();
    const passages: WebRAGPassage[] = [];
    if (typeof json?.answer === 'string' && json.answer.trim()) {
      passages.push({ text: clip(json.answer), url: 'https://tavily.com', title: 'Tavily answer', retrievedAt: now });
    }
    for (const result of Array.isArray(json?.results) ? json.results : []) {
      if (passages.length >= maxResults) break;
      if (typeof result?.content !== 'string' || !result.content.trim()) continue;
      passages.push({ text: clip(result.content), url: String(result.url ?? ''), title: result.title, retrievedAt: now });
    }
    return passages;
  }
}
