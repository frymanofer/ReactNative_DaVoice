const TIME_SENSITIVE_PATTERNS: RegExp[] = [
  // Temporal references
  /\b(today|yesterday|tomorrow|tonight|this\s+(morning|afternoon|evening|week|month|year)|right\s+now|currently|just\s+(happened|now)|as\s+of\s+(today|now)|at\s+the\s+moment|at\s+this\s+(point|time)|recent(ly)?|breaking|just\s+announced)\b/i,
  // Live data
  /\b(weather|temperature|forecast|price\s+(of|for)|stock\s+(price|market)|exchange\s+rate|crypto|bitcoin|ethereum|sports?\s+score|game\s+(score|result)|who\s+(won|is\s+winning))\b/i,
  // News
  /\b(news|headline|breaking|what'?s?\s+happening|in\s+the\s+news)\b/i,
  // Current office holders
  /\bwho\s+(is|are)\s+(the\s+)?(current\s+)?(president|prime\s+minister|ceo|chancellor|king|queen|pope|leader|governor|mayor)\b/i,
  // Explicit "current/latest/now" state queries
  /\bwhat\s+(is|are)\s+(the\s+)?(current|latest|today'?s?|now)\b/i,
];

export function isTimeSensitiveQuery(text: string): boolean {
  return TIME_SENSITIVE_PATTERNS.some(pattern => pattern.test(text));
}
