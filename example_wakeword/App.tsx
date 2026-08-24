import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { KeyWordRNBridgeInstance } from 'react-native-wakeword';
import {
  hasIOSMicPermissions,
  requestIOSMicPermissions,
  setWakewordAudioRoutingConfig,
} from 'react-native-wakeword';
import {
  addInstanceMulti,
  attachKeywordListenerOnce,
  cleanDetectedWakeWord,
  detachKeywordListener,
  formatWakeWord,
} from './src/wakeword';
import { defaultAudioRoutingConfig } from './src/config/audioRoutingConfig';
import { instanceConfigs } from './src/wakeword/config/wakewordModels';
import { ensureMicPermission } from './src/initialization';
import { KEYWORD_LICENSE } from './local.config';

const configuredWakeWords = instanceConfigs.map((config) => formatWakeWord(config.modelName));
const normalizeWakeWordKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const configuredWakeWordEntries = configuredWakeWords.map((wakeWord) => ({
  label: wakeWord,
  key: normalizeWakeWordKey(wakeWord),
}));

function App(): React.JSX.Element {
  const instanceRef = useRef<KeyWordRNBridgeInstance | null>(null);
  const listenerRef = useRef<any>(null);
  const initInFlightRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState('Checking microphone permission...');
  const [lastWakeWord, setLastWakeWord] = useState('Nothing detected yet');
  const [detectionCount, setDetectionCount] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [wakeWordStats, setWakeWordStats] = useState<Record<string, number>>(() =>
    configuredWakeWordEntries.reduce<Record<string, number>>((acc, wakeWord) => {
      acc[wakeWord.key] = 0;
      return acc;
    }, {}),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestPermission = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await ensureMicPermission();
          if (isMountedRef.current) {
            setHasPermission(granted);
            setStatus(
              granted
                ? 'Microphone ready. Initializing wake-word detection...'
                : 'Microphone permission is required.',
            );
          }
          return;
        }

        let granted = await hasIOSMicPermissions();
        if (!granted) {
          granted = await requestIOSMicPermissions(20000);
        }
        if (isMountedRef.current) {
          setHasPermission(!!granted);
          setStatus(
            granted
              ? 'Microphone ready. Initializing wake-word detection...'
              : 'Microphone permission is required.',
          );
        }
      } catch (error) {
        console.error('Permission request failed:', error);
        if (isMountedRef.current) {
          setHasPermission(false);
          setStatus('Failed to get microphone permission.');
        }
      }
    };

    requestPermission();

    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      if (!hasInitializedRef.current && !initInFlightRef.current) {
        requestPermission().catch((error) => {
          console.error('Permission retry failed:', error);
        });
      }
    });

    return () => {
      appStateListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!hasPermission || hasInitializedRef.current || initInFlightRef.current) {
      return;
    }

    const initializeWakewordOnly = async () => {
      initInFlightRef.current = true;

      try {
        if (!KEYWORD_LICENSE || KEYWORD_LICENSE === 'YOUR_WAKEWORD_LICENSE') {
          throw new Error(
            'Set KEYWORD_LICENSE in local.config.ts before running the example.',
          );
        }

        await setWakewordAudioRoutingConfig(defaultAudioRoutingConfig);

        const instance = await addInstanceMulti(instanceConfigs[0]);
        instanceRef.current = instance;

        await attachKeywordListenerOnce(listenerRef, instance, formatWakeWord, (phrase) => {
          if (!isMountedRef.current) {
            return;
          }
          const cleanWakeWord = cleanDetectedWakeWord(phrase).cleanWakeWord;
          const normalizedWakeWord = normalizeWakeWordKey(cleanWakeWord);
          const matchedWakeWord =
            configuredWakeWordEntries.find((entry) => normalizedWakeWord.includes(entry.key))?.label ??
            cleanWakeWord;

          console.log('Wake word detection debug:', {
            phrase,
            cleanWakeWord,
            normalizedWakeWord,
            matchedWakeWord,
          });

          setLastWakeWord(matchedWakeWord);
          setDetectionCount((current) => current + 1);
          setWakeWordStats((current) => ({
            ...current,
            [normalizeWakeWordKey(matchedWakeWord)]:
              (current[normalizeWakeWordKey(matchedWakeWord)] ?? 0) + 1,
          }));
          setStatus('Wake word detected.');
        });

        const isLicensed = await instance.setKeywordDetectionLicense(KEYWORD_LICENSE);
        if (!isLicensed) {
          throw new Error('Wake-word license was rejected.');
        }

        await instance.startKeywordDetection(instanceConfigs[0].threshold, true);

        hasInitializedRef.current = true;
        if (isMountedRef.current) {
          setStatus('Listening for wake words...');
        }
      } catch (error) {
        console.error('Wake-word initialization failed:', error);
        if (isMountedRef.current) {
          setStatus('Failed to initialize wake-word detection. Check logs.');
        }
      } finally {
        initInFlightRef.current = false;
      }
    };

    initializeWakewordOnly().catch((error) => {
      console.error('Wakeword initialization failed:', error);
    });
  }, [hasPermission]);

  useEffect(() => {
    return () => {
      const cleanup = async () => {
        const instance = instanceRef.current;
        if (instance) {
          try {
            await instance.stopKeywordDetection();
          } catch (error) {
            console.warn('stopKeywordDetection failed during cleanup:', error);
          }
        }

        try {
          await detachKeywordListener(listenerRef);
        } catch (error) {
          console.warn('detachKeywordListener failed during cleanup:', error);
        }
      };

      cleanup().catch((error) => {
        console.warn('Wakeword cleanup failed:', error);
      });
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>Wake Word Demo</Text>
        <Text style={styles.title}>Multimodel Listener</Text>
        <Text style={styles.status}>{status}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Configured wake words</Text>
          <Text style={styles.cardValue}>{configuredWakeWords.join(', ')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Last detected wake word</Text>
          <Text style={styles.detectedWakeWord}>{lastWakeWord}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Wake word counts</Text>
          {configuredWakeWordEntries.map((wakeWord) => {
            const count = wakeWordStats[wakeWord.key] ?? 0;
            const isLastDetected = wakeWord.label === lastWakeWord;

            return (
              <View key={wakeWord.key} style={styles.wakeWordRow}>
                <View style={styles.wakeWordRowText}>
                  <Text style={styles.wakeWordName}>{wakeWord.label}</Text>
                  <Text style={styles.wakeWordMeta}>
                    {isLastDetected ? 'Most recent detection' : 'Waiting for detection'}
                  </Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{count}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.footerRow}>
          <View style={styles.footerPill}>
            <Text style={styles.footerLabel}>Detections</Text>
            <Text style={styles.footerValue}>{detectionCount}</Text>
          </View>
          <View style={styles.footerPill}>
            <Text style={styles.footerLabel}>Permission</Text>
            <Text style={styles.footerValue}>{hasPermission ? 'Granted' : 'Missing'}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  eyebrow: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 12,
  },
  status: {
    color: '#cbd5e1',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#111c44',
    borderColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  cardValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
  },
  detectedWakeWord: {
    color: '#facc15',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  wakeWordRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  wakeWordRowText: {
    flex: 1,
    paddingRight: 16,
  },
  wakeWordName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  wakeWordMeta: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    minWidth: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countBadgeText: {
    color: '#facc15',
    fontSize: 18,
    fontWeight: '800',
  },
  footerPill: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  footerLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  footerValue: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default App;
