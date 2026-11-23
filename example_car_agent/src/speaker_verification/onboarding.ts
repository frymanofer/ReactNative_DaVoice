import RNFS from 'react-native-fs';
import {
  createSpeakerVerificationMicController,
  onSpeakerVerificationOnboardingDone,
  onSpeakerVerificationOnboardingProgress,
  onSpeakerVerificationError,
} from 'react-native-wakeword';
import { getSVUIDisplayScore, getSVUIMatch, SV_DECISION_THRESHOLD, SV_ONBOARDING_SAMPLE_COUNT, type SVPromptChoice } from '../appflow';
import { startEndlessVerificationWithEnrollmentFix } from './verification';

export type SVEnrollmentUIHooks = {
  onStart?: (targetSamples: number) => void;
  onProgress?: (collected: number, target: number) => void;
  onComplete?: (targetSamples: number) => void;
  onFinalizing?: () => void;
};

export async function writeEnrollmentJsonToFile(enrollmentJson: string, filename = 'sv_enrollment.json') {
  const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
  await RNFS.writeFile(path, enrollmentJson, 'utf8');
  console.log('[SVJS] wrote enrollment json to', path, 'len=', enrollmentJson.length);
  return path;
}

export async function loadEnrollmentJsonFromFile(filename = 'sv_enrollment.json') {
  const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
  const exists = await RNFS.exists(path);
  console.log('loadEnrollmentJsonFromFile() path == ', path);

  if (!exists) {
    console.log('[SVJS] no saved enrollment json at', path);
    return null;
  }

  const enrollmentJson = await RNFS.readFile(path, 'utf8');
  if (!enrollmentJson || enrollmentJson.length < 10) {
    console.warn('[SVJS] saved enrollment json invalid at', path);
    return null;
  }

  console.log('[SVJS] loaded enrollment json from', path, 'len=', enrollmentJson.length);
  return enrollmentJson;
}

export async function runSpeakerVerifyEnrollment(
  setUiMessage?: (s: string) => void,
  sampleCount: number = SV_ONBOARDING_SAMPLE_COUNT,
  uiHooks?: SVEnrollmentUIHooks,
): Promise<string> {
  const targetSamples = Math.max(1, Math.floor(sampleCount));
  const micConfig = {
    modelPath: 'sv.dm',
    options: {
      decisionThreshold: SV_DECISION_THRESHOLD,
      // TODO IOS IGNORES tailSeconds!!! AND ANDROID DOES NOT!!!
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
    },
  };

  const ctrl = await createSpeakerVerificationMicController('svMic1');
  setUiMessage?.('Speaker verification: preparing mic controller...');
  uiHooks?.onStart?.(targetSamples);

  console.log('[SVJS] create mic controller...');
  await ctrl.create(JSON.stringify(micConfig));

  let collected = 0;
  let target = targetSamples;
  let enrollmentJson: string | null = null;

  const waitForNextSVStep = (controllerId: string, beforeCollected: number, timeoutMs = 25000) => {
    return new Promise<{ type: 'progress' | 'done'; ev: any }>((resolve, reject) => {
      const t = setTimeout(() => {
        offP?.();
        offD?.();
        offE?.();
        reject(new Error(`[SVJS] timeout waiting for progress/done (before=${beforeCollected})`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(t);
        offP?.();
        offD?.();
        offE?.();
      };

      const offE = onSpeakerVerificationError((e) => {
        if (e?.controllerId !== controllerId) return;
        cleanup();
        reject(new Error(`[SVJS] SV ERROR event: ${JSON.stringify(e)}`));
      });

      const offP = onSpeakerVerificationOnboardingProgress((e) => {
        if (e?.controllerId !== controllerId) return;
        const c = Number(e?.collected ?? 0);
        if (c > beforeCollected) {
          cleanup();
          resolve({ type: 'progress', ev: e });
        }
      });

      const offD = onSpeakerVerificationOnboardingDone((e) => {
        if (e?.controllerId !== controllerId) return;
        cleanup();
        resolve({ type: 'done', ev: e });
      });
    });
  };

  const offErr = onSpeakerVerificationError((e) => {
    console.log('[SVJS] ERROR event:', e);
  });

  const offProg = onSpeakerVerificationOnboardingProgress((e) => {
    if (e?.controllerId !== 'svMic1') return;
    console.log('[SVJS] PROGRESS event:', e);
    collected = Number(e?.collected ?? collected);
    target = Number(e?.target ?? target);
    uiHooks?.onProgress?.(collected, target);
  });

  // The "done" event (the enrollment JSON) is remembered from the start; its wait (FINALIZE_TIMEOUT_MS) only starts after the last
  // sample. 2026-11-22 phone: a 60 s limit counted from the FIRST sample failed anyone reading the 5 sentences slowly.
  let doneSeen = false;
  let doneArrived: (() => void) | null = null;
  const offDone = onSpeakerVerificationOnboardingDone((e) => {
    if (e?.controllerId !== 'svMic1' || doneSeen) return;
    doneSeen = true;
    console.log('[SVJS] DONE event:', e);
    enrollmentJson = e?.enrollmentJson ?? e?.enrollment ?? e?.json ?? null;
    doneArrived?.();
  });
  const waitForDone = () =>
    new Promise<void>((resolve, reject) => {
      if (doneSeen) return resolve();
      const t = setTimeout(() => reject(new Error('[SVJS] timeout waiting for onboarding done')), FINALIZE_TIMEOUT_MS);
      doneArrived = () => {
        clearTimeout(t);
        resolve();
      };
    });
  const release = async () => {
    offProg?.();
    offErr?.();
    offDone?.();
    // the native mic controller keeps recording until it is destroyed (2026-11-22 phone: it ran on for 44 s after a timeout)
    try { await ctrl.destroy?.(); } catch { }
  };

  try {
  setUiMessage?.(`Speaker verification: onboarding started. Collecting ${targetSamples} samples.`);
  await ctrl.beginOnboarding?.('davoice', targetSamples, true);

  for (let i = 1; i <= targetSamples; i++) {
    console.log('[SVJS] requesting embedding', i, '/', targetSamples);
    setUiMessage?.(`Speaker verification: collecting sample ${i}/${targetSamples}...`);

    const before = collected;
    const stepPromise = waitForNextSVStep('svMic1', before, SAMPLE_TIMEOUT_MS);
    await ctrl.getNextEmbeddingFromMic();
    const step = await stepPromise;

    if (step.type === 'done') {
      const e = step.ev;
      enrollmentJson = e?.enrollmentJson ?? e?.enrollment ?? e?.json ?? enrollmentJson;
      setUiMessage?.('Speaker verification: onboarding completed.');
      uiHooks?.onComplete?.(targetSamples);
      break;
    }

    setUiMessage?.(`Speaker verification: collected ${Math.min(collected, targetSamples)}/${targetSamples} samples.`);
  }

  setUiMessage?.('Speaker verification: finalizing speaker profile...');
  uiHooks?.onFinalizing?.();
  await waitForDone();

  const json: string | null = enrollmentJson;
  if (!json || typeof json !== 'string' || json.length < 10) {
    throw new Error('[SVJS] onboarding done but enrollmentJson is empty/invalid');
  }

  console.log('[SVJS] enrollmentJson len=', json.length);
  await ctrl.setEnrollmentJson(json);
  setUiMessage?.('Speaker verification: speaker profile saved.');
  return json;
  } finally {
    // success or failure: the mic controller is closed (it would fight the wake word and STT for the microphone)
    await release();
  }
}

/** How long one voice sample may take (the user reads a sentence; 2026-11-22: 30 s was too short on the phone). */
const SAMPLE_TIMEOUT_MS = 60000;
/** After the last sample, how long the speaker profile may take to build. */
const FINALIZE_TIMEOUT_MS = 30000;

/** What the speaker screen says after a voice signature could not be recorded. */
export const SV_ENROLLMENT_FAILED_NOTICE = "I couldn't hear the samples clearly. Try again in a quiet place, or skip this step.";

export async function runSpeakerVerificationStartupFlow({
  beforeEnrollment,
  afterEnrollment,
  setMessage,
  enrollmentJsonRef,
  enrollmentJsonPathRef,
  setSvPromptHasSavedEnrollment,
  setShowSVPrompt,
  svChoiceResolverRef,
  setShowSVStatusScreen,
  setSvStatusCanContinue,
  setSvOnboardingCollected,
  setSvOnboardingTarget,
  setSvStatusPhase,
  setLastSVScore,
  lastSVScoreTimeRef,
  setSvElapsed,
  svElapsedIntervalRef,
  setSvRunning,
  svStopRef,
  svContinueResolverRef,
  setSvPromptNotice,
}: {
  beforeEnrollment: () => Promise<void>;
  afterEnrollment: () => Promise<void>;
  setMessage: (value: string) => void;
  enrollmentJsonRef: { current: string | null };
  enrollmentJsonPathRef: { current: string | null };
  setSvPromptHasSavedEnrollment: (value: boolean) => void;
  setShowSVPrompt: (value: boolean) => void;
  svChoiceResolverRef: { current: null | ((choice: SVPromptChoice) => void) };
  setShowSVStatusScreen: (value: boolean) => void;
  setSvStatusCanContinue: (value: boolean) => void;
  setSvOnboardingCollected: (value: number) => void;
  setSvOnboardingTarget: (value: number) => void;
  setSvStatusPhase: (value: 'idle' | 'onboarding' | 'verifying') => void;
  setLastSVScore: (value: { score: number; isMatch: boolean } | null) => void;
  lastSVScoreTimeRef: { current: number | null };
  setSvElapsed: (value: string) => void;
  svElapsedIntervalRef: { current: any };
  setSvRunning: (value: boolean) => void;
  svStopRef: { current: null | (() => Promise<void>) };
  svContinueResolverRef: { current: null | (() => void) };
  /** A line on the speaker screen (why it is shown again: the voice signature could not be recorded). */
  setSvPromptNotice?: (value: string) => void;
}) {
  let enrollmentJson = enrollmentJsonRef.current;
  console.log('initializeKeywordDetection() enrollmentJson == ', enrollmentJson);
  let svChoice: SVPromptChoice = 'skip';

  try {
    if (!enrollmentJson) {
      enrollmentJson = await loadEnrollmentJsonFromFile('sv_enrollment.json');
      console.log('initializeKeywordDetection() 2 enrollmentJson == ', enrollmentJson);

      if (enrollmentJson) {
        console.log('initializeKeywordDetection() 3 enrollmentJson == ', enrollmentJson);
        enrollmentJsonRef.current = enrollmentJson;
        enrollmentJsonPathRef.current = `${RNFS.DocumentDirectoryPath}/sv_enrollment.json`;
      }
    }
    // The prompt, and the recording if chosen; a recording that fails shows the prompt again (try again / skip) instead of
    // failing the whole start-up (2026-11-22 phone: "Voice setup failed. Restart the app to retry.").
    for (;;) {
    const hasSavedEnrollment = typeof enrollmentJson === 'string' && enrollmentJson.length > 0;
    setSvPromptHasSavedEnrollment(hasSavedEnrollment);
    setShowSVPrompt(true);
    svChoice = await new Promise<SVPromptChoice>((resolve) => {
      svChoiceResolverRef.current = resolve;
    });
    setShowSVPrompt(false);
    setSvPromptHasSavedEnrollment(false);
    setSvPromptNotice?.('');
    if (svChoice === 'skip') {
      enrollmentJson = null;
      enrollmentJsonRef.current = null;
      enrollmentJsonPathRef.current = null;
    }
    if (svChoice !== 'skip') {
      setShowSVStatusScreen(true);
      setSvStatusCanContinue(false);
      setSvOnboardingCollected(0);
      setSvOnboardingTarget(SV_ONBOARDING_SAMPLE_COUNT);
      if (svChoice === 'redo_onboarding' || !enrollmentJson) {
        /*** --> ENROLLMENT HERE ***/
        setSvStatusPhase('onboarding');
        try {
          await beforeEnrollment();
          enrollmentJson = await runSpeakerVerifyEnrollment(setMessage, SV_ONBOARDING_SAMPLE_COUNT, {
            onStart: (targetSamples) => {
              setSvOnboardingTarget(targetSamples);
              setSvOnboardingCollected(0);
            },
            onProgress: (collected, targetSamples) => {
              setSvOnboardingCollected(collected);
              setSvOnboardingTarget(targetSamples);
            },
            onComplete: (targetSamples) => {
              setSvOnboardingCollected(targetSamples);
              setSvOnboardingTarget(targetSamples);
            },
          });
          enrollmentJsonRef.current = enrollmentJson;
          enrollmentJsonPathRef.current = await writeEnrollmentJsonToFile(
            enrollmentJson,
            'sv_enrollment.json',
          );
        } catch (enrollError) {
          console.warn('[SVJS] voice signature not recorded, back to the speaker screen:', enrollError);
          enrollmentJson = enrollmentJsonRef.current; // a saved signature from before stays usable
          setShowSVStatusScreen(false);
          setSvStatusPhase('idle');
          setSvOnboardingCollected(0);
          setSvPromptNotice?.(SV_ENROLLMENT_FAILED_NOTICE);
          continue;
        } finally {
          await afterEnrollment();
        }
      }
      setSvStatusPhase('verifying');
      // Reset score tracking and start elapsed timer
      setLastSVScore(null);
      lastSVScoreTimeRef.current = null;
      setSvElapsed('N/A');
      svElapsedIntervalRef.current = setInterval(() => {
        const t = lastSVScoreTimeRef.current;
        if (t === null) {
          setSvElapsed('N/A');
        } else {
          const sec = (Date.now() - t) / 1000;
          setSvElapsed(sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`);
        }
      }, 100);

      setSvRunning(true);
      // await runVerificationWithEnrollment(enrollmentJson, setMessage);
      //        svStopRef.current = await startEndlessVerificationWithEnrollment(enrollmentJson, setMessage, { hopSeconds: 0.5, stopOnMatch: false });
      svStopRef.current = await startEndlessVerificationWithEnrollmentFix(
        enrollmentJson,
        setMessage,
        {
          hopSeconds: 0.25, stopOnMatch: false, waitFirstResult: true, firstResultTimeoutMs: 3000,
          onStopReady: (stopFn: () => Promise<void>) => { svStopRef.current = stopFn; },
          onScore: (score: number, isMatch: boolean) => {
            const uiIsMatch = getSVUIMatch(score, isMatch);
            setLastSVScore({ score: getSVUIDisplayScore(score, isMatch), isMatch: uiIsMatch });
            lastSVScoreTimeRef.current = Date.now();
            setSvStatusCanContinue(true);
          }
        }
      );
      await new Promise<void>((resolve) => {
        svContinueResolverRef.current = resolve;
      });
      // Cleanup timer when verification ends
      if (svElapsedIntervalRef.current) {
        clearInterval(svElapsedIntervalRef.current);
        svElapsedIntervalRef.current = null;
      }
      setSvRunning(false);
    }
    break;
    }
    setShowSVStatusScreen(false);
    setSvStatusCanContinue(false);
    setSvStatusPhase('idle');
    setSvOnboardingCollected(0);
    svContinueResolverRef.current = null;
  } catch (error) {
    console.error('Error loading model:', error);
    setShowSVPrompt(false);
    setSvPromptHasSavedEnrollment(false);
    setShowSVStatusScreen(false);
    setSvStatusCanContinue(false);
    setSvStatusPhase('idle');
    setSvOnboardingCollected(0);
    svContinueResolverRef.current = null;
    setMessage(`Speaker verification debug mode failed: ${String((error as any)?.message ?? error)}`);
    throw error;
  }

  return {
    svChoice,
    enrollmentJson,
    enrollmentJsonPath: enrollmentJsonPathRef.current,
  };
}
