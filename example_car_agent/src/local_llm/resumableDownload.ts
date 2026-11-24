import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

/**
 * Downloads `url` into `tmpPath`, continuing where an earlier try stopped instead of starting again (2026-11-24, user: the model and
 * the pre-warmed states are ~430 MB each; one network stall used to throw the whole download away).
 *
 * - Android: RNFS writes straight into the file, so the bytes of a failed try stay on disk. The next try asks the server only for the
 *   rest (HTTP Range) into a part file, and that part is added to the end of `tmpPath`. A partial file left by an earlier app start is
 *   continued the same way.
 * - iOS: RNFS's downloader keeps the system's resume data on a failure and waits for `resumeDownload` (without a `resumable` handler
 *   the download never finishes and never fails). Here it is resumed after a short pause.
 *
 * Timeouts are for silence, not for the whole download: `readTimeout` ends a try only after that long with no data at all.
 * Resolves when the file is complete (`expectedBytes`, when known); the caller checks the sha256 and moves the file into place.
 */
export async function downloadResumable(options: {
  url: string;
  tmpPath: string;
  expectedBytes?: number;
  onProgress?: (fractionComplete: number) => void;
  /** Tries (Android) or resumes (iOS) after the first one. */
  retries?: number;
  log?: string;
}): Promise<void> {
  const { url, tmpPath, expectedBytes, onProgress, retries = 5, log = '[download]' } = options;
  // The Cordova / Capacitor file layer (src/shims/react-native-fs.ts there) can't read part of a file or resume: it retries from the start.
  const fs = RNFS as any;
  const canResume = typeof fs.read === 'function' && typeof fs.resumeDownload === 'function';
  if (Platform.OS === 'ios' && canResume) {
    await RNFS.unlink(tmpPath).catch(() => undefined);   // iOS keeps its own partial data (resume data), not this file
    return downloadIos(url, tmpPath, onProgress, retries, log);
  }
  for (let attempt = 0; ; attempt++) {
    if (!canResume) await RNFS.unlink(tmpPath).catch(() => undefined);
    const have = await sizeOf(tmpPath);
    if (expectedBytes && have === expectedBytes) return;
    if (expectedBytes && have > expectedBytes) await RNFS.unlink(tmpPath).catch(() => undefined);   // not this file
    const from = expectedBytes && have > expectedBytes ? 0 : have;
    try {
      const done = await downloadRestAndroid(url, tmpPath, from, expectedBytes, onProgress, log);
      if (done) return;
    } catch (error) {
      if (attempt >= retries) throw error;
      console.log(`${log} try ${attempt + 1} stopped at ${Math.round((await sizeOf(tmpPath)) / 1e6)} MB (${String((error as Error)?.message ?? error)}); continuing`);
    }
    if (attempt >= retries) throw new Error('download incomplete');
    await sleep(Math.min(2000 * (attempt + 1), 10_000));
  }
}

const SILENCE_TIMEOUTS = { connectionTimeout: 20_000, readTimeout: 60_000 };

/** One try from byte `from` on. True when the file is complete. */
async function downloadRestAndroid(
  url: string,
  tmpPath: string,
  from: number,
  expectedBytes: number | undefined,
  onProgress: ((f: number) => void) | undefined,
  log: string,
): Promise<boolean> {
  let total = expectedBytes ?? 0;
  const progress = (written: number) => {
    if (total > 0) onProgress?.(Math.min(1, (from + written) / total));
  };
  if (from === 0) {
    const res = await RNFS.downloadFile({
      fromUrl: url,
      toFile: tmpPath,
      begin: (b) => { if (!total && b.contentLength > 0) total = b.contentLength; },
      progress: (p) => progress(p.bytesWritten),
      progressInterval: 100,
      ...SILENCE_TIMEOUTS,
    }).promise;
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
    return true;   // the server sent the whole file (the caller's sha256 check catches a wrong one)
  }
  // The rest only, into a part file that is then added to the end of tmpPath. Its bytes are kept even when this try fails.
  const part = `${tmpPath}.part`;
  await RNFS.unlink(part).catch(() => undefined);
  console.log(`${log} continuing from ${Math.round(from / 1e6)} MB`);
  let status = 0;
  let failure: unknown = null;
  try {
    const res = await RNFS.downloadFile({
      fromUrl: url,
      toFile: part,
      headers: { Range: `bytes=${from}-` },
      begin: (b) => { if (!total && b.contentLength > 0) total = from + b.contentLength; },
      progress: (p) => progress(p.bytesWritten),
      progressInterval: 100,
      ...SILENCE_TIMEOUTS,
    }).promise;
    status = res.statusCode;
  } catch (error) {
    failure = error;
    status = 206;   // what arrived before the failure is the next bytes of the file
  }
  if (status === 416) {   // nothing left to send: the partial file is already complete
    await RNFS.unlink(part).catch(() => undefined);
    return true;
  }
  if (status === 200) {   // the server ignored the range and sent the whole file: it replaces the partial one
    if (failure) {
      await RNFS.unlink(part).catch(() => undefined);
      throw failure;
    }
    await RNFS.unlink(tmpPath).catch(() => undefined);
    await RNFS.moveFile(part, tmpPath);
    return true;
  }
  if (status !== 206) {
    await RNFS.unlink(part).catch(() => undefined);
    throw new Error(`HTTP ${status}`);
  }
  await appendFile(part, tmpPath);
  await RNFS.unlink(part).catch(() => undefined);
  if (failure) throw failure;
  return true;
}

/** Adds `src` to the end of `dest`, in 4 MB slices (RNFS has no native append of one file to another). */
async function appendFile(src: string, dest: string): Promise<void> {
  const size = await sizeOf(src);
  const slice = 4 * 1024 * 1024;
  for (let at = 0; at < size; at += slice) {
    const b64 = await RNFS.read(src, Math.min(slice, size - at), at, 'base64');
    await RNFS.appendFile(dest, b64, 'base64');
  }
}

function downloadIos(url: string, tmpPath: string, onProgress: ((f: number) => void) | undefined, retries: number, log: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let resumes = 0;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve();
    };
    const job = RNFS.downloadFile({
      fromUrl: url,
      toFile: tmpPath,
      begin: () => {},   // iOS needs a begin handler for progress (see ModelManager.downloadModelOnce)
      progress: onProgress ? (p) => { if (p.contentLength > 0) onProgress(p.bytesWritten / p.contentLength); } : undefined,
      progressInterval: 100,
      ...SILENCE_TIMEOUTS,
      // The download stopped and can continue from where it was.
      resumable: () => {
        if (resumes >= retries) {
          finish(new Error('download stalled too many times'));
          return;
        }
        resumes++;
        console.log(`${log} stalled; continuing (${resumes}/${retries})`);
        setTimeout(() => {
          if (!settled) RNFS.resumeDownload(job.jobId);
        }, Math.min(2000 * resumes, 10_000));
      },
    });
    job.promise.then(
      (res) => finish(res.statusCode === 200 ? undefined : new Error(`HTTP ${res.statusCode}`)),
      (error) => finish(error),
    );
  });
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await RNFS.exists(path)) ? Number((await RNFS.stat(path)).size) : 0;
  } catch {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
