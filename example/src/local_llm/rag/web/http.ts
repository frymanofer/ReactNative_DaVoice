// Small helpers shared by the search engines.

/** Max characters per passage: enough for a fact, short enough for a 1.5B model. */
export const MAX_PASSAGE_CHARS = 450;

export async function fetchJson(url: string, init: RequestInit & { signal: AbortSignal }): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
}

/** Collapses whitespace and cuts at a word boundary. */
export function clip(text: string, maxChars = MAX_PASSAGE_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars).replace(/\s+\S*$/, '')}...`;
}

/** Removes HTML tags and decodes the common entities search APIs return. */
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
