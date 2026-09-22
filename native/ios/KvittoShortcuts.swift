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

enum PurchaseMonth: String, AppEnum {
  case january, february, march, april, may, june, july, august, september, october, november, december

  static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Måned")
  static let caseDisplayRepresentations: [PurchaseMonth: DisplayRepresentation] = [
    .january: "Januar", .february: "Februar", .march: "Mars", .april: "April",
    .may: "Mai", .june: "Juni", .july: "Juli", .august: "August",
    .september: "September", .october: "Oktober", .november: "November", .december: "Desember"
  ]

  var number: Int {
    switch self {
    case .january: return 1
    case .february: return 2
    case .march: return 3
    case .april: return 4
    case .may: return 5
    case .june: return 6
    case .july: return 7
    case .august: return 8
    case .september: return 9
    case .october: return 10
    case .november: return 11
    case .december: return 12
    }
  }
}

private enum ShortcutInputError: LocalizedError {
  case invalidYear
  case invalidStore

  var errorDescription: String? {
    switch self {
    case .invalidYear: return "Velg et år mellom 1900 og 9999."
    case .invalidStore: return "Skriv et butikknavn på 1 til 100 tegn."
    }
  }
}

/// Pass only the requested selection. Receipt data stays behind application authentication.
private func shortcutURL(path: String, parameters: [URLQueryItem]) -> URL {
  var components = URLComponents(string: "kvitto:///\(path)")!
  components.queryItems = parameters + [URLQueryItem(name: "request", value: UUID().uuidString)]
  return components.url!
}

struct FindLatestReceiptIntent: AppIntent {
  static let title: LocalizedStringResource = "Finn siste kvittering"
  static let description = IntentDescription("Åpner den nyeste daterte kvitteringen fra valgt butikk. Krever innlogging og nett.")
  static let openAppWhenRun = true

  @Parameter(title: "Butikk", requestValueDialog: "Hvilken butikk vil du finne kvitteringen fra?")
  var store: String

  static var parameterSummary: some ParameterSummary {
    Summary("Finn siste kvittering fra \(\.$store)")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    let name = store.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty && name.count <= 100 else { throw ShortcutInputError.invalidStore }
    await UIApplication.shared.open(shortcutURL(path: "shortcut-receipt", parameters: [URLQueryItem(name: "store", value: name)]))
    return .result()
  }
}

struct ShowMonthlyPurchasesIntent: AppIntent {
  static let title: LocalizedStringResource = "Vis kjøp for måned"
  static let description = IntentDescription("Åpner registrerte kjøp for valgt måned i Kvitto. Uten år brukes inneværende år. Krever innlogging og nett.")
  static let openAppWhenRun = true

  @Parameter(title: "Måned", requestValueDialog: "Hvilken måned vil du se?")
  var month: PurchaseMonth

  @Parameter(title: "År")
  var year: Int?

  static var parameterSummary: some ParameterSummary {
    Summary("Vis kjøp for \(\.$month)") { \.$year }
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    let selectedYear = year ?? Calendar(identifier: .gregorian).component(.year, from: Date())
    guard (1900...9999).contains(selectedYear) else { throw ShortcutInputError.invalidYear }
    let value = String(format: "%04d-%02d", selectedYear, month.number)
    await UIApplication.shared.open(shortcutURL(path: "(tabs)/spending", parameters: [URLQueryItem(name: "month", value: value)]))
    return .result()
  }
}

struct KvittoShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: FindLatestReceiptIntent(), phrases: ["Finn siste kvittering i \(.applicationName)", "Find my latest receipt in \(.applicationName)"], shortTitle: "Finn kvittering", systemImageName: "doc.text.magnifyingglass")
    AppShortcut(intent: ShowMonthlyPurchasesIntent(), phrases: ["Vis kjøp i \(.applicationName)", "Vis kjøp for \(\.$month) i \(.applicationName)", "Show purchases in \(.applicationName)"], shortTitle: "Vis månedens kjøp", systemImageName: "chart.bar.xaxis")
    AppShortcut(intent: ScanReceiptIntent(), phrases: ["Skann kvittering med \(.applicationName)", "Scan a receipt with \(.applicationName)"], shortTitle: "Skann kvittering", systemImageName: "doc.viewfinder")
    AppShortcut(intent: OpenInboxIntent(), phrases: ["Åpne innboksen i \(.applicationName)", "Open inbox in \(.applicationName)"], shortTitle: "Åpne innboks", systemImageName: "tray")
  }
}
