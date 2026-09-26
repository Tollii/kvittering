const path = require("node:path");

const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

config.resolver.blockList = [
  ...config.resolver.blockList,
  /[/\\]sveltemo[/\\].*/,
  // Deployment credentials are CLI inputs, not Expo environment modules.
  /[/\\]\.env\.staging\.local$/,
];

// The web build is for browser checks of an iOS app (tools/visual). expo-sqlite
// loads wa-sqlite as a WebAssembly asset there. Web bundles replace modules
// that have no working web implementation; native bundles are unaffected.
config.resolver.assetExts.push("wasm");

const sqliteWeb = path.join("expo-sqlite", "web");

const resolveRequest = config.resolver.resolveRequest;

const webModule = (context, moduleName) => {
  if (moduleName === "expo-file-system")
    return path.resolve(__dirname, "src/web/expo-file-system.ts");

  if (moduleName === "expo-sqlite-web-worker-channel")
    return path.join(
      path.dirname(require.resolve("expo-sqlite/package.json")),
      "web/WorkerChannel.ts",
    );

  if (
    moduleName === "./WorkerChannel" &&
    path.dirname(context.originModulePath).endsWith(sqliteWeb)
  )
    return path.resolve(__dirname, "src/web/expo-sqlite-worker-channel.ts");

  return undefined;
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const replacement =
    platform === "web" ? webModule(context, moduleName) : undefined;

  if (replacement) return { type: "sourceFile", filePath: replacement };

  return (resolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
