import type { AudioRoutingConfig } from 'react-native-wakeword';

type AppRouteConfigEntry = AudioRoutingConfig['default'] & {
  forceFallback?: AudioRoutingConfig['default']['preferredInput'];
};

export type AppAudioRoutingConfig = Omit<AudioRoutingConfig, 'default' | 'byOutputPort'> & {
  WakewordAEC?: {
    regular: boolean;
    duringTTS: boolean;
  };
  default: AppRouteConfigEntry;
  byOutputPort: {
    [Port in keyof AudioRoutingConfig['byOutputPort']]?: AppRouteConfigEntry;
  };
  WhenPlayingAudio?: {
    onPlay?: {options: AudioRoutingConfig['default']['options']};
    onFinishPlaying?: {notifyOthers: boolean};
  };
  STTDuckingConfig?: {
    onUnpause?: {options: AudioRoutingConfig['default']['options']};
    onPause?: {notifyOthers: boolean};
  };
  wakeWordDuringTTS?: {
    threshold: number;
    buffer_cnt: number;
  };
};

// This wakeword-only demo does not play TTS or run STT, but the complete
// configuration shows how DaVoice Wakeword, TTS, and STT share audio routing.
export const defaultAudioRoutingConfig: AppAudioRoutingConfig = {
  WakewordAEC: {
    regular: false,
    duringTTS: true,
  },
  default: {
    category: 'playAndRecord',
    mode: 'default',
    options: [
      'mixWithOthers',
      'bluetoothHighQualityRecording',
      'allowAirPlay',
      'defaultToSpeaker',
    ],
    preferredInput: 'bluetoothHighQualityMic',
    forceFallback: 'none',
  },
  byOutputPort: {
    carAudio: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
        'overrideMutedMicrophoneInterruption',
      ],
      preferredInput: 'none',
    },
    builtInReceiver: {
      category: 'playAndRecord',
      mode: 'default',
      options: ['mixWithOthers', 'allowBluetoothA2DP', 'allowAirPlay', 'defaultToSpeaker'],
      preferredInput: 'builtInMic',
    },
    builtInSpeaker: {
      category: 'playAndRecord',
      mode: 'default',
      options: ['mixWithOthers', 'allowBluetoothA2DP', 'allowAirPlay', 'defaultToSpeaker'],
      preferredInput: 'builtInMic',
    },
    bluetoothA2DP: {
      category: 'playAndRecord',
      mode: 'default',
      options: ['mixWithOthers', 'bluetoothHighQualityRecording', 'allowAirPlay'],
      preferredInput: 'bluetoothHighQualityMic',
      forceFallback: 'none',
    },
    bluetoothHFP: {
      category: 'playAndRecord',
      mode: 'default',
      options: ['mixWithOthers', 'bluetoothHighQualityRecording', 'allowAirPlay'],
      preferredInput: 'bluetoothHighQualityMic',
      forceFallback: 'none',
    },
    headphones: {
      category: 'playAndRecord',
      mode: 'default',
      options: ['mixWithOthers', 'allowBluetoothA2DP', 'allowAirPlay'],
      preferredInput: 'builtInMic',
    },
  },
  // Used automatically when the DaVoice TTS package is added.
  WhenPlayingAudio: {
    onPlay: {
      options: ['duckOthers'],
    },
    onFinishPlaying: {
      notifyOthers: true,
    },
  },
  // Used automatically when the DaVoice STT package is added.
  STTDuckingConfig: {
    onUnpause: {
      options: ['duckOthers'],
    },
    onPause: {
      notifyOthers: true,
    },
  },
  wakeWordDuringTTS: {
    threshold: 0.9,
    buffer_cnt: 1,
  },
};
