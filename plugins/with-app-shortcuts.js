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

    const widgetTarget = result.modResults.findTargetKey("ExpoWidgetsTarget");

    if (!widgetTarget) throw new Error("Missing widget extension target.");
    const controlPath = "ExpoWidgetsTarget/ReceiptCaptureControl.swift";
    fs.copyFileSync(
      path.join(
        result.modRequest.projectRoot,
        "native/ios/ReceiptCaptureControl.swift",
      ),
      path.join(result.modRequest.platformProjectRoot, controlPath),
    );

    if (!result.modResults.hasFile("ReceiptCaptureControl.swift"))
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: "ReceiptCaptureControl.swift",
        groupName: "ExpoWidgetsTarget",
        project: result.modResults,
        targetUuid: widgetTarget,
      });

    const target = result.modResults.pbxNativeTargetSection()[widgetTarget];

    const configurations =
      result.modResults.pbxXCConfigurationList()[target.buildConfigurationList]
        .buildConfigurations;

    for (const configuration of configurations) {
      const settings =
        result.modResults.pbxXCBuildConfigurationSection()[configuration.value]
          .buildSettings;

      settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS =
        '"$(inherited) KVITTO_WIDGET"';
    }

    for (const groupName of [projectName, "ExpoWidgetsTarget"]) {
      const intentPath = `${groupName}/ReceiptCaptureIntent.swift`;
      fs.copyFileSync(
        path.join(
          result.modRequest.projectRoot,
          "native/ios/ReceiptCaptureIntent.swift",
        ),
        path.join(result.modRequest.platformProjectRoot, intentPath),
      );

      const referencePath =
        groupName === "ExpoWidgetsTarget"
          ? "ReceiptCaptureIntent.swift"
          : intentPath;

      if (!result.modResults.hasFile(referencePath))
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath: referencePath,
          groupName,
          project: result.modResults,
          targetUuid:
            groupName === "ExpoWidgetsTarget"
              ? widgetTarget
              : result.modResults.getFirstTarget().uuid,
        });
    }

    const indexPath = path.join(
      result.modRequest.platformProjectRoot,
      "ExpoWidgetsTarget/index.swift",
    );

    const source = fs.readFileSync(indexPath, "utf8");

    if (!source.includes("ReceiptCaptureControl()")) {
      if (!source.includes("WidgetLiveActivity()"))
        throw new Error("Missing widget bundle insertion point.");
      fs.writeFileSync(
        indexPath,
        source.replace(
          "WidgetLiveActivity()",
          "WidgetLiveActivity()\n    if #available(iOS 18.0, *) { ReceiptCaptureControl() }",
        ),
      );
    }

    return result;
  });
