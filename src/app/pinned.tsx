import { Redirect } from 'expo-router';

// chits://pinned — the link named in the original brief — opens Spaces.
export default function PinnedLink() {
  return <Redirect href="/spaces" />;
}
