// react-native-fs ships Flow-typed source that Jest can't parse: tests that don't mock it themselves get this empty file system.
const api = {
  DocumentDirectoryPath: '/docs',
  CachesDirectoryPath: '/caches',
  MainBundlePath: '/bundle',
  exists: async () => false,
  unlink: async () => undefined,
  mkdir: async () => undefined,
  readDir: async () => [],
  readFile: async () => '',
  writeFile: async () => undefined,
};
module.exports = { __esModule: true, default: api, ...api };
