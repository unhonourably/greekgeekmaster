import SwiftUI

struct ChapterShellView: View {
    @Environment(AppSession.self) private var session
    @State private var destination: ChapterDestination = .overview
    @State private var history: [ChapterDestination] = []
    @State private var showMenu = false
    @State private var showBugReport = false
    @State private var openedConversationId: String?
    @State private var openedEvent: ChapterEvent?
    @State private var openedMember: DirectoryMember?

    var body: some View {
        Group {
            if session.isLoadingChapter && session.selectedChapter == nil {
                ProgressView()
                    .tint(Palette.accent)
                    .greekGeekScreen()
            } else if let message = session.lastError, session.selectedChapter == nil {
                VStack(spacing: 16) {
                    GGEmptyState(icon: "exclamationmark.triangle", title: "Could not load chapter", message: message)
                    GGButton(title: "Back to home", kind: .secondary) { session.closeChapter() }
                }
                .greekGeekScreen()
            } else if let chapter = session.selectedChapter {
                VStack(spacing: 0) {
                    ChapterChromeBar(
                        title: chromeTitle,
                        backTitle: chromeBackTitle,
                        onBack: chromeBack,
                        onMenu: { showMenu = true },
                        onBug: { showBugReport = true }
                    )
                    Group {
                        if let openedConversationId,
                           let openedConversation = session.conversation(id: openedConversationId) ?? chapter.conversations.first(where: { $0.id == openedConversationId }) {
                            ChatRoomView(conversation: openedConversation)
                        } else if let openedEvent {
                            EventDetailView(event: openedEvent)
                        } else if let member = openedMember {
                            MemberProfileView(member: member, onRemoved: { openedMember = nil })
                        } else {
                            moduleView(destination, chapter: chapter)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .background(Palette.canvas.ignoresSafeArea())
                .onChange(of: destination) { _, _ in
                    openedConversationId = nil
                    openedEvent = nil
                    openedMember = nil
                }
                .onChange(of: openedConversationId) { _, id in
                    session.viewingConversationId = id
                }
                .onDisappear {
                    session.viewingConversationId = nil
                }
                .sheet(isPresented: $showMenu) {
                    NavigationStack {
                        ChapterMenuView(destination: destination, isPresented: $showMenu, onPick: pickDestination)
                    }
                    .presentationDetents([.medium, .large])
                }
                .sheet(isPresented: $showBugReport) {
                    BugReportView(page: bugPage)
                }
            } else {
                VStack(spacing: 16) {
                    GGEmptyState(icon: "building.2", title: "No chapter selected")
                    GGButton(title: "Back to home", kind: .secondary) { session.closeChapter() }
                }
                .greekGeekScreen()
            }
        }
        .tint(Palette.accent)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }

    private var chromeTitle: String {
        if let openedConversationId,
           let openedConversation = session.conversation(id: openedConversationId) ?? session.selectedChapter?.conversations.first(where: { $0.id == openedConversationId }) {
            return openedConversation.title
        }
        if let openedEvent { return openedEvent.title }
        if let openedMember { return openedMember.name }
        return destination.title
    }

    private var chromeBackTitle: String {
        if openedConversationId != nil { return "Messages" }
        if openedEvent != nil { return "Events" }
        if openedMember != nil { return destination == .settings ? "Settings" : "Directory" }
        if destination == .overview { return "Home" }
        return history.last?.title ?? "Overview"
    }

    private var bugPage: String {
        guard let slug = session.selectedChapter?.chapter.slug else { return "/home" }
        if openedConversationId != nil { return "/c/\(slug)/chat" }
        if openedEvent != nil { return "/c/\(slug)/events" }
        if openedMember != nil { return "/c/\(slug)/directory" }
        if destination == .overview { return "/c/\(slug)" }
        return "/c/\(slug)/\(destination.rawValue)"
    }

    private func chromeBack() {
        if openedConversationId != nil {
            openedConversationId = nil
        } else if openedEvent != nil {
            openedEvent = nil
        } else if openedMember != nil {
            openedMember = nil
        } else if destination != .overview {
            destination = history.popLast() ?? .overview
        } else {
            session.closeChapter()
        }
    }

    private func pickDestination(_ next: ChapterDestination) {
        if next == destination { return }
        if next == .overview {
            history.removeAll()
        } else {
            history.append(destination)
        }
        destination = next
    }

    @ViewBuilder
    private func moduleView(_ destination: ChapterDestination, chapter: ChapterContext) -> some View {
        switch destination {
        case .overview: OverviewView(chapter: chapter, onOpen: pickDestination)
        case .setup: SetupView(chapter: chapter, onOpen: pickDestination)
        case .chat: ChatInboxView(chapter: chapter, onSelect: { conversation in
            openedConversationId = conversation.id
            if !conversation.didLoadMessages {
                Task { await session.refreshConversation(conversation.id) }
            }
        })
        case .announcements: AnnouncementsView(chapter: chapter)
        case .events: EventsView(chapter: chapter, onSelect: { openedEvent = $0 })
        case .directory: DirectoryView(chapter: chapter, onSelect: { openedMember = $0 })
        case .dues: DuesView(chapter: chapter)
        case .reimbursements: ReimbursementsView(chapter: chapter)
        case .finances: FinancesView(chapter: chapter)
        case .recruitment: RecruitmentView(chapter: chapter)
        case .analytics: AnalyticsView(chapter: chapter)
        case .philanthropy: PhilanthropyView(chapter: chapter)
        case .housing: HousingView(chapter: chapter)
        case .standards: StandardsView(chapter: chapter)
        case .academics: AcademicsView(chapter: chapter)
        case .settings: SettingsView(chapter: chapter, onSelectMember: { openedMember = $0 })
        }
    }
}

struct ChapterChromeBar: View {
    let title: String
    let backTitle: String
    let onBack: () -> Void
    let onMenu: () -> Void
    var onBug: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                    Text(backTitle)
                        .font(.system(size: 16, weight: .medium))
                }
                .foregroundStyle(Palette.ink)
            }
            .accessibilityLabel(backTitle)
            Spacer(minLength: 8)
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
            Spacer(minLength: 8)
            if let onBug {
                Button(action: onBug) {
                    Image(systemName: "ant")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Palette.ink2)
                        .frame(width: 40, height: 44)
                }
                .accessibilityLabel("Report a bug")
            }
            Button(action: onMenu) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Chapter menu")
        }
        .padding(.leading, 16)
        .padding(.trailing, 6)
        .frame(height: 52)
        .background(Palette.canvas)
        .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
    }
}

struct ChapterMenuView: View {
    @Environment(AppSession.self) private var session
    var destination: ChapterDestination
    @Binding var isPresented: Bool
    var onPick: (ChapterDestination) -> Void

    var body: some View {
        List {
            Section {
                Button {
                    isPresented = false
                    session.closeChapter()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "house")
                            .foregroundStyle(Palette.ink3)
                            .frame(width: 22)
                        Text("Home")
                            .foregroundStyle(Palette.ink2)
                        Spacer()
                    }
                }
                .listRowBackground(Palette.surface)
            }
            ForEach(groups) { group in
                Section {
                    ForEach(group.items) { item in
                        Button {
                            onPick(item.id)
                            isPresented = false
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: item.symbol)
                                    .foregroundStyle(destination == item.id ? Palette.accent : Palette.ink3)
                                    .frame(width: 22)
                                Text(item.title)
                                    .foregroundStyle(destination == item.id ? Palette.ink : Palette.ink2)
                                Spacer()
                                if let badge = item.badge, badge > 0 {
                                    Text(badge > 99 ? "99+" : "\(badge)")
                                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
                                        .foregroundStyle(Palette.onAccent)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Palette.accent)
                                        .clipShape(Capsule())
                                }
                                if let tag = item.tag {
                                    GGBadge(text: tag, tone: .warning)
                                }
                            }
                        }
                        .listRowBackground(destination == item.id ? Palette.subtle : Palette.surface)
                    }
                } header: {
                    if let label = group.label {
                        Text(label.uppercased())
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Palette.ink3)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
        .navigationTitle(session.selectedChapter?.chapter.organizationName ?? "Chapter")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { isPresented = false }
                    .foregroundStyle(Palette.ink2)
            }
        }
    }

    private var groups: [NavGroup] {
        guard let chapter = session.selectedChapter else { return [] }
        var homeItems: [NavItem] = [
            NavItem(id: .overview),
            NavItem(id: .chat, badge: chapter.unreadMessages),
            NavItem(id: .announcements),
            NavItem(id: .events),
            NavItem(id: .directory),
            NavItem(id: .dues),
            NavItem(id: .reimbursements)
        ]
        if chapter.can(.chapterManage) {
            homeItems.insert(NavItem(id: .setup), at: 1)
        }
        var officer: [NavItem] = []
        if chapter.can(.financeView) { officer.append(NavItem(id: .finances)) }
        if chapter.chapter.isEnabled(.recruitment) && (chapter.can(.recruitmentView) || chapter.can(.recruitmentManage)) {
            officer.append(NavItem(id: .recruitment))
        }
        if chapter.can(.analyticsView) { officer.append(NavItem(id: .analytics)) }
        var programs: [NavItem] = []
        if chapter.chapter.isEnabled(.philanthropy) { programs.append(NavItem(id: .philanthropy)) }
        if chapter.chapter.isEnabled(.housing) && chapter.membership.memberClass != .newMember {
            programs.append(NavItem(id: .housing))
        }
        if chapter.chapter.isEnabled(.standards) { programs.append(NavItem(id: .standards)) }
        if chapter.chapter.isEnabled(.academics) { programs.append(NavItem(id: .academics)) }
        var groups: [NavGroup] = [NavGroup(id: "home", label: nil, items: homeItems)]
        if !officer.isEmpty { groups.append(NavGroup(id: "officers", label: "Officers", items: officer)) }
        if !programs.isEmpty { groups.append(NavGroup(id: "programs", label: "Programs", items: programs)) }
        if chapter.can(.chapterManage) || chapter.can(.membersManage) || chapter.can(.rolesManage) || chapter.can(.paymentsConfigure) || chapter.can(.auditView) {
            groups.append(NavGroup(id: "settings", label: nil, items: [NavItem(id: .settings)]))
        }
        return groups
    }
}

struct OverviewView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    var onOpen: (ChapterDestination) -> Void = { _ in }

    var body: some View {
        GGScreenStack {
            GGPageHeader(
                title: chapter.chapter.organizationName,
                description: [chapter.chapter.designation, chapter.chapter.universityName].compactMap { $0 }.joined(separator: " · "),
                trailing: chapter.chapter.greekLetters
            )
            standing
            if let next = chapter.setupSteps.first(where: { !$0.done }), chapter.can(.chapterManage) {
                GGCard(padding: 16) {
                    Text("Chapter setup")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.ink3)
                    Text("Next: \(next.title)")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 4)
                    Text(next.detail)
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink2)
                        .padding(.top, 4)
                    ProgressView(value: Double(chapter.setupSteps.filter(\.done).count), total: Double(max(chapter.setupSteps.count, 1)))
                        .tint(Palette.accent)
                        .padding(.top, 10)
                    GGButton(title: "Continue setup") { onOpen(next.destination) }
                        .padding(.top, 12)
                    Button("See all steps") { onOpen(.setup) }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.ink2)
                        .padding(.top, 4)
                }
            }
            eventsCard
            announcementsCard
            duesCard
        }
    }

    private var standing: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            standingTile("Dues", chapter.balance.balanceCents > 0 ? MoneyFormat.cents(chapter.balance.balanceCents) : "Paid up", chapter.balance.balanceCents > 0 ? .warning : .positive)
            standingTile("Events", "\(chapter.events.filter { $0.rsvp == "going" }.count) going", .info)
            standingTile("Policies", "\(chapter.policies.filter { !$0.acknowledged }.count) due", chapter.policies.contains(where: { !$0.acknowledged }) ? .danger : .positive)
            standingTile("Messages", chapter.unreadMessages == 0 ? "Caught up" : "\(chapter.unreadMessages) unread", .accent)
        }
    }

    private func standingTile(_ label: String, _ value: String, _ tone: Tone) -> some View {
        GGCard(padding: 12) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Palette.ink3)
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tone.foreground)
                .padding(.top, 4)
        }
    }

    private var eventsCard: some View {
        GGCard {
            GGCardHeader(title: "Upcoming events")
            if chapter.events.isEmpty {
                GGEmptyState(icon: "calendar", title: "No upcoming events", message: "Events your chapter schedules will appear here.")
            } else {
                ForEach(Array(chapter.events.enumerated()), id: \.element.id) { index, event in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(event.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.ink)
                            Text([DateFormat.chapter(event.startsAt, timeZone: event.timezone), event.location].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                        if event.attendanceRequired { GGBadge(text: "Required", tone: .gold) }
                        if let rsvp = event.rsvp { GGBadge(text: rsvp.capitalized, tone: .info) }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    if index < chapter.events.count - 1 { ListRowDivider() }
                }
            }
        }
    }

    private var announcementsCard: some View {
        GGCard {
            GGCardHeader(title: "Announcements")
            if chapter.announcements.isEmpty {
                GGEmptyState(icon: "megaphone", title: "No announcements yet")
            } else {
                ForEach(chapter.announcements) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            if item.pinned {
                                Image(systemName: "pin")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Palette.ink3)
                            }
                            Text(item.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.ink)
                            if item.requiresAck { GGBadge(text: "Acknowledge", tone: .warning) }
                        }
                        Text(item.body)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink2)
                            .lineLimit(2)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    private var duesCard: some View {
        GGCard(padding: 20) {
            Text("My dues")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.ink)
            Text("Current balance")
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink3)
                .padding(.top, 10)
            Text(MoneyFormat.cents(chapter.balance.balanceCents))
                .font(.system(size: 28, weight: .semibold).monospacedDigit())
                .foregroundStyle(Palette.ink)
            if let due = chapter.balance.nextDueDate {
                Text("Next due \(DateFormat.medium(due))")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink2)
                    .padding(.top, 4)
            }
        }
    }
}

struct SetupView: View {
    let chapter: ChapterContext
    var onOpen: (ChapterDestination) -> Void = { _ in }

    var body: some View {
        let steps = chapter.setupSteps
        let done = steps.filter(\.done).count
        let next = steps.first(where: { !$0.done })
        let pct = steps.isEmpty ? 0 : Double(done) / Double(steps.count)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(
                    title: "Chapter setup",
                    description: next.map { "\(done) of \(steps.count) finished. \($0.title) is the next step." } ?? "Every setup step is finished. You can still open any of them."
                )
                if steps.contains(where: \.preview) {
                    GGNotice(tone: .info, title: "Subscription required", message: "These steps stay a preview until the chapter subscription is active.")
                }
                GGCard(padding: 16) {
                    HStack {
                        Text("Progress")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink2)
                        Spacer()
                        Text("\(Int(pct * 100))%")
                            .font(.system(size: 13).monospacedDigit())
                            .foregroundStyle(Palette.ink2)
                    }
                    ProgressView(value: pct)
                        .tint(Palette.accent)
                        .padding(.top, 8)
                    if let next {
                        GGButton(title: next.actionTitle, fillWidth: true) { onOpen(next.destination) }
                            .padding(.top, 12)
                    }
                }
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top, spacing: 12) {
                            ZStack {
                                Circle()
                                    .fill(step.done ? Palette.accent : Palette.subtle)
                                    .frame(width: 32, height: 32)
                                if step.done {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(Palette.onAccent)
                                } else {
                                    Text("\(index + 1)")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(Palette.ink2)
                                }
                            }
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    Text(step.title)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(Palette.ink)
                                    if step.done && !step.skipped { GGBadge(text: "Done", tone: .positive) }
                                    if step.skipped { GGBadge(text: "Skipped", tone: .neutral) }
                                    if step.optional && !step.done { GGBadge(text: "Optional", tone: .neutral) }
                                }
                                Text(step.detail)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink2)
                                    .fixedSize(horizontal: false, vertical: true)
                                GGButton(title: step.actionTitle, kind: .secondary, size: .sm) {
                                    onOpen(step.destination)
                                }
                                .padding(.top, 4)
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Palette.line, lineWidth: 1)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .greekGeekScreen()
    }
}
