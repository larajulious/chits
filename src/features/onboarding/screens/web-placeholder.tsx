import { EmptyState, Screen } from '@/components/ui/primitives';
import { ot } from '../strings';

// Onboarding routes on the web preview, which has no local database.
export default function OnboardingWebScreen() {
  return <Screen><EmptyState title={ot('web.title')} description={ot('web.body')} /></Screen>;
}
