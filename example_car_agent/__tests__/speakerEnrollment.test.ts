// Speaker verification at start-up (src/speaker_verification/onboarding.ts), with the native mic controller faked. 2026-11-22 phone:
// a voice sample that did not arrive within 30 s threw out of the start-up ("Voice setup failed. Restart the app to retry.") and
// the native recorder kept running. Now: 60 s per sample, the recorder is always released, the speaker screen comes back with a
// notice, and skipping continues the start-up.

const mockListeners: Record<string, Array<(e: any) => void>> = { progress: [], done: [], error: [] };
const mockOn = (kind: string) => (cb: (e: any) => void) => {
  mockListeners[kind].push(cb);
  return () => {
    mockListeners[kind] = mockListeners[kind].filter((x) => x !== cb);
  };
};
const mockCtrl = {
  create: jest.fn(async () => true),
  beginOnboarding: jest.fn(async () => true),
  getNextEmbeddingFromMic: jest.fn(async () => true),
  setEnrollmentJson: jest.fn(async () => true),
  destroy: jest.fn(async () => true),
};

jest.mock('react-native-wakeword', () => ({
  createSpeakerVerificationMicController: jest.fn(async () => mockCtrl),
  onSpeakerVerificationOnboardingProgress: (cb: any) => mockOn('progress')(cb),
  onSpeakerVerificationOnboardingDone: (cb: any) => mockOn('done')(cb),
  onSpeakerVerificationError: (cb: any) => mockOn('error')(cb),
}));
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/docs',
  exists: jest.fn(async () => false),
  readFile: jest.fn(async () => ''),
  writeFile: jest.fn(async () => undefined),
}));
jest.mock('../src/speaker_verification/verification', () => ({ startEndlessVerificationWithEnrollmentFix: jest.fn(async () => async () => undefined) }));

import { runSpeakerVerificationStartupFlow, runSpeakerVerifyEnrollment, SV_ENROLLMENT_FAILED_NOTICE } from '../src/speaker_verification/onboarding';

const emit = (kind: string, e: any) => [...mockListeners[kind]].forEach((cb) => cb(e));
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  Object.values(mockCtrl).forEach((f) => f.mockClear());
  for (const k of Object.keys(mockListeners)) mockListeners[k] = [];
});
afterEach(() => jest.useRealTimers());

test('a sample that never comes: fails after 60 s (not 30), the recorder is released and no listener is left', async () => {
  const run = runSpeakerVerifyEnrollment(undefined, 5);
  let error: any = null;
  run.catch((e) => (error = e));
  await flush();
  jest.advanceTimersByTime(30001);
  await flush();
  expect(error).toBeNull();
  jest.advanceTimersByTime(30000);
  await flush();
  expect(String(error)).toContain('timeout waiting for progress/done');
  expect(mockCtrl.destroy).toHaveBeenCalledTimes(1);
  expect(mockListeners.progress.length + mockListeners.done.length + mockListeners.error.length).toBe(0);
});

test('five slow samples (50 s each) still finish: the 30 s profile limit starts only after the last one', async () => {
  const run = runSpeakerVerifyEnrollment(undefined, 5);
  for (let i = 1; i <= 5; i++) {
    await flush();
    jest.advanceTimersByTime(50000);
    emit('progress', { controllerId: 'svMic1', collected: i, target: 5 });
  }
  await flush();
  emit('done', { controllerId: 'svMic1', enrollmentJson: '{"enrollmentId":"davoice","x":1}' });
  await expect(run).resolves.toBe('{"enrollmentId":"davoice","x":1}');
  expect(mockCtrl.destroy).toHaveBeenCalledTimes(1);
});

test('a failed recording shows the speaker screen again with a notice; skipping then continues the start-up', async () => {
  const notices: string[] = [];
  const prompts: boolean[] = [];
  const resolver: { current: null | ((c: any) => void) } = { current: null };
  const order: string[] = [];
  const flow = runSpeakerVerificationStartupFlow({
    beforeEnrollment: async () => void order.push('before'),
    afterEnrollment: async () => void order.push('after'),
    setMessage: () => undefined,
    enrollmentJsonRef: { current: null },
    enrollmentJsonPathRef: { current: null },
    setSvPromptHasSavedEnrollment: () => undefined,
    setShowSVPrompt: (v) => void prompts.push(v),
    svChoiceResolverRef: resolver,
    setShowSVStatusScreen: () => undefined,
    setSvStatusCanContinue: () => undefined,
    setSvOnboardingCollected: () => undefined,
    setSvOnboardingTarget: () => undefined,
    setSvStatusPhase: () => undefined,
    setLastSVScore: () => undefined,
    lastSVScoreTimeRef: { current: null },
    setSvElapsed: () => undefined,
    svElapsedIntervalRef: { current: null },
    setSvRunning: () => undefined,
    svStopRef: { current: null },
    svContinueResolverRef: { current: null },
    setSvPromptNotice: (v) => void notices.push(v),
  });
  await flush();
  resolver.current!('redo_onboarding');
  await flush();
  jest.advanceTimersByTime(60001); // the first sample never comes
  await flush();
  await flush();
  expect(notices).toContain(SV_ENROLLMENT_FAILED_NOTICE);
  expect(mockCtrl.destroy).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['before', 'after']);
  expect(prompts.filter(Boolean).length).toBe(2); // shown again
  resolver.current!('skip');
  await expect(flow).resolves.toMatchObject({ svChoice: 'skip', enrollmentJson: null });
  expect(notices[notices.length - 1]).toBe('');
});
