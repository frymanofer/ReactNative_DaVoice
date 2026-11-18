# DaVoice Car Demo — redesign handoff

The approved redesign of `example_car_agent`, for implementing **one screen at a time** in the React Native app.
Visual direction: "VW Emerald" (dark obsidian + carbon fiber + brushed titanium + emerald LED glow).

Design canvas (live, interactive): https://claude.ai/artifact/VQEWjV2ZdQLVdYFtUpaFH8

## What is in this folder

| Folder | What |
|---|---|
| `screens/` | PNG of every screen, 1170×2532 (390×844 pt @3x). The visual target. |
| `source/` | The design source of each screen (`*.dc.html`): HTML with inline styles + a small JS class. Exact colors, sizes, spacing and the behavior logic (needle math, car state, command matcher). Read it like a spec; it is not React Native code. |
| `assets/` | `DaVoice_emblem.png` (512×512, transparent circle), `hood_background_A.jpg`, `hood_background_B.jpg` (572×996, status bar already cropped). |

## Global rules

- **No scrolling screens.** Every screen fits 390×844 pt. The only scrolling element allowed is the language list inside its panel (screen 1).
- Touch targets ≥ 44 pt (primary buttons 56–58 pt high).
- Fonts: Inter (400/500/600/700/800); tool calls in a monospace font.
- Don't put the in-app status bar inside the design; use the real translucent `StatusBar`.

### Color tokens

| Token | Hex | Use |
|---|---|---|
| bg | `#0B0F0E` | screen background |
| panel | `#0D1210` | recessed panels |
| carbon | `#141A18` / `#161D1B` | header backing, secondary buttons; carbon weave = 45° stripes `#161D1B`/`#0B0F0E` (3 px / 4 px) |
| button fill | `#1A2421` (85% opacity) | list tiles |
| titanium | `#4B5552` | bezel borders, rivets, secondary button border |
| olive | `#3A4D3F` | circuit-trace decorations, inactive rings |
| emerald | `#10B981` | active borders, primary button bottom |
| mint | `#34D399` | glow, icons, primary button top, active states |
| mint light | `#6EE7B7` | eyebrow labels, reply text |
| text | `#F9FAFB` / secondary `#9CA3AF` / size tags `#D1D5DB` |
| warning | `#F59E0B` / `#FBBF24` | blocked actions, seat/wheel heating |
| vent | `#60A5FA` | seat ventilation |

Glow = `shadow 0 0 12px rgba(16,185,129,0.35)`. Primary button = vertical gradient `#34D399 → #10B981`, text `#04140D`, 700.

## Screens, in implementation order

Line numbers are from `App.tsx` as of 2026-11-18 and may have moved.

### 1 · Language — "under the hood"
- PNGs: `01a` (option A, chosen design), `01b` (option B, side rack). `01c/01d` = plain dropdown fallback.
- Code today: `if (!appLanguage)` render (~line 2437).
- Background: `hood_background_A.jpg`, cover, top-aligned.
- The **selected language** shows on the engine as a glowing "Active module" plate (code + name + size), centered at ~y 384.
- Bottom panel (from y 470): title "CHOOSE YOUR LANGUAGE", subtitle, **2-column scrolling list** of all non-hidden `APP_LANGUAGES` (`CODE • native name`, size from `languagePackSizeBytes`, download icon or ✓ when selected), and a pinned primary button "Install <language> · <size>".
- **Default selection: Brazilian Portuguese (pt-BR).** Tapping a tile only selects it; the button calls `selectAppLanguage(id)`.

### 2 · Install — speedometer
- PNGs: `02a` (in progress), `02b` (done). Code today: `if (!appLanguage && languagePackDownload)` (~line 2387).
- A speedometer dial, 0 → 100, arc from 135° to 405° (270° sweep). **Needle angle = 135 + 2.7 × pct**, where `pct = floor(bytesDone / bytesTotal × 100)` from `languagePackDownload.progress`. Animate the needle on every progress update (spring/timing ~350 ms).
- Emerald value arc + ticks/labels that light up as passed; big centered number + unit label (km/h).
- Three steps below: Downloading (MB done/total), Checking the download (`progress.stage === 'verify'`), Installed on the engine.
- Button: "Cancel installation" → `leaveLanguagePackDownload`; on error show Retry → `startLanguagePackDownload(language)`; at 100% "Ready to drive — choose a voice".
- Needs `react-native-svg` (not installed yet) for the dial, or draw it with rotated Views.

### 3 · Voice
- PNG `03`. Code: `if (showTTSModelPrompt)` (~line 3057).
- Compact emblem header, "Clone a new voice" dashed row → `openVoiceCloneScreen`, expressive voices (2-up, from `voiceAbilities`), 3 style chips (play examples), built-in voices 5-up, cloned voices row, Back + "Continue with <voice>".

### 4 · Speaker verification
- PNG `04`. Code: `if (showSVPrompt)` (~line 2720). Same choices as today (use existing / redo / create / skip), restyled.

### 5 · Voice signature capture
- PNG `05`. Code: `showSVStatusScreen` with `svStatusPhase === 'onboarding'` (~line 2770). Progress ring = `svOnboardingCollected / svOnboardingTarget`, 5 segment dots, the current step message in the card.

### 6 · Wake word
- PNG `06`. Code: the home screen (final `return`, after line 3455). Big emblem with pulsing emerald rings, the wake word phrase (from `wakeWords`), chips for voice / language / speaker check.

### 7 · Agent loading
- PNG `07`. Code: `shouldShowFullAIChatScreen && isLocalAIChat && localModelStatus !== 'Ready'` (~line 2472). Same stages as today (`loadingStage`), restyled.

### 8 · Car agent — one live car
- PNGs: `08a` (ready), `08b` (after: driver window, "I'm cold", sunroof, navigate home), `08c` (ambient blue, rear-left door, trunk).
- Code: `shouldShowFullAIChatScreen && isLocalAIChat` (~line 2553) and `src/car/CarCard.tsx`.
- **One top-down car drawing rendered from `getCarState()`**, re-rendered on `onCarChange` (exactly as `CarCard` does today). No per-command screens: every tool call changes `CarState`, the drawing reflects it.
- State → visual mapping:
  - `windows[pos]`: emerald strip on that side; length = open 100% / half 50% / crack 20%.
  - `doors[pos] === 'open'`: door panel swung out 38°. `locked`: lock icon at the rear + "Locked" tile.
  - `sunroof`: closed solid glass / tilt dashed emerald / open emerald outline.
  - `trunk`, `frunk`, `chargePort` open: emerald fill + outline. Blocked action (`CarAction.ok === false`) on a part: amber blink.
  - `seatHeater` / `seatVentilation`: seat fill orange / blue. `wheelHeater`: steering ring orange.
  - `defrost.windshield / rear`: orange heat lines on the glass. `ambient.on`: cabin outline in `ambient.color`.
  - `audioFocus` / active call: sound waves around that seat.
- Around the car: driver/passenger temperature, fan, fuel/range (left); volume/source, doors/lock (right).
- Top banner: navigation (`destination`, ETA), call, radio/media, vehicle status; otherwise "Parked/Driving · all on-device". Reset + settings (model, local confidence) as icon buttons next to it.
- Last-action card: "You: <transcript>", action summary, exact tool call (mono), "Kate: <reply>". Amber when blocked.
- Header: Back, emblem, "Car Agent", Parked/Driving switch (`setDriving`).
- The suggestion chips + text box in the design are only there to make the canvas prototype interactive; in the app the input is the voice (wake word → STT). Keep them only as a dev aid if wanted.

## Brand note
The emblem and hood backgrounds contain the VW logo. Fine for internal demos; get VW's approval before external use.
