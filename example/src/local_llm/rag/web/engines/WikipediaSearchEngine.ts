import { clip, fetchJson } from '../http';
import type { WebRAGPassage, WebSearchEngine, WebSearchOptions } from '../types';

// Wikimedia asks API clients to identify themselves and rate-limits generic
// clients more aggressively.
const CLIENT_ID = 'DaVoiceDemo/1.0 (https://davoice.io; info@davoice.io)';
const HEADERS = { 'Api-User-Agent': CLIENT_ID, 'User-Agent': CLIENT_ID };
const API = 'https://en.wikipedia.org/w/api.php?format=json&origin=*';

const STOP_WORDS = new Set(
  "who what when where which why how is are was were the a an of in on at to for and or do does did current currently now today right latest who's what's tell me please".split(' '),
);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/** The sentences of `extract` most relevant to `query`, favoring ones that
 * say who or what is current, and their combined relevance score. */
function bestSentences(extract: string, query: string, count = 2): { text: string; score: number } {
  const words = keywords(query).map((word) => new RegExp(`\\b${word}`, 'i'));
  const sentences = extract.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  const scored = sentences.map((sentence, index) => {
    let score = words.reduce((sum, word) => sum + (word.test(sentence) ? 1 : 0), 0);
    if (/\b(current|currently|incumbent|serving as|as of)\b/i.test(sentence)) score += 2;
    if (/\b20(2[4-9]|[3-9]\d)\b/.test(sentence)) score += 1.5;
    if (index === 0) score += 0.5;
    return { sentence, index, score };
  });
  const best = scored.sort((a, b) => b.score - a.score).slice(0, count);
  return {
    text: best.sort((a, b) => a.index - b.index).map((s) => s.sentence).join(' '),
    score: best.reduce((max, s) => Math.max(max, s.score), 0),
  };
}

/**
 * Wikipedia: free, no key. Good for "who currently holds this office"
 * questions (article introductions name the current holder); no news, prices
 * or weather. Returns the best page's two most relevant sentences: a second
 * page is usually noise that confuses a small model (a former office holder,
 * or "Apple Corps" for Apple's CEO).
 */
export class WikipediaSearchEngine implements WebSearchEngine {
  readonly name = 'Wikipedia';

  async search(query: string, { signal }: WebSearchOptions): Promise<WebRAGPassage[]> {
    const found = await fetchJson(
      `${API}&action=query&list=search&srlimit=3&srsearch=${encodeURIComponent(keywords(query).join(' ') || query)}`,
      { headers: HEADERS, signal },
    );
    const titles: string[] = (found?.query?.search ?? []).map((r: any) => String(r.title));
    if (titles.length === 0) return [];
    const pages = await fetchJson(
      `${API}&action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(titles.join('|'))}`,
      { headers: HEADERS, signal },
    );
    const now = Date.now();
    const candidates = Object.values<any>(pages?.query?.pages ?? {})
      .filter((page) => typeof page?.extract === 'string' && page.extract.trim())
      .map((page) => {
        const best = bestSentences(page.extract, query);
        return {
          score: best.score,
          passage: {
            text: clip(best.text),
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`,
            title: String(page.title),
            retrievedAt: now,
          },
        };
      })
      .sort((a, b) => b.score - a.score);
    return candidates.slice(0, 1).map((c) => c.passage);
  }
}
