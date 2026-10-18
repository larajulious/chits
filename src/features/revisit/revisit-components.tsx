import { createContext, useContext, type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View, type TextProps } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText as Text } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { NoteCard, useNoteColors } from '@/components/ui/note-card';
import { PressableSurface } from '@/components/ui/surface';
import { tintWithAccent } from '@/constants/board-appearance';
import { mix } from '@/constants/style-tokens';
import type { RevisitNote } from '@/services/revisit-engine';

type Ink = { primary: string; secondary: string; fill: string; frame: string; progress: string };
const PaperInk = createContext<Ink | null>(null);

function useInk(): Ink {
  const { tokens, scheme } = useTheme();
  const paper = useContext(PaperInk);
  return paper ?? { primary: tokens.textPrimary, secondary: tokens.textSecondary, fill: tokens.surface, frame: tokens.borderSubtle, progress: scheme === 'dark' ? '#E6A5B6' : '#802743' };
}

export function RevisitText({ style, ...props }: ComponentProps<typeof Text>) {
  const ink = useInk();
  return <Text {...props} style={[{ color: ink.primary }, style]} />;
}

/** The same collection variant, board tint, frame and ink as Notes → Cards. */
export function RevisitPaper({ children, note, id, onPress, label }: PropsWithChildren<{ note?: RevisitNote; id?: string; onPress?: () => void; label?: string }>) {
  const { tokens, scheme, styleTokens } = useTheme();
  const colors = useNoteColors(note?.boardAccent);
  const accent = note?.boardAccent;
  const dark = scheme === 'dark';
  const paper = accent ? tintWithAccent(tokens.cardBase, accent, dark ? 0.16 : 0.1) : tokens.cardPaper;
  const fill = styleTokens.card.tinted ? colors.cardTint : paper;
  const ink = {
    primary: styleTokens.card.tinted ? colors.cardInk : tokens.textPrimary,
    secondary: styleTokens.card.tinted ? colors.cardInkMuted : tokens.textSecondary,
    fill,
    frame: mix(fill, styleTokens.card.tinted ? colors.cardEdge : tokens.textSecondary, dark ? 0.24 : 0.12),
    progress: styleTokens.card.tinted ? colors.cardInk : dark ? '#E6A5B6' : '#802743',
  };
  return <PaperInk.Provider value={ink}><NoteCard id={id ?? note?.key ?? 'revisit'} accent={accent} paper={paper} border={ink.frame} variant="collection"
    accessible={!!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} onPress={onPress}>
    {children}
  </NoteCard></PaperInk.Provider>;
}

export function RevisitAction({ children, onPress, disabled = false, label, primary = false, quiet = false }: PropsWithChildren<{ onPress: () => void; disabled?: boolean; label?: string; primary?: boolean; quiet?: boolean }>) {
  const { tokens, styleColors, styleTokens } = useTheme();
  const ink = useInk();
  const sticky = styleTokens.card.tinted;
  return <PressableSurface accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={2}
    fill={quiet ? undefined : primary ? (sticky ? styleColors.accentFill : tokens.accent) : mix(ink.fill, tokens.surface, 0.6)}
    border={primary || quiet ? undefined : ink.frame} radius={styleTokens.button.radius} outline={false} edge={false}
    style={[styles.action, disabled && { opacity: 0.4 }]}>
    <Text weight={primary ? '700' : '600'} style={[styles.actionText, { color: primary ? (sticky ? styleColors.onAccent : tokens.accentText) : quiet ? tokens.accentStrong : ink.primary }]}>{children}</Text>
  </PressableSurface>;
}

export function RevisitMore({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const ink = useInk();
  return <PressableSurface accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={2} outline={false} edge={false} style={[styles.more, disabled && { opacity: 0.4 }]}>
    <Icon name="ellipsis-horizontal" size={18} color={ink.secondary} />
  </PressableSurface>;
}

export function RevisitHeading({ children, count }: PropsWithChildren<{ count?: number }>) {
  const { tokens } = useTheme();
  return <View style={styles.heading} accessibilityRole="header"><Text variant="display" weight="700" style={[styles.headingText, { color: tokens.textPrimary }]}>{children}</Text>
    {count !== undefined ? <Text style={[styles.count, { color: tokens.textMuted }]}>{count}</Text> : null}
  </View>;
}

export function RevisitBody({ children }: PropsWithChildren) { return <View style={styles.body}>{children}</View>; }
export function RevisitTitle({ children, style, ...props }: TextProps) { return <RevisitText variant="display" weight="600" numberOfLines={2} {...props} style={[styles.title, style]}>{children}</RevisitText>; }
export function RevisitCaption({ children, style, ...props }: TextProps) {
  const ink = useInk();
  return <Text {...props} style={[styles.caption, { color: ink.secondary }, style]}>{children}</Text>;
}

export function RevisitProgress({ note }: { note: RevisitNote }) {
  const ink = useInk();
  if (!note.total) return null;
  const percent = Math.round(note.completed / note.total * 100);
  return <View style={styles.progress} accessible accessibilityLabel={`${note.completed} of ${note.total} completed, ${percent} percent, ${note.total - note.completed} remaining`}>
    <View style={styles.progressLabels}><RevisitCaption>{note.completed} of {note.total} done</RevisitCaption><RevisitCaption>{percent}%</RevisitCaption></View>
    <View style={[styles.progressTrack, { backgroundColor: mix(ink.fill, ink.progress, 0.12) }]}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: ink.progress }]} /></View>
  </View>;
}

export function RevisitFooter({ note, children }: PropsWithChildren<{ note?: RevisitNote }>) {
  const ink = useInk();
  return <View style={styles.footer}><View style={styles.footerCopy}>
    {note ? <><View style={styles.location}>{note.boardAccent ? <View style={[styles.dot, { backgroundColor: note.boardAccent }]} /> : null}
      <RevisitCaption numberOfLines={1}>{note.boardName ?? 'Unorganized'}</RevisitCaption></View>
      <View style={styles.dateRow}><RevisitCaption>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</RevisitCaption>{note.pinned ? <Icon name="pin" size={10} color={ink.secondary} /> : null}</View></> : null}
  </View>{children}</View>;
}

export function RevisitNoteContent({ note, dates = false, moreRecent = false, previewLines }: { note: RevisitNote; dates?: boolean; moreRecent?: boolean; previewLines?: number }) {
  const ink = useInk();
  // A derived first-line title should not repeat as the first line of its body.
  const text = note.text.trim();
  const preview = text === note.title ? '' : text.startsWith(`${note.title}\n`) ? text.slice(note.title.length).trimStart() : text;
  const thoughtPreview = !dates && note.key.startsWith('thought:') && text.startsWith(note.title);
  const date = (value: number) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return <RevisitBody>
    {thoughtPreview ? <RevisitText variant="paragraph" numberOfLines={previewLines ?? 6} style={styles.thought}>{text.slice(0, 260)}{text.length > 260 ? '…' : ''}</RevisitText> : <RevisitTitle numberOfLines={dates ? 0 : 2}>{note.title}</RevisitTitle>}
    {dates ? <View style={styles.dates}><RevisitCaption>Created {date(note.createdAt)}</RevisitCaption><RevisitCaption>Updated {date(note.updatedAt)}</RevisitCaption>
      {moreRecent ? <View style={[styles.recentBadge, { backgroundColor: mix(ink.fill, ink.progress, 0.08) }]}><Icon name="time-outline" size={12} color={ink.secondary} /><RevisitCaption>More recently updated</RevisitCaption></View> : null}
    </View> : null}
    <RevisitProgress note={note} />
    {!thoughtPreview && preview ? <RevisitText variant="paragraph" numberOfLines={previewLines} style={[styles.preview, dates && styles.detailPreview]}>{preview.slice(0, dates ? 2400 : 260)}{preview.length > (dates ? 2400 : 260) ? '…' : ''}</RevisitText> : !text ? <RevisitCaption>Open the original to see its attachments.</RevisitCaption> : null}
  </RevisitBody>;
}

export function RevisitEmpty({ children, icon = 'documents-outline' }: PropsWithChildren<{ icon?: ComponentProps<typeof Icon>['name'] }>) {
  const { tokens } = useTheme();
  return <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: tokens.surfaceElevated }]}><Icon name={icon} size={18} color={tokens.textMuted} /></View><Text variant="paragraph" style={[styles.emptyText, { color: tokens.textSecondary }]}>{children}</Text></View>;
}

export function RevisitActions({ children }: { children: ReactNode }) { return <View style={styles.actions}>{children}</View>; }

const styles = StyleSheet.create({
  body: { minWidth: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4, gap: 8 },
  title: { fontSize: 15.5, lineHeight: 21, letterSpacing: -0.2 },
  preview: { fontSize: 13, lineHeight: 19 },
  detailPreview: { fontSize: 15, lineHeight: 22 }, thought: { fontSize: 15, lineHeight: 21, letterSpacing: -0.15 },
  caption: { fontSize: 11, lineHeight: 16 },
  heading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  headingText: { flexShrink: 1, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 }, count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  progress: { gap: 7, marginTop: 4 }, progressLabels: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 2 },
  dates: { gap: 4, marginTop: 2 }, recentBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', flexWrap: 'wrap', gap: 5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  footer: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 6, paddingBottom: 4, marginTop: 6 },
  footerCopy: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 5 }, location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 }, dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  action: { minHeight: 44, minWidth: 48, maxWidth: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { fontSize: 13, lineHeight: 18, textAlign: 'center' }, more: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  empty: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  emptyIcon: { width: 36, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, emptyText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19 },
});
