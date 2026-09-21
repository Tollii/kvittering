import ExpoModulesCore
import CoreSpotlight
import UIKit

public class ReceiptAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
    guard identifier == ReceiptBackgroundUploads.identifier else { completionHandler(); return }
    ReceiptBackgroundUploads.shared.completionHandler = completionHandler
    ReceiptBackgroundUploads.shared.reconnect()
  }

  public func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    guard userActivity.activityType == CSSearchableItemActionType,
          let id = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
          id.range(of: "^[a-z0-9]+$", options: .regularExpression) != nil,
          let url = URL(string: "kvitto:///receipt/\(id)") else { return false }
    application.open(url)
    return true
  }
}
