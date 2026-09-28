/**
 * The confirmation text for "Move back to Unorganized", shared by Card Details
 * and the Cards tab so both always ask first and say exactly the same thing.
 * The simple case (one Chit, nothing that only lives on the card) still gets a
 * short, reassuring confirmation; merged cards and card-only comments or
 * attachments — which are removed by this — are spelled out.
 */
export function detachConfirmationMessage(input: { boardName: string | null; messageCount: number; commentCount: number; attachmentCount: number }): string {
  const from = input.boardName ? ` from ${input.boardName}` : '';
  const chits = input.messageCount > 1
    ? `This card will be removed${from} and its ${input.messageCount} Chits will return to Unorganized.`
    : `This card will be removed${from} and its Chit will return to Unorganized.`;
  const extras: string[] = [];
  if (input.commentCount) extras.push(`${input.commentCount} comment${input.commentCount === 1 ? '' : 's'}`);
  if (input.attachmentCount) extras.push(`${input.attachmentCount} attachment${input.attachmentCount === 1 ? '' : 's'}`);
  const parts = [chits, 'Your Chits stay in Chat.'];
  if (extras.length) parts.push(`These belong only to the card and will be removed:\n${extras.map((extra) => `• ${extra}`).join('\n')}`);
  return parts.join('\n\n');
}
