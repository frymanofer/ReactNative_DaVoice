const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withProjectBuildGradle,
  withXcodeProject,
} = require('@expo/config-plugins');

const DEFAULT_SOURCE_DIR = 'assets/models/local';
const ANDROID_MAVEN_REPOS = [
  'maven { url "${project(":react-native-wakeword").projectDir}/libs" }',
  'maven { url "${project(":react-native-davoice").projectDir}/libs" }',
];

function getPluginOptions(options) {
  return {
    sourceDir: options?.sourceDir || DEFAULT_SOURCE_DIR,
    iosBundleSubdir: options?.iosBundleSubdir || 'DaVoiceModels',
  };
}

function getModelFiles(projectRoot, sourceDir) {
  const absSourceDir = path.resolve(projectRoot, sourceDir);
  if (!fs.existsSync(absSourceDir)) {
    throw new Error(
      `[withDaVoiceNativeAssets] Source directory not found: ${absSourceDir}`
    );
  }

  const entries = fs
    .readdirSync(absSourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.dm') || name.endsWith('.onnx'))
    .sort();

  if (!entries.length) {
    throw new Error(
      `[withDaVoiceNativeAssets] No .dm or .onnx files found in ${absSourceDir}`
    );
  }

  return {
    absSourceDir,
    fileNames: entries,
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function syncFiles(sourceDir, targetDir, fileNames) {
  ensureDir(targetDir);

  for (const fileName of fileNames) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(targetDir, fileName));
  }
}

function addMavenRepos(src) {
  let result = src;
  for (const repo of ANDROID_MAVEN_REPOS) {
    if (result.includes(repo)) {
      continue;
    }

    result = result.replace(
      /allprojects\s*\{\s*repositories\s*\{/m,
      (match) => `${match}\n    ${repo}`
    );
  }
  return result;
}

function getIosAppDirFromProject(project) {
  const target = project.getFirstTarget().firstTarget;
  if (!target?.name) {
    throw new Error('[withDaVoiceNativeAssets] Could not determine iOS target name');
  }
  return target.name;
}

function getRelativePath(fromDir, toPath) {
  return path.relative(fromDir, toPath).replace(/\\/g, '/');
}

function ensureResourcesGroup(project) {
  const existing = project.pbxGroupByName('Resources');
  if (existing) {
    return existing.uuid;
  }

  const groupId = project.pbxCreateGroup('Resources');
  const appGroup = project.pbxGroupByName(project.getFirstTarget().firstTarget.name);
  const parentGroupId = appGroup?.uuid || project.getFirstProject().firstProject.mainGroup;
  project.addToPbxGroup({ fileRef: groupId, basename: 'Resources' }, parentGroupId);
  return groupId;
}

function ensureIosResource(project, filePath) {
  const groupId = ensureResourcesGroup(project);
  const target = project.getFirstTarget().uuid;

  const existingFile = project.hasFile(filePath);
  if (!existingFile) {
    project.addResourceFile(filePath, { target }, groupId);
  }
}

const withDaVoiceNativeAssets = (config, options = {}) => {
  const pluginOptions = getPluginOptions(options);

  config = withProjectBuildGradle(config, (gradleConfig) => {
    gradleConfig.modResults.contents = addMavenRepos(gradleConfig.modResults.contents);
    return gradleConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const { absSourceDir, fileNames } = getModelFiles(
        modConfig.modRequest.projectRoot,
        pluginOptions.sourceDir
      );

      const androidAssetsDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets'
      );

      syncFiles(absSourceDir, androidAssetsDir, fileNames);
      console.log(
        `[withDaVoiceNativeAssets] Copied Android assets: ${fileNames.join(', ')}`
      );
      return modConfig;
    },
  ]);

  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const { absSourceDir, fileNames } = getModelFiles(
        modConfig.modRequest.projectRoot,
        pluginOptions.sourceDir
      );

      const projectName = modConfig.modRequest.projectName;
      if (!projectName) {
        throw new Error('[withDaVoiceNativeAssets] Could not determine iOS project name');
      }

      const iosAppDir = path.join(modConfig.modRequest.platformProjectRoot, projectName);
      const iosTargetDir = path.join(iosAppDir, pluginOptions.iosBundleSubdir);
      syncFiles(absSourceDir, iosTargetDir, fileNames);
      console.log(
        `[withDaVoiceNativeAssets] Copied iOS assets: ${fileNames.join(', ')}`
      );
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (xcodeConfig) => {
    const { fileNames } = getModelFiles(
      xcodeConfig.modRequest.projectRoot,
      pluginOptions.sourceDir
    );

    const iosAppDir = path.join(
      xcodeConfig.modRequest.platformProjectRoot,
      getIosAppDirFromProject(xcodeConfig.modResults)
    );
    const iosTargetDir = path.join(iosAppDir, pluginOptions.iosBundleSubdir);

    for (const fileName of fileNames) {
      const absFilePath = path.join(iosTargetDir, fileName);
      const relativeFilePath = getRelativePath(
        xcodeConfig.modRequest.platformProjectRoot,
        absFilePath
      );
      ensureIosResource(xcodeConfig.modResults, relativeFilePath);
    }

    return xcodeConfig;
  });

  return config;
};

module.exports = withDaVoiceNativeAssets;
