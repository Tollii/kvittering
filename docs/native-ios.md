# Native iOS integration

Kvitto uses system sheets, search, segmented controls, menus, forms, and toolbars.
Cobalt summaries and the paper background remain part of the application design.
At larger accessibility text sizes, segmented controls use wrapping labels and
sheets open at full height. Editing a receipt still requires the existing save
operation; dismissing its details sheet does not discard the receipt draft.

## Apple authentication

On supported iOS devices, **Continue with Apple** is the first authentication
option. The same button creates an account or signs in to an existing Kvitto
account. **Opprett konto med e-post** opens email registration; **Logg inn med
e-post** opens email login. The welcome screen uses a centered mark, rounded
buttons, and a separate email form. Devices without Apple authentication show
the email form directly.

Existing email users can select **Innstillinger → Koble til Apple** to add Apple
to their current account. This preserves the account identifier, household,
receipt access, and email password. Apple private relay addresses are supported.
The backend never links accounts automatically by matching email addresses. One
Apple identity can belong to only one Kvitto account. Linking does not merge two
existing Kvitto accounts.

Before distributing a build:

1. Enable **Sign in with Apple** for `no.tolnes.kvitto` in Apple Developer, under
   team `592JWHZRVQ`. Refresh the provisioning profile if required. EAS can
   synchronize this capability when the build has the required account access.
2. Deploy the additive authentication backend to the build's target deployment.
3. Build a new native binary with `expo-apple-authentication`. The Expo plugin
   and `ios.usesAppleSignIn` setting are configured in `app.json`.
4. Test new registration, repeat login, cancellation, Hide My Email, explicit
   linking, and restored sessions on a signed physical iPhone. Confirm that an
   existing email user's household and queued receipts remain available.

This native flow sends an Apple identity token and nonce to Better Auth. The
server verifies Apple's signature, issuer, audience, expiry, and nonce. The
accepted audience comes from the bundle identifier in `app.json`. Apple supplies
the native name only on first authorization; the client passes it with that
first sign-in. A later sign-in preserves the stored name.

Native identity-token verification does not require an Apple private key, client
secret, Services ID, or browser return URL. Apple web and Android authentication
are not configured. Expo Go identities are not accepted because its audience
differs from Kvitto's bundle identifier. Use a development build for device tests.

The new native dependency and entitlement require a binary, not an OTA-only
release. Existing clients keep email/password access and their session storage.
No receipt data migration or minimum-version change is required.

Public App Store release still requires an in-app account-deletion flow and
Apple token revocation. Those account-lifecycle operations are not implemented
by this native sign-in flow. Plan the authorization-code exchange and server
credentials with that work; an identity token alone cannot revoke Apple access.

References: [Expo 57 Apple authentication](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/),
[Better Auth Apple provider](https://www.better-auth.com/docs/authentication/apple),
and [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

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

## Background receipt transfers

On iOS, the upload queue schedules the current receipt's image files with a
background URL session. iOS can continue those transfers after the application
is suspended. The backend starts processing when the last image arrives; it
does not wait for the application to reopen. Duplicate requests remain safe.

The existing device queue retains images and completed steps until it receives
confirmation. Opening Kvitto reconciles transfers completed while it was closed.
An expired login token or failed transfer waits for the application to resume
and retry with current credentials. Receipts not yet scheduled stay in the queue.
Force-quitting the application can cancel transfers; open Kvitto to resume them.
Changing account or household cancels transfers from the previous scope.

## Control Center and Lock Screen

On iOS 18 or later, add **Kvitto → Skann kvittering** from the controls gallery.
The control opens the camera selected in Settings. The shared capture intent
runs in the main application. It does not capture a photograph without user
interaction. Lock Screen access can require unlocking the phone.

## Receipt previews and Spotlight

**Vis originalkvittering** opens Quick Look on supported native builds. It
provides system zoom, page navigation, and sharing. Protected receipt images
are downloaded into a temporary, protected directory and removed on dismissal.
Imported PDF pages are still stored as images; this does not retain the PDF file.
Older native clients keep the existing image viewer.

In Settings, enable **Finn kvitteringer i Spotlight** to index the latest 100
receipt records on this device. Search uses store names, purchase dates, and
item names. The index is off by default. Excluded receipts are omitted. Updates
replace the index while the app is running; disabling the setting, signing out,
or changing household removes it. Opening a result still requires application
authentication and household access. The feature does not publish receipts to a
web search engine.

## Contextual tips

On iOS 17 or later, TipKit can explain product matching when unmatched items
exist. After three visits to Forbruk, it can suggest the spending widget if none
is installed. Tips use the system dismissal controls and daily frequency limit.
Each tip has a maximum of two displays. Completing a product match or detecting
an installed widget invalidates the corresponding tip.

## Receipt processing Live Activities

When at least two reserved receipts are uploading or processing, the inbox
provides **Følg behandling på låseskjermen**. This starts an explicit batch of up
to 30 receipts. Larger queues show the limit in the button label. The activity
shows processed and failed counts on the Lock Screen and Dynamic Island.
An item ready for review counts as processed, not necessarily approved.

A live Convex subscription updates the activity while Kvitto runs. The backend
also sends ActivityKit updates through APNs when receipt status changes. The
activity becomes stale after five minutes without an update and tells the user
to open Kvitto. Tracking ends when all receipts finish or after one hour; ending
tracking does not cancel processing. Account and household changes end local
activities. Backend registration is limited to three activities per account.

Remote updates require these secrets on each target Convex deployment:

- `APNS_KEY_ID`: the Apple push notification signing key identifier.
- `APNS_TEAM_ID`: the Apple Developer team identifier.
- `APNS_PRIVATE_KEY`: the complete `.p8` signing key, stored as a backend secret.

Use an APNs signing key authorized for `no.tolnes.kvitto`, not an App Store
Connect API key or an Expo notification token. Retrieve an existing key from
its secure owner; do not place it in application configuration or commit it.
The client reads its signed APNs environment and registers it with its activity
token, so development and distribution builds can use the same backend.
The server selects the corresponding APNs endpoint. Without these credentials,
foreground updates still work, but suspended-app updates do not.

Deploy the additive backend before distributing this native build. Existing
clients keep explicit upload completion. The queue format and API version are
unchanged. Validate Control Center launch, background transfers after locking,
Spotlight launch, and APNs updates on a signed physical iPhone before release.
Simulator checks do not establish APNs delivery or background scheduling.
