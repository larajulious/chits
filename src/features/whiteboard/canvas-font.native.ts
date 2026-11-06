import { Asset } from 'expo-asset';
import * as FS from 'expo-file-system/legacy';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';

let font: Promise<string> | null = null;
/** Reuse Chits' bundled font inside the offline WebView; never fetch a web font. */
export function canvasFont() {
  font ??= Asset.fromModule(Nunito_600SemiBold).downloadAsync().then(asset => {
    if (!asset.localUri) throw new Error('Canvas font is not available locally');
    return FS.readAsStringAsync(asset.localUri, { encoding: FS.EncodingType.Base64 });
  }).catch(error => { font = null; throw error; });
  return font;
}
