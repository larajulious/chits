export type ChatReturnPath = '/' | '/attachments';

// Guards callbacks crossing the UI/JS bridge against a newer navigation intent.
export function createChatTransitionLifecycle() {
  let generation = 0;
  let openingToken: number | null = null;
  let navigated = false;
  let focused = false;
  let closing = false;
  let expectingBalloonFocus = false;
  let balloonVisit = false;
  let returnPath: ChatReturnPath = '/';
  return {
    beginOpen(path: ChatReturnPath) {
      if (openingToken !== null || focused) return null;
      returnPath = path;
      openingToken = ++generation;
      navigated = false;
      closing = false;
      expectingBalloonFocus = true;
      return openingToken;
    },
    navigateOpen(token: number) {
      if (token !== openingToken || closing || navigated) return false;
      navigated = true;
      return true;
    },
    finishOpen(token: number) {
      if (token !== openingToken || closing) return false;
      openingToken = null;
      return true;
    },
    focus() {
      focused = true;
      closing = false;
      balloonVisit = expectingBalloonFocus;
      expectingBalloonFocus = false;
      return openingToken !== null;
    },
    close() {
      if (!focused || closing) return null;
      closing = true;
      openingToken = null;
      ++generation;
      return { balloonVisit, returnPath };
    },
    blur() {
      focused = false;
      closing = false;
      openingToken = null;
      expectingBalloonFocus = false;
      ++generation;
    },
  };
}
