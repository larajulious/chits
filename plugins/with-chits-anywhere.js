const { withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Register this plugin BEFORE expo-widgets in app.json: Xcode mod callbacks
// execute in reverse registration order, so the SDK must create the target first.
// Expo owns extension generation. Add the app's existing translations to its
// resource phase so gallery labels are localized in production builds as well.
module.exports = config => withXcodeProject(config, config => {
  const project = config.modResults;
  const targets = project.pbxNativeTargetSection();
  const entry = Object.entries(targets).find(([, value]) => value?.name?.replaceAll('"', '') === 'ExpoWidgetsTarget');
  if (!entry) throw new Error('Chits Anywhere requires the expo-widgets extension target.');
  const target = entry[0];
  const relative = 'ExpoWidgetsTarget/Localizable.xcstrings';
  const strings = {};
  const locales = path.join(config.modRequest.projectRoot, 'src/localization/locales');
  for (const file of fs.readdirSync(locales).filter(file => file.endsWith('.json'))) {
    const language = file.replace('.json', '');
    const catalog = JSON.parse(fs.readFileSync(path.join(locales, file), 'utf8'));
    for (const [source, key] of [['Chits Anywhere', 'anywhere.brand'], ['Quick Note and your recent notes.', 'anywhere.description']]) {
      strings[source] ??= { localizations: {} };
      strings[source].localizations[language] = { stringUnit: { state: 'translated', value: catalog[key] } };
    }
  }
  const destination = path.join(config.modRequest.platformProjectRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify({ sourceLanguage: 'en', strings, version: '1.0' }, null, 2));
  if (!project.hasFile(relative)) {
    const phases = project.hash.project.objects.PBXResourcesBuildPhase ?? {};
    if (!targets[target].buildPhases.some(phase => phases[phase.value])) project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target);
    let group = project.pbxGroupByName('Resources');
    if (!group) {
      const created = project.addPbxGroup([], 'Resources', '');
      project.addToPbxGroup(created.uuid, project.getFirstProject().firstProject.mainGroup);
    }
    const resources = project.pbxGroupByName('Resources');
    if (resources.path === undefined || resources.path === 'undefined' || resources.path === '') delete resources.path;
    const groups = project.hash.project.objects.PBXGroup;
    const resourceKey = Object.keys(groups).find(key => groups[key]?.name === 'Resources');
    project.addResourceFile(relative, { target, lastKnownFileType: 'text.json.xcstrings' }, resourceKey);
  }
  const resources = project.pbxGroupByName('Resources');
  if (resources && (resources.path === undefined || resources.path === 'undefined' || resources.path === '')) delete resources.path;
  const refs = project.pbxFileReferenceSection();
  for (const value of Object.values(refs)) {
    if (value?.path?.replaceAll('"', '') === relative) { value.lastKnownFileType = 'text.json.xcstrings'; delete value.explicitFileType; if (value.fileEncoding === undefined || value.fileEncoding === 'undefined') delete value.fileEncoding; }
  }
  return config;
});
