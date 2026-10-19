import assert from 'node:assert/strict';
import test from 'node:test';
import { chatButtonFrame, localChatOrigin } from '../src/services/chat-transition-motion.ts';

test('window measurements align with an overlay below native bars or in a split pane', () => {
  const measured = { x: 75, y: 762, size: 62 };
  assert.deepEqual(localChatOrigin(measured, { x: 12, y: 24 }), { x: 63, y: 738, size: 62 });
  const local = localChatOrigin(measured, { x: 12, y: 24 });
  assert.equal(local.x + 12, measured.x);
  assert.equal(local.y + 24, measured.y);
  assert.deepEqual(measured, { x: 75, y: 762, size: 62 });
});

test('the corner-button transition lifts continuously without a pause, snap or overshoot', () => {
  let previous = chatButtonFrame(0);
  assert.ok(previous.translateY === 0);
  for (let step = 1; step <= 280; step++) {
    const frame = chatButtonFrame(step / 280);
    assert.ok(frame.translateY < previous.translateY);
    assert.ok(Math.abs(frame.translateY - previous.translateY) < 1, 'no one-frame jump');
    assert.ok(frame.scale > 0.8 && frame.scale <= previous.scale);
    previous = frame;
  }
  assert.ok(previous.translateY > -32, 'keep movement local to the floating button');
});

test('interrupted/out-of-range progress always produces a bounded visible frame', () => {
  assert.deepEqual(chatButtonFrame(-1), chatButtonFrame(0));
  assert.deepEqual(chatButtonFrame(2), chatButtonFrame(1));
});
