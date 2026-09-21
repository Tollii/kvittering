import AppIntents
#if !KVITTO_WIDGET
import UIKit
#endif

enum ReceiptCaptureDestination: String, AppEnum {
  case camera
  static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Kvitteringskamera")
  static let caseDisplayRepresentations: [ReceiptCaptureDestination: DisplayRepresentation] = [.camera: "Kamera"]
}

struct ScanReceiptIntent: OpenIntent {
  @Parameter(title: "Mål", default: .camera)
  var target: ReceiptCaptureDestination

  static let title: LocalizedStringResource = "Skann kvittering"
  static let description = IntentDescription("Åpner valgt kvitteringskamera i Kvitto.")
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    #if !KVITTO_WIDGET
    await UIApplication.shared.open(URL(string: "kvitto:///(tabs)")!)
    #endif
    return .result()
  }
}
