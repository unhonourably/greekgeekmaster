import Combine
import SwiftUI

struct AnnouncementsView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    @State private var showComposer = false

    var body: some View {
        let live = session.selectedChapter ?? chapter
        GGScreenStack {
                HStack(alignment: .top) {
                    GGPageHeader(title: "Announcements", description: "Pinned posts stay at the top. Officers can require an acknowledgment.")
                    if live.can(.announcementsPublish) {
                        GGButton(title: "Post", size: .sm) { showComposer = true }
                    }
                }
                if live.announcements.isEmpty {
                    GGEmptyState(icon: "megaphone", title: "No announcements yet", message: "When officers post, it will show up here.")
                }
                ForEach(live.announcements) { item in
                    GGCard(padding: 16) {
                        HStack(spacing: 8) {
                            if item.pinned {
                                Image(systemName: "pin.fill")
                                    .foregroundStyle(Palette.ink3)
                            }
                            Text(item.title)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Palette.ink)
                            Spacer()
                            if item.requiresAck { GGBadge(text: "Acknowledge", tone: .warning) }
                        }
                        Text(item.body)
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.ink2)
                            .padding(.top, 6)
                        HStack {
                            Text("\(item.author) · \(item.audience)")
                                .font(.system(size: 12))
                                .foregroundStyle(Palette.ink3)
                            Spacer()
                            if item.requiresAck {
                                GGButton(title: "Acknowledge", size: .sm) {
                                    session.acknowledge(announcementId: item.id)
                                }
                            }
                        }
                        .padding(.top, 10)
                    }
                }
        }
        .sheet(isPresented: $showComposer) {
            AnnouncementComposer(chapter: live)
        }
    }
}

struct AnnouncementComposer: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let chapter: ChapterContext
    @State private var title = ""
    @State private var bodyText = ""
    @State private var audience = "all"
    @State private var pinned = false
    @State private var requiresAck = false
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    GGField(label: "Title") { GGTextField(placeholder: "Chapter meeting moved", text: $title) }
                    GGField(label: "Body") { GGTextArea(placeholder: "Write the announcement", text: $bodyText, minHeight: 160) }
                    Picker("Audience", selection: $audience) {
                        Text("All members").tag("all")
                        if chapter.can(.announcementsOfficers) {
                            Text("Officers").tag("officers")
                        }
                    }
                    .tint(Palette.accent)
                    Toggle("Pin to top", isOn: $pinned).tint(Palette.accent)
                    Toggle("Require acknowledgment", isOn: $requiresAck).tint(Palette.accent)
                    if let error { GGNotice(tone: .danger, message: error) }
                    GGButton(title: "Publish", fillWidth: true, busy: busy) { Task { await publish() } }
                }
                .padding(20)
            }
            .greekGeekScreen()
            .navigationTitle("New announcement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundStyle(Palette.ink2)
                }
            }
        }
    }

    private func publish() async {
        guard title.trimmingCharacters(in: .whitespaces).count >= 2, !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            error = "Add a title and the announcement text."
            return
        }
        busy = true
        error = await session.performChapter { store, chapter in
            try await store.publishAnnouncement(
                chapterId: chapter.chapter.id,
                title: title,
                body: bodyText,
                audience: audience,
                pinned: pinned,
                requiresAck: requiresAck
            )
        }
        busy = false
        if error == nil { dismiss() }
    }
}

struct EventsView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    var onSelect: (ChapterEvent) -> Void
    @State private var showComposer = false

    var body: some View {
        let live = session.selectedChapter ?? chapter
        GGScreenStack {
                HStack(alignment: .top) {
                    GGPageHeader(title: "Events", description: "RSVP, required attendance, and QR check-in.")
                    if live.can(.eventsManage) {
                        GGButton(title: "New", size: .sm) { showComposer = true }
                    }
                }
                if live.events.isEmpty {
                    GGEmptyState(icon: "calendar", title: "No upcoming events", message: "When your chapter schedules something, it will appear here.")
                }
                ForEach(live.events) { event in
                    Button {
                        onSelect(event)
                    } label: {
                        GGCard(padding: 16) {
                            HStack(alignment: .top) {
                                VStack(spacing: 0) {
                                    Text(DateFormat.month(event.startsAt, timeZone: event.timezone).uppercased())
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundStyle(Palette.accent)
                                    Text(DateFormat.day(event.startsAt, timeZone: event.timezone))
                                        .font(.system(size: 18, weight: .semibold).monospacedDigit())
                                        .foregroundStyle(Palette.ink)
                                }
                                .frame(width: 48)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(event.title)
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(Palette.ink)
                                    Text(DateFormat.chapter(event.startsAt, timeZone: event.timezone))
                                        .font(.system(size: 13))
                                        .foregroundStyle(Palette.ink2)
                                    if let location = event.location {
                                        Text(location)
                                            .font(.system(size: 13))
                                            .foregroundStyle(Palette.ink3)
                                    }
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 6) {
                                    if event.attendanceRequired { GGBadge(text: "Required", tone: .gold) }
                                    if let rsvp = event.rsvp { GGBadge(text: rsvp.capitalized, tone: .info) }
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
        }
        .sheet(isPresented: $showComposer) {
            EventComposer(chapter: live)
        }
    }
}

struct EventComposer: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let chapter: ChapterContext
    @State private var title = ""
    @State private var location = ""
    @State private var details = ""
    @State private var starts = Date().addingTimeInterval(86_400)
    @State private var ends = Date().addingTimeInterval(86_400 + 3_600)
    @State private var required = false
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    GGField(label: "Title") { GGTextField(placeholder: "Chapter meeting", text: $title) }
                    GGField(label: "Location") { GGTextField(placeholder: "Great room", text: $location) }
                    GGField(label: "Details") { GGTextArea(placeholder: "Optional", text: $details) }
                    DatePicker("Starts", selection: $starts).tint(Palette.accent).foregroundStyle(Palette.ink)
                    DatePicker("Ends", selection: $ends).tint(Palette.accent).foregroundStyle(Palette.ink)
                    Toggle("Attendance required", isOn: $required).tint(Palette.accent)
                    if let error { GGNotice(tone: .danger, message: error) }
                    GGButton(title: "Create event", fillWidth: true, busy: busy) { Task { await save() } }
                }
                .padding(20)
            }
            .greekGeekScreen()
            .navigationTitle("New event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundStyle(Palette.ink2)
                }
            }
        }
    }

    private func save() async {
        guard title.trimmingCharacters(in: .whitespaces).count >= 2 else {
            error = "Give the event a title."
            return
        }
        var end = ends
        if end <= starts { end = starts.addingTimeInterval(3_600) }
        busy = true
        error = await session.performChapter { store, chapter in
            try await store.createEvent(
                chapterId: chapter.chapter.id,
                title: title,
                location: location.isEmpty ? nil : location,
                details: details.isEmpty ? nil : details,
                startsAt: starts,
                endsAt: end,
                timezone: chapter.chapter.timezone,
                attendanceRequired: required
            )
        }
        busy = false
        if error == nil { dismiss() }
    }
}

struct EventDetailView: View {
    @Environment(AppSession.self) private var session
    let event: ChapterEvent
    @State private var showCheckIn = false

    var body: some View {
        let live = session.selectedChapter?.events.first(where: { $0.id == event.id }) ?? event
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: live.title, description: DateFormat.chapter(live.startsAt, timeZone: live.timezone))
                if let location = live.location {
                    labeled("Location", location)
                }
                if let details = live.details {
                    labeled("Details", details)
                }
                if live.attendanceRequired {
                    GGNotice(tone: .gold, title: "Attendance required", message: "Officers will take attendance. QR codes rotate every 30 seconds.")
                }
                Text("Your RSVP")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.ink)
                HStack(spacing: 8) {
                    rsvpButton("Going", "going", live.rsvp)
                    rsvpButton("Maybe", "maybe", live.rsvp)
                    rsvpButton("Not going", "not_going", live.rsvp)
                }
                Button("Check in with QR") { showCheckIn = true }
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.accent)
            }
            .padding(16)
        }
        .greekGeekScreen()
        .sheet(isPresented: $showCheckIn) {
            NavigationStack {
                CheckInView(event: live)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") { showCheckIn = false }
                                .foregroundStyle(Palette.ink2)
                        }
                    }
            }
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(Palette.ink3)
            Text(value)
                .font(.system(size: 15))
                .foregroundStyle(Palette.ink)
        }
    }

    private func rsvpButton(_ title: String, _ value: String, _ current: String?) -> some View {
        GGButton(title: title, kind: current == value ? .primary : .secondary, size: .sm) {
            session.setRSVP(eventId: event.id, status: value)
        }
    }
}

struct CheckInView: View {
    let event: ChapterEvent
    @State private var tick = 0
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 18) {
            Text(event.title)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Palette.ink)
            Text("Codes rotate every 30 seconds and are accepted for about 2 minutes.")
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center)
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Palette.ink)
                .frame(width: 220, height: 220)
                .overlay {
                    Image(systemName: "qrcode")
                        .resizable()
                        .scaledToFit()
                        .padding(24)
                        .foregroundStyle(Palette.canvas)
                }
            Text("Refresh in \(30 - (tick % 30))s")
                .font(.system(size: 13).monospacedDigit())
                .foregroundStyle(Palette.ink3)
            GGNotice(tone: .info, message: "Officers can also take attendance by hand. A screenshot shared quickly could be reused within the acceptance window.")
        }
        .padding(24)
        .greekGeekScreen()
        .onReceive(timer) { _ in tick += 1 }
        .navigationTitle("Check-in")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct DirectoryView: View {
    let chapter: ChapterContext
    var onSelect: (DirectoryMember) -> Void
    @State private var query = ""
    @State private var filter: MemberClass?

    var body: some View {
        let rows = chapter.members.filter { member in
            (filter == nil || member.memberClass == filter) &&
            (query.isEmpty || member.name.localizedCaseInsensitiveContains(query) || member.email.localizedCaseInsensitiveContains(query))
        }
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                GGPageHeader(title: "Directory", description: "\(chapter.members.count) \(chapter.members.count == 1 ? "member" : "members")")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        filterChip("All", nil)
                        ForEach([MemberClass.active, .newMember, .associate, .alumni], id: \.self) { item in
                            filterChip(item.label, item)
                        }
                    }
                }
                if rows.isEmpty {
                    GGEmptyState(icon: "person.2", title: chapter.members.isEmpty ? "No members yet" : "No one matches", message: chapter.members.isEmpty ? "Officers invite the roster from Settings." : "Try another class or search.")
                }
                ForEach(rows) { member in
                    Button {
                        onSelect(member)
                    } label: {
                        HStack(spacing: 12) {
                            PersonAvatar(name: member.name, path: member.avatarPath, size: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Palette.ink)
                                Text(([member.memberClass.label] + member.roles + [member.graduationYear.map(String.init)].compactMap { $0 }).joined(separator: " · "))
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                        }
                        .padding(14)
                        .background(Palette.surface)
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(Palette.line, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
        }
        .greekGeekScreen()
        .searchable(text: $query, prompt: "Search members")
    }

    private func filterChip(_ title: String, _ value: MemberClass?) -> some View {
        Button(title) { filter = value }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(filter == value ? Palette.onAccent : Palette.ink2)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(filter == value ? Palette.accent : Palette.subtle)
            .clipShape(Capsule())
    }
}

struct MemberProfileView: View {
    @Environment(AppSession.self) private var session
    let member: DirectoryMember
    var onRemoved: (() -> Void)? = nil
    @State private var memberClass: MemberClass
    @State private var status: MembershipStatus
    @State private var reason = ""
    @State private var roleId = ""
    @State private var message: String?
    @State private var busy = false

    init(member: DirectoryMember, onRemoved: (() -> Void)? = nil) {
        self.member = member
        self.onRemoved = onRemoved
        _memberClass = State(initialValue: member.memberClass)
        _status = State(initialValue: member.status)
    }

    private var live: DirectoryMember {
        session.selectedChapter?.members.first { $0.membershipId == member.membershipId } ?? member
    }

    var body: some View {
        let chapter = session.selectedChapter
        let canManageMembers = chapter?.can(.membersManage) == true
        let canManageRoles = chapter?.can(.rolesManage) == true
        ScrollView {
            VStack(spacing: 16) {
                PersonAvatar(name: live.name, path: live.avatarPath, size: 72)
                Text(live.name)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                if !live.email.isEmpty {
                    Text(live.email)
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.ink2)
                }
                HStack {
                    GGBadge(text: live.status.label, tone: .neutral)
                    GGBadge(text: live.memberClass.label, tone: .neutral)
                    ForEach(Array(live.roles.enumerated()), id: \.offset) { _, role in
                        GGBadge(text: role, tone: .neutral)
                    }
                }
                if let message {
                    GGNotice(tone: message.contains("updated") || message.contains("assigned") || message.contains("ended") ? .positive : .danger, message: message)
                }
                GGCard(padding: 16) {
                    row("Class", live.memberClass.label)
                    row("Status", live.status.label)
                    row("Graduation", live.graduationYear.map(String.init) ?? "—")
                    row("Housing", live.house ?? "Not in house")
                }
                if canManageMembers {
                    GGCard(padding: 16) {
                        Text("Manage membership")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        Picker("Class", selection: $memberClass) {
                            ForEach(MemberClass.allCases, id: \.self) { item in
                                Text(item.label).tag(item)
                            }
                        }
                        .tint(Palette.accent)
                        .padding(.top, 6)
                        Picker("Status", selection: $status) {
                            ForEach(MembershipStatus.allCases, id: \.self) { item in
                                Text(item.label).tag(item)
                            }
                        }
                        .tint(Palette.accent)
                        GGField(label: "Reason") { GGTextField(placeholder: "Required when suspending or ending", text: $reason) }
                            .padding(.top, 8)
                        GGButton(title: "Save member", fillWidth: true, busy: busy) { Task { await saveMember() } }
                            .padding(.top, 12)
                        if live.id != session.currentUserId {
                            GGButton(title: "Remove from chapter", kind: .danger, fillWidth: true, busy: busy) { Task { await removeMember() } }
                                .padding(.top, 8)
                        }
                    }
                }
                if canManageRoles, let chapter {
                    GGCard(padding: 16) {
                        Text("Roles")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        if live.roleAssignments.isEmpty {
                            Text("No officer roles assigned.")
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.ink3)
                                .padding(.top, 4)
                        }
                        ForEach(live.roleAssignments) { hold in
                            HStack {
                                Text(hold.name)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Palette.ink)
                                Spacer()
                                Button("End") { Task { await endRole(hold.id) } }
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Palette.danger)
                                    .disabled(busy)
                            }
                            .padding(.vertical, 6)
                        }
                        Picker("Assign role", selection: $roleId) {
                            Text("Choose a role").tag("")
                            ForEach(chapter.roles.filter { role in !live.roleAssignments.contains(where: { $0.name == role.name }) }) { role in
                                Text(role.name).tag(role.id)
                            }
                        }
                        .tint(Palette.accent)
                        .padding(.top, 6)
                        GGButton(title: "Assign role", kind: .secondary, fillWidth: true, busy: busy) { Task { await assignRole() } }
                            .padding(.top, 10)
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: live.memberClass) { _, value in memberClass = value }
        .onChange(of: live.status) { _, value in status = value }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(Palette.ink3)
            Spacer()
            Text(value)
                .foregroundStyle(Palette.ink)
        }
        .font(.system(size: 14))
        .padding(.vertical, 6)
    }

    private func saveMember() async {
        if (status == .ended || status == .suspended) && reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 {
            message = "Give a reason when suspending or ending membership."
            return
        }
        busy = true
        let error = await session.performChapter { store, _ in
            try await store.updateMembership(
                membershipId: member.membershipId,
                memberClass: memberClass,
                status: status,
                reason: reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : reason
            )
        }
        busy = false
        message = error ?? "Member updated."
    }

    private func removeMember() async {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 3 else {
            message = "Give a reason before removing this member."
            return
        }
        busy = true
        let error = await session.performChapter { store, _ in
            try await store.removeChapterMember(membershipId: member.membershipId, reason: String(trimmed.prefix(300)))
        }
        busy = false
        if let error {
            message = error
        } else {
            onRemoved?()
        }
    }

    private func assignRole() async {
        guard !roleId.isEmpty else {
            message = "Choose a role."
            return
        }
        busy = true
        let error = await session.performChapter { store, chapter in
            try await store.assignRole(chapterId: chapter.chapter.id, membershipId: member.membershipId, roleId: roleId)
        }
        busy = false
        if let error {
            message = error
        } else {
            roleId = ""
            message = "Role assigned."
        }
    }

    private func endRole(_ assignmentId: String) async {
        busy = true
        let error = await session.performChapter { store, chapter in
            try await store.endRole(assignmentId: assignmentId, chapterId: chapter.chapter.id)
        }
        busy = false
        message = error ?? "Role ended."
    }
}

struct DuesView: View {
    let chapter: ChapterContext

    var body: some View {
        GGScreenStack {
                GGPageHeader(title: "My dues", description: "Your balance with \(chapter.chapter.organizationName). You pay exactly what you owe; no fees are added.")
                GGDesktopHint()
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    metric("Balance", MoneyFormat.cents(chapter.balance.balanceCents))
                    metric("Clearing", MoneyFormat.cents(chapter.balance.processingCents))
                }
                GGCard(padding: 16) {
                    Text("Next due")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink3)
                    Text(chapter.balance.nextDueDate.map { DateFormat.medium($0) } ?? "Nothing due")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 4)
                }
                if !chapter.canCollect && chapter.charges.contains(where: { $0.outstandingCents > 0 }) {
                    GGNotice(tone: .info, message: "Your chapter is not accepting online payments yet. Pay your treasurer directly; they will record it here.")
                }
                GGCard {
                    GGCardHeader(title: "Open charges")
                    let open = chapter.charges.filter { $0.outstandingCents > 0 }
                    if open.isEmpty {
                        GGEmptyState(icon: "creditcard", title: "You are all paid up", message: "New charges from your treasurer will appear here.")
                    } else {
                        ForEach(open) { charge in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(charge.title)
                                        .font(.system(size: 15, weight: .medium))
                                        .foregroundStyle(Palette.ink)
                                    Spacer()
                                    Text(MoneyFormat.cents(charge.outstandingCents))
                                        .font(.system(size: 15, weight: .semibold).monospacedDigit())
                                        .foregroundStyle(Palette.ink)
                                }
                                Text("\(charge.category) · Due \(DateFormat.medium(charge.dueDate))")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink3)
                                if charge.allowInstallments {
                                    Text("Installments available, up to \(charge.maxInstallments)")
                                        .font(.system(size: 12))
                                        .foregroundStyle(Palette.ink3)
                                }
                                Link(destination: AppConfig.chapterWebURL(slug: chapter.chapter.slug, path: "/dues")) {
                                    Text("Pay online")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(Palette.onAccent)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(Palette.accent)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                }
                            }
                            .padding(16)
                        }
                    }
                }
                GGCard {
                    GGCardHeader(title: "Payment history")
                    ForEach(Array(chapter.payments.enumerated()), id: \.element.id) { index, payment in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(payment.title)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(Palette.ink)
                                Text("\(payment.method) · \(DateFormat.medium(payment.createdAt))")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(MoneyFormat.cents(payment.amountCents))
                                    .font(.system(size: 14, weight: .medium).monospacedDigit())
                                    .foregroundStyle(Palette.ink)
                                GGBadge(text: payment.status.label, tone: payment.status.tone)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        if index < chapter.payments.count - 1 { ListRowDivider() }
                    }
                }
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        GGCard(padding: 12) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Palette.ink3)
            Text(value)
                .font(.system(size: 16, weight: .semibold).monospacedDigit())
                .foregroundStyle(Palette.ink)
                .padding(.top, 4)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
    }
}

struct ReimbursementsView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    @State private var title = ""
    @State private var amount = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Reimbursements", description: "Members request repayment. The treasurer reviews it in Finances.")
                GGCard(padding: 16) {
                    Text("New request")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    GGField(label: "What was it for") {
                        GGTextField(placeholder: "Costco supplies", text: $title)
                    }
                    .padding(.top, 10)
                    GGField(label: "Amount") {
                        GGTextField(placeholder: "0.00", text: $amount, keyboard: .decimalPad)
                    }
                    .padding(.top, 10)
                    GGButton(title: "Submit request", size: .sm) {
                        let cents = Int((Double(amount) ?? 0) * 100)
                        guard !title.isEmpty, cents > 0 else { return }
                        session.submitReimbursement(title: title, amountCents: cents)
                        title = ""
                        amount = ""
                    }
                    .padding(.top, 12)
                }
                ForEach(chapter.reimbursements) { item in
                    GGCard(padding: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Palette.ink)
                                Text("\(item.requester) · \(DateFormat.medium(item.submittedAt))")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 6) {
                                Text(MoneyFormat.cents(item.amountCents))
                                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                                    .foregroundStyle(Palette.ink)
                                GGBadge(text: item.status, tone: item.status == "Approved" ? .positive : .info)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
    }
}
