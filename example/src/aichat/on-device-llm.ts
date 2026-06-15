import { initLlama, LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import type { GeminiChatMessage } from './index';

const MODEL_URL =
  'https://huggingface.co/bartowski/google_gemma-3-1b-it-GGUF/resolve/main/google_gemma-3-1b-it-Q3_K_M.gguf';
const MODEL_FILENAME = 'gemma-3-1b-it-q3_k_m.gguf';

let llamaContext: LlamaContext | null = null;

function getModelPath(): string {
  return `${RNFS.DocumentDirectoryPath}/models/${MODEL_FILENAME}`;
}

export async function downloadModelIfNeeded(
  onProgress: (progress: number) => void,
): Promise<void> {
  const modelPath = getModelPath();
  const modelsDir = `${RNFS.DocumentDirectoryPath}/models`;

  if (!(await RNFS.exists(modelsDir))) {
    await RNFS.mkdir(modelsDir);
  }

  if (await RNFS.exists(modelPath)) {
    onProgress(1);
    return;
  }

  onProgress(0);
  await new Promise<void>((resolve, reject) => {
    const { promise } = RNFS.downloadFile({
      fromUrl: MODEL_URL,
      toFile: modelPath,
      progress: ({ bytesWritten, contentLength }) => {
        if (contentLength > 0) {
          onProgress(bytesWritten / contentLength);
        }
      },
      progressDivider: 1,
    });
    promise
      .then(result => {
        if (result.statusCode === 200) {
          onProgress(1);
          resolve();
        } else {
          reject(new Error(`Model download failed: HTTP ${result.statusCode}`));
        }
      })
      .catch(reject);
  });
}

export async function initOnDeviceLLM(): Promise<void> {
  if (llamaContext) return;
  const modelPath = getModelPath();
  console.log('[OnDeviceLLM] Loading model', modelPath);
  llamaContext = await initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_threads: 4,
  });
  console.log('[OnDeviceLLM] Model ready');
}

export function isOnDeviceLLMReady(): boolean {
  return llamaContext !== null;
}

export async function generateOnDeviceReply(
  history: GeminiChatMessage[],
  systemPrompt: string,
): Promise<{ text: string; elapsed_ms: number }> {
  if (!llamaContext) {
    throw new Error('On-device LLM not initialized');
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts.map(p => p.text).join(''),
    })),
  ];

  const start = Date.now();
  const result = await llamaContext.completion({
    messages,
    n_predict: 512,
    temperature: 0.7,
    stop: ['<end_of_turn>', '<eos>', '<|end|>', '<|user|>'],
  });
  const elapsed_ms = Date.now() - start;

  const text = (result.text ?? '').trim();
  console.log('[OnDeviceLLM] Inference done', { elapsed_ms, textLength: text.length });
  return { text, elapsed_ms };
}

export async function teardownOnDeviceLLM(): Promise<void> {
  if (!llamaContext) return;
  await llamaContext.release();
  llamaContext = null;
  console.log('[OnDeviceLLM] Context released');
}
