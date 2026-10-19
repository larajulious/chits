/** Publish the timeline before optional pinned hydration, even when pins fail. */
export async function loadChatFeed<Page, Pinned>({
  isCurrent, loadTimeline, publishTimeline, onTimelineError, onTimelineSettled,
  loadPinned, publishPinned,
}: {
  isCurrent: () => boolean;
  loadTimeline: () => Promise<Page>;
  publishTimeline: (page: Page) => void;
  onTimelineError: () => void;
  onTimelineSettled: () => void;
  loadPinned: () => Promise<Pinned>;
  publishPinned: (pinned: Pinned) => void;
}): Promise<void> {
  try {
    const page = await loadTimeline();
    if (isCurrent()) publishTimeline(page);
  } catch {
    if (isCurrent()) onTimelineError();
  } finally {
    if (isCurrent()) onTimelineSettled();
  }
  if (!isCurrent()) return;
  try {
    const pinned = await loadPinned();
    if (isCurrent()) publishPinned(pinned);
  } catch { /* Pins are optional; a later focus or pin action retries. */ }
}
