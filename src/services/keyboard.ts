import { Keyboard } from 'react-native';

/**
 * Closes the keyboard and resolves once it has actually finished hiding (or
 * after a short timeout). Call this before anything that shows a system
 * permission prompt: on Android that prompt is a dialog-style activity that
 * pauses Chits without covering it, and a keyboard hide/show happening across
 * it can leave the screen's KeyboardAvoidingView sized as if the keyboard still
 * covered almost everything — a blank white screen until Back is pressed.
 */
export function dismissKeyboardAsync(timeoutMs = 400): Promise<void> {
  if (!Keyboard.isVisible()) {
    Keyboard.dismiss();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve();
    };
    const subscription = Keyboard.addListener('keyboardDidHide', finish);
    const timer = setTimeout(finish, timeoutMs);
    Keyboard.dismiss();
  });
}
