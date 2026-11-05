import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { useDirection, useLocale } from '@/localization/provider';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { navigationIconName } from '@/localization/text-layout';
import { settingsSurfaces } from './settings-surfaces';

const ROW_PADDING = 14;

export function useSettingsSurfaces() {
  const { scheme, tokens } = useTheme();
  const desk = useDesk();
  return settingsSurfaces(scheme, tokens, desk.ink);
}

/** A handwritten heading on the desk over one shared sheet of the theme's paper, with hairlines between its rows. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const surfaces = useSettingsSurfaces();
  const rows = Children.toArray(children);
  return <View style={styles.section}>
    <AppText accessibilityRole="header" style={[handBold, styles.heading, { color: desk.ink }]}>{title}</AppText>
    <View style={[styles.sheet, { backgroundColor: surfaces.surface, borderColor: surfaces.border, borderRadius: styleTokens.button.radius }]}>
      {rows.map((child, index) => <View key={index}>
        {index > 0 ? <View style={[styles.divider, { backgroundColor: surfaces.border }]} /> : null}
        {child}
      </View>)}
    </View>
  </View>;
}

function RowCopy({ label, description, muted }: { label: string; description?: string; muted?: boolean }) {
  const { tokens } = useTheme();
  const fonts = useWelcomeFonts();
  return <View style={styles.copy}>
    <AppText family={fonts.text} style={[styles.label, { color: muted ? tokens.textSecondary : tokens.textPrimary }]}>{label}</AppText>
    {description ? <AppText variant="paragraph" family={fonts.text} style={[styles.description, { color: tokens.textSecondary }]}>{description}</AppText> : null}
  </View>;
}

type RowProps = { label: string; icon?: IconName; description?: string; value?: string; /** A color shown beside the value. */ swatch?: string; onPress?: () => void; disabled?: boolean; /** False for a row that acts right here instead of leading somewhere. */ chevron?: boolean };

/** The whole row is the target; the chevron only says where it leads. */
export function SettingsRow({ label, icon, description, value, swatch, onPress, disabled = false, chevron = true }: RowProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle, direction } = useDirection();
  const { tokens } = useTheme();
  const fonts = useWelcomeFonts();
  const surfaces = useSettingsSurfaces();
  return <Pressable
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityState={onPress ? { disabled } : undefined}
    accessibilityLabel={[label, value, description].filter(Boolean).join('. ')}
    disabled={!onPress || disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.row, rowStyle, pressed && { backgroundColor: surfaces.pressed }, disabled && styles.disabled]}
  >
    {icon ? <Icon name={icon} size={19} color={tokens.textSecondary} style={styles.icon} /> : null}
    <RowCopy label={label} description={description} />
    {swatch ? <View style={[styles.swatch, { backgroundColor: swatch, borderColor: surfaces.border }]} /> : null}
    {value ? <AppText numberOfLines={2} family={fonts.text} style={[styles.value, { color: tokens.textSecondary, textAlign: direction === 'rtl' ? 'left' : 'right' }]}>{value}</AppText> : null}
    {onPress && chevron ? <Icon name={navigationIconName('chevron-forward', direction)} size={17} color={tokens.textSecondary} /> : null}
  </Pressable>;
}

type ToggleProps = { label: string; icon?: IconName; description?: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean };

/**
 * A setting that's on or off. The row is the one thing that takes the touch:
 * the native switch only shows the state, so a tap can't reach two handlers.
 * Off and on differ by the thumb's color as well as its side.
 */
export function SettingsToggleRow({ label, icon, description, value, onChange, disabled = false }: ToggleProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const { tokens } = useTheme();
  const surfaces = useSettingsSurfaces();
  return <Pressable
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityHint={description}
    accessibilityState={{ checked: value, disabled }}
    disabled={disabled}
    onPress={() => onChange(!value)}
    style={({ pressed }) => [styles.row, rowStyle, pressed && { backgroundColor: surfaces.pressed }]}
  >
    {icon ? <Icon name={icon} size={19} color={tokens.textSecondary} style={styles.icon} /> : null}
    <RowCopy label={label} description={description} muted={disabled} />
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Switch value={value} disabled={disabled} trackColor={{ true: tokens.accent, false: surfaces.switchOff }} thumbColor={value ? tokens.accentText : surfaces.thumbOff} ios_backgroundColor={surfaces.switchOff} />
    </View>
  </Pressable>;
}

/** Plain explanatory text inside a section. */
export function SettingsNote({ children }: { children: string }) {
  const { tokens } = useTheme();
  const fonts = useWelcomeFonts();
  return <AppText variant="paragraph" family={fonts.text} style={[styles.note, { color: tokens.textSecondary }]}>{children}</AppText>;
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  heading: { fontSize: 22, lineHeight: 29, paddingHorizontal: 4 },
  sheet: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: ROW_PADDING },
  row: { minHeight: 52, alignItems: 'center', gap: 12, paddingHorizontal: ROW_PADDING, paddingVertical: 11 },
  disabled: { opacity: 0.55 },
  icon: { width: 22, textAlign: 'center' },
  copy: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  value: { fontSize: 14, lineHeight: 19, flexShrink: 1, maxWidth: '45%' },
  swatch: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  note: { fontSize: 13, lineHeight: 19, paddingHorizontal: ROW_PADDING, paddingVertical: 12 },
});
