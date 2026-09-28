# Chat back transition

The previous reverse balloon animation drove the timeline/header and composer through separate opacity windows. The background photo lived outside those views. Back waited for the 260 ms reverse animation to finish before navigating, so the controls disappeared while the photo remained. The transition mask briefly hid that state, then exposed it again before navigation.

The entire native Chat now lives inside one `Animated.View`: background image, dim/blur treatment, timeline, header, composer, and supporting surfaces. That parent owns the balloon entrance reveal. After opening, the complete scene stays opaque and native navigation owns its removal.

Back changes the scene immediately, retaining the complete Chat until navigation changes focus. The custom reverse fades and mask pulse are removed. The traveling balloon entrance and navigation bar's return animation remain. Android header and hardware/edge-gesture Back share `closeChat`; an open search still closes first, preserving existing behavior.

The opening tab switch uses a Reanimated progress crossover instead of a timer. A lifecycle coordinator rejects stale animation/navigation callbacks after Back, blur, or unmount and prevents duplicate open/close requests. Transition progress is left intact on blur; the next opening resets it while Chat is inactive. Focus cleanup uses stable callbacks and no longer runs when opening state changes.

Balloon launches remember their originating tab. Direct/history entries use navigation history, with tab history enabled so a pushed Chat can return to its preceding detail screen. Root and tab scenes have explicit theme-matching backgrounds.

## Validation — September 28, 2026

- TypeScript and all 73 tests passed. Five lifecycle tests cover interrupted opening, duplicate navigation/back, stale callbacks, slow focus, and direct/history entries. The existing privacy check still requires temporary reveals to clear on actual focus loss.
- Lint reports no errors and the two existing unused-variable warnings in Settings. iOS and Android native builds succeeded.
- iPhone 17 / iOS 26.5 simulator: seven UI scenarios passed, including five Cards/photo returns, four Boards/photo returns, three Attachments/photo returns, five rapid open/back sequences, direct Card Details history, native iOS swipe-back, and three default-background returns.
- Android 13 emulator: header, hardware key, and system edge-gesture Back passed from Cards, Boards, and Attachments with a photo background; all three passed with the default background. Four open/back sequences with an 80 ms interval and a direct-card history return also passed.
- The old iOS recording reproduced the defect across three returns, with 14 decoded exit frames showing the photo after composer loss. Recorded updated tab returns showed zero such frames. Native iOS stack-pop and swipe recordings were inspected separately because those move/fade the entire scene; they retained the background, header, notes, and composer together.
- Android's recorded photo-background returns showed no background-only exit frames. QA used a separate package and fixture data; the installed user app was not modified.

Physical iPhone and Android device gesture behavior remain unverified for this fix. Native recordings and test results are retained under `/tmp/chits-transition-*` in this workspace session.
