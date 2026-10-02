import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { classifyMessage, classifyText, parseInlineContent, parseParagraphs, parseStructuredText } from '@/components/chat/message-presentation';
import { useTheme } from '@/components/theme-provider';
import { useStickySurface } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import type { Message } from '@/db/types';
import { useBackgroundReadability } from './background-readability';

type NoteProps = { message: Message; focused: boolean; onActions: () => void; onHideAgain?: () => void };
type ContentMode = 'compact' | 'detail';

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function messageLabel(message: Message) {
  return `You: ${message.text ?? 'Empty thought'}. ${formatTime(message.createdAt)}${message.updatedAt !== message.createdAt ? '. Edited' : ''}. Long press for actions.`;
}

export function MessageMetadata({ message, inside = false, onActions, onHideAgain, splitPills = false }: { message: Message; inside?: boolean; onActions: () => void; onHideAgain?: () => void; splitPills?: boolean }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const backgroundActive = useBackgroundReadability();
  const organization = message.organization;
  const openOrganization = () => {
    if (organization) router.push({ pathname: '/board/[id]', params: { id: organization.boardId, highlightColumnId: organization.columnId } });
  };
  return <View style={[styles.metadata, inside && styles.metadataInside, backgroundActive && !inside && { alignSelf: 'flex-end', backgroundColor: tokens.surface, paddingHorizontal: 8, borderRadius: 12 }]}>
    {organization ? (splitPills ? <>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open board ${organization.boardName} at column ${organization.columnName}`} accessibilityHint="Opens this column on its board" hitSlop={8} onPress={openOrganization} style={({ pressed }) => [styles.pill, { backgroundColor: tokens.accentSoft }, pressed && styles.pressed]}>
        <Icon name="folder-outline" size={11} color={tokens.accentStrong} />
        <AppText numberOfLines={1} style={[styles.pillText, { color: tokens.accentStrong }]}>{organization.boardName}</AppText>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open ${organization.columnName} in ${organization.boardName}`} accessibilityHint="Opens this column on its board" hitSlop={8} onPress={openOrganization} style={({ pressed }) => [styles.pill, { backgroundColor: tokens.accentSoft }, pressed && styles.pressed]}>
        <Icon name="calendar-outline" size={11} color={tokens.accentStrong} />
        <AppText numberOfLines={1} style={[styles.pillText, { color: tokens.accentStrong }]}>{organization.columnName}</AppText>
      </Pressable>
    </> : <Pressable accessibilityRole="link" accessibilityLabel={`Open ${organization.columnName} in ${organization.boardName}`} accessibilityHint="Opens this column on its board" hitSlop={8} onPress={openOrganization} style={({ pressed }) => [styles.boardChip, { backgroundColor: tokens.accentSoft }, pressed && styles.pressed]}>
      <Icon name="folder-outline" size={10} color={tokens.accentStrong} />
      <AppText numberOfLines={1} style={[styles.boardChipText, { color: tokens.accentStrong }]}>{organization.boardName} · {organization.columnName}</AppText>
    </Pressable>) : null}
    <AppText style={[styles.time, { color: tokens.textMuted }]}>{formatTime(message.createdAt)}{message.updatedAt !== message.createdAt ? ' · edited' : ''}</AppText>
    {message.pinned ? <Icon accessibilityLabel="Pinned" name="pin-outline" size={13} color={tokens.textMuted} /> : null}
    {/* A reminder belongs to this thought or its linked card. */}
    {(message.reminderAt ?? message.organization?.reminderAt) != null ? <Icon accessibilityLabel="Reminder set" name="notifications-outline" size={13} color={tokens.textMuted} /> : null}
    {onHideAgain ? <Pressable accessibilityRole="button" accessibilityLabel="Hide again" hitSlop={8} onPress={onHideAgain} style={({ pressed }) => [styles.privacyAction, pressed && styles.pressed]}><Icon name="eye-off-outline" size={16} color={tokens.textMuted} /></Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Thought actions" hitSlop={8} onPress={onActions} style={styles.more}>
      <Icon name="ellipsis-horizontal" size={17} color={tokens.textMuted} />
    </Pressable>
  </View>;
}

/** Sticky's outlined chat surfaces; null under Classic. */
function useStickyMessage() {
  const { tokens, styleTokens: t, styleColors } = useTheme();
  const sticky = useStickySurface();
  const b = t.radius.bubble;
  return {
    // A thought: its bubble color, outlined, the bottom-right corner tight like a tail.
    bubble: (focused: boolean) => sticky({ fill: tokens.bubble, radius: { topLeft: b, topRight: b, bottomRight: t.radius.card.bottomRight, bottomLeft: b }, outlineColor: focused ? tokens.accentStrong : undefined }),
    card: (focused: boolean) => sticky({ fill: styleColors.controlFill, radius: t.radius.panel, outlineColor: focused ? tokens.accentStrong : undefined }),
  };
}

export function QuickThoughtBubble({ message, focused, onActions, onHideAgain, preview = false }: NoteProps & { preview?: boolean }) {
  const { tokens } = useTheme();
  const sticky = useStickyMessage();
  const bubbleStyle = [styles.quickThought, { backgroundColor: tokens.bubble, borderColor: focused ? tokens.accentStrong : 'transparent' }, focused && styles.focused, sticky.bubble(Boolean(focused))];
  const content = <PlainTextContent text={message.text ?? ''} mode="compact" color={tokens.bubbleText} />;
  return <>
    {preview ? <View style={bubbleStyle}>{content}</View> : <Pressable
      accessibilityRole="button"
      accessibilityLabel={messageLabel(message)}
      delayLongPress={350}
      onLongPress={onActions}
      style={({ pressed }) => [bubbleStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>}
    {!preview ? <MessageMetadata message={message} onActions={onActions} onHideAgain={onHideAgain} /> : null}
  </>;
}

export function NoteCard({ message, focused, onActions, onHideAgain }: NoteProps) {
  const { tokens } = useTheme();
  const sticky = useStickyMessage();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={messageLabel(message)}
    delayLongPress={350}
    onLongPress={onActions}
    style={({ pressed }) => [styles.noteCard, { backgroundColor: tokens.surface, borderColor: focused ? tokens.accentStrong : tokens.borderSubtle }, focused && styles.focused, sticky.card(Boolean(focused)), pressed && styles.pressed]}
  >
    <PlainTextContent text={message.text ?? ''} mode="compact" color={tokens.textPrimary} />
    <MessageMetadata message={message} inside onActions={onActions} onHideAgain={onHideAgain} />
  </Pressable>;
}

export function StructuredNoteCard({ message, focused, onActions, onHideAgain }: NoteProps) {
  const { tokens } = useTheme();
  const sticky = useStickyMessage();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={messageLabel(message)}
    delayLongPress={350}
    onLongPress={onActions}
    style={({ pressed }) => [styles.noteCard, { backgroundColor: tokens.surface, borderColor: focused ? tokens.accentStrong : tokens.borderSubtle }, focused && styles.focused, sticky.card(Boolean(focused)), pressed && styles.pressed]}
  >
    <StructuredContent text={message.text ?? ''} mode="compact" />
    <MessageMetadata message={message} inside onActions={onActions} onHideAgain={onHideAgain} />
  </Pressable>;
}

function PlainTextContent({ text, mode, color }: { text: string; mode: ContentMode; color: string }) {
  const paragraphs = parseParagraphs(text);
  const textStyle = [mode === 'detail' ? styles.detailText : styles.noteText, { color }];
  if (paragraphs.length <= 1) return <TextWithLinks text={text} style={textStyle} />;
  return <View style={mode === 'detail' ? styles.detailParagraphs : styles.compactParagraphs}>{paragraphs.map((paragraph, index) => <TextWithLinks key={`${index}-${paragraph}`} text={paragraph} style={textStyle} />)}</View>;
}

function TextWithLinks({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const { tokens } = useTheme();
  return <AppText style={style}>{parseInlineContent(text).map((segment, index) => segment.kind === 'link'
    ? <AppText key={`${index}-${segment.text}`} accessibilityRole="link" onPress={(event) => { event.stopPropagation(); void Linking.openURL(segment.text); }} style={{ color: tokens.accentStrong, textDecorationLine: 'underline' }}>{segment.text}</AppText>
    : <AppText key={`${index}-${segment.text}`}>{segment.text}</AppText>)}</AppText>;
}

function StructuredContent({ text, mode, accentColor }: { text: string; mode: ContentMode; accentColor?: string }) {
  const { tokens } = useTheme();
  const bulletColor = accentColor ?? tokens.accent;
  const checkedIconColor = accentColor ? '#FFFFFF' : tokens.accentText;
  const lines = parseStructuredText(text);
  return <View style={[styles.structuredBody, mode === 'detail' && styles.structuredBodyDetail]}>
    {lines.map((line) => {
      if (line.kind === 'spacer') return <View key={line.key} style={mode === 'detail' ? styles.paragraphSpacerDetail : styles.paragraphSpacer} />;
      if (line.kind === 'copy') return <TextWithLinks key={line.key} text={line.text} style={[mode === 'detail' ? styles.structuredCopyDetail : styles.structuredCopy, { color: tokens.textPrimary }]} />;
      return <View key={line.key} style={[styles.itemRow, mode === 'detail' && styles.itemRowDetail]}>
        {line.checked === null
          ? <View style={[styles.bullet, mode === 'detail' && styles.bulletDetail, { backgroundColor: bulletColor }]} />
          : <View style={[styles.checkbox, mode === 'detail' && styles.checkboxDetail, { borderColor: line.checked ? bulletColor : tokens.borderSubtle, backgroundColor: line.checked ? bulletColor : 'transparent' }]}>{line.checked ? <Icon name="checkmark" size={12} color={checkedIconColor} /> : null}</View>}
        <TextWithLinks text={line.text} style={[mode === 'detail' ? styles.itemTextDetail : styles.itemText, { color: tokens.textPrimary }]} />
      </View>;
    })}
  </View>;
}

export function MessageContentRenderer({ message, mode, focused = false, accentColor, onActions, onHideAgain, onPressText, textAccessibilityLabel, renderAttachments }: { message: Message; mode: ContentMode; focused?: boolean; accentColor?: string; onActions?: () => void; onHideAgain?: () => void; onPressText?: () => void; textAccessibilityLabel?: string; renderAttachments?: () => ReactNode }) {
  const { tokens } = useTheme();
  const presentation = classifyMessage(message);
  const actions = onActions ?? (() => undefined);
  if (mode === 'compact') {
    if (presentation === 'attachment') return <>{renderAttachments?.()}</>;
    if (presentation === 'structured-note') return <StructuredNoteCard message={message} focused={focused} onActions={actions} onHideAgain={onHideAgain} />;
    if (presentation === 'note') return <NoteCard message={message} focused={focused} onActions={actions} onHideAgain={onHideAgain} />;
    return <QuickThoughtBubble message={message} focused={focused} onActions={actions} onHideAgain={onHideAgain} />;
  }
  const textPresentation = classifyText(message.text);
  const content = message.text ? textPresentation === 'structured-note'
    ? <StructuredContent text={message.text} mode="detail" accentColor={accentColor} />
    : <PlainTextContent text={message.text} mode="detail" color={tokens.textPrimary} /> : null;
  return <View style={styles.detailContent}>
    {message.attachments.length ? renderAttachments?.() : null}
    {content && onPressText ? <Pressable accessibilityRole="button" accessibilityLabel={textAccessibilityLabel ?? 'Edit content'} hitSlop={8} onPress={onPressText} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content}
  </View>;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  focused: { borderWidth: 2 },
  quickThought: { alignSelf: 'flex-end', maxWidth: '82%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderRadius: radii.compactCard },
  noteCard: { alignSelf: 'flex-end', width: '100%', maxWidth: 640, overflow: 'hidden', paddingHorizontal: spacing.md, paddingTop: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.contentCard },
  noteText: { fontSize: 16, lineHeight: 24 },
  compactParagraphs: { gap: spacing.sm },
  detailContent: { gap: spacing.sm },
  // Tighter than it used to be, but still visibly more than a bullet-to-bullet
  // gap — paragraphs read as a document, just a compact one now (see PHASE:
  // COMPACT CARD DETAILS CONTENT TYPOGRAPHY).
  detailParagraphs: { gap: spacing.sm },
  detailText: { fontSize: 16, lineHeight: 22 },
  structuredBody: { gap: spacing.xs },
  // Was spacing.md (16): with itemRowDetail's own minHeight removed below, that
  // extra gap was compounding with natural line-height to make list items read
  // as far apart as separate paragraphs. spacing.xs keeps items visually
  // distinct without the note dominating the screen.
  structuredBodyDetail: { gap: spacing.xs },
  structuredCopy: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  structuredCopyDetail: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  paragraphSpacer: { height: spacing.xxs },
  paragraphSpacerDetail: { height: spacing.xxs },
  itemRow: { minHeight: 28, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // No minHeight here (unlike compact's, which sizes a tappable chat-bubble row):
  // detail rows are static text, so their height should come from the text
  // itself, not an enforced touch-target minimum — that alone was the biggest
  // single contributor to oversized bullet spacing. Gap is the bullet-to-text
  // indentation now that bulletDetail below no longer adds its own marginRight.
  itemRowDetail: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  itemText: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 23 },
  itemTextDetail: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22 },
  bullet: { width: 6, height: 6, marginTop: 8, marginLeft: 5, marginRight: 5, borderRadius: 3 },
  // Smaller dot, and marginRight zeroed out so itemRowDetail's `gap` above is the
  // ONLY space between the dot and its text (avoids double-spacing the two). The
  // marginTop centers the dot on the first line's midpoint for the new 16/22
  // font/line-height (22 - 6) / 2 = 8.
  bulletDetail: { width: 6, height: 6, marginTop: 8, marginRight: 0 },
  checkbox: { width: 18, height: 18, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 5 },
  checkboxDetail: { width: 18, height: 18, marginTop: 2, borderRadius: 5 },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xxs, marginTop: spacing.xxs },
  metadataInside: { alignSelf: 'flex-end', minHeight: 40, marginTop: spacing.xs },
  boardChip: { maxWidth: 190, minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.xs, borderRadius: radii.pill },
  boardChipText: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  pill: { maxWidth: 140, minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.xs, borderRadius: radii.pill },
  pillText: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  time: { fontSize: 11, lineHeight: 15 },
  privacyAction: { width: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  more: { width: 36, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
});
