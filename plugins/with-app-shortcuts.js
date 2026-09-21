const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const fs = require("node:fs");

const path = require("node:path");

/** Compile App Intents in the application target so Xcode extracts their metadata. */
module.exports = (config) =>
  withXcodeProject(config, (result) => {
    const projectName = result.modRequest.projectName;

    if (!projectName) throw new Error("Missing iOS application target name.");
    const filePath = `${projectName}/KvittoShortcuts.swift`;
    fs.copyFileSync(
      path.join(
        result.modRequest.projectRoot,
        "native/ios/KvittoShortcuts.swift",
      ),
      path.join(result.modRequest.platformProjectRoot, filePath),
    );

    if (!result.modResults.hasFile(filePath))
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: projectName,
        project: result.modResults,
      });

    return result;
  });
