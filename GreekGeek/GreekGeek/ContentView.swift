import SwiftUI

struct ContentView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        @Bindable var session = session
        Group {
            if session.isRestoring {
                ZStack {
                    Palette.canvas.ignoresSafeArea()
                    VStack(spacing: 16) {
                        WordmarkView(height: 24)
                        ProgressView()
                            .tint(Palette.accent)
                    }
                }
            } else if session.flow == .signedIn {
                SignedInRootView()
            } else {
                MarketingHomeView()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: session.flow)
        .sheet(isPresented: $session.pendingResetPassword) {
            NavigationStack { ResetPasswordView() }
        }
        .sheet(isPresented: Binding(
            get: { session.pendingInviteToken != nil },
            set: { if !$0 { session.pendingInviteToken = nil } }
        )) {
            NavigationStack { InviteAcceptView() }
        }
    }
}

#Preview {
    ContentView()
        .environment(AppSession())
        .preferredColorScheme(.dark)
}
