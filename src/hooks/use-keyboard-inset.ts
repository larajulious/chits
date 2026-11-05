import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type KeyboardEvent, type KeyboardMetrics } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// How far the keyboard reaches up from the bottom of the screen, for views
// that run to the screen's bottom edge. React Native's KeyboardAvoidingView
// measures itself against its parent rather than the screen, so below a
// header (Edit Note, Focus) it under-lifts and the toolbar ends up behind the
// keyboard; this reads the keyboard alone.
//
// iOS: from the frame the keyboard is about to take, animated with it.
// Android: the height it reports sits above the navigation bar, which under
// edge-to-edge also covers this app, so that bar's inset is added back.
const ios = Platform.OS === 'ios';
const reach = (metrics: KeyboardMetrics | undefined) => !metrics ? 0
  : ios ? Math.max(0, Dimensions.get('window').height - metrics.screenY) : metrics.height;

export function useKeyboardInset() {
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(() => Keyboard.isVisible() ? reach(Keyboard.metrics()) : 0);
  useEffect(() => {
    const update = (event: KeyboardEvent, open: boolean) => {
      if (ios && event.duration) LayoutAnimation.configureNext({ duration: event.duration, update: { duration: event.duration, type: LayoutAnimation.Types.keyboard } });
      setKeyboard(open ? reach(event.endCoordinates) : 0);
    };
    const listeners = ios
      ? [Keyboard.addListener('keyboardWillChangeFrame', (event) => update(event, reach(event.endCoordinates) > 0)), Keyboard.addListener('keyboardWillHide', (event) => update(event, false))]
      : [Keyboard.addListener('keyboardDidShow', (event) => update(event, true)), Keyboard.addListener('keyboardDidHide', (event) => update(event, false))];
    return () => listeners.forEach((listener) => listener.remove());
  }, []);
  return keyboard > 0 ? keyboard + (ios ? 0 : insets.bottom) : 0;
}
