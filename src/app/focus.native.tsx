import { useLocalSearchParams } from 'expo-router';
import { FocusHome } from '@/features/focus/focus-home';
import FocusScreen from '@/features/focus/focus-screen';
export default function FocusRoute() {
  const params = useLocalSearchParams<{ note?: string; session?: string }>();
  // No note means arriving from the side panel: resume, or choose what to work on.
  if (!params.note) return <FocusHome />;
  return <FocusScreen key={`${params.note}:${params.session}`} />;
}
