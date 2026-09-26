const path = require("node:path");

const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

config.resolver.blockList = [
  ...config.resolver.blockList,
  /[/\\]sveltemo[/\\].*/,
  // Deployment credentials are CLI inputs, not Expo environment modules.
  /[/\\]\.env\.staging\.local$/,
];

const resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "decode-uri-component") {
    return {
      type: "sourceFile",
      filePath: path.join(__dirname, "tools/metro/decode-uri-component.cjs"),
    };
  }

  return (resolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
