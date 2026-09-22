import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { BottomSheetSurface } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';

type Kind = 'photo' | 'video' | 'file';
type Props = { visible: boolean; onClose: () => void; onPick: (kind: Kind) => void };

function Row({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={theme.textPrimary} />
    <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
  </Pressable>;
}

// A lightweight contextual menu, not a form — matches the compact icon+label row
// language used by the redesigned message-actions sheet, rather than a Photo/
// Video/File picker embedded directly in Card Details.
export function AddCardAttachmentSheet({ visible, onClose, onPick }: Props) {
  const { tokens: theme } = useTheme();
  return <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close add attachment" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <BottomSheetSurface>
          <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Add attachment</Text>
          <View style={styles.group}>
            <Row icon="image-outline" label="Photo" onPress={() => onPick('photo')} />
            <Row icon="videocam-outline" label="Video" onPress={() => onPick('video')} />
            <Row icon="document-outline" label="File" onPress={() => onPick('file')} />
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
