import SwiftUI

struct SignedInRootView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @State private var showAccount = false
    @State private var showNotifications = false
    @State private var showOnboarding = false
    @State private var showAdmin = false
    @State private var showBugReport = false

    var body: some View {
        @Bindable var session = session
        VStack(spacing: 0) {
            if session.presentedChapterSlug == nil {
                AppHeaderBar(
                    onNotifications: { showNotifications = true },
                    onAccount: { showAccount = true },
                    onAdmin: session.staffRole == nil ? nil : { showAdmin = true },
                    onBug: { showBugReport = true }
                )
            }
            NavigationStack {
                HomeView(showAccount: $showAccount, showOnboarding: $showOnboarding)
                    .navigationDestination(item: $session.presentedChapterSlug) { _ in
                        ChapterShellView()
                            .navigationBarBackButtonHidden(true)
                            .toolbar(.hidden, for: .navigationBar)
                    }
            }
        }
        .background(Palette.canvas.ignoresSafeArea())
        .sheet(isPresented: $showAccount) {
            NavigationStack { AccountView() }
        }
        .sheet(isPresented: $showNotifications) {
            NavigationStack { NotificationsView() }
        }
        .sheet(isPresented: $showOnboarding) {
            NavigationStack { OnboardingView() }
        }
        .sheet(isPresented: $showAdmin) {
            NavigationStack { AdminHomeView() }
        }
        .sheet(isPresented: $showBugReport) {
            BugReportView(page: "/home")
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await session.refreshInbox() }
            }
        }
    }
}

struct AppHeaderBar: View {
    @Environment(AppSession.self) private var session
    var onNotifications: () -> Void
    var onAccount: () -> Void
    var onAdmin: (() -> Void)?
    var onBug: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            WordmarkView(height: 18)
            Spacer()
            if let onAdmin {
                Button("Platform admin", action: onAdmin)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.ink2)
            }
            if let onBug {
                Button(action: onBug) {
                    Image(systemName: "ant")
                        .foregroundStyle(Palette.ink2)
                }
                .accessibilityLabel("Report a bug")
            }
            Button(action: onNotifications) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "bell")
                        .foregroundStyle(Palette.ink2)
                    if session.unreadCount > 0 {
                        Circle()
                            .fill(Palette.accent)
                            .frame(width: 8, height: 8)
                            .offset(x: 3, y: -3)
                    }
                }
            }
            .accessibilityLabel("Notifications")
            Button(action: onAccount) {
                PersonAvatar(name: session.profile?.personName ?? "Account", path: session.profile?.avatarPath, size: 28)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Palette.canvas.opacity(0.94))
        .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
    }
}

struct HomeView: View {
    @Environment(AppSession.self) private var session
    @Binding var showAccount: Bool
    @Binding var showOnboarding: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                welcome
                if !session.chapters.isEmpty { stats }
                if session.chapters.isEmpty {
                    getStarted
                } else {
                    chaptersCard
                }
                if !session.applications.isEmpty { applicationsCard }
                if !session.upcomingEvents.isEmpty { upcomingEvents }
                profileChecklist
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                PersonAvatar(name: session.profile?.personName ?? "Member", path: session.profile?.avatarPath, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.firstName.isEmpty ? "Welcome" : "Welcome, \(session.firstName)")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(session.user?.email ?? "")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink3)
                }
                Spacer(minLength: 0)
            }
            GGButton(title: "Register a chapter", icon: "building.2", kind: .secondary, size: .sm) { showOnboarding = true }
        }
        .padding(18)
        .background(Palette.surface)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Palette.line, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var stats: some View {
        let totalDue = session.chapters.reduce(0) { $0 + $1.balanceCents }
        let events = session.upcomingEvents.count
        return HStack(spacing: 0) {
            stat("Chapters", "\(session.chapters.count)")
            Palette.line.frame(width: 1)
            stat("Dues balance", MoneyFormat.cents(totalDue), warning: totalDue > 0)
            Palette.line.frame(width: 1)
            stat("Upcoming events", "\(events)")
        }
        .background(Palette.surface)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Palette.line, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func stat(_ label: String, _ value: String, warning: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Palette.ink3)
            Text(value)
                .font(.system(size: 17, weight: .semibold).monospacedDigit())
                .foregroundStyle(warning ? Palette.warning : Palette.ink)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var chaptersCard: some View {
        GGCard {
            GGCardHeader(title: "Your chapters")
            ForEach(Array(session.chapters.enumerated()), id: \.element.id) { index, chapter in
                Button {
                    session.openChapter(chapter)
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "building.2")
                            .foregroundStyle(Palette.accent)
                            .frame(width: 40, height: 40)
                            .background(Palette.accentSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chapter.organizationName)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(Palette.ink)
                            Text([chapter.designation, chapter.universityName, chapter.memberClass.label].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                        if chapter.status != .verified {
                            GGBadge(text: chapter.status.label, tone: .danger)
                        } else {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text(chapter.balanceCents > 0 ? "\(MoneyFormat.cents(chapter.balanceCents)) due" : "Paid up")
                                    .font(.system(size: 13, weight: .medium).monospacedDigit())
                                    .foregroundStyle(chapter.balanceCents > 0 ? Palette.warning : Palette.ink2)
                                if let due = chapter.nextDueDate, chapter.balanceCents > 0 {
                                    Text("Next due \(DateFormat.shortDay(due))")
                                        .font(.system(size: 12))
                                        .foregroundStyle(Palette.ink3)
                                }
                            }
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Palette.ink3)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                }
                if index < session.chapters.count - 1 { ListRowDivider() }
            }
        }
    }

    private var getStarted: some View {
        GGCard {
            GGCardHeader(title: "Get started", description: "Officers register their chapter. Members join by invitation.")
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "building.2")
                    .foregroundStyle(Palette.accent)
                    .frame(width: 36, height: 36)
                    .background(Palette.accentSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                Text("Register your chapter")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                Text("For officers setting up their chapter. We verify every chapter before it can invite members or collect dues.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink2)
                GGButton(title: "Start an application", size: .sm) { showOnboarding = true }
            }
            .padding(20)
            ListRowDivider()
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "envelope")
                    .foregroundStyle(Palette.ink2)
                    .frame(width: 36, height: 36)
                    .background(Palette.subtle)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                Text("Joining a chapter?")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                Text("Ask an officer to invite \(session.user?.email ?? "your email"), then open the link in the email.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink2)
            }
            .padding(20)
        }
    }

    private var applicationsCard: some View {
        GGCard {
            GGCardHeader(title: "Chapter applications", description: "Applications you started or submitted.")
            ForEach(session.applications) { application in
                HStack(spacing: 12) {
                    Image(systemName: "doc.text")
                        .foregroundStyle(Palette.ink3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text([application.organizationName, application.designation].compactMap { $0 }.joined(separator: ", ").ifEmpty("Untitled application"))
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Palette.ink)
                        Text("\(application.kind.label) · \(application.universityName ?? "University not set")")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink3)
                    }
                    Spacer()
                    GGBadge(text: application.status.label, tone: application.status.tone)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
        }
    }

    private var upcomingEvents: some View {
        GGCard {
            GGCardHeader(title: "Upcoming events")
            let events = session.upcomingEvents
            if events.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "calendar")
                    Text("Nothing scheduled. Events from your chapters will appear here.")
                }
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink3)
                .padding(20)
            } else {
                ForEach(Array(events.enumerated()), id: \.element.id) { index, event in
                    HStack(spacing: 12) {
                        VStack(spacing: 0) {
                            Text(DateFormat.month(event.startsAt, timeZone: event.timezone).uppercased())
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(Palette.accent)
                            Text(DateFormat.day(event.startsAt, timeZone: event.timezone))
                                .font(.system(size: 14, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Palette.ink)
                        }
                        .frame(width: 44)
                        .padding(.vertical, 6)
                        .overlay {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .stroke(Palette.line, lineWidth: 1)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(event.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.ink)
                            Text([DateFormat.weekdayTime(event.startsAt, timeZone: event.timezone), event.location].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                        if event.attendanceRequired {
                            GGBadge(text: "Required", tone: .gold)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    if index < events.count - 1 { ListRowDivider() }
                }
            }
        }
    }

    private var profileChecklist: some View {
        let items = [
            ("Add your name", !(session.profile?.fullName ?? "").isEmpty),
            ("Add a profile photo", session.profile?.avatarPath != nil),
            ("Add your graduation year", session.profile?.graduationYear != nil),
            ("Join or register a chapter", !session.chapters.isEmpty)
        ]
        let remaining = items.filter { !$0.1 }.count
        guard remaining > 0 else { return AnyView(EmptyView()) }
        return AnyView(
            GGCard {
                GGCardHeader(title: "Finish your profile", description: "\(items.count - remaining) of \(items.count) done")
                ProgressView(value: Double(items.count - remaining), total: Double(items.count))
                    .tint(Palette.accent)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(items, id: \.0) { item in
                        HStack(spacing: 10) {
                            Image(systemName: item.1 ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(item.1 ? Palette.accent : Palette.lineStrong)
                            Text(item.0)
                                .font(.system(size: 13))
                                .foregroundStyle(item.1 ? Palette.ink3 : Palette.ink2)
                                .strikethrough(item.1)
                        }
                    }
                }
                .padding(20)
                Button("Open account settings") { showAccount = true }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.accent)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        )
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}

#Preview {
    SignedInRootView()
        .environment(AppSession())
        .preferredColorScheme(.dark)
}
