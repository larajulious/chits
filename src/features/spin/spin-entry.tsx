import { useEffect } from 'react';
import { router } from 'expo-router';
import { IconButton, HeaderIcon, Icon } from '@/components/ui/primitives';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { useLocale } from '@/localization/provider';
import { preloadHandwriting } from '@/components/desk/paper-desk';

export function SpinEntry({ header = false }: { header?: boolean }) {
  useLocale();
  const { tokens } = useTheme();
  // Warm Spin's handwriting while the app is idle, before anyone taps.
  useEffect(() => { const id = requestIdleCallback(preloadHandwriting); return () => cancelIdleCallback(id); }, []);
  return <IconButton label={tr('spin.title')} onPress={() => router.push('/spin')}>{header ? <HeaderIcon name="shuffle-outline" size={22} /> : <Icon name="shuffle-outline" size={22} color={tokens.accentStrong} />}</IconButton>;
}
