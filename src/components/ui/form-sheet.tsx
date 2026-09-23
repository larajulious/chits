import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type KeyboardEvent, type ScrollViewProps, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { GlassSurface } from '@/components/ui/glass-surface';

// How much breathing room to leave between the focused field and the keyboard
// — the 12-20px range from PHASE: FIX KEYBOARD COVERING INPUTS.
const FOCUS_GAP = 16;

// The ref every FormSheet exposes to its caller — a small superset of what a
// plain ScrollView ref offers (`scrollTo`, used to reset scroll position on
// open) plus `requestVisible`, which a TextInput's own `onFocus` calls (with
// its own ref) to keep itself clear of the keyboard. Kept on the SAME ref
// object (rather than e.g. React Context) because the TextInputs that need to
// call `requestVisible` are authored in the parent sheet's own scope — the
// parent already holds this ref directly, so no extra plumbing is needed.
export type FormSheetHandle = {
  scrollTo: (options: { y?: number; x?: number; animated?: boolean }) => void;
  requestVisible: (inputRef: RefObject<TextInput | null>) => void;
};

type Props = PropsWithChildren<{
  visible: boolean;
  onRequestClose: () => void;
  closeAccessibilityLabel: string;
  // Rendered above the ScrollView, outside it — for sheets that want a
  // drag-handle/title/close row that stays put while the form beneath it
  // scrolls (see ColumnManagementSheet). Sheets without one just put
  // everything in `children` instead.
  header?: ReactNode;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  maxHeightPercent?: number;
  scrollEnabled?: boolean;
  accessibilityViewIsModal?: boolean;
  // The one trigger that focuses this sheet's first field, fired every time the
  // sheet is presented. TextInput's own `autoFocus` only fires once, on that
  // input's first mount — useless here since these sheets stay mounted (just
  // hidden) between opens, per the existing wasVisible-reset pattern — so
  // `autoFocus` either silently does nothing on reopen, or (paired with a
  // second, separate focus() call) can race and double-trigger the ScrollView's
  // scroll-to-focused-input behavior. One `onShow` call is the only trigger.
  onModalShow?: () => void;
}>;

// The shared Create/Edit Board & Column sheet shell — see PHASE: FIX BOTTOM
// SHEET KEYBOARD BEHAVIOR and PHASE: FIX KEYBOARD COVERING INPUTS. Every one of
// these sheets previously duplicated its own Modal + KeyboardAvoidingView +
// SafeAreaView + ScrollView boilerplate, and had drifted into inconsistent (and
// on iOS, competing) keyboard strategies.
//
// There is exactly ONE keyboard strategy here, shared by every sheet:
//   - The sheet itself never moves or resizes (no KeyboardAvoidingView padding
//     on iOS — it's a structural no-op there). The header stays put, the sheet
//     never disappears off-screen.
//   - A trailing spacer inside the ScrollView grows to the live keyboard height
//     (tracked from keyboardWillShow/keyboardWillChangeFrame/keyboardWillHide)
//     so there's always genuine scrollable room to reveal a field that's
//     behind the keyboard — zero height, so no permanent gap, when the
//     keyboard is closed.
//   - On focus, and again on every keyboard frame change while a field stays
//     focused (iOS can fire keyboardWillChangeFrame several times during the
//     open animation), the focused input's real on-screen position is
//     measured and compared against the CURRENT keyboard top. Only the
//     minimum scroll needed to clear it (if any) is applied — never a fixed
//     offset, never scrollToEnd(). This never runs from a text change.
// `automaticallyAdjustKeyboardInsets` is deliberately NOT used alongside this
// — it would be a second system fighting the same scroll position. Android
// keeps its existing, separate `KeyboardAvoidingView behavior="height"` —
// untouched, since it was never part of the reported iOS bug and none of the
// above (iOS-only) logic runs there.
export const FormSheet = forwardRef<FormSheetHandle, Props>(function FormSheet(
  { visible, onRequestClose, closeAccessibilityLabel, header, contentContainerStyle, maxHeightPercent = 100, scrollEnabled, accessibilityViewIsModal, onModalShow, children },
  forwardedRef,
) {
  const { tokens: theme } = useTheme();
  const scrollNodeRef = useRef<ScrollView | null>(null);
  const scrollOffsetRef = useRef(0);
  const keyboardScreenYRef = useRef(Dimensions.get('window').height);
  const focusedInputRef = useRef<RefObject<TextInput | null> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const requestVisible = useCallback((inputRef: RefObject<TextInput | null>) => {
    focusedInputRef.current = inputRef;
    const scrollNode = scrollNodeRef.current;
    const inputNode = inputRef.current;
    if (!scrollNode || !inputNode) return;
    inputNode.measureInWindow((_x, y, _width, height) => {
      const focusedInputBottom = y + height;
      const availableBottom = keyboardScreenYRef.current - FOCUS_GAP;
      if (focusedInputBottom <= availableBottom) return; // already fully visible — do nothing
      const requiredScroll = focusedInputBottom - availableBottom;
      scrollNode.scrollTo({ y: scrollOffsetRef.current + requiredScroll, animated: true });
    });
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    scrollTo: (options) => scrollNodeRef.current?.scrollTo(options),
    requestVisible,
  }), [requestVisible]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const handleFrame = (event: KeyboardEvent) => {
      keyboardScreenYRef.current = event.endCoordinates.screenY;
      setKeyboardHeight(Math.max(0, Dimensions.get('window').height - event.endCoordinates.screenY));
      // Re-check the SAME field against the keyboard's latest frame — iOS
      // reports this event several times while the keyboard is still
      // animating open, and each call converges on the correct final
      // position instead of overshooting (once visible, requiredScroll <= 0
      // and nothing further happens).
      if (focusedInputRef.current) requestVisible(focusedInputRef.current);
    };
    const handleHide = () => {
      keyboardScreenYRef.current = Dimensions.get('window').height;
      setKeyboardHeight(0);
      focusedInputRef.current = null;
    };
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', handleFrame),
      Keyboard.addListener('keyboardWillChangeFrame', handleFrame),
      Keyboard.addListener('keyboardWillHide', handleHide),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [requestVisible]);

  const close = () => {
    // Explicit rather than relying on the modal dismiss to incidentally resign
    // first responder — keeps no keyboard listener/animation lingering past the
    // sheet closing.
    Keyboard.dismiss();
    onRequestClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} onShow={onModalShow}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'android' ? 'height' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={closeAccessibilityLabel} style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView
          edges={['bottom']}
          accessibilityViewIsModal={accessibilityViewIsModal}
          style={[styles.safeArea, { maxHeight: `${maxHeightPercent}%` as `${number}%`, backgroundColor: theme.surface }]}
        >
          <GlassSurface style={[styles.sheet, { borderColor: theme.borderSubtle }]}>
            {header}
            <ScrollView
              ref={scrollNodeRef}
              scrollEnabled={scrollEnabled}
              onScroll={(event) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={32}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={contentContainerStyle}
            >
              {children}
              {/* Real scrollable room to reveal a covered field — grows only
                  while the keyboard is open, so it never adds permanent
                  whitespace once it's closed. */}
              <View pointerEvents="none" style={{ height: keyboardHeight }} />
            </ScrollView>
          </GlassSurface>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  safeArea: { width: '100%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheet: { flexShrink: 1, maxHeight: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  scroll: { flexShrink: 1 },
});
