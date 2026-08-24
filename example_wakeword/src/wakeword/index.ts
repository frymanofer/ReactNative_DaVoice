import { createKeyWordRNBridgeInstance } from 'react-native-wakeword';
import type { KeyWordRNBridgeInstance } from 'react-native-wakeword';
import { instanceConfigs, type InstanceConfig } from './config/wakewordModels';

export {
  heyCoachModelName,
  heyLookdeepModelName,
  instanceConfigs,
} from './config/wakewordModels';
export type { InstanceConfig } from './config/wakewordModels';

export const formatWakeWord = (fileName: string): string =>
  fileName
    .replace(/(_model.*|_\d+.*)\.(onnx|dm)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\.(onnx|dm)$/i, '')
    .replace(/\b\w/g, (character) => character.toUpperCase());

export async function addInstanceMulti(
  config: InstanceConfig,
): Promise<KeyWordRNBridgeInstance> {
  const instance = await createKeyWordRNBridgeInstance(config.id, false);
  if (!instance) {
    throw new Error(`Failed to create wakeword instance ${config.id}`);
  }

  await instance.createInstanceMulti(
    instanceConfigs.map((item) => item.modelName),
    instanceConfigs.map((item) => item.threshold),
    instanceConfigs.map((item) => item.bufferCnt),
    instanceConfigs.map((item) => item.msBetweenCallbacks),
  );

  return instance;
}

export async function attachKeywordListenerOnce(
  listenerRef: { current: any },
  instance: KeyWordRNBridgeInstance,
  formatPhrase: (phrase: string) => string,
  callback: (phrase: string) => void,
) {
  await detachKeywordListener(listenerRef);

  const subscription = instance.onKeywordDetectionEvent((phrase: string) => {
    callback(formatPhrase(phrase));
  });
  listenerRef.current = subscription;
  return subscription;
}

export async function detachKeywordListener(listenerRef: { current: any }) {
  const subscription = listenerRef.current;
  if (subscription && typeof subscription.remove === 'function') {
    try {
      await subscription.remove();
    } catch (error) {
      console.warn('Wakeword listener cleanup failed:', error);
    }
  }
  listenerRef.current = null;
}

export function cleanDetectedWakeWord(value: unknown) {
  const keywordText = String(value ?? '');
  const keywordWords = keywordText.trim().split(/\s+/).filter(Boolean);
  const modelWordIndex = keywordWords.findIndex(
    (word) => word.toLowerCase() === 'model',
  );
  const cleanWakeWord =
    modelWordIndex >= 0
      ? keywordWords.slice(0, modelWordIndex).join(' ')
      : keywordText;

  return { keywordText, keywordWords, cleanWakeWord };
}
