import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { classifyMessage, classifyText, parseInlineContent, parseParagraphs, parseStructuredText } from '@/components/chat/message-presentation';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';
import type { Message } from '@/db/types';

type NoteProps = { message: Message; focused: boolean; onActions: () => void };
type ContentMode = 'compact' | 'detail';

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function messageLabel(message: Message) {
  return `You: ${message.text ?? 'Empty thought'}. ${formatTime(message.createdAt)}${message.updatedAt !== message.createdAt ? '. Edited' : ''}. Long press for actions.`;
}

export function MessageMetadata({ message, inside = false, onActions, splitPills = false }: { message: Message; inside?: boolean; onActions: () => void; splitPills?: boolean }) {
  const { tokens } = useTheme();
  return <View style={[styles.metadata, inside && styles.metadataInside]}>
    {message.organization ? (splitPills ? <>
      <View accessibilityLabel={`Board: ${message.organization.boardName}`} style={[styles.pill, { backgroundColor: tokens.accentSoft }]}>
        <Ionicons accessible={false} name="folder-outline" size={11} color={tokens.accentStrong} />
        <Text numberOfLines={1} style={[styles.pillText, { color: tokens.accentStrong }]}>{message.organization.boardName}</Text>
      </View>
      <View accessibilityLabel={`Column: ${message.organization.columnName}`} style={[styles.pill, { backgroundColor: tokens.accentSoft }]}>
        <Ionicons accessible={false} name="calendar-outline" size={11} color={tokens.accentStrong} />
        <Text numberOfLines={1} style={[styles.pillText, { color: tokens.accentStrong }]}>{message.organization.columnName}</Text>
      </View>
    </> : <View accessibilityLabel={`Organized in ${message.organization.boardName}, ${message.organization.columnName}`} style={[styles.boardChip, { backgroundColor: tokens.accentSoft }]}>
      <Ionicons accessible={false} name="folder-outline" size={10} color={tokens.accentStrong} />
      <Text numberOfLines={1} style={[styles.boardChipText, { color: tokens.accentStrong }]}>{message.organization.boardName} · {message.organization.columnName}</Text>
    </View>) : null}
    <Text style={[styles.time, { color: tokens.textMuted }]}>{formatTime(message.createdAt)}{message.updatedAt !== message.createdAt ? ' · edited' : ''}</Text>
    {message.pinned ? <Ionicons accessibilityLabel="Pinned" name="pin-outline" size={13} color={tokens.textMuted} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Thought actions" hitSlop={8} onPress={onActions} style={styles.more}>
      <Ionicons accessible={false} name="ellipsis-horizontal" size={17} color={tokens.textMuted} />
    </Pressable>
  </View>;
}

export function QuickThoughtBubble({ message, focused, onActions }: NoteProps) {
  const { tokens, themeKey } = useTheme();
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={messageLabel(message)}
      delayLongPress={350}
      onLongPress={onActions}
      style={({ pressed }) => [
        styles.quickThought,
        { backgroundColor: themeKey === 'light' ? tokens.accentSoft : tokens.accent, borderColor: focused ? tokens.accentStrong : 'transparent' },
        focused && styles.focused,
        pressed && styles.pressed,
      ]}
    >
      <PlainTextContent text={message.text ?? ''} mode="compact" color={themeKey === 'light' ? tokens.textPrimary : tokens.accentText} />
    </Pressable>
    <MessageMetadata message={message} onActions={onActions} />
  </>;
}

export function NoteCard({ message, focused, onActions }: NoteProps) {
  const { tokens } = useTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={messageLabel(message)}
    delayLongPress={350}
    onLongPress={onActions}
    style={({ pressed }) => [styles.noteCard, { backgroundColor: tokens.surface, borderColor: focused ? tokens.accentStrong : tokens.borderSubtle }, focused && styles.focused, pressed && styles.pressed]}
  >
    <PlainTextContent text={message.text ?? ''} mode="compact" color={tokens.textPrimary} />
    <MessageMetadata message={message} inside onActions={onActions} />
  </Pressable>;
}

export function StructuredNoteCard({ message, focused, onActions }: NoteProps) {
  const { tokens } = useTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={messageLabel(message)}
    delayLongPress={350}
    onLongPress={onActions}
    style={({ pressed }) => [styles.noteCard, { backgroundColor: tokens.surface, borderColor: focused ? tokens.accentStrong : tokens.borderSubtle }, focused && styles.focused, pressed && styles.pressed]}
  >
    <StructuredContent text={message.text ?? ''} mode="compact" />
    <MessageMetadata message={message} inside onActions={onActions} />
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
  return <Text style={style}>{parseInlineContent(text).map((segment, index) => segment.kind === 'link'
    ? <Text key={`${index}-${segment.text}`} accessibilityRole="link" onPress={() => void Linking.openURL(segment.text)} style={{ color: tokens.accentStrong, textDecorationLine: 'underline' }}>{segment.text}</Text>
    : <Text key={`${index}-${segment.text}`}>{segment.text}</Text>)}</Text>;
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
          : <View style={[styles.checkbox, mode === 'detail' && styles.checkboxDetail, { borderColor: line.checked ? bulletColor : tokens.borderSubtle, backgroundColor: line.checked ? bulletColor : 'transparent' }]}>{line.checked ? <Ionicons accessible={false} name="checkmark" size={12} color={checkedIconColor} /> : null}</View>}
        <TextWithLinks text={line.text} style={[mode === 'detail' ? styles.itemTextDetail : styles.itemText, { color: tokens.textPrimary }]} />
      </View>;
    })}
  </View>;
}

export function MessageContentRenderer({ message, mode, focused = false, accentColor, onActions, renderAttachments }: { message: Message; mode: ContentMode; focused?: boolean; accentColor?: string; onActions?: () => void; renderAttachments?: () => ReactNode }) {
  const { tokens } = useTheme();
  const presentation = classifyMessage(message);
  const actions = onActions ?? (() => undefined);
  if (mode === 'compact') {
    if (presentation === 'attachment') return <>{renderAttachments?.()}</>;
    if (presentation === 'structured-note') return <StructuredNoteCard message={message} focused={focused} onActions={actions} />;
    if (presentation === 'note') return <NoteCard message={message} focused={focused} onActions={actions} />;
    return <QuickThoughtBubble message={message} focused={focused} onActions={actions} />;
  }
  const textPresentation = classifyText(message.text);
  return <View style={styles.detailContent}>
    {message.attachments.length ? renderAttachments?.() : null}
    {message.text ? textPresentation === 'structured-note'
      ? <StructuredContent text={message.text} mode="detail" accentColor={accentColor} />
      : <PlainTextContent text={message.text} mode="detail" color={tokens.textPrimary} /> : null}
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
  more: { width: 36, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
});
