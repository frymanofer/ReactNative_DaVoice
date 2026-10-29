// Voice cloning's microphone recording and file picker: the app's own native
// module NativeModules.VoiceRecorder (src/tts/voiceClone.ts), the same files as
// ../example (VoiceRecorderModule.kt, VoiceRecorderPackage.kt, VoiceRecorder.m).
//
// On every prebuild:
// - Android: copies the Kotlin files into the app's package and adds
//   VoiceRecorderPackage() to MainApplication.
// - iOS: copies VoiceRecorder.m into the app folder and adds it to the target.
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withDangerousMod,
  withMainApplication,
  withXcodeProject,
} = require('@expo/config-plugins');

const SOURCE_DIR = path.join(__dirname, 'voice-recorder');
const ANDROID_FILES = ['VoiceRecorderModule.kt', 'VoiceRecorderPackage.kt'];
const IOS_FILE = 'VoiceRecorder.m';
const PACKAGE_LINE = 'add(VoiceRecorderPackage())';

function androidPackage(config) {
  const name = config.android?.package;
  if (!name) throw new Error('[withVoiceRecorder] android.package is not set');
  return name;
}

const withVoiceRecorder = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const name = androidPackage(modConfig);
      const targetDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java',
        ...name.split('.')
      );
      fs.mkdirSync(targetDir, { recursive: true });
      for (const file of ANDROID_FILES) {
        const source = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
        fs.writeFileSync(
          path.join(targetDir, file),
          source.replace(/^package\s+[\w.]+/m, `package ${name}`)
        );
      }
      return modConfig;
    },
  ]);

  config = withMainApplication(config, (modConfig) => {
    const contents = modConfig.modResults.contents;
    if (!contents.includes(PACKAGE_LINE)) {
      const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!anchor.test(contents)) {
        throw new Error('[withVoiceRecorder] PackageList(this).packages.apply { not found in MainApplication');
      }
      modConfig.modResults.contents = contents.replace(
        anchor,
        (match) => `${match}\n          ${PACKAGE_LINE}`
      );
    }
    return modConfig;
  });

  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectName = modConfig.modRequest.projectName;
      fs.copyFileSync(
        path.join(SOURCE_DIR, IOS_FILE),
        path.join(modConfig.modRequest.platformProjectRoot, projectName, IOS_FILE)
      );
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const projectName = modConfig.modRequest.projectName;
    const filepath = `${projectName}/${IOS_FILE}`;
    if (!modConfig.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: modConfig.modResults,
      });
    }
    return modConfig;
  });

  return config;
};

module.exports = withVoiceRecorder;
