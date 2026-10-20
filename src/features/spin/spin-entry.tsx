import { router } from 'expo-router';
import { IconButton, HeaderIcon, Icon } from '@/components/ui/primitives';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { useLocale } from '@/localization/provider';

export function SpinEntry({ header = false }: { header?: boolean }) {
  useLocale();
  const { tokens } = useTheme();
  return <IconButton label={tr('spin.title')} onPress={() => router.push('/spin')}>{header ? <HeaderIcon name="shuffle-outline" size={22} /> : <Icon name="shuffle-outline" size={22} color={tokens.accentStrong} />}</IconButton>;
}
