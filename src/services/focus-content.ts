import { newBlockKey, type NoteDraftBlock } from './note-content';

/** Quick Capture appends a plain paragraph without extending the last list or
 * moving an image. The caller persists with the normal note repository. */
export function appendFocusThought(blocks: NoteDraftBlock[], thought: string): NoteDraftBlock[] {
  const next = [...blocks];
  const last = next[next.length - 1];
  if (last?.type === 'text' && !last.list) next[next.length - 1] = { ...last, text: `${last.text}${last.text ? '\n\n' : ''}${thought}` };
  else next.push({ key: newBlockKey(), type: 'text', text: thought });
  return next;
}
