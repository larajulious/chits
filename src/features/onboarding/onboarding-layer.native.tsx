import { useEffect, useRef } from 'react';
import { router, usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { prepareLaunch } from './tour';

// Mounted once, at the root, above every screen: decides on launch whether this
// is a fresh install that should get the welcome tour.
export function OnboardingLayer() {
  const database = useSQLiteContext();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    // After the first frame, like ReminderCoordinator, so the navigator is mounted.
    // Only a launch that lands on the home screen may start the tour (never a deep link).
    const frame = requestAnimationFrame(() => {
      void prepareLaunch(database, pathnameRef.current === '/')
        .then((start) => { if (start && pathnameRef.current === '/') router.push('/onboarding/welcome'); })
        .catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [database]);

  return null;
}
