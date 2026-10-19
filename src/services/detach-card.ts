import { countLabel, tr } from '@/localization/runtime';
/**
 * The confirmation text for "Move back to Unorganized", shared by Card Details
 * and the Cards tab so both always ask first and say exactly the same thing.
 * The simple case (one Chit, nothing that only lives on the card) still gets a
 * short, reassuring confirmation; merged cards and card-only comments or
 * attachments — which are removed by this — are spelled out.
 */
export function detachConfirmationMessage(input: { boardName: string | null; messageCount: number; commentCount: number; attachmentCount: number }): string {
  const from = input.boardName ? tr('detachcard.fromBoard', { board: input.boardName }) : '';
  const chits = input.messageCount > 1
    ? tr("messages.thisCardWillBeRemovedAndItsChits", { value1: from, value2: input.messageCount })
    : tr("messages.thisCardWillBeRemovedAndItsChit", { value1: from });
  const extras: string[] = [];
  if (input.commentCount) extras.push(countLabel('comment', input.commentCount));
  if (input.attachmentCount) extras.push(countLabel('attachment', input.attachmentCount));
  const parts = [chits, tr("detachcard.yourChitsStayInChat")];
  if (extras.length) parts.push(tr("messages.theseBelongOnlyToTheCardAndWill", { value1: extras.map((extra) => `• ${extra}`).join('\n') }));
  return parts.join('\n\n');
}
