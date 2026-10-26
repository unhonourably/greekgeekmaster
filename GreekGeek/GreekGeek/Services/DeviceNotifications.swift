import Foundation
import UserNotifications
import UIKit

enum DeviceNotifications {
    static func requestPermission() async {
        let center = UNUserNotificationCenter.current()
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
    }

    static func post(_ item: AppNotification, badge: Int) {
        let content = UNMutableNotificationContent()
        content.title = item.displayTitle
        if !item.displayBody.isEmpty {
            content.body = item.displayBody
        }
        content.sound = .default
        content.badge = NSNumber(value: badge)
        let request = UNNotificationRequest(
            identifier: item.id,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        )
        UNUserNotificationCenter.current().add(request)
    }

    static func setBadge(_ count: Int) {
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(count) }
    }

    static func clear() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        setBadge(0)
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}
