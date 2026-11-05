import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether VoiceOver or TalkBack is on, kept current while the app runs. */
export function useScreenReader() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => { if (active) setEnabled(value); });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => { active = false; subscription.remove(); };
  }, []);
  return enabled;
}
