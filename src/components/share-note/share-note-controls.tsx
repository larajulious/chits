import { memo, type ComponentProps, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';
import { SHARE_NOTE_COLLECTIONS, type ShareNoteFontStyle, type ShareNoteTheme } from '@/constants/chits-themes';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import type { ShareNoteImage } from '@/services/share-note';

export function ControlSection({ title, hint, hintEmphasis = false, children }: { title: string; hint?: string | null; hintEmphasis?: boolean; children: ReactNode }) {
  const { tokens: theme } = useTheme();
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
    {children}
    {hint ? <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: hintEmphasis ? theme.accentStrong : theme.textMuted }, hintEmphasis && styles.hintEmphasis]}>{hint}</Text> : null}
  </View>;
}

export type SegmentOption<Key extends string> = { key: Key; label: string; detail?: string; disabled?: boolean };

export function SegmentedControl<Key extends string>({ options, value, onChange, label }: { options: SegmentOption<Key>[]; value: Key; onChange: (key: Key) => void; label: string }) {
  const { tokens: theme } = useTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: theme.surfaceElevated }]}>
    {options.map((option) => {
      const selected = option.key === value;
      return <Pressable
        key={option.key}
        accessibilityRole="radio"
        accessibilityLabel={option.detail ? `${option.label}, ${option.detail}` : option.label}
        accessibilityState={{ selected, disabled: option.disabled }}
        disabled={option.disabled}
        onPress={() => onChange(option.key)}
        style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: theme.background }], option.disabled && styles.disabled]}
      >
        <Text numberOfLines={1} style={[styles.segmentLabel, { color: selected ? theme.textPrimary : theme.textSecondary }]}>{option.label}</Text>
        {option.detail ? <Text style={[styles.segmentDetail, { color: theme.textMuted }]}>{option.detail}</Text> : null}
      </Pressable>;
    })}
  </View>;
}

const SERIF = Platform.select({ ios: 'ui-serif', default: 'serif' });
// The swatch's "Aa" in each voice's face (undefined = the system face).
const SWATCH_FACE: Partial<Record<ShareNoteFontStyle, string>> = { elegant: SERIF, expressive: SERIF, classic: SERIF, mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }) };

const ThemeSwatch = memo(function ThemeSwatch({ item, selected, onPress }: { item: ShareNoteTheme; selected: boolean; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  const { colors } = item;
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${item.name} theme. ${item.mood}`} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.swatch, pressed && styles.pressed]}>
    <View style={[styles.swatchFrame, { borderColor: selected ? theme.accent : 'transparent' }]}>
      <View style={[styles.swatchCanvas, { backgroundColor: colors.background }]}>
        {item.backgroundType === 'gradient' ? <LinearGradient colors={[colors.background, colors.backgroundEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        <View style={[styles.swatchCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.swatchGlyph, { color: colors.textPrimary, fontStyle: item.fontStyle === 'elegant' ? 'italic' : 'normal', fontWeight: item.fontStyle === 'bold' ? '900' : '700', fontFamily: SWATCH_FACE[item.fontStyle] }]}>Aa</Text>
          <View style={[styles.swatchAccent, { backgroundColor: colors.accent }]} />
        </View>
      </View>
    </View>
    <Text numberOfLines={1} style={[styles.swatchName, { color: selected ? theme.textPrimary : theme.textSecondary }, selected && styles.swatchNameSelected]}>{item.name}</Text>
  </Pressable>;
});

/** Share Note → Theme: one scrolling row per collection (Personalities, Generations). */
export function ThemePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { tokens: theme } = useTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.collections}>
    {SHARE_NOTE_COLLECTIONS.filter((collection) => collection.shown).map((collection) => <View key={collection.id}>
      <Text accessibilityRole="header" style={[styles.collectionTitle, { color: theme.textSecondary }]}>{collection.name}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={`${collection.name} themes`} contentContainerStyle={styles.themeRow} style={styles.bleed}>
        {collection.themes.map((item) => <ThemeSwatch key={item.id} item={item} selected={item.id === value} onPress={() => onChange(item.id)} />)}
      </ScrollView>
    </View>)}
  </View>;
}

export function ImageSelector({ images, selected, onToggle }: { images: ShareNoteImage[]; selected: string[]; onToggle: (id: string) => void }) {
  const { tokens: theme } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow} style={styles.bleed}>
    {images.map((image, index) => {
      const order = selected.indexOf(image.id);
      const uri = resolveAttachmentUri(image.storagePath);
      return <Pressable key={image.id} accessibilityRole="checkbox" accessibilityLabel={`Photo ${index + 1}`} accessibilityState={{ checked: order >= 0 }} onPress={() => onToggle(image.id)} style={({ pressed }) => [styles.thumb, { backgroundColor: theme.surfaceElevated, borderColor: order >= 0 ? theme.accent : theme.borderSubtle }, order >= 0 && styles.thumbSelected, pressed && styles.pressed]}>
        {uri ? <Image source={{ uri }} contentFit="cover" cachePolicy="memory" recyclingKey={image.id} style={StyleSheet.absoluteFill} /> : null}
        {order < 0 ? <View style={styles.thumbDim} /> : null}
        <View style={[styles.thumbBadge, order >= 0 ? { backgroundColor: theme.accent, borderColor: theme.accent } : styles.thumbBadgeEmpty]}>
          {order >= 0 ? <Text style={[styles.thumbBadgeText, { color: theme.accentText }]}>{order + 1}</Text> : null}
        </View>
      </Pressable>;
    })}
  </ScrollView>;
}

export function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (value: boolean) => void }) {
  const { tokens: theme } = useTheme();
  return <View style={styles.toggleRow}>
    <View style={styles.toggleCopy}>
      <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>{label}</Text>
      {detail ? <Text style={[styles.hint, { color: theme.textMuted, marginTop: 2 }]}>{detail}</Text> : null}
    </View>
    <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: theme.accent, false: theme.borderSubtle }} thumbColor={Platform.OS === 'android' ? theme.background : undefined} />
  </View>;
}

export function InfoLine({ icon, message, tone = 'muted' }: { icon: ComponentProps<typeof Ionicons>['name']; message: string; tone?: 'muted' | 'warning' }) {
  const { tokens: theme } = useTheme();
  return <View accessibilityRole={tone === 'warning' ? 'alert' : undefined} style={[styles.info, { backgroundColor: tone === 'warning' ? theme.accentSoft : theme.surface }]}>
    <Ionicons accessible={false} name={icon} size={16} color={tone === 'warning' ? theme.accentStrong : theme.textMuted} />
    <Text style={[styles.infoText, { color: theme.textSecondary }]}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginBottom: spacing.xs },
  hint: { fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
  hintEmphasis: { fontWeight: '700' },
  bleed: { marginHorizontal: -spacing.lg },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radii.control, gap: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxs, borderRadius: 9 },
  segmentSelected: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentLabel: { fontSize: 13, fontWeight: '600' },
  segmentDetail: { fontSize: 10, marginTop: 1, fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  collections: { gap: spacing.md },
  collectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  themeRow: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  swatch: { width: 66, alignItems: 'center' },
  swatchFrame: { padding: 2, borderRadius: 16, borderWidth: 2 },
  swatchCanvas: { width: 56, height: 70, overflow: 'hidden', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  swatchCard: { width: 40, height: 50, borderRadius: 7, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swatchGlyph: { fontSize: 17 },
  swatchAccent: { width: 14, height: 3, borderRadius: 1.5 },
  swatchName: { marginTop: 5, fontSize: 11, fontWeight: '500' },
  swatchNameSelected: { fontWeight: '700' },
  imageRow: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  thumb: { width: 68, height: 68, overflow: 'hidden', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  thumbSelected: { borderWidth: 2 },
  thumbDim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  thumbBadge: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  thumbBadgeEmpty: { borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.2)' },
  thumbBadgeText: { fontSize: 11, fontWeight: '800' },
  toggleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleCopy: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
