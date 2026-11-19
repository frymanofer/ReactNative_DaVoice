import { APP_LANGUAGES, SV_ONBOARDING_SAMPLE_COUNT } from '../src/appflow';
import { ENROLLMENT_SENTENCE_LANGUAGES, enrollmentSentences } from '../src/speaker_verification/enrollmentSentences';

describe('voice signature sentences', () => {
  it('has its own sentences for every language of the app', () => {
    for (const { id } of APP_LANGUAGES) {
      expect(ENROLLMENT_SENTENCE_LANGUAGES).toContain(id);
    }
  });

  it.each(APP_LANGUAGES.map((entry) => entry.id))('%s: one sentence per sample, the first with the wake phrase', (language) => {
    const sentences = enrollmentSentences(language, 'Hey Coach');
    expect(sentences).toHaveLength(SV_ONBOARDING_SAMPLE_COUNT);
    expect(new Set(sentences).size).toBe(sentences.length);
    expect(sentences[0].startsWith('Hey Coach, ')).toBe(true);
    for (const sentence of sentences) {
      expect(sentence).not.toContain('{wake}');
      expect(sentence.trim()).toBe(sentence);
      expect(sentence.length).toBeGreaterThan(15);
      expect(/[.?;]$/.test(sentence)).toBe(true);
    }
    // The last sentence is the long one.
    expect(sentences[4].length).toBeGreaterThan(sentences[1].length);
  });

  it('shows the requested English sentences', () => {
    expect(enrollmentSentences('en', 'Hey Coach')).toEqual([
      'Hey Coach, Please send a message to my friend.',
      "How's the weather going to be today?",
      'Please set a timer for three minutes.',
      'Can you play some music for me?',
      'Every morning, I enjoy a fresh cup of coffee while watching the beautiful sunrise.',
    ]);
  });

  it('uses English for an unknown language', () => {
    expect(enrollmentSentences(null, 'Hey Coach')[1]).toBe("How's the weather going to be today?");
  });
});
