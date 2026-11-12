// Every app language must get a TTS model, a speed and a voice-cloning encoder (2026-11-12: a lost constant made every
// non-English voice throw, and no test covered it). Downloaded language packs are faked as "on disk".
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  exists: jest.fn(async () => true),
  stat: jest.fn(async (path: string) => ({ size: mockSizes[path.split('/').pop() as string] })),
}));
const mockSizes: Record<string, number> = {};

import { APP_LANGUAGES } from '../src/appflow';
import { getTTSVoiceConfig, getVoiceEmbedder, setTTSLanguage } from '../src/tts';
import { isDownloadableLanguage, isLanguagePackReady, LANGUAGE_PACKS } from '../src/tts/languagePacks';

beforeAll(() => {
  for (const pack of Object.values(LANGUAGE_PACKS)) {
    mockSizes[pack!.model.filename] = pack!.model.sizeBytes;
    mockSizes[pack!.embedder.filename] = pack!.embedder.sizeBytes;
  }
});

describe('TTS files per language', () => {
  for (const { id, hidden } of APP_LANGUAGES.filter((language) => !language.hidden)) {
    test(`${id}: model, speed and embedder`, async () => {
      expect(hidden).toBeFalsy();
      if (isDownloadableLanguage(id)) expect(await isLanguagePackReady(id)).toBe(true);
      setTTSLanguage(id);
      const config = getTTSVoiceConfig('Rich', false);
      expect(config.model).toBeTruthy();
      expect(Number.isFinite(config.speed)).toBe(true);
      expect(getVoiceEmbedder()).toBeTruthy();
      if (isDownloadableLanguage(id)) {
        expect(String(config.model)).toBe(`/docs/language_packs/${id}/${LANGUAGE_PACKS[id]!.model.filename}`);
        expect(String(getVoiceEmbedder())).toBe(`/docs/language_packs/${id}/${LANGUAGE_PACKS[id]!.embedder.filename}`);
      }
    });
  }

  test('pt-BR is built in and speaks at the Brazilian speed', () => {
    setTTSLanguage('pt-BR');
    expect(isDownloadableLanguage('pt-BR')).toBe(false);
    expect(getTTSVoiceConfig('Rich', false).speed).toBe(1.0);
  });
});
