import CoreSpotlight
import UniformTypeIdentifiers
import ExpoModulesCore

struct SearchReceipt: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var detail: String = ""
  @Field var keywords: [String] = []
}

/// One app index is replaced serially, so an old account cannot repopulate it after clearing.
final class ReceiptSearch {
  static let shared = ReceiptSearch()
  private let queue = OperationQueue()
  private let domain = "no.tolnes.kvitto.receipts"

  private init() { queue.maxConcurrentOperationCount = 1 }

  func replace(_ receipts: [SearchReceipt], promise: Promise) {
    queue.addOperation {
      let semaphore = DispatchSemaphore(value: 0)
      CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [self.domain]) { error in
        guard error == nil else { promise.reject("SEARCH_FAILED", "Kunne ikke oppdatere Spotlight."); semaphore.signal(); return }
        let items = receipts.map { receipt in
          let attributes = CSSearchableItemAttributeSet(contentType: .text)
          attributes.title = receipt.title
          attributes.contentDescription = receipt.detail
          attributes.keywords = receipt.keywords
          attributes.contentURL = URL(string: "kvitto:///receipt/\(receipt.id)")
          let item = CSSearchableItem(uniqueIdentifier: receipt.id, domainIdentifier: self.domain, attributeSet: attributes)
          item.expirationDate = Date().addingTimeInterval(30 * 86400)
          return item
        }
        CSSearchableIndex.default().indexSearchableItems(items) { error in
          if error != nil { promise.reject("SEARCH_FAILED", "Kunne ikke oppdatere Spotlight.") }
          else { promise.resolve(nil) }
          semaphore.signal()
        }
      }
      semaphore.wait()
    }
  }
}
