import { useLocalSearchParams } from 'expo-router';
import FocusScreen from '@/features/focus/focus-screen';
export default function FocusRoute() {
  const params = useLocalSearchParams<{ note?: string; session?: string }>();
  return <FocusScreen key={`${params.note}:${params.session}`} />;
}
