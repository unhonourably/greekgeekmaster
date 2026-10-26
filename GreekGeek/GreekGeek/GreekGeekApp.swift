import SwiftUI

@main
struct GreekGeekApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(session)
                .preferredColorScheme(.dark)
                .tint(Palette.accent)
                .task {
                    await session.bootstrap()
                }
                .onOpenURL { url in
                    Task { await session.handleIncomingURL(url) }
                }
        }
    }
}
