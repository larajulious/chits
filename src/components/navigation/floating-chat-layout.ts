import { spacing } from '@/constants/theme';

/** Shared safe-area baseline for the floating Chat control and its companion. */
export function floatingChatBottom(bottomInset: number) {
  return Math.max(bottomInset, spacing.xs) + spacing.sm;
}

export function floatingCompanionBottom(bottomInset: number, chatHeight: number, companionHeight: number) {
  return floatingChatBottom(bottomInset) + (chatHeight - companionHeight) / 2;
}
