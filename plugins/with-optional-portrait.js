const { withAndroidManifest } = require('expo/config-plugins');

// app.json locks Chits to portrait, so Android writes screenOrientation="portrait" on the
// activity, and that implies the android.hardware.screen.portrait feature as *required*.
// Google Play then hides the app from devices it treats as having no portrait screen
// (some tablets, Chromebooks and desktops, Android XR) and blocks review with
// "Required hardware feature declarations are restricting your app's availability".
// Chits works in any orientation (Android 16 already ignores the lock on large
// screens), so the feature is declared optional; the phone lock itself stays.
const FEATURE = 'android.hardware.screen.portrait';

module.exports = config => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  const features = manifest['uses-feature'] ?? [];
  const existing = features.find(feature => feature.$?.['android:name'] === FEATURE);
  if (existing) existing.$['android:required'] = 'false';
  else features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
  manifest['uses-feature'] = features;
  return config;
});
