import { router } from 'expo-router';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';

export default function RevisitUnavailable() {
  return <Screen><AppHeader title="Revisit" leading={<IconButton label="Go back" onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <EmptyState title="Revisit on mobile" description="Open Chits on iOS or Android to revisit your saved notes and manage connections." />
  </Screen>;
}
