# Example App: React Native On-Device Voice AI

This example app demonstrates a full **React Native voice AI** flow running on device:

- <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake word detection</a>
- <a href="https://davoice.io/speaker-recognition" target="_blank" rel="noopener noreferrer">speaker identification / speaker verification</a>
- real-time speech to text
- on-device text to speech
- coordinated pause/resume between wake word and ASR

The key implementation is in [App.tsx](./App.tsx).

## What the demo shows

The demo is not just a wake-word sample. It is a full on-device voice pipeline designed to reflect how production voice apps actually behave.

The example includes:

- optional speaker onboarding
- using a saved speaker signature
- <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake-word detection</a> with recorded wake-word audio
- clean transition from <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake word</a> into speech recognition
- an intentional pause before STT to improve flow
- selectable TTS voices and model quality
- manual TTS test mode
- resuming the listening experience after speech

## Demo flow

1. Launch the app and grant microphone permissions.
2. Choose whether to create or reuse a speaker signature.
3. Start <a href="https://davoice.io/integration-guides-wake-word/react-native" target="_blank" rel="noopener noreferrer">wake word detection</a>.
4. Say the wake phrase.
5. The app pauses wake-word detection before moving into ASR.
6. If speaker verification is enabled, the app can enforce the onboarded speaker.
7. The app listens for speech and can speak back with on-device TTS.
8. The voice session is reset and the wake-word listener can resume.

## Why the pause matters

The pause between wake word detection and speech recognition is deliberate. In multi-stage mobile voice experiences, one of the biggest sources of instability is overlapping audio pipelines. This example demonstrates a cleaner handoff between:

- always-listening wake word
- speaker verification
- active speech recognition
- TTS playback

That is one of the main reasons this repository is useful as a React Native voice reference.

## Run the example

```bash
cd example
yarn
```

Android:

```bash
npx react-native run-android
```

iOS:

```bash
cd ios
pod install
cd ..
npx react-native run-ios
```

## Important setup notes

### Gemini API key

Do not commit a real `GEMINI_API_KEY` into this public repository.

For this demo app, the simplest approach is:

1. Keep the key in a local file that is ignored by git.
2. Load it into `App.tsx` from that local file.
3. Commit only a template/example file or a short setup note, not the real key.

Why this is better than asking developers to run `export GEMINI_API_KEY=...`:

- React Native apps do not automatically get shell environment variables at runtime on-device.
- A local ignored config file is easier for other developers to understand and reproduce.
- It avoids accidentally committing a shared API key into source control.

Recommended setup for contributors:

- Copy `example/local.config.example.ts` to `example/local.config.ts`
- `example/local.config.ts` is git-ignored
- Paste your real key into `export const GEMINI_API_KEY = 'your-key';`
- `App.tsx` imports the key from that local file

For production apps, a permanent Gemini key should usually not be shipped directly in the client at all. A backend proxy or short-lived token flow is safer.

### Local AI Chat web search

Local AI Chat runs on the device, so its model only knows facts up to its training. For
time-sensitive questions ("Who is the president of the US?", "latest", "today", news,
prices), the app says a short phrase such as "Well, that is a good question, let me search."
(picked to fit the question), searches the web, and the
on-device model answers from the results. Other questions never leave the device.

The search engine is replaceable. Choose it in the git-ignored `example/local.config.ts`:

```ts
export const WEB_SEARCH_ENGINE = 'wikipedia'; // default: free, no key. Or 'tavily' / 'brave'.
export const TAVILY_API_KEY = '';             // https://tavily.com (free plan available)
export const BRAVE_API_KEY = '';              // https://brave.com/search/api
```

All three lines are optional. Wikipedia handles "who currently holds this office" questions
well but has no news, prices or weather; Tavily and Brave are full web search. If the chosen
engine fails or finds nothing, Wikipedia is tried.

To use any other search API, implement `WebSearchEngine` from
`src/local_llm/rag/web/types.ts` and pass it to `configureWebSearch`:

```ts
import { configureWebSearch } from './src/local_llm/rag/web/WebRAGProvider';
import type { WebSearchEngine } from './src/local_llm/rag/web/WebRAGProvider';

const mySearch: WebSearchEngine = {
  name: 'MySearch',
  async search(query, { maxResults, signal }) {
    const res = await fetch(`https://my-api.example.com/search?q=${encodeURIComponent(query)}`, { signal });
    const json = await res.json();
    return json.items.slice(0, maxResults).map((item: any) => ({
      text: item.snippet, // short plain text, most relevant first
      url: item.link,
      title: item.title,
      retrievedAt: Date.now(),
    }));
  },
};

configureWebSearch({ engine: mySearch }); // optional: fallbackToWikipedia, maxResults, timeoutMs
```

Which questions trigger a search is decided in `src/local_llm/rag/web/needsWebSearch.ts`.

### Metro assets

Make sure your Metro configuration supports DaVoice model assets such as `.onnx` and `.dm` files. See [react-native.config.js](./react-native.config.js) and the project asset setup.

### Native permissions

Microphone permission is required. iOS speech-recognition permissions may also be required depending on the flow you enable.

### Android sharing support

The example can share recorded wake-word audio. On Android that uses a `FileProvider`, which is why the app manifest references `share_file_paths.xml`.

## Relevant files

- [App.tsx](./App.tsx): top-level app container, React state, screen flow, and JSX
- [src/README.md](./src/README.md): detailed source-map for the extracted feature modules
- [src/appflow.ts](./src/appflow.ts): shared app constants and flow helpers
- [src/initialization/](./src/initialization): startup, permission, and speech-init helpers
- [src/stt/](./src/stt): STT transcript merge logic and speech callback registration
- [src/tts/](./src/tts): TTS constants, model assets, and intro speech flow
- [src/wakeword/](./src/wakeword): wakeword config, bootstrap, listener, capture, and sharing helpers
- [src/speaker_verification/](./src/speaker_verification): onboarding and verification helpers
- [src/aichat/](./src/aichat): Gemini request helpers and AI-chat speech/session helpers
- [package.json](./package.json): example dependencies
- [AndroidManifest.xml](./android/app/src/main/AndroidManifest.xml): Android permissions and file sharing
- [share_file_paths.xml](./android/app/src/main/res/xml/share_file_paths.xml): Android file-sharing resource

## New source structure

The example no longer keeps all of the voice logic in one giant file.

The original `App.tsx` was broken into reusable logic modules under `src/` so developers can lift individual features into their own React Native app with less effort.

### `App.tsx` now focuses on

- React state and refs
- top-level app flow
- prompt transitions
- screen rendering
- styles

### `src/` now contains the reusable logic

#### `src/appflow.ts`
- shared app constants and UI-facing helpers
- includes speaker-verification thresholds and score-display helpers

#### `src/initialization/`
- microphone permission helpers
- speech-library initialization helpers
- TTS model-selection prompt flow
- startup timing helpers like `withTimeout(...)`

#### `src/stt/`
- STT merge logic for partial/final transcripts
- `Speech.onSpeechError`
- `Speech.onSpeechStart`
- `Speech.onSpeechEnd`
- `Speech.onSpeechPartialResults`
- `Speech.onSpeechResults`
- Android-specific partial-results guard during initialization

#### `src/tts/`
- TTS constants and model assets
- wakeword intro speech flow
- reusable TTS-related helpers

#### `src/wakeword/`
- wakeword model/config constants
- listener attach/detach helpers
- wakeword startup/bootstrap flow
- wakeword detection capture helpers
- wakeword recording-share helpers
- iOS audio-routing config used by wakeword flows

#### `src/speaker_verification/`
- enrollment JSON load/save helpers
- onboarding flow
- endless verification/runtime verification helpers

#### `src/aichat/`
- Gemini request and streaming helpers
- speech queue handling for AI-chat replies
- AI-chat session reset/finish helpers

## How to copy pieces into your app

If you only need one feature from this example, these are the best starting points:

- Wakeword only:
  - start with [src/wakeword/index.ts](./src/wakeword/index.ts)
- Speaker verification onboarding + verification:
  - start with [src/speaker_verification/onboarding.ts](./src/speaker_verification/onboarding.ts) and [src/speaker_verification/verification.ts](./src/speaker_verification/verification.ts)
  - also use [src/appflow.ts](./src/appflow.ts) for SV-related thresholds/UI helpers
- STT + TTS interaction loop:
  - start with [src/stt/index.ts](./src/stt/index.ts), [src/tts/index.ts](./src/tts/index.ts), and [src/initialization/index.ts](./src/initialization/index.ts)
- Gemini voice chat:
  - start with [src/aichat/index.ts](./src/aichat/index.ts) plus the STT/TTS modules above

## Important note about behavior preservation

This refactor was intentionally done as a move/extract refactor, not as a redesign.

The goal of the new structure is:

- keep the same voice behavior
- preserve the Android/iOS-specific logic
- preserve the STT/TTS/wakeword pause-resume orchestration
- make the example easier to understand and easier to copy feature-by-feature

## Search-friendly summary

If you found this example while searching for:

- React Native wake word example
- React Native speaker identification example
- React Native speech to text example
- React Native text to speech example
- React Native offline voice AI

this demo is intended to cover the full mobile voice flow rather than only one feature in isolation.

## Questions and support

For production integration help, licensing, custom wake words, or full voice AI support, contact `info@davoice.io`.
