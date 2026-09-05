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

### Metro assets

Make sure your Metro configuration supports DaVoice model assets such as `.onnx` and `.dm` files. See [react-native.config.js](./react-native.config.js) and the project asset setup.

### Wake word model updates from a CDN

The wake word model `hey_coach_model_28_22012026b.dm` ships inside the app (Android assets and the iOS bundle) and can also be refreshed from a CDN at runtime. The code lives in [src/wakeword/modelUpdater.ts](./src/wakeword/modelUpdater.ts).

Host two files at the root of the CDN, keeping the names:

```text
https://<cdn>/hey_coach_model_28_22012026b.dm
https://<cdn>/hey_coach_model_28_22012026b.dm.sha256
```

`WAKEWORD_MODEL_CDN_BASE_URL` in `src/wakeword/modelUpdater.ts` must be the **directory** that holds the files, not the file itself. The updater appends the model name, so a base URL that already ends in `.dm` produces `.../<model>.dm/<model>.dm` and every request returns 404. The example uses a Cloudflare R2 public bucket:

```ts
export const WAKEWORD_MODEL_CDN_BASE_URL = 'https://pub-fa06ba558cd447a38e86d0d4cf3e6786.r2.dev';
```

Generate the `.sha256` sidecar after every model change and upload it together with the model:

```bash
node scripts/wakeword-model-hash.js path/to/hey_coach_model_28_22012026b.dm
# writes path/to/hey_coach_model_28_22012026b.dm.sha256 (use --out <dir> to place it elsewhere)
```

Give the `.sha256` file a short cache TTL so new versions are noticed quickly. The CDN must be served over HTTPS (iOS App Transport Security is left strict in this example).

#### How it behaves

- **App open**: before the wake word instance is created, the app fetches the `.sha256` sidecar (or, if it is missing, the model's `ETag`/`Last-Modified`/`Content-Length` from a `HEAD` request) and compares it with the model in use. Only when it differs is the `.dm` downloaded, hash-verified, and installed. The instance then loads the new file. The check is time-boxed (15 seconds) and silent: if the CDN is unreachable or the download fails, nothing is shown and the current model keeps working.
- **Menu, "Check for wake word update"**: same check, started by the user. It reports "up to date", "could not check", or "updated". After an update, when the app is idle (no prompt, narration, or speech session), it offers "Reload now", which hot-swaps the model on the running instance. Otherwise it asks the user to close the app completely and open it again.
- **CDN serves the bundled model again**: the downloaded copy is dropped and the app returns to the bundled model.

Downloaded models are stored under the app's documents directory in `wakeword_models/<sha256 prefix>/`, each version in its own folder so the native `.dm` unpack cache never serves a stale copy. The manifest next to them records what is installed; deleting the folder falls back to the bundled model.

#### Platform support

| Platform | Loads a downloaded model? | Notes |
|---|---|---|
| Android | Yes | The DaVoice `KeyWordsDetection` library checks `new File(path).exists()` before treating the string as an asset name. |
| iOS | Not yet (react-native-wakeword 1.1.143) | The DaVoice `KeyWordDetection.xcframework` resolves every model string as a main-bundle asset (`copyAssetToDocumentsDirectory`). An absolute path fails with `Failed to copy asset`. |

On iOS the download and install still succeed, but when the native instance rejects the path the app logs a warning and falls back to the bundled model (`addInstanceMulti` and `reloadWakewordModel` in [src/wakeword/index.ts](./src/wakeword/index.ts)). The "Reload now" action shows "Could not load the new model" instead of asking for a restart, since a restart would not help. Once the iOS framework accepts absolute paths (a one-line early return for paths that start with `/` and exist on disk, matching the Android behavior), downloaded models take effect on iOS with no app change.

#### Logging

The whole flow is traced in the console:

- `[WakewordFlow]`: app launch, permissions, init gating, bootstrap, instance creation, license, detection start, manual update check, and hot reload (`App.tsx` and `src/wakeword/index.ts`).
- `[WakewordModelUpdate]`: manifest state, the exact URLs requested, remote and bundled hashes, HEAD fallback metadata, download progress, verification, install path, cleanup, and the final `RESULT` line with the remaining time budget (`src/wakeword/modelUpdater.ts`).

#### Testing an update end to end

1. Keep two different versions of the model with the same file name, for example the bundled one in `assets/models/` and a newer one in `assets/models/new/`.
2. Create the sidecar for the new model:
   ```bash
   node scripts/wakeword-model-hash.js assets/models/new/hey_coach_model_28_22012026b.dm
   ```
3. Upload `hey_coach_model_28_22012026b.dm` and `hey_coach_model_28_22012026b.dm.sha256` from that folder to the CDN root, replacing the existing files. Verify:
   ```bash
   curl -sS https://<cdn>/hey_coach_model_28_22012026b.dm.sha256
   curl -sS https://<cdn>/hey_coach_model_28_22012026b.dm | shasum -a 256
   ```
   Both hashes must match.
4. **Startup path**: delete the app from the device, install, launch, and filter the console on `[WakewordModelUpdate]`. Expect `step 1: remote sha256 =`, `compare remote vs bundled` with two different hashes, `download verified`, `INSTALLING new model`, `RESULT updated`, then `using DOWNLOADED model`. On iOS a `[WakewordFlow]` warning follows and the bundled model is used (see Platform support).
5. **Already up to date**: relaunch without changing the CDN. Expect `remote sha256 matches the installed downloaded model` and `RESULT up_to_date` with no download.
6. **Manual check**: upload another version plus its sidecar, open the top-right menu, tap "Check for wake word update", then "Reload now". Android hot-swaps the model; iOS shows "Could not load the new model" and keeps running.
7. **Rollback**: upload the bundled model and its sidecar again and relaunch. Expect `switching back to the BUNDLED model` and `RESULT up_to_date`; the old version folder is removed.
8. **Offline**: disable networking and launch. Expect `RESULT unavailable` within seconds and a normal start on the active model.

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
- [src/wakeword/modelUpdater.ts](./src/wakeword/modelUpdater.ts): CDN update check and download for the `.dm` wake word model
- [scripts/wakeword-model-hash.js](./scripts/wakeword-model-hash.js): writes the `.sha256` sidecar to upload next to the model
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
