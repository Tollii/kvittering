import ExpoModulesCore
import SwiftUI
import TipKit

@available(iOS 17.0, *)
struct ProductMatchTip: Tip {
  var title: Text { Text("Koble varer raskt") }
  var message: Text? { Text("Velg produktet du kjenner igjen. Du kan angre det siste valget.") }
  var image: Image? { Image(systemName: "barcode") }
  var options: [TipOption] { MaxDisplayCount(2) }
}

@available(iOS 17.0, *)
struct SpendingWidgetTip: Tip {
  var title: Text { Text("Forbruk på Hjem-skjermen") }
  var message: Text? { Text("Legg til Kvitto-widgeten for å se månedens forbruk uten å åpne appen.") }
  var image: Image? { Image(systemName: "square.grid.2x2") }
  var options: [TipOption] { MaxDisplayCount(2) }
}

@available(iOS 17.0, *)
struct ReceiptTipContent: View {
  let kind: String
  let heightChanged: (CGFloat) -> Void
  var body: some View {
    Group {
      if kind == "matching" { TipView(ProductMatchTip()) }
      else { TipView(SpendingWidgetTip()) }
    }
    .tint(Color(red: 0.15, green: 0.24, blue: 0.78))
    .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { heightChanged($0) }
  }
}

final class ReceiptTipView: ExpoView {
  let onHeightChange = EventDispatcher()
  private var controller: UIHostingController<AnyView>?
  private static var configured = false
  var kind = "matching" { didSet { configure() } }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    if #available(iOS 17.0, *), !Self.configured {
      do { try Tips.configure([.displayFrequency(.daily)]); Self.configured = true }
      catch { /* Tips are optional and must not prevent receipt access. */ }
    }
    configure()
  }

  private func configure() {
    guard #available(iOS 17.0, *) else { return }
    let content = AnyView(ReceiptTipContent(kind: kind) { [weak self] height in self?.onHeightChange(["height": height]) })
    if let controller { controller.rootView = content }
    else {
      let hosting = UIHostingController(rootView: content)
      hosting.view.backgroundColor = .clear
      controller = hosting
      addSubview(hosting.view)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let controller else { return }
    let size = controller.sizeThatFits(in: CGSize(width: bounds.width, height: CGFloat.greatestFiniteMagnitude))
    controller.view.frame = CGRect(x: 0, y: 0, width: bounds.width, height: size.height)
  }
}
