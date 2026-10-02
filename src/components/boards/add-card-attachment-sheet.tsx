import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, type ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { BottomSheetSurface } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';

type Kind = 'photo' | 'video' | 'file';
type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called once the sheet has fully closed — iOS can't present the system picker over a closing modal. */
  onPick: (kind: Kind) => void;
};

function Row({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
    <Icon name={icon} size={20} color={theme.textPrimary} />
    <AppText style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</AppText>
  </Pressable>;
}

// A lightweight contextual menu, not a form — matches the compact icon+label row
// language used by the redesigned message-actions sheet, rather than a Photo/
// Video/File picker embedded directly in Card Details.
export function AddCardAttachmentSheet({ visible, onClose, onPick }: Props) {
  const { tokens: theme } = useTheme();
  // The chosen kind waits here until the sheet has closed: onDismiss on iOS,
  // the next frame on Android (which has no onDismiss and no such limitation).
  const pending = useRef<Kind | null>(null);
  const choose = (kind: Kind) => { pending.current = kind; onClose(); };
  const dismiss = () => { pending.current = null; onClose(); };
  const finishClosing = () => {
    const kind = pending.current;
    pending.current = null;
    if (kind) onPick(kind);
  };
  useEffect(() => {
    if (visible || Platform.OS === 'ios' || !pending.current) return;
    const frame = requestAnimationFrame(finishClosing);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacts to the sheet closing.
  }, [visible]);
  return <Modal transparent animationType="slide" visible={visible} onRequestClose={dismiss} onDismiss={Platform.OS === 'ios' ? finishClosing : undefined}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close add attachment" onPress={dismiss} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <BottomSheetSurface>
          <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
          <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Add attachment</AppText>
          <View style={styles.group}>
            <Row icon="image-outline" label="Photo" onPress={() => choose('photo')} />
            <Row icon="videocam-outline" label="Video" onPress={() => choose('video')} />
            <Row icon="document-outline" label="File" onPress={() => choose('file')} />
          </View>
        </BottomSheetSurface>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.22)' },
  sheet: { width: '100%' },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, marginBottom: spacing.sm, borderRadius: 2 },
  title: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, fontSize: 17, fontWeight: '700' },
  group: { paddingBottom: spacing.sm },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  rowPressed: { opacity: 0.6 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
});
