# 3D car for screen 8 (Car agent)

The readable source of `assets/car3d/car3d_viewer.html` (three.js r170). The app loads that HTML in a WebView
(`src/redesign/Car3DView.tsx`): Android from `file:///android_asset/` (`assets.srcDirs` in `android/app/build.gradle`),
iOS from the app bundle (`project.pbxproj`).

## Messages
- Out: `{type:'ready'}` once loaded.
- In: `{type:'state', state: getCarState(), lastAction}` on every `onCarChange` (`lastAction` only when it is new).
- In: `{type:'pause', on}` — no rendering at all while `on` (the app pauses it while the agent works).

## Rebuild
Bundle `viewer.js` with three.js 0.170.0 and put the result in place of the HTML's `<script>` block:
`esbuild viewer.js --bundle --minify --format=iife`

## Changes from the original design files
- Performance (the agent model runs on the same CPU, measured on a Pixel 8): no auto-rotate; frames only while something
  changes; none while paused; at most 30 fps; pixel ratio at most 1.25; no `preserveDrawingBuffer`. Without the pause, a
  turn's answer took up to 16 s instead of 2–4 s.
- Interior: the deck surface no longer covers the cabin; lit two-tone seats with a rear bench, centre console, dashboard
  displays, inner door panels. The panoramic glass turns see-through while the roof is open.
- Seats: heater / ventilation per seat and level (1–3), shown as orange → red / light → deep blue.
- `snap()` (first state shows at once) and `view()` (fixed camera, for design previews).
