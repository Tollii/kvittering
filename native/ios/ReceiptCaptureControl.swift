import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct ReceiptCaptureControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "no.tolnes.kvitto.capture") {
      ControlWidgetButton(action: ScanReceiptIntent()) {
        Label("Skann kvittering", systemImage: "doc.viewfinder")
      }
    }
    .displayName("Skann kvittering")
    .description("Åpner kvitteringskameraet i Kvitto.")
  }
}
