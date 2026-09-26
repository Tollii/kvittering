const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const fs = require("node:fs");

const path = require("node:path");

/** Copy a Swift source from native/ios into the generated iOS project. */
const copyNativeSource = (modRequest, name, destination) => {
  fs.copyFileSync(
    path.join(modRequest.projectRoot, `native/ios/${name}`),
    path.join(modRequest.platformProjectRoot, destination),
  );
};

/** Add a source file to a group once, in the given target when there is one. */
const addSourceFile = (project, filepath, groupName, targetUuid) => {
  if (project.hasFile(filepath)) return;

  const options = { filepath, groupName, project };

  IOSConfig.XcodeUtils.addBuildSourceFileToGroup(
    targetUuid ? { ...options, targetUuid } : options,
  );
};

/** Show the capture control in the widget bundle on iOS 18 and later. */
const registerCaptureControl = (platformProjectRoot) => {
  const indexPath = path.join(
    platformProjectRoot,
    "ExpoWidgetsTarget/index.swift",
  );

  const source = fs.readFileSync(indexPath, "utf8");

  if (source.includes("ReceiptCaptureControl()")) return;

  if (!source.includes("WidgetLiveActivity()"))
    throw new Error("Missing widget bundle insertion point.");
  fs.writeFileSync(
    indexPath,
    source.replace(
      "WidgetLiveActivity()",
      "WidgetLiveActivity()\n    if #available(iOS 18.0, *) { ReceiptCaptureControl() }",
    ),
  );
};

/** Compile App Intents in the application target so Xcode extracts their metadata. */
module.exports = (config) =>
  withXcodeProject(config, (result) => {
    const projectName = result.modRequest.projectName;

    if (!projectName) throw new Error("Missing iOS application target name.");
    const project = result.modResults;
    const filePath = `${projectName}/KvittoShortcuts.swift`;
    copyNativeSource(result.modRequest, "KvittoShortcuts.swift", filePath);
    addSourceFile(project, filePath, projectName);

    const widgetTarget = project.findTargetKey("ExpoWidgetsTarget");

    if (!widgetTarget) throw new Error("Missing widget extension target.");
    copyNativeSource(
      result.modRequest,
      "ReceiptCaptureControl.swift",
      "ExpoWidgetsTarget/ReceiptCaptureControl.swift",
    );
    addSourceFile(
      project,
      "ReceiptCaptureControl.swift",
      "ExpoWidgetsTarget",
      widgetTarget,
    );

    const target = project.pbxNativeTargetSection()[widgetTarget];

    const configurations =
      project.pbxXCConfigurationList()[target.buildConfigurationList]
        .buildConfigurations;

    for (const configuration of configurations) {
      const settings =
        project.pbxXCBuildConfigurationSection()[configuration.value]
          .buildSettings;

      settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS =
        '"$(inherited) KVITTO_WIDGET"';
    }

    // The intent compiles in both targets; the widget group uses a bare file name.
    copyNativeSource(
      result.modRequest,
      "ReceiptCaptureIntent.swift",
      `${projectName}/ReceiptCaptureIntent.swift`,
    );
    addSourceFile(
      project,
      `${projectName}/ReceiptCaptureIntent.swift`,
      projectName,
      project.getFirstTarget().uuid,
    );
    copyNativeSource(
      result.modRequest,
      "ReceiptCaptureIntent.swift",
      "ExpoWidgetsTarget/ReceiptCaptureIntent.swift",
    );
    addSourceFile(
      project,
      "ReceiptCaptureIntent.swift",
      "ExpoWidgetsTarget",
      widgetTarget,
    );

    registerCaptureControl(result.modRequest.platformProjectRoot);

    return result;
  });
