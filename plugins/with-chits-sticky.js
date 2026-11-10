const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const plist = require('@expo/plist').default;
const fs = require('fs');
const path = require('path');

// Sticky Notes widget (iOS). Register this plugin BEFORE expo-widgets in
// app.json: mods run in reverse registration order, so expo-widgets generates
// the extension first and this then:
//  - replaces its generated ChitsSticky.swift with
//    plugins/chits-sticky/ChitsSticky.swift: the same Space choice (Fridge,
//    Desk, Cork board, Wall), plus a fallback before the app's first publish;
//  - bundles the faces Spaces writes stickies in (Nunito, Space Mono) into the
//    extension and registers them in its Info.plist.
// Without it the widget still builds from app.json's own Space choice; it just
// loses the fallback, the translated titles and the fonts.

const TARGET = 'ExpoWidgetsTarget';
const FONTS = [
  ['@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf', 'Nunito-SemiBold.ttf'],
  ['@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf', 'Nunito-ExtraBold.ttf'],
  ['@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf', 'SpaceMono-Bold.ttf'],
];

const withStickySources = (config) => withDangerousMod(config, ['ios', (config) => {
  const { projectRoot, platformProjectRoot } = config.modRequest;
  const target = path.join(platformProjectRoot, TARGET);
  const generated = path.join(target, 'ChitsSticky.swift');
  if (!fs.existsSync(generated)) throw new Error('Sticky Note requires the expo-widgets ChitsSticky widget. Register ./plugins/with-chits-sticky before expo-widgets.');
  fs.copyFileSync(path.join(projectRoot, 'plugins/chits-sticky/ChitsSticky.swift'), generated);
  for (const [source, name] of FONTS) fs.copyFileSync(require.resolve(source, { paths: [projectRoot] }), path.join(target, name));
  const infoPath = path.join(target, 'Info.plist');
  const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
  info.UIAppFonts = [...new Set([...(info.UIAppFonts ?? []), ...FONTS.map(([, name]) => name)])];
  fs.writeFileSync(infoPath, plist.build(info));
  return config;
}]);

const withStickyFonts = (config) => withXcodeProject(config, (config) => {
  const project = config.modResults;
  const targets = project.pbxNativeTargetSection();
  const entry = Object.entries(targets).find(([, value]) => value?.name?.replaceAll('"', '') === TARGET);
  if (!entry) throw new Error('Sticky Note requires the expo-widgets extension target.');
  const [targetKey, target] = entry;
  const phases = project.hash.project.objects.PBXResourcesBuildPhase ?? {};
  if (!target.buildPhases.some((phase) => phases[phase.value])) project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetKey);
  if (!project.pbxGroupByName('Resources')) {
    const created = project.addPbxGroup([], 'Resources', '');
    project.addToPbxGroup(created.uuid, project.getFirstProject().firstProject.mainGroup);
  }
  const resources = project.pbxGroupByName('Resources');
  if (resources.path === undefined || resources.path === 'undefined' || resources.path === '') delete resources.path;
  const groups = project.hash.project.objects.PBXGroup;
  const groupKey = Object.keys(groups).find((key) => groups[key]?.name === 'Resources');
  for (const [, name] of FONTS) {
    const relative = `${TARGET}/${name}`;
    if (!project.hasFile(relative)) project.addResourceFile(relative, { target: targetKey, lastKnownFileType: 'file' }, groupKey);
  }
  return config;
});

module.exports = (config) => withStickyFonts(withStickySources(config));
