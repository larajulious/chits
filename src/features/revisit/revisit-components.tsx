import { getFormattingLocale, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { createContext, useContext, type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import { DeskHeading, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PaperButton, PaperCard, useDesk, useHandwriting, useOnDesk } from '@/components/desk/paper-desk';
import { StyleSheet, View, type TextProps } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText as Text } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/surface';
import { mix, noteColors, stableTilt } from '@/constants/style-tokens';
import type { RevisitNote } from '@/services/revisit-engine';

type Ink = { primary: string; secondary: string; fill: string; frame: string; progress: string };
const PaperInk = createContext<Ink | null>(null);

// Ink comes from the paper a thing is written on; straight on the desk it is
// the desk's; anywhere else (sheets, theme pages) the theme's.
function useInk(): Ink {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, scheme } = useTheme();
  const desk = useDesk();
  const onDesk = useOnDesk();
  const paper = useContext(PaperInk);
  if (paper) return paper;
  if (onDesk) return { primary: desk.ink, secondary: desk.inkMuted, fill: desk.desk, frame: desk.rule, progress: desk.ink };
  return { primary: tokens.textPrimary, secondary: tokens.textSecondary, fill: tokens.surface, frame: tokens.borderSubtle, progress: scheme === 'dark' ? '#E6A5B6' : '#802743' };
}

export function RevisitText({ style, ...props }: ComponentProps<typeof Text>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const ink = useInk();
  return <Text {...props} style={[{ color: ink.primary }, style]} />;
}

/**
 * A note on the desk, as in Notes → Cards: a board's notes on a pastel of the
 * board's color, others on cream, each with its own fixed tilt and some taped.
 * Everything inside writes in the paper's ink.
 */
export function RevisitPaper({ children, note, id, onPress, label }: PropsWithChildren<{ note?: RevisitNote; id?: string; onPress?: () => void; label?: string }>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const accent = note?.boardAccent;
  const colors = accent ? noteColors(accent) : null;
  const fill = colors?.cardTint ?? PAPER_WHITE;
  const key = id ?? note?.key ?? 'revisit';
  const ink = { primary: PAPER_INK, secondary: colors?.cardInkMuted ?? PAPER_INK_MUTED, fill, frame: 'rgba(43,38,32,0.16)', progress: PAPER_INK };
  return <PaperInk.Provider value={ink}><PaperCard paper={fill} tilt={stableTilt(`revisit:${key}`, 0.8)} tape={stableTilt(`revisit:${key}:tape`, 1) > 0.35}
    accessible={!!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} onPress={onPress}>
    {children}
  </PaperCard></PaperInk.Provider>;
}

export function RevisitAction({ children, onPress, disabled = false, label, primary = false, quiet = false }: PropsWithChildren<{ onPress: () => void; disabled?: boolean; label?: string; primary?: boolean; quiet?: boolean }>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, styleColors, styleTokens } = useTheme();
  const ink = useInk();
  const { handBold } = useHandwriting();
  const onPaper = useContext(PaperInk) !== null;
  const onDesk = useOnDesk();
  const sticky = styleTokens.card.tinted;
  // On the desk or a paper, actions are paper slips (yellow leads) or a
  // handwritten word for the quiet ones.
  if (onPaper || onDesk) {
    if (quiet) return <PaperButton paper="transparent" accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={2} style={[styles.action, styles.quietPaper]}>
      <Text style={[handBold, styles.paperActionText, { color: ink.primary }]}>{children}</Text>
    </PaperButton>;
    return <PaperButton paper={primary ? PAPER_YELLOW : PAPER_WHITE} tilt={primary ? -1 : 0.8} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={2} style={styles.action}>
      <Text style={[handBold, styles.paperActionText, { color: PAPER_INK }]}>{children}</Text>
    </PaperButton>;
  }
  return <PressableSurface accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={2}
    fill={quiet ? undefined : primary ? (sticky ? styleColors.accentFill : tokens.accent) : mix(ink.fill, tokens.surface, 0.6)}
    border={primary || quiet ? undefined : ink.frame} radius={styleTokens.button.radius} outline={false} edge={false}
    style={[styles.action, disabled && { opacity: 0.4 }]}>
    <Text weight={primary ? '700' : '600'} style={[styles.actionText, { color: primary ? (sticky ? styleColors.onAccent : tokens.accentText) : quiet ? tokens.accentStrong : ink.primary }]}>{children}</Text>
  </PressableSurface>;
}

export function RevisitMore({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const ink = useInk();
  return <PressableSurface accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={2} outline={false} edge={false} style={[styles.more, disabled && { opacity: 0.4 }]}>
    <Icon name="ellipsis-horizontal" size={18} color={ink.secondary} />
  </PressableSurface>;
}

export function RevisitHeading({ children, count }: PropsWithChildren<{ count?: number }>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const onDesk = useOnDesk();
  if (onDesk && typeof children === 'string') return <DeskHeading title={children} count={count} style={styles.deskHeading} />;
  return <View style={styles.heading} accessibilityRole="header"><Text variant="display" weight="700" style={[styles.headingText, { color: tokens.textPrimary }]}>{children}</Text>
    {count !== undefined ? <Text style={[styles.count, { color: tokens.textMuted }]}>{count}</Text> : null}
  </View>;
}

export function RevisitBody({ children }: PropsWithChildren) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale(); return <View style={styles.body}>{children}</View>; }
export function RevisitTitle({ children, style, ...props }: TextProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { handBold } = useHandwriting();
  const onPaper = useContext(PaperInk) !== null;
  return <RevisitText variant="display" weight="600" numberOfLines={2} {...props} style={[styles.title, onPaper && [handBold, styles.handTitle], style]}>{children}</RevisitText>; }
export function RevisitCaption({ children, style, ...props }: TextProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const ink = useInk();
  return <Text {...props} style={[styles.caption, { color: ink.secondary }, style]}>{children}</Text>;
}

export function RevisitProgress({ note }: { note: RevisitNote }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const ink = useInk();
  if (!note.total) return null;
  const percent = Math.round(note.completed / note.total * 100);
  return <View style={styles.progress} accessible accessibilityLabel={tr("revisitcomponents.valueOfValueCompletedValuePercentValueRemaining", { value1: note.completed, value2: note.total, value3: percent, value4: note.total - note.completed })}>
    <View style={styles.progressLabels}><RevisitCaption>{note.completed} {' '}{tr("id.of")}{' '}{note.total} {' '}{tr("cardlistrow.done")}</RevisitCaption><RevisitCaption>{percent}%</RevisitCaption></View>
    <View style={[styles.progressTrack, { backgroundColor: mix(ink.fill, ink.progress, 0.12) }]}><View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: ink.progress }]} /></View>
  </View>;
}

export function RevisitFooter({ note, children }: PropsWithChildren<{ note?: RevisitNote }>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const ink = useInk();
  return <View style={styles.footer}><View style={styles.footerCopy}>
    {note ? <><View style={styles.location}>{note.boardAccent ? <View style={[styles.dot, { backgroundColor: note.boardAccent }]} /> : null}
      <RevisitCaption numberOfLines={1}>{note.boardName ?? tr("index.unorganized")}</RevisitCaption></View>
      <View style={styles.dateRow}><RevisitCaption>{new Date(note.updatedAt).toLocaleDateString(getFormattingLocale(), { month: 'short', day: 'numeric' })}</RevisitCaption>{note.pinned ? <Icon name="pin" size={10} color={ink.secondary} /> : null}</View></> : null}
  </View>{children}</View>;
}

export function RevisitNoteContent({ note, dates = false, moreRecent = false, previewLines, titleFirst = false }: { note: RevisitNote; dates?: boolean; moreRecent?: boolean; previewLines?: number; titleFirst?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const ink = useInk();
  const { hand } = useHandwriting();
  const onPaper = useContext(PaperInk) !== null;
  // A derived first-line title should not repeat as the first line of its body.
  const text = note.text.trim();
  const preview = text === note.title ? '' : text.startsWith(`${note.title}\n`) ? text.slice(note.title.length).trimStart() : text;
  const thoughtPreview = !titleFirst && !dates && note.key.startsWith('thought:') && text.startsWith(note.title);
  const date = (value: number) => new Date(value).toLocaleString(getFormattingLocale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return <RevisitBody>
    {thoughtPreview ? <RevisitText variant="paragraph" numberOfLines={previewLines ?? 6} style={[styles.thought, onPaper && [hand, styles.handThought]]}>{text.slice(0, 260)}{text.length > 260 ? '…' : ''}</RevisitText> : <RevisitTitle numberOfLines={dates ? 0 : 2}>{note.title}</RevisitTitle>}
    {dates ? <View style={styles.dates}><RevisitCaption>{tr("id.created")}{' '}{date(note.createdAt)}</RevisitCaption><RevisitCaption>{tr("revisitcomponents.updated")}{' '}{date(note.updatedAt)}</RevisitCaption>
      {moreRecent ? <View style={[styles.recentBadge, { backgroundColor: mix(ink.fill, ink.progress, 0.08) }]}><Icon name="time-outline" size={12} color={ink.secondary} /><RevisitCaption>{tr("revisitcomponents.moreRecentlyUpdated")}</RevisitCaption></View> : null}
    </View> : null}
    <RevisitProgress note={note} />
    {!thoughtPreview && preview ? <RevisitText variant="paragraph" numberOfLines={previewLines} style={[styles.preview, dates && styles.detailPreview]}>{preview.slice(0, dates ? 2400 : 260)}{preview.length > (dates ? 2400 : 260) ? '…' : ''}</RevisitText> : !text ? <RevisitCaption>{tr("revisitcomponents.openTheOriginalToSeeItsAttachments")}</RevisitCaption> : null}
  </RevisitBody>;
}

export function RevisitEmpty({ children, icon = 'documents-outline', compact = false }: PropsWithChildren<{ icon?: ComponentProps<typeof Icon>['name']; compact?: boolean }>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const desk = useDesk();
  const onDesk = useOnDesk();
  return <View style={[styles.empty, compact && styles.emptyCompact]}><View style={[styles.emptyIcon, compact && styles.emptyIconCompact, { backgroundColor: onDesk ? PAPER_WHITE : tokens.surfaceElevated }, onDesk && { boxShadow: `0px 2px 4px ${desk.shadow}` }]}><Icon name={icon} size={compact ? 16 : 18} color={onDesk ? PAPER_INK : tokens.textMuted} /></View><Text variant="paragraph" style={[styles.emptyText, { color: onDesk ? desk.inkMuted : tokens.textSecondary }]}>{children}</Text></View>;
}

export function RevisitActions({ children }: { children: ReactNode }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale(); return <View style={styles.actions}>{children}</View>; }

const styles = StyleSheet.create({
  body: { minWidth: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4, gap: 8 },
  title: { fontSize: 15.5, lineHeight: 21, letterSpacing: -0.2 },
  handTitle: { fontSize: 19, lineHeight: 25, letterSpacing: 0 },
  handThought: { fontSize: 17, lineHeight: 23, letterSpacing: 0 },
  deskHeading: { marginTop: 8, marginBottom: 6 },
  quietPaper: { boxShadow: 'none' },
  paperActionText: { fontSize: 17, lineHeight: 23, textAlign: 'center' },
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
  emptyCompact: { minHeight: 44, gap: 8, paddingVertical: 4 }, emptyIconCompact: { width: 26, height: 28, borderRadius: 6 },
});
