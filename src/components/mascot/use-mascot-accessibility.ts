import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export function useMascotReducedMotion() {
  const initial = useReducedMotion();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((next) => { if (active) setReduced(next); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}
