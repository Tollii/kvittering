import AppIntents
import UIKit

struct OpenInboxIntent: AppIntent {
  static let title: LocalizedStringResource = "Åpne innboks"
  static let description = IntentDescription("Åpner kvitteringer som trenger kontroll i Kvitto.")
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await UIApplication.shared.open(URL(string: "kvitto:///(tabs)/inbox")!)
    return .result()
  }
}

struct KvittoShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: ScanReceiptIntent(), phrases: ["Skann kvittering med \(.applicationName)", "Scan a receipt with \(.applicationName)"], shortTitle: "Skann kvittering", systemImageName: "doc.viewfinder")
    AppShortcut(intent: OpenInboxIntent(), phrases: ["Åpne innboksen i \(.applicationName)", "Open inbox in \(.applicationName)"], shortTitle: "Åpne innboks", systemImageName: "tray")
  }
}
