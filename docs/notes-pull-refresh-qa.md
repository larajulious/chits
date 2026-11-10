# Notes elastic pull-back mascot

Updated November 7, 2026 using the supplied header mockup and the elastic
pull-back interaction request. The existing character, accessory preference,
colors, typography, controls, tabs, masonry and navigation remain in use.

The existing toolbar and scrolling hero share one measured header drawing
boundary. There is one mascot instance. Its gesture-controlled route exits to
the right, travels off screen, and enters from the top; returning reverses that
route. Source and destination use the same window coordinate system, with the
upper pose fitted between the existing toolbar action groups (including RTL).
There is no refresh banner or additional permanent layout space.

Pull distance has increasing exponential resistance. Shared values drive the
mascot route, grip acquisition, body tension, both hand anchors, and the curved
SVG upper edge of the hero's existing beige/dotted surface. The forearms reach
the curve using the original stroke colors, thicknesses and round hand shapes;
the endpoint remains on the edge as the body leans, squashes, blinks or recoils.
The text, buttons and cards translate without being warped. Canvas viewport
size is retained while the header stretches.

Release immediately springs the header back with damping 18, stiffness 210,
and mass 0.9, including a small overshoot. The mascot stays at the header while
the existing Notes reload runs, then leaves upward and returns from the right.
The release prompt fades as recoil starts so it cannot cover the returning
hero copy. There are no artificial production loading delays. A canceled pull
does not refresh. Repeated pulls cannot start concurrent refreshes, and errors,
blur/background and unmount restore the animation state. Reduced motion keeps
refresh functional with simplified travel, no elastic curvature or body bounce.

Files involved:

- `src/components/notes/notes-pull-refresh.native.tsx`: shared header stage, gesture/resistance, single-flight refresh, spring recoil, SVG surface and hand/edge geometry.
- `src/components/boards/boards-mascot-hero.native.tsx`: existing background/copy/bounds connected to shared elastic stretch; Boards retains its original inline mascot.
- `src/components/notes/notes-listing.native.tsx`: Notes-only controller and stable canvas viewport.
- `src/features/onboarding/welcome/chits-peek-mascot.tsx`: one mascot's off-screen route, tension pose and projected arm shoulders.
- `src/features/onboarding/welcome/mascot-art.tsx`: original arm/hand styling rendered against the grip anchors; no stretched oval hands.
- `src/app/(tabs)/index.native.tsx`: existing toolbar and desk enclosed by the shared header stage; existing Notes reload/error callbacks.
- `tests/native/notes-mascot.fixture.tsx`: shared stage and in-memory loading/failure/count probes.
- `src/components/boards/cards-collection.native.tsx` and `src/localization/locales/en.json`: retained from the initial refresh integration (native gesture coordination and three labels).

Completed checks:

- TypeScript and focused ESLint on changed production files and the fixture; whitespace checks. No native builds or unrelated test suites.
- Android, light in-memory fixture: one mascot, right exit/top entry, curved edge with both hands visibly anchored, lean, immediate recoil, one refresh and return.
- Actual Notes free canvas in dark mode: header grip/recoil/return captures, with no note edits.
- Android dark in-memory fixture, active Unorganized filter: a rejected refresh returned safely and retained the selected filter.
- Incomplete pull retained refresh count 1; two rapid full pulls during one operation advanced it only to 2.
- Reduced-motion refresh advanced count to 3 and returned safely; original Android animation-scale setting restored.
- Normal masonry scrolling kept the filter rail pinned and hid the mascot with the scrolled-away header.

Current local evidence:

- `/tmp/chits-elastic-pull-back.mp4`: recorded Android interaction, including grip, recoil and return.
- `/tmp/chits-elastic-warm-grip.png`: final warm beige grip/curved edge.
- `/tmp/chits-elastic-warm-recoil.png` and `/tmp/chits-elastic-warm-loading.png`: settled header with the mascot still present during loading.
- `/tmp/chits-elastic-warm-returned.png`: one successful refresh and restored hero.

- `/tmp/chits-elastic-idle.png`
- `/tmp/chits-elastic-exit-right.png`
- `/tmp/chits-elastic-top-entry.png`
- `/tmp/chits-elastic-final-grip.png` (actual Notes, dark)
- `/tmp/chits-elastic-fixture-failure.png`
- `/tmp/chits-elastic-fixture-cancelled.png`
- `/tmp/chits-elastic-fixture-repeated.png`
- `/tmp/chits-elastic-fixture-reduced.png`
- `/tmp/chits-elastic-fixture-scrolled.png`

Manual acceptance on Android and iOS:

1. Compare idle with the original screen; toolbar, hero dimensions and copy, tabs and note spacing should match.
2. Pull slowly and quickly. Watch the right exit/top entry; continue pulling and check that the hands stay on the curved edge, the arms extend, and resistance increases. Reverse direction midway.
3. Release below the threshold. Check spring return, no refresh and right-side re-entry. Cross the threshold repeatedly in one gesture and check one haptic.
4. Release above the threshold. Check immediate recoil, a small controlled overshoot, one refresh and safe return after success or failure. Repeat a pull while loading and interrupt the returning mascot with another pull.
5. Change categories, scroll, tap/hold notes, drag in My order, and navigate away while refreshing. No stuck state or unintended note/category changes.
6. Check free canvas, empty and populated masonry, light/dark, narrow screens, large text, RTL, reduced motion, VoiceOver/TalkBack and physical-device haptics.

For isolated review, temporarily export
`../../tests/native/notes-mascot.fixture` from `src/app/notes-mascot-qa.tsx`.
Open `chits://notes-mascot-qa?count=200`; add `mode=dark` or
`refreshFailure=1`. It uses in-memory notes and a fixture-only 1.2-second
operation to make recoil/loading reviewable. Its header reports refresh counts.
The temporary route is removed after checking.

iOS/device acceptance, live screen-reader interaction, large-text/narrow-screen
combinations, RTL rendering and measured frame rate remain pending. 60 FPS is a
target, not a profiled result. The supplied generated mockup contains two mascot
images; implementation keeps the requested single character and empties its
hero position during the interaction. The screen was not rebuilt or redesigned.


## Pulling-pose correction

The user's follow-up identified exposed feet and an awkward pulling pose.
The header mascot now omits the leg/foot SVG layer throughout travel (rather
than fading it), including top entry, cancellation and right-side return.
Standalone mascots retain their existing feet. The header pose uses the original
open oval eyes, an occasional refresh blink, a smaller body, less tilt and
squash, softer forearm curves, and a far shoulder attached inside the body.
The large recoil shrink was reduced; hand anchors and header physics are unchanged.

Correction files: `chits-peek-mascot.tsx`, `notes-pull-refresh.native.tsx`,
and this QA document. Verify top entry and cancellation at slow speed: no feet
or ghosted eyes should appear, and the same character should settle back into
the hero. TypeScript and focused ESLint passed; no native build was run.


Corrected-pose Android evidence: `/tmp/chits-pull-pose-corrected.mp4`,
`/tmp/chits-pose-fix-early-grip.png`, `/tmp/chits-pose-fix-ready.png`, and
`/tmp/chits-pose-fix-refreshing.png`. Entry/grip/refresh frames were inspected
with no foot paths visible. iOS visual acceptance remains pending.

## Close-grip reference correction (latest)

The newer cropped reference supersedes the dangling-arm pose above. The same
mascot now peeks closely behind two mitten grips. The forearm joints tuck
behind a gathered fabric lip; no legs are rendered during header travel.
Original face, body colors, tape and selected accessory remain in use.

`pull-fabric.tsx` adds tapered shaded SVG folds, a curved lip and yellow grip
accents. Their geometry and the front hands use the same shared edge values.
A lightweight animated overflow clip hides the lower body; no native bitmap
mask or additional layout section is used. Gesture-only header stretch reserves
room for the dots and prompt; the background covers that entire stretch.
The overlay clips at the safe header boundary, below the status bar.

Latest Android evidence: `/tmp/chits-reference-final.png` (threshold),
`/tmp/chits-reference-final-return.png` (restored hero). Refresh count increased
once after release; a sub-threshold cancellation left it unchanged. The prior
recording `/tmp/chits-reference-fix.mp4` predates the final mitten tracking fix
and safe-area crop; do not use it for final visual acceptance.

TypeScript, focused ESLint and `git diff --check` passed. No full build or
unrelated test suite was run. iOS and physical-device frame-rate checks remain
pending. Existing startup navigation/require-cycle warnings were also visible.

Manual checklist for this correction:
1. Pull slowly and quickly: original face, two close grips, no feet or exposed
   long arms; folds converge at the hands without obscuring toolbar buttons.
2. Reverse midway and release below threshold: no refresh; mascot returns to
   the right; no residual prompt, folds or permanent vertical spacing.
3. Release above threshold: one refresh, controlled spring recoil, clean return.
4. Repeat on iOS/Android with light/dark and reduced motion; check scrolling,
   category selection, note taps and safe-area clearance.

## Floating order switch and centered header

Moved the existing Recent/My order clock/sort control out of the top toolbar
and directly above Chat on the Notes masonry view. The original handler,
loading-disabled state and accessibility label remain. Placement uses Chat's
actual style dimensions and safe-area baseline, and fades with Chat navigation.
Canvas and Boards preserve their previous order-switch visibility.
The mascot corridor reserves equal space on each side, based on the larger
header action group, so its grips and body stay on the header centerline.

Android emulator: tapped the relocated switch into My order and back to Recent,
inspected `/tmp/chits-order-switch-verified.png` and the centered threshold pose
at `/tmp/chits-centered-pull.png`. Returned the emulator to its original canvas
layout after checking. TypeScript, focused ESLint and diff whitespace checks
passed; no full build. iOS/native accessibility acceptance remains pending.

Manual: toggle Recent/My order above Chat; pull and reverse to check centered
mascot/toolbar clearance; enter Chat and return; verify safe-area spacing on iOS.

## Pull and filter performance correction (latest)

Cause: the hero animated its layout height on every gesture/spring frame.
FlashList's header `onLayout` then sent the measured height back through JS to
position the independently overlaid horizontal filters. The canvas also needed
an animated negative margin to compensate for its changing viewport. That
created a layout/measurement feedback path and delayed filter movement.

The workspace now uses one shared UI-thread translateY for hero content,
filters and notes. Hero/list/canvas layout dimensions stay fixed. The negative
canvas margin and animated hero/copy/cover layout offsets were removed.
The beige background stays continuous behind the moving content, and the
mascot's paper edge follows the same transform. The small mascot-only clipping
bounds still animate; they do not resize the list or report header measurements.

While dragging, stretch follows the finger directly. On release, its current
value springs to zero independently of the mascot's journey/grip progress.
This avoids multiplying two simultaneous easing curves during return. A pull
that interrupts return starts from the current visual displacement.
The existing damped spring, threshold, data refresh and cancellation behavior
remain. The hidden refreshing label no longer causes a React render.

Drawing reductions: the beige dots are static rather than rebuilding two large
SVG background paths; grip hands are small static SVGs positioned/scaled with
transforms; the fold canvas is only 180 points tall; forearm surfaces are smaller
and stop drawing once fully occluded behind the grips.

Checks: TypeScript, focused ESLint and `git diff --check` passed. No full native
build or unrelated suite. Android emulator checked 200 in-memory notes with a
slow threshold pull, short cancellation, fast pull, filter scrolling/selection
and clean return. Successful pulls counted twice; cancellation did not increment
the counter. Main Notes canvas pull/return preserved note positions and zoom.
Temporary fixture route removed after checking.

Latest evidence: `/tmp/chits-smooth-reviewed.mp4`,
`/tmp/chits-smooth-reviewed-ready.png`, `/tmp/chits-smooth-reviewed-cancel.png`,
`/tmp/chits-smooth-reviewed-fast.png`, `/tmp/chits-smooth-reviewed-filter.png`,
`/tmp/chits-smooth-canvas-pull.png`, `/tmp/chits-smooth-canvas-return.png`.
An intermediate debug-emulator gfxinfo capture is at
`/tmp/chits-smooth-gfx-final.txt` (385 frames, 38 flagged janky, median 22 ms).
This was not a controlled before/after release benchmark and does not establish
60 FPS on physical devices. iOS and physical-device profiling remain pending.

Manual follow-up:
1. Pull slowly, quickly, then reverse mid-drag: filters and notes should move
   together without a one-frame catch-up or horizontal selection reset.
2. Release below/above threshold and grab during the return: no abrupt collapse,
   stuck offset or duplicate refresh; verify filters remain tappable afterward.
3. Repeat in canvas/masonry, light/dark, and on Android/iOS hardware; confirm
   canvas zoom and note positions stay fixed through the pull.

## Transition clipping and grip repair (latest)

The supplied broken-transition screenshot revealed a gap in the prior checks:
the lower-body clip was tied to grip strength, so it opened during partial pulls
and recoil, exposing the mascot below the fabric. The upper header clip also
kept moving while the face was visible. The hands were still interpolating
between their old positions and grip anchors while cloth tension had begun.

Clipping now changes on the hidden right/above segment of the existing route
(progress .22-.29), before top entry (.36-.55). Both boundaries hold throughout
the top pose; relaxing grip cannot reveal the lower body. Reaching uses its own
curve (.44-.55), finishing at both hand anchors before cloth tension begins
(.55-.75). Reverse travel releases the cloth before the hands leave the edge.
Hand scale grows continuously through the reach. These are shared-value curves;
the single mascot, fixed list layout and UI-thread content transform remain.

Android: inspected top entry, reaching, partial grip, threshold, recoil, upward
exit, near-threshold cancellation and restored hero with 200 fixture notes.
Evidence: `/tmp/chits-transition-repaired.mp4`,
`/tmp/chits-repaired-reach.png`, `/tmp/chits-repaired-partial-grip.png`,
`/tmp/chits-repaired-cancel-grip.png`, `/tmp/chits-repaired-cancel-recoil.png`,
`/tmp/chits-repaired-cancel-exit.png`, `/tmp/chits-repaired-restored.png`.
A fast pull was also checked with `/tmp/chits-repaired-fast-grip.png` and
`/tmp/chits-repaired-fast-return.png`. TypeScript, focused ESLint and whitespace
checks passed; no full build. iOS/device visual acceptance remains pending.

Manual regression: pause at a partial grip, reverse slowly, then release below
threshold. The lower-body/shadow outline must stay behind the sheet, hands must
be level when folds appear, and the upper clip must not sweep across the face.
Repeat with a fast pull and full refresh; check clean re-entry into the hero.

Speech layering regression (device verification pending): tap Chits in Notes
and Boards. The whole reply note and tail should draw in front of the mascot,
with the existing automatic dismissal and accessible announcement. Start a
pull while a reply is visible: speech should fade as Chits leaves the hero,
without blocking toolbar actions or pull gestures. Repeat after returning from
refresh and in reduced-motion mode. This correction was checked by source
review and `git diff --check` only; no builds or tests were run.
