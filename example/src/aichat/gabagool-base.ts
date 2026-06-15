/**
 * Gabagool base-URL resolver for DaVoice.
 *
 * Drop this file at example/src/aichat/gabagool-base.ts inside ReactNative_DaVoice,
 * then apply adapters/davoice/index.ts.patch to example/src/aichat/index.ts.
 *
 * Behaviour:
 *   - Pings the local Gabagool sidecar on first call; result cached 30 s.
 *   - If reachable, requests route through Gabagool (which augments + forwards
 *     to the configured upstream provider).
 *   - If unreachable, requests go directly to Gemini exactly as before.
 *
 * Configuration lives in example/local.config.ts. All fields are optional:
 *   GABAGOOL_URL       default 'http://localhost:8788'
 *   GABAGOOL_PROVIDER  default 'google'   ('google' | 'anthropic' | 'openai')
 *   GABAGOOL_MODEL     reserved for future per-provider model overrides
 */

import {
  GABAGOOL_URL,
  GABAGOOL_PROVIDER,
} from '../../local.config';

export const GABAGOOL_BASE = GABAGOOL_URL ?? 'http://localhost:8788';
export const DIRECT_GEMINI_BASE = 'https://generativelanguage.googleapis.com';
export const PROVIDER: 'google' | 'anthropic' | 'openai' =
  (GABAGOOL_PROVIDER as any) ?? 'google';

const HEALTH_TIMEOUT_MS = 1000;
const CHECK_TTL_MS = 30_000;

let cached: boolean | null = null;
let lastCheckMs = 0;

async function pingGabagool(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${GABAGOOL_BASE}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function isGabagoolAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cached !== null && now - lastCheckMs < CHECK_TTL_MS) {
    return cached;
  }
  cached = await pingGabagool();
  lastCheckMs = now;
  return cached;
}

export async function resolveBase(): Promise<string> {
  return (await isGabagoolAvailable()) ? GABAGOOL_BASE : DIRECT_GEMINI_BASE;
}

export function isGabagoolBase(base: string): boolean {
  return base === GABAGOOL_BASE;
}

export function gabagoolProviderHeader(base: string): Record<string, string> {
  if (isGabagoolBase(base) && PROVIDER !== 'google') {
    return { 'X-Gabagool-Provider': PROVIDER };
  }
  return {};
}

/**
 * Force the next isGabagoolAvailable() call to re-check. Used by the
 * fail-open retry path inside generateGeminiReply: if a request through
 * the gateway returns non-2xx, we mark it down and retry direct.
 */
export function markGabagoolDown(): void {
  cached = false;
  lastCheckMs = Date.now();
}
