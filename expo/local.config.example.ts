// Copy to local.config.ts (git-ignored; scripts/ensure-local-config.js creates
// it from this file when missing, e.g. on EAS) and put your own keys there.
// Never commit real keys to this template.

// Gemini, for the "AI Chat (Gemini)" mode.
export const GEMINI_API_KEY = 'your-gemini-api-key';

// Local AI Chat (all optional):
// - web search engine: 'wikipedia' (default, no key) | 'tavily' | 'brave'
// export const WEB_SEARCH_ENGINE = 'tavily';
// export const TAVILY_API_KEY = 'your-tavily-key';
// export const BRAVE_API_KEY = 'your-brave-key';
// - USDA FoodData Central for the calorie tracker's food lookup (before Wikipedia)
// export const USDA_API_KEY = 'your-usda-key';
