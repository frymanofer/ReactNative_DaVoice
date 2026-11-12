import RNFS from 'react-native-fs';
import type { AppLanguage } from '../appflow';

import { BUNDLED_LANGUAGES, LANGUAGE_FILES, LANGUAGE_PACK_BASE_URL, type LanguagePackFile, type LanguagePackFiles } from './languagePacks.generated';

// Language packs (2026-11-12): language_packs.json (example root) says which languages are built into the
// app ("bundled", default English + Brazilian Portuguese) and where the others are downloaded from
// ("baseUrl"/<file>); scripts/generate-language-packs.js turns it into languagePacks.generated.ts (Metro
// runs it on every bundle). A downloaded language's TTS model + voice-cloning embedder are fetched the
// first time the language is chosen (sha256 checked); src/tts/index.ts then uses the downloaded files.

type PackFile = LanguagePackFile;
export type LanguagePack = LanguagePackFiles;

/** The languages that are downloaded (in the config, not bundled). */
export const LANGUAGE_PACKS: Partial<Record<AppLanguage, LanguagePack>> = Object.fromEntries(
  Object.entries(LANGUAGE_FILES).filter(([id]) => !BUNDLED_LANGUAGES.includes(id as AppLanguage)),
);

/** True when `language` is not bundled and comes as a downloaded language pack. */
export function isDownloadableLanguage(language: AppLanguage): boolean {
  return LANGUAGE_PACKS[language] != null;
}

export function languagePackSizeBytes(language: AppLanguage): number {
  const pack = LANGUAGE_PACKS[language];
  return pack ? pack.model.sizeBytes + pack.embedder.sizeBytes : 0;
}

function packDir(language: AppLanguage): string {
  return `${RNFS.DocumentDirectoryPath}/language_packs/${language}`;
}

function filePath(language: AppLanguage, file: PackFile): string {
  return `${packDir(language)}/${file.filename}`;
}

// Languages whose files were found complete on disk (getTTSVoiceConfig / getVoiceEmbedder are synchronous).
const readyLanguages = new Set<AppLanguage>();

/** Checks the files on disk (existence + exact size; sha256 was checked when they were downloaded). */
export async function isLanguagePackReady(language: AppLanguage): Promise<boolean> {
  const pack = LANGUAGE_PACKS[language];
  if (!pack) return true; // bundled
  for (const file of [pack.model, pack.embedder]) {
    const path = filePath(language, file);
    if (!(await RNFS.exists(path))) {
      readyLanguages.delete(language);
      return false;
    }
    const stat = await RNFS.stat(path);
    if (Number(stat.size) !== file.sizeBytes) {
      readyLanguages.delete(language);
      return false;
    }
  }
  readyLanguages.add(language);
  return true;
}

/** The downloaded file's absolute path (the speech library takes plain paths), or null if the pack isn't ready. */
export function languagePackFilePath(language: AppLanguage, kind: 'model' | 'embedder'): string | null {
  const pack = LANGUAGE_PACKS[language];
  if (!pack || !readyLanguages.has(language)) return null;
  return filePath(language, pack[kind]);
}

export type LanguagePackProgress = {
  stage: 'download' | 'verify';
  bytesDone: number;
  bytesTotal: number;
};

type InFlight = { promise: Promise<void>; cancel: () => void };
const inFlight = new Map<AppLanguage, InFlight>();
const listeners = new Map<AppLanguage, Set<(p: LanguagePackProgress) => void>>();

/** Stops a running download (the partial file is removed; the next download starts over). */
export function cancelLanguagePackDownload(language: AppLanguage): void {
  inFlight.get(language)?.cancel();
}

/**
 * Downloads `language`'s pack if it isn't on disk yet; concurrent callers join the same download.
 * Rejects with a readable message (no URL yet, no space, HTTP error, checksum mismatch, cancelled).
 */
export function downloadLanguagePack(
  language: AppLanguage,
  onProgress?: (progress: LanguagePackProgress) => void,
): Promise<void> {
  if (onProgress) {
    if (!listeners.has(language)) listeners.set(language, new Set());
    listeners.get(language)!.add(onProgress);
  }
  const existing = inFlight.get(language);
  if (existing) return existing.promise;

  let cancelled = false;
  let jobId: number | null = null;
  const emit = (p: LanguagePackProgress) => listeners.get(language)?.forEach((listener) => listener(p));
  const run = async () => {
    const pack = LANGUAGE_PACKS[language];
    if (!pack) return;
    if (await isLanguagePackReady(language)) return;
    if (!LANGUAGE_PACK_BASE_URL) {
      throw new Error('This language pack is not available yet (its download address is not set in the app).');
    }
    const files = [pack.model, pack.embedder];
    const bytesTotal = files.reduce((sum, f) => sum + f.sizeBytes, 0);
    const dir = packDir(language);
    if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);

    // Room for the files plus a margin (the files already on disk count as done).
    let missingBytes = 0;
    for (const file of files) {
      const path = filePath(language, file);
      const ok = (await RNFS.exists(path)) && Number((await RNFS.stat(path)).size) === file.sizeBytes;
      if (!ok) missingBytes += file.sizeBytes;
    }
    const { freeSpace } = await RNFS.getFSInfo();
    if (freeSpace < missingBytes + 100 * 1024 * 1024) {
      throw new Error(
        `Not enough free space: ${Math.ceil(missingBytes / 1e6)} MB needed, ${Math.floor(freeSpace / 1e6)} MB free.`,
      );
    }

    let bytesBefore = 0;
    for (const file of files) {
      const dest = filePath(language, file);
      if ((await RNFS.exists(dest)) && Number((await RNFS.stat(dest)).size) === file.sizeBytes) {
        bytesBefore += file.sizeBytes;
        emit({ stage: 'download', bytesDone: bytesBefore, bytesTotal });
        continue;
      }
      if (cancelled) throw new Error('Download cancelled.');
      const tmp = `${dest}.download`;
      await RNFS.unlink(tmp).catch(() => undefined);
      const job = RNFS.downloadFile({
        fromUrl: `${LANGUAGE_PACK_BASE_URL}/${file.filename}`,
        toFile: tmp,
        begin: () => {}, // iOS reports progress only with a begin handler (see ModelManager.ts)
        progress: (res) => emit({ stage: 'download', bytesDone: bytesBefore + res.bytesWritten, bytesTotal }),
        progressInterval: 100,
      });
      jobId = job.jobId;
      let result;
      try {
        result = await job.promise;
      } catch (e) {
        await RNFS.unlink(tmp).catch(() => undefined);
        throw cancelled ? new Error('Download cancelled.') : e;
      } finally {
        jobId = null;
      }
      if (cancelled) {
        await RNFS.unlink(tmp).catch(() => undefined);
        throw new Error('Download cancelled.');
      }
      if (result.statusCode !== 200) {
        await RNFS.unlink(tmp).catch(() => undefined);
        throw new Error(`Download failed: HTTP ${result.statusCode} for ${file.filename}.`);
      }
      bytesBefore += file.sizeBytes;
      emit({ stage: 'verify', bytesDone: bytesBefore, bytesTotal });
      const hash = (await RNFS.hash(tmp, 'sha256')).toLowerCase();
      if (hash !== file.sha256) {
        await RNFS.unlink(tmp).catch(() => undefined);
        throw new Error(`Download failed: ${file.filename} is damaged (checksum mismatch). Please retry.`);
      }
      await RNFS.unlink(dest).catch(() => undefined);
      await RNFS.moveFile(tmp, dest);
    }
    if (!(await isLanguagePackReady(language))) {
      throw new Error('Download failed: the language pack is incomplete. Please retry.');
    }
  };

  const promise = run().finally(() => {
    inFlight.delete(language);
    listeners.delete(language);
  });
  inFlight.set(language, {
    promise,
    cancel: () => {
      cancelled = true;
      if (jobId != null) RNFS.stopDownload(jobId);
    },
  });
  return promise;
}

/** Removes a downloaded language pack (it is downloaded again the next time the language is chosen). */
export async function deleteLanguagePack(language: AppLanguage): Promise<void> {
  readyLanguages.delete(language);
  const dir = packDir(language);
  if (await RNFS.exists(dir)) await RNFS.unlink(dir);
}
