export interface PersonaConfig {
  id: string;
  systemPromptFragment: string;
}

// This is local_llm.md's Stage 8 "voice system prompt", relocated here as the
// persona layer's first (and currently only) real, finalized persona — not a
// stub. PromptAssembler.ts composes this with the model pack's
// defaultSystemPromptTemplate and the user's profile/preferences.
export const VOICE_ASSISTANT_PERSONA: PersonaConfig = {
  id: 'voice-assistant-default',
  systemPromptFragment:
    'You are a helpful voice assistant. Keep all answers under four sentences. ' +
    'Do not use markdown, bullet points, or numbered lists. ' +
    'Do not begin a sentence with "Certainly" or "Of course". ' +
    'Spell out abbreviations when reading aloud.',
};

export const LOCAL_LLM_PERSONAS: Record<string, PersonaConfig> = {
  [VOICE_ASSISTANT_PERSONA.id]: VOICE_ASSISTANT_PERSONA,
};
