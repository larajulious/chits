import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import plistModule from '@expo/plist';
import xml2js from 'xml2js';
import xcode from 'xcode';

// Accept an isolated prebuild directory to verify generation without replacing native projects.
const root = resolve(process.argv[2] ?? '.');
const read = path => readFileSync(join(root, path), 'utf8');
const config = JSON.parse(read('app.json')).expo;
const languages = JSON.parse(read('src/localization/languages.json')).map(item => item.id);
const plugins = config.plugins.filter(item => (Array.isArray(item) ? item[0] : item) === 'expo-localization');
assert.equal(plugins.length, 1, 'Exactly one localization plugin');
for (const platform of ['ios', 'android']) assert.deepEqual(plugins[0][1].supportedLocales[platform], languages);
assert.deepEqual(Object.keys(config.locales), languages);
const info = plistModule.default.parse(read('ios/Chits/Info.plist'));
assert.deepEqual(info.CFBundleLocalizations, languages);
assert.equal(info.CFBundleDevelopmentRegion, 'en');
assert.equal(info.ExpoLocalization_supportsRTL, true);

const project = xcode.project(join(root, 'ios/Chits.xcodeproj/project.pbxproj')).parseSync();
const objects = project.hash.project.objects;
const resources = Object.values(objects.PBXResourcesBuildPhase).flatMap(phase => phase.files ?? []);
for (const language of languages) {
  const native = JSON.parse(read(config.locales[language])).ios;
  const strings = read(`ios/Chits/Supporting/${language}.lproj/InfoPlist.strings`);
  for (const [key, value] of Object.entries(native)) assert.ok(strings.includes(`${key} = ${JSON.stringify(value)};`), `${language}: native string ${key}`);
  const reference = Object.entries(objects.PBXFileReference).find(([, ref]) => typeof ref === 'object' && ref.path?.replaceAll('"', '') === `${language}.lproj/InfoPlist.strings`);
  assert.ok(reference, `${language}: Xcode file reference`);
  const buildFile = Object.entries(objects.PBXBuildFile).find(([, file]) => typeof file === 'object' && file.fileRef === reference[0]);
  assert.ok(buildFile && resources.some(file => file.value === buildFile[0]), `${language}: copied by Xcode resources phase`);
}
const manifest = await xml2js.parseStringPromise(read('android/app/src/main/AndroidManifest.xml'));
const application = manifest.manifest.application[0];
assert.equal(application.$['android:localeConfig'], '@xml/locales_config');
const activity = application.activity.find(item => item.$['android:name'] === '.MainActivity');
for (const flag of ['locale', 'layoutDirection']) assert.ok(activity.$['android:configChanges'].split('|').includes(flag));
const xml = await xml2js.parseStringPromise(read('android/app/src/main/res/xml/locales_config.xml'));
assert.deepEqual(xml['locale-config'].locale.map(item => item.$['android:name']), languages);
const strings = await xml2js.parseStringPromise(read('android/app/src/main/res/values/strings.xml'));
assert.equal(strings.resources.string.find(item => item.$.name === 'ExpoLocalization_supportsRTL')._, 'true');
const gradle = read('android/app/build.gradle');
const declarations = [...gradle.matchAll(/resourceConfigurations\s*\+=\s*\[([^\]]*)\]/g)];
assert.equal(declarations.length, 1, 'No duplicated Android resource configuration');
assert.deepEqual([...declarations[0][1].matchAll(/"([^"]+)"/g)].map(item => item[1]), languages.map(language => `b+${language.replaceAll('-', '+')}`));
console.log(`Native localization verified: ${languages.length} iOS bundle locales and Xcode resources; Android manifest, locale XML and resource configurations match.`);
