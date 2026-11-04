const { withBaseMod } = require("expo/config-plugins");

const bundlePhase = "Bundle React Native code and images";

const posthogXcode =
  "`\"$NODE_BINARY\" --print \"require('path').join(require('path').dirname(require.resolve('posthog-react-native')), '..', 'tooling', 'posthog-xcode.sh')\"`";

/**
 * Upload Hermes source maps to PostHog from Release builds that have the
 * upload key, which EAS provides. PostHog's own plugin wraps every build and
 * fails it when the key or posthog-cli is missing, which breaks CI and local
 * builds. This keeps one generated project, and so one fingerprint, for all.
 */
const guardedUpload = (bundle) =>
  [
    'if [ "$CONFIGURATION" = "Release" ] && [ -n "$POSTHOG_CLI_API_KEY" ]; then',
    `  ${posthogXcode} ${bundle}`,
    "else",
    `  ${bundle}`,
    "fi",
  ].join("\n");

// Runs after the other Xcode changes, so it wraps the bundle command that
// Sentry has already wrapped.
module.exports = (config) =>
  withBaseMod(config, {
    platform: "ios",
    mod: "xcodeproj",
    async action(config) {
      const { nextMod, ...modRequest } = config.modRequest;

      const results = await nextMod({ ...config, modRequest });

      const phase = results.modResults.pbxItemByComment(
        bundlePhase,
        "PBXShellScriptBuildPhase",
      );

      const script = JSON.parse(phase.shellScript);

      if (!script.includes("posthog-xcode.sh"))
        phase.shellScript = JSON.stringify(
          script.replace(
            /^.*(packager|scripts)\/react-native-xcode\.sh.*$/m,
            (line) => guardedUpload(line.trim()),
          ),
        );

      return results;
    },
  });
