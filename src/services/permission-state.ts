type PermissionResponse = { granted: boolean; canAskAgain: boolean };

/**
 * - granted: go ahead.
 * - denied: the user just answered the system prompt with "Don't Allow". Stop
 *   quietly; App Review Guideline 5.1.1(iv) forbids following that answer with
 *   another prompt or a Settings shortcut.
 * - blocked: the system prompt was not shown because the user declined on an
 *   earlier attempt. The screen may offer Settings, since the user has just
 *   deliberately tried the feature again.
 */
export type PermissionState = 'granted' | 'denied' | 'blocked';

/**
 * Checks first and shows the system prompt only while the OS still allows it,
 * so each call asks at most once. Call only from a deliberate user action —
 * never from mount, focus or app-state effects.
 */
export async function resolvePermission(get: () => Promise<PermissionResponse>, request: () => Promise<PermissionResponse>): Promise<PermissionState> {
  const current = await get();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';
  return (await request()).granted ? 'granted' : 'denied';
}
