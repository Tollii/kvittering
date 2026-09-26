const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

config.resolver.blockList = [
  ...config.resolver.blockList,
  /[/\\]sveltemo[/\\].*/,
  // Deployment credentials are CLI inputs, not Expo environment modules.
  /[/\\]\.env\.staging\.local$/,
];

// expo-sqlite's web build loads wa-sqlite as a WebAssembly asset.
config.resolver.assetExts.push("wasm");

module.exports = config;
