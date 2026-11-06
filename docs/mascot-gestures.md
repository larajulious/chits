# Mascot gestures and personality

Implemented 2026-11-06 using the existing Expo 57, Reanimated 4.5.1 and react-native-svg stack. The versioned Expo 57 documentation was reviewed before implementation. No dependencies, application data schema, navigation or screen geometry were changed. The original bundled SVG and the current Classic/Ong artwork remain intact.

## Shared architecture and files

| Files | Responsibility |
| --- | --- |
| `src/components/mascot/mascot-gestures.ts` | Ten pose timelines, Easter egg, weighted selection, synchronous overlap gate and cancellation tokens |
| `src/components/mascot/gesture-animation.ts` | Applies individual part transforms/expressions through Reanimated; compact and reduced-motion adaptations |
| `src/components/mascot/use-mascot-accessibility.ts` | Initial and live system reduced-motion preference |
| `src/features/onboarding/welcome/use-mascot-rig.ts`, `mascot-machine.ts` | Extends the existing state machine, speech, entrance, activity ownership and sleeping; UI-thread idle tracks and lifecycle cleanup |
| `src/features/onboarding/welcome/chits-peek-mascot.tsx`, `mascot-art.tsx` | Existing split artwork, independently animated far arm, touch feedback and shared full/hero renderer |
| `src/components/mascot/chits-mascot.tsx` | Reusable public component and imperative context interface; preserves static/decorative rendering |
| Welcome screen, `use-journey-mascot.ts`, Notes/Boards listings and hero, `card-subtasks.native.tsx`, Plan screen, Focus home/stage, Spin stage, Appearance preview, EmptyState, mascot picker | Context wiring on existing surfaces |
| `tests/mascot-gestures.test.mjs`, `tests/native/mascot-gestures.fixture.tsx` | Controller/timeline/adapter regression tests and isolated native harness |

```tsx
<ChitsMascot
  size={76}
  interactive
  enableIdleAnimation
  context="notes"
  onGestureComplete={handleGestureComplete}
/>
```

`controlRef` exposes `tap(): boolean` and `play(gesture): void`. The existing rig adds `react(gesture)` and extends `say(line, gesture?)`. These control animation state only. Screens keep their existing repositories, state and save handlers. Selection cards retain their outer radio control and call the same tap gate without nesting another button.

## Gestures and admission

Wave 18%, Happy 16%, Laugh 14%, Thinking 12%, Shy 10%, Surprised 9%, Sleepy 7%, Peekaboo 6%, Dance 5%, Dizzy 3%. Selection excludes the preceding normal gesture and renormalizes the remaining weights. Welcome favors wave, Getting Started favors happy, and non-running Focus favors quieter gestures.

Arms, eyelids, gaze, supported expressions and body transforms have distinct timelines, each ending at the screen's own rest pose. Normal reactions cannot overlap, including multiple taps delivered in one React batch. Five taps within two seconds replace a normal reaction with one surprised/shake/wobble/pause/wave Easter egg. Its stale predecessor cannot complete or unlock it. The egg has a five-second cooldown.

Breathing, occasional blinks, small tilts and rare waves use Reanimated sequences/delays/repeats on the UI thread. There is no recurring JS idle animation loop. Existing sleeping and speech timers remain bounded and are cleaned up. Idle stops before gestures, on blur/background and while the Notes keyboard is open. Context events have one pending reaction, rather than an unbounded queue.

## Existing screen activity

- Welcome keeps its greeting/entrance and existing tour poses; taps favor waving.
- Getting Started keeps persisted milestone tracking and existing copy, with happy reactions to real progress.
- Notes and Boards react to changed loaded repository results, ignoring initial history and filter changes. Notes react after returning from the editor; nothing is added inside the editor. Board moves already update the board's timestamp, so the listing hero can acknowledge them on return without adding a mascot over the working board. Completed subtask artwork reacts after a successful existing save.
- Plan reacts to real completion increments, dances at the existing all-complete milestone, and uses wave/happy/sleepy greetings according to the existing time period.
- Focus preserves activity ownership, completion celebrations and the original timer. Running sessions admit no tap gestures or spontaneous waves/tilts. Hidden companions run no idle loop; the existing still companion remains still.
- Spin retains its existing watch-before-spin and result celebration transitions.
- Settings previews and selection cards accept the same reusable gestures. Empty guides stay still at rest and react on tap. Decorative mascots inside existing navigation controls keep those controls' original handlers.

## Artwork and accessibility boundaries

The original note body is also its head, so head tilts are restrained body tilts. Existing squint/happy eyes, surprise mouth, eyelids and blush are reused. There is no new face, dizzy-eye drawing or path morphing. The far arm was separated using exactly its existing paths; neutral placement is unchanged. Full mascots clip to their allocated square; compact reactions reduce lift, tilt and stretch, and existing hero masks still apply.

Press feedback uses a small compression and spring release. Reduced motion replaces every gesture, including the egg, with a brief supported expression, disabling travel, arm sweeps, stretch and rotation. Press feedback and costume transitions also follow the live preference. The button has the existing localized mascot label and supports accessibility activation. No sound was added; existing screen haptic handlers are retained.

Blur/background cancels timers and shared-value tracks, clears pending gesture/tap history, and invalidates active completion tokens. Returning restores the existing rest/watching/sleeping state without replaying an interrupted reaction. Unmount removes listeners and cancels animation tracks and accessibility hold timers.

## Verification

- TypeScript passed. ESLint passed with two existing unused-variable warnings in `src/app/board/[id].native.tsx` and `src/app/card/edit-content.native.tsx`.
- Seven new gesture tests passed: exact weights/no repeats, distinct finite timelines, overlap/rapid-tap preemption, stale callback rejection, tap-window expiry/cancellation, state ownership, actual adapter final poses/compact bounds and motion-free reduced expressions.
- Combined mascot, Settings, layout, Focus, Plan and Spin regression run: 244 passed / 245 total. The one existing Settings header source assertion expects `{title ? <HeaderTitleTag>` while unchanged production code uses `showTitle`. It was independently reproduced against unchanged HEAD during customization work.
- Localization audit passed: 21 bundled languages, 2,100 English keys, no missing keys or placeholder mismatches.
- Final iOS and Android production exports passed after removing the temporary `/mascot-gestures-qa` route. Hermes bundles and bundled assets are in `/tmp/chits-mascot-gestures-export`; the reusable harness remains under `tests/native` and is not a production route.
- Android emulator: all ten gestures and direct egg completed through the production rig; actual five rapid taps preempted a normal gesture. Compact rendering stayed inside its square. Backgrounding and navigating away cancelled an in-flight egg without a completion callback; a fresh wave worked after each return. Idle-to-tap returned to idle. Reduced-motion physical tap samples showed zero changed bandana/body landmark pixels, while expressions remained available. Both Android animation scale values were restored to their original value of 1.
- iOS simulator: the isolated harness ran all ten gestures and the egg to completion through the production rig, then five programmatic taps during a normal reaction completed the egg. Android exercised actual touch admission; iOS harness activation used the same imperative tap interface.

Native evidence is local to this session: [Android gesture results](/tmp/chits-native-gestures-results.json), [Shy pose](/tmp/chits-gesture-shy.png), [Compact reaction](/tmp/chits-compact-dizzy.png), [Android foreground rest](/tmp/chits-foreground-rest.png), [Reduced-motion sample](/tmp/chits-reduced-touch-release.png), [iOS all-gesture completion](/tmp/chits-ios-all-complete.png), [iOS rapid-tap completion](/tmp/chits-ios-rapid-complete.png).

Physical-device acceptance, measured 60 FPS/GPU profiling, signed-release lifecycle testing, and VoiceOver/TalkBack end-to-end interaction remain unperformed. Simulator/harness checks do not establish those results.
