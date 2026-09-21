# Native iOS integration

Kvitto uses system sheets, search, segmented controls, menus, forms, and toolbars.
Cobalt summaries and the paper background remain part of the application design.
At larger accessibility text sizes, segmented controls use wrapping labels and
sheets open at full height. Editing a receipt still requires the existing save
operation; dismissing its details sheet does not discard the receipt draft.

## Compare cameras

Open **Innstillinger → Kamera → Bruk VisionKit-skanner**.
The device saves this experimental switch. It is off by default. Turn it off to
return to the ordinary camera. Unsupported devices and older development
binaries show a disabled switch with an explanation.

VisionKit scans physical documents. Its pages enter the same image preparation,
preview, upload queue, and server processing as camera photographs. A scan starts
as one receipt; the preview still lets you choose separate receipts. Canceling
the scanner does not add or upload anything. The eight-image limit applies to
both cameras, including pictures already selected.

Use a physical iPhone to compare a short receipt, a long receipt, folded paper,
faint ink, poor lighting, multiple pages, cancellation, and denied permission.
The simulator cannot verify capture quality. Keep the ordinary camera as the
default until these comparisons show no unacceptable loss of detail.
Remove the experimental switch after these checks establish the selected camera
and supported clients no longer need the alternative for comparison.

## Home Screen widget

Add **Kvitto → Dagligvarer** from the iOS widget gallery. The widget supports small
and medium sizes. It shows the month, grocery spending, budget remaining or
overspend, and the update time. Provisional totals are marked. The medium widget
also has a **Skann kvittering** shortcut; tapping the summary opens Forbruk.

Open Forbruk for the current month to refresh the widget. It reuses the complete,
unfiltered spending subscription. Filters do not change the widget totals.
It does not run a second history fetch or promise background freshness. The
month and timestamp remain visible when the application is closed.

Account or household changes clear the summary. Signing out clears it too.
Only the displayed summary enters the shared widget container; no credentials
or receipt lines are stored there.

## App Shortcuts

In Apple's Shortcuts app, select Kvitto's **Skann kvittering** or **Åpne innboks**.
Both open the corresponding screen. The camera screen uses the camera preference
above. Capture still requires the user's action and camera permission.

On a supported iPhone, assign **Skann kvittering** under
**Settings → Action Button → Shortcut**. The shortcuts are also available to Siri
and Spotlight through App Intents.

## Native build

These features require a new native build. `expo-widgets` adds a widget extension,
and the local receipt module adds VisionKit support. The App Shortcuts config
plugin compiles its Swift source in the main application target so Xcode can
extract the intent metadata. Expo prebuild recreates all generated native files.
The existing fingerprint runtime policy separates this build from older clients.
Do not publish this change as an OTA update to an older runtime.

The widget and share extension use `group.no.tolnes.kvitto`. The Expo Widgets
config plugin includes its extension in the EAS signing configuration. A device
build needs a provisioning profile for that additional extension.
