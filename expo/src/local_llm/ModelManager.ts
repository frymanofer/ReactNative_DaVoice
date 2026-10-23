import RNFS from 'react-native-fs';
import type { LocalLLMModelConfig, ModelId } from './types';
import { LOCAL_LLM_STORAGE_DIR } from './constants';

// Real download/cache logic (same RNFS.downloadFile pattern already
// documented for this feature in local_llm.md's Stage 4) — only the actual
// URLs come from the model registry (ModelRegistry.ts). Downloads land under the
// app's documents directory, never inside the app bundle: the GGUF must
// never ship in the binary (~1-5GB) and must never be committed to any repo.

function modelsDir(): string {
  return `${RNFS.DocumentDirectoryPath}/${LOCAL_LLM_STORAGE_DIR}/models`;
}

export function getModelPath(model: LocalLLMModelConfig): string {
  return `${modelsDir()}/${model.filename}`;
}

export async function isModelDownloaded(model: LocalLLMModelConfig): Promise<boolean> {
  return RNFS.exists(getModelPath(model));
}

export async function deleteModel(model: LocalLLMModelConfig): Promise<void> {
  const path = getModelPath(model);
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }
}

/**
 * In-flight download per model id, so concurrent callers join the same
 * transfer instead of starting a second one to the same destination file.
 *
 * A naive `if (await RNFS.exists(dest)) return;` guard (still present below,
 * as the cheap common-case fast path) is not enough on its own: two callers
 * can both pass that check — file not there yet — before either has started
 * writing, and both then call `RNFS.downloadFile` against the same `dest`.
 * Concurrent writers streaming into one destination corrupt it. This is the
 * same "load/download at most once" fix documented for `LocalLLMLoader.ts`'s
 * `ensureModelLoaded`, applied one layer down to the download itself (see the
 * AmigoLocal `loadModel`/`modelLoadRef` writeup in memory for the reference
 * case this pattern is copied from).
 */
const inFlightDownloads = new Map<ModelId, Promise<void>>();

/**
 * Downloads the GGUF for `model` if it isn't already cached. Deliberately
 * does NOT delete a different, already-downloaded model variant — see
 * "storage" note in the scaffolding plan: the default policy (keep at most
 * one GGUF resident) belongs in the app-flow code that calls this, not here,
 * so a caller that wants to keep both variants around can.
 */
export async function downloadModel(
  model: LocalLLMModelConfig,
  onProgress?: (fractionComplete: number) => void,
): Promise<void> {
  const existing = inFlightDownloads.get(model.id);
  if (existing) return existing;

  const download = downloadModelOnce(model, onProgress).finally(() => {
    // Always clear, success or failure: a completed download shouldn't stay
    // "in flight" (the isModelDownloaded()/exists() fast path takes over),
    // and a failed one must be retryable.
    inFlightDownloads.delete(model.id);
  });
  inFlightDownloads.set(model.id, download);
  return download;
}

async function downloadModelOnce(
  model: LocalLLMModelConfig,
  onProgress?: (fractionComplete: number) => void,
): Promise<void> {
  const dir = modelsDir();
  const dest = getModelPath(model);

  if (await RNFS.exists(dest)) return;

  const dirExists = await RNFS.exists(dir);
  if (!dirExists) {
    await RNFS.mkdir(dir);
  }

  const tmpDest = `${dest}.download`;
  const { promise } = RNFS.downloadFile({
    fromUrl: model.url,
    toFile: tmpDest,
    // Required on iOS even though the result is ignored here: iOS's
    // downloader only records the status code and content length inside its
    // `begin` branch, and gates every `progress` callback on statusCode ==
    // 200. Without a `begin` handler that gate is never satisfied and
    // progress silently never fires (found the hard way in a sibling app —
    // see the AmigoLocal `modelStore.ts` writeup in memory).
    begin: () => {},
    progress: onProgress
      ? (res) => {
          if (res.contentLength > 0) {
            onProgress(res.bytesWritten / res.contentLength);
          }
        }
      : undefined,
    // Time-based throttling (~10fps), not `progressDivider`'s percent-based
    // throttling: a multi-GB file only crosses ~30 whole-percent boundaries
    // total, which is too coarse for a smooth progress bar.
    progressInterval: 100,
  });

  const result = await promise;
  if (result.statusCode !== 200) {
    await RNFS.unlink(tmpDest).catch(() => undefined);
    throw new Error(`Model download failed for ${model.displayName}: HTTP ${result.statusCode}`);
  }

  // Never clobber a model that is already on disk: the exists() check above
  // and this in-flight-download map should already prevent two transfers to
  // the same dest, but stay defensive in case something outside this module
  // wrote it in the meantime.
  if (await RNFS.exists(dest)) {
    await RNFS.unlink(tmpDest).catch(() => undefined);
    onProgress?.(1);
    return;
  }

  await RNFS.moveFile(tmpDest, dest);
  onProgress?.(1);
}

/**
 * Deletes `.gguf` files in the models directory that no registered model uses
 * any more (e.g. after a built-in model switched quantization, or a custom
 * model was removed without deleting its file). Partial downloads are kept.
 */
export async function deleteUnusedModelFiles(models: LocalLLMModelConfig[]): Promise<string[]> {
  const dir = modelsDir();
  if (!(await RNFS.exists(dir))) return [];
  const inUse = new Set(models.map((m) => m.filename));
  const deleted: string[] = [];
  for (const entry of await RNFS.readDir(dir)) {
    if (entry.isFile() && entry.name.endsWith('.gguf') && !inUse.has(entry.name)) {
      await RNFS.unlink(entry.path);
      deleted.push(entry.name);
    }
  }
  return deleted;
}
