import { memo } from 'react';

import { useTheme } from '@/components/theme-provider';
import { FadedHeaderBackdrop, type FadedHeaderBackdropProps } from '@/components/ui/faded-header-backdrop.native';

export { HEADER_BACKDROP_OVERHANG as CHAT_HEADER_BACKDROP_OVERHANG } from '@/components/ui/faded-header-backdrop.native';

/** Live timeline blur that becomes clear at the bottom of the pinned row. */
export const ChatHeaderBackdrop = memo(function ChatHeaderBackdrop(props: FadedHeaderBackdropProps) {
  const { tokens } = useTheme();
  return <FadedHeaderBackdrop {...props} color={tokens.chatBackground} />;
});
