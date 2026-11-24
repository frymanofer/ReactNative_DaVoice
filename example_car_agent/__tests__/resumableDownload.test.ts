// downloadResumable (src/local_llm/resumableDownload.ts): a download that stalls continues from where it stopped (Android: HTTP Range
// into a part file, appended; iOS: RNFS resumeDownload), and a partial file from an earlier start is continued.

const mockFiles = new Map<string, Buffer>();
const MOCK_FILE = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
let mockPlan: Array<{ stopAt?: number; status?: number }> = [];
const mockRequests: Array<{ range?: string }> = [];
let mockPlatform = 'android';

jest.mock('react-native', () => ({ Platform: { get OS() { return mockPlatform; } } }));

jest.mock('react-native-fs', () => {
  const api: any = {
    exists: async (p: string) => mockFiles.has(p),
    unlink: async (p: string) => { mockFiles.delete(p); },
    stat: async (p: string) => ({ size: mockFiles.get(p)!.length }),
    moveFile: async (a: string, b: string) => { mockFiles.set(b, mockFiles.get(a)!); mockFiles.delete(a); },
    read: async (p: string, len: number, pos: number) => mockFiles.get(p)!.subarray(pos, pos + len).toString('base64'),
    appendFile: async (p: string, b64: string) => { mockFiles.set(p, Buffer.concat([mockFiles.get(p) ?? Buffer.alloc(0), Buffer.from(b64, 'base64')])); },
    resumeDownload: jest.fn(),
    downloadFile: (o: any) => {
      const range: string | undefined = o.headers?.Range;
      mockRequests.push({ range });
      const from = range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
      const step = mockPlan.shift() ?? {};
      if (step.status) return { jobId: 1, promise: Promise.resolve({ statusCode: step.status, bytesWritten: 0 }) };
      const end = step.stopAt !== undefined ? Math.min(step.stopAt, MOCK_FILE.length) : MOCK_FILE.length;
      if (mockPlatform === 'ios') {
        // iOS: nothing in toFile until the end; a stall asks for resumeDownload
        if (step.stopAt !== undefined) {
          let resolveIt: (v: any) => void = () => undefined;
          const promise = new Promise((r) => { resolveIt = r; });
          api.resumeDownload.mockImplementationOnce(() => { mockFiles.set(o.toFile, MOCK_FILE); resolveIt({ statusCode: 200, bytesWritten: MOCK_FILE.length }); });
          setTimeout(() => o.resumable?.(), 0);
          return { jobId: 7, promise };
        }
        mockFiles.set(o.toFile, MOCK_FILE);
        return { jobId: 7, promise: Promise.resolve({ statusCode: 200, bytesWritten: MOCK_FILE.length }) };
      }
      mockFiles.set(o.toFile, MOCK_FILE.subarray(from, end));
      if (step.stopAt !== undefined) return { jobId: 1, promise: Promise.reject(new Error('timeout')) };
      return { jobId: 1, promise: Promise.resolve({ statusCode: range ? 206 : 200, bytesWritten: end - from }) };
    },
  };
  return { __esModule: true, default: api, ...api };
});

import { downloadResumable } from '../src/local_llm/resumableDownload';

beforeEach(() => {
  mockFiles.clear();
  mockRequests.length = 0;
  mockPlan = [];
  mockPlatform = 'android';
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => { Promise.resolve().then(fn); return 0 as any; }) as any);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('android: stalls twice, continues from the bytes it has, the file is complete and correct', async () => {
  mockPlan = [{ stopAt: 300 }, { stopAt: 650 }, {}];
  await downloadResumable({ url: 'u', tmpPath: '/t', expectedBytes: MOCK_FILE.length });
  expect(mockRequests.map((r) => r.range)).toEqual([undefined, 'bytes=300-', 'bytes=650-']);
  expect(mockFiles.get('/t')!.equals(MOCK_FILE)).toBe(true);
  expect(mockFiles.has('/t.part')).toBe(false);
});

test('android: a partial file from an earlier start is continued, not downloaded again', async () => {
  mockFiles.set('/t', MOCK_FILE.subarray(0, 400));
  await downloadResumable({ url: 'u', tmpPath: '/t', expectedBytes: MOCK_FILE.length });
  expect(mockRequests.map((r) => r.range)).toEqual(['bytes=400-']);
  expect(mockFiles.get('/t')!.equals(MOCK_FILE)).toBe(true);
});

test('android: an already complete partial file needs no request', async () => {
  mockFiles.set('/t', MOCK_FILE);
  await downloadResumable({ url: 'u', tmpPath: '/t', expectedBytes: MOCK_FILE.length });
  expect(mockRequests).toHaveLength(0);
});

test('android: a server that ignores the range sends the whole file, which replaces the partial one', async () => {
  mockFiles.set('/t', MOCK_FILE.subarray(0, 400));
  mockPlan = [{ status: undefined }];
  const real = (jest.requireMock('react-native-fs') as any).default.downloadFile;
  (jest.requireMock('react-native-fs') as any).default.downloadFile = (o: any) => {
    mockRequests.push({ range: o.headers?.Range });
    mockFiles.set(o.toFile, MOCK_FILE);
    return { jobId: 1, promise: Promise.resolve({ statusCode: 200, bytesWritten: MOCK_FILE.length }) };
  };
  try {
    await downloadResumable({ url: 'u', tmpPath: '/t', expectedBytes: MOCK_FILE.length });
  } finally {
    (jest.requireMock('react-native-fs') as any).default.downloadFile = real;
  }
  expect(mockFiles.get('/t')!.equals(MOCK_FILE)).toBe(true);
});

test('android: gives up after the retries', async () => {
  mockPlan = Array.from({ length: 10 }, (_, i) => ({ stopAt: (i + 1) * 10 }));
  await expect(downloadResumable({ url: 'u', tmpPath: '/t', expectedBytes: MOCK_FILE.length, retries: 2 })).rejects.toThrow('timeout');
  expect(mockRequests).toHaveLength(3);
  expect(mockFiles.get('/t')!.equals(MOCK_FILE.subarray(0, 30))).toBe(true);   // kept for the next start
});

test('ios: a stall is resumed with resumeDownload', async () => {
  mockPlatform = 'ios';
  mockPlan = [{ stopAt: 300 }];
  await downloadResumable({ url: 'u', tmpPath: '/t', expectedBytes: MOCK_FILE.length });
  const rnfs = (jest.requireMock('react-native-fs') as any).default;
  expect(rnfs.resumeDownload).toHaveBeenCalledWith(7);
  expect(mockFiles.get('/t')!.equals(MOCK_FILE)).toBe(true);
});
