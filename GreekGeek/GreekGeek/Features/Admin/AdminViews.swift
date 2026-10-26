import SwiftUI

enum AdminDestination: String, Hashable, CaseIterable {
    case verification
    case chapters
    case revenue
    case reconciliation
    case pricing
    case outreach
    case emailStats
    case bugs
    case closures
    case audit

    var title: String {
        switch self {
        case .verification: return "Verification"
        case .chapters: return "Chapters"
        case .revenue: return "Revenue"
        case .reconciliation: return "Reconciliation"
        case .pricing: return "Pricing"
        case .outreach: return "Outreach"
        case .emailStats: return "Email stats"
        case .bugs: return "Bug reports"
        case .closures: return "Closures"
        case .audit: return "Audit log"
        }
    }

    var symbol: String {
        switch self {
        case .verification: return "shield.checkered"
        case .chapters: return "building.2"
        case .revenue: return "chart.bar"
        case .reconciliation: return "building.columns"
        case .pricing: return "tag"
        case .outreach: return "envelope"
        case .emailStats: return "chart.line.uptrend.xyaxis"
        case .bugs: return "ant"
        case .closures: return "xmark.seal"
        case .audit: return "scroll"
        }
    }

    var capability: AdminCapability {
        switch self {
        case .verification: return .verification
        case .chapters: return .chapters
        case .revenue, .reconciliation: return .financeTools
        case .bugs: return .bugs
        case .outreach, .emailStats, .closures, .pricing, .audit: return .adminOnly
        }
    }
}

enum AdminRoute: Hashable {
    case section(AdminDestination)
    case application(String)
    case chapter(String)
    case bug(String)
    case form(String)
}

struct AdminHomeView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let role = session.staffRole
        List {
            if let role {
                Section {
                    Text("Signed in as \(role.label.lowercased()).")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink3)
                        .listRowBackground(Palette.canvas)
                }
            }
            if let adminError = session.adminError {
                Section { Text(adminError).foregroundStyle(Palette.danger).font(.system(size: 14)) }
            }
            if role?.can(.verification) == true {
                Section("Trust") {
                    adminRow(.verification, count: session.admin.applications.filter { $0.status == .pendingVerification }.count)
                }
            }
            if role?.can(.chapters) == true {
                Section {
                    adminRow(.chapters, count: session.admin.chapters.count)
                }
            }
            if role?.can(.financeTools) == true {
                Section("Finance") {
                    adminRow(.revenue)
                    adminRow(.reconciliation, count: session.admin.reconciliation.count)
                }
            }
            if role?.can(.adminOnly) == true {
                Section("Growth") {
                    adminRow(.outreach, count: session.admin.replies.filter(\.unread).count + session.admin.forms.filter(\.unread).count)
                    adminRow(.emailStats)
                }
            }
            if role?.can(.bugs) == true {
                Section("Support") {
                    adminRow(.bugs, count: session.admin.bugs.filter { ["new", "triaged", "in_progress"].contains($0.status) }.count)
                }
            }
            if role?.can(.adminOnly) == true {
                Section("Platform") {
                    adminRow(.closures, count: session.admin.closures.count)
                    adminRow(.pricing)
                    adminRow(.audit)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
        .navigationTitle("Platform admin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
                    .foregroundStyle(Palette.ink2)
            }
        }
        .navigationDestination(for: AdminRoute.self) { route in
            switch route {
            case .section(let item): AdminSectionView(destination: item)
            case .application(let id): AdminApplicationView(applicationId: id)
            case .chapter(let id): AdminChapterView(chapterId: id)
            case .bug(let id): AdminBugView(bugId: id)
            case .form(let id): AdminFormView(formId: id)
            }
        }
        .task { await session.loadAdmin() }
        .refreshable { await session.loadAdmin() }
        .overlay {
            if session.isLoadingAdmin && session.admin.applications.isEmpty && session.admin.chapters.isEmpty && session.admin.bugs.isEmpty {
                ProgressView().tint(Palette.accent)
            }
        }
    }

    private func adminRow(_ item: AdminDestination, count: Int = 0) -> some View {
        NavigationLink(value: AdminRoute.section(item)) {
            HStack {
                Label(item.title, systemImage: item.symbol)
                    .foregroundStyle(Palette.ink)
                Spacer()
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 12, weight: .semibold).monospacedDigit())
                        .foregroundStyle(Palette.onAccent)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Palette.accent)
                        .clipShape(Capsule())
                }
            }
        }
        .listRowBackground(Palette.surface)
    }
}

struct AdminSectionView: View {
    @Environment(AppSession.self) private var session
    let destination: AdminDestination

    var body: some View {
        Group {
            switch destination {
            case .verification: AdminVerificationList()
            case .chapters: AdminChapterList()
            case .revenue: AdminRevenueView()
            case .reconciliation: AdminReconciliationView()
            case .pricing: AdminPricingView()
            case .outreach: AdminOutreachView()
            case .emailStats: AdminEmailStatsView()
            case .bugs: AdminBugList()
            case .closures: AdminClosuresView()
            case .audit: AdminAuditView()
            }
        }
        .navigationTitle(destination.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AdminVerificationList: View {
    @Environment(AppSession.self) private var session
    @State private var view = "open"

    var body: some View {
        let rows = session.admin.applications.filter { application in
            switch view {
            case "waiting": return application.status == .infoRequested
            case "decided": return [.verified, .rejected, .suspended, .withdrawn].contains(application.status)
            default: return application.status == .pendingVerification
            }
        }
        List {
            Section {
                Picker("Queue", selection: $view) {
                    Text("Needs review").tag("open")
                    Text("Waiting").tag("waiting")
                    Text("Decided").tag("decided")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Palette.canvas)
            }
            if rows.isEmpty {
                Section {
                    Text(view == "open" ? "Nothing to review." : "No applications in this view.")
                        .foregroundStyle(Palette.ink3)
                }
            } else {
                ForEach(rows) { application in
                    NavigationLink(value: AdminRoute.application(application.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(application.title).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                            Text("\(application.university) · \(application.kind.label)")
                                .font(.system(size: 13)).foregroundStyle(Palette.ink3)
                            HStack(spacing: 6) {
                                GGBadge(text: application.status.label, tone: application.status.tone)
                                if application.emailVerified { GGBadge(text: "Email confirmed", tone: .positive) }
                                if application.appealCount > 0 { GGBadge(text: "Appeal", tone: .info) }
                            }
                        }
                    }
                    .listRowBackground(Palette.surface)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
    }
}

struct AdminApplicationView: View {
    @Environment(AppSession.self) private var session
    let applicationId: String
    @State private var decision = "verified"
    @State private var message = ""
    @State private var note = ""
    @State private var confirm = false
    @State private var status: String?
    @State private var busy = false

    var body: some View {
        let application = session.admin.applications.first { $0.id == applicationId }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let application {
                    GGPageHeader(title: application.title, description: "\(application.kind.label) · \(application.university)")
                    GGBadge(text: application.status.label, tone: application.status.tone)
                    GGCard(padding: 16) {
                        labeled("Applicant", application.applicantName)
                        labeled("Officer role", application.intendedRole)
                        labeled("Method", application.method.capitalized)
                        labeled("School email", application.institutionalEmail.isEmpty ? "—" : application.institutionalEmail)
                        labeled("National contact", application.nationalContact.isEmpty ? "—" : application.nationalContact)
                        labeled("FSL contact", application.fslContact.isEmpty ? "—" : application.fslContact)
                        if !application.greekLetters.isEmpty { labeled("Letters", application.greekLetters) }
                    }
                    if !application.statement.isEmpty {
                        GGCard(padding: 16) {
                            Text("Officer statement").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.ink)
                            Text(application.statement).font(.system(size: 14)).foregroundStyle(Palette.ink2).padding(.top, 6)
                        }
                    }
                    if let status { GGNotice(tone: status.contains("verified") || status.contains("sent") || status.contains("rejected") || status.contains("suspended") || status.contains("Note") ? .positive : .danger, message: status) }
                    if application.applicantId == session.currentUserId {
                        GGNotice(tone: .warning, message: "You cannot decide your own application.")
                    } else if application.status == .pendingVerification || application.status == .infoRequested {
                        GGCard(padding: 16) {
                            Text("Decision").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                            Picker("Decision", selection: $decision) {
                                Text("Verify").tag("verified")
                                Text("Ask for information").tag("info_requested")
                                Text("Reject").tag("rejected")
                                Text("Suspend").tag("suspended")
                            }
                            .tint(Palette.accent)
                            GGField(label: "Message to applicant") { GGTextArea(placeholder: "Required unless you are verifying", text: $message, minHeight: 90) }
                                .padding(.top, 8)
                            GGField(label: "Internal note") { GGTextArea(placeholder: "Optional, staff only", text: $note, minHeight: 72) }
                                .padding(.top, 8)
                            if decision == "verified" {
                                Toggle("The evidence supports verification", isOn: $confirm)
                                    .tint(Palette.accent)
                                    .padding(.top, 8)
                            }
                            GGButton(title: "Submit decision", fillWidth: true, busy: busy) { Task { await submit(application) } }
                                .padding(.top, 12)
                        }
                    }
                    GGCard(padding: 16) {
                        Text("Internal note").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                        GGField(label: "Note") { GGTextArea(placeholder: "Visible to staff only", text: $note, minHeight: 72) }
                            .padding(.top, 8)
                        GGButton(title: "Add note", kind: .secondary, fillWidth: true, busy: busy) { Task { await addNote() } }
                            .padding(.top, 10)
                    }
                } else {
                    GGEmptyState(icon: "shield.checkered", title: "Application not found")
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Palette.ink3)
            Spacer(minLength: 12)
            Text(value).foregroundStyle(Palette.ink).multilineTextAlignment(.trailing)
        }
        .font(.system(size: 14))
        .padding(.vertical, 5)
    }

    private func submit(_ application: AdminApplication) async {
        if decision == "verified" && !confirm {
            status = "Confirm that the evidence supports verification."
            return
        }
        if decision != "verified" && message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            status = "Explain the decision to the applicant."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.reviewApplication(
                id: application.id,
                decision: decision,
                message: message.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            )
        }
        busy = false
        status = error ?? (decision == "verified" ? "Chapter verified." : decision == "info_requested" ? "Request sent." : decision == "rejected" ? "Application rejected." : "Chapter suspended.")
    }

    private func addNote() async {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            status = "Write a note."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.addApplicationNote(id: applicationId, note: text)
        }
        busy = false
        if error == nil { note = "" }
        status = error ?? "Note added."
    }
}

struct AdminChapterList: View {
    @Environment(AppSession.self) private var session
    @State private var query = ""

    var body: some View {
        let rows = session.admin.chapters.filter {
            query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.university.localizedCaseInsensitiveContains(query) || $0.slug.localizedCaseInsensitiveContains(query)
        }
        List {
            if rows.isEmpty {
                Text("No chapters match.").foregroundStyle(Palette.ink3)
            } else {
                ForEach(rows) { chapter in
                    NavigationLink(value: AdminRoute.chapter(chapter.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(chapter.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                            Text("\(chapter.university) · \(chapter.members) members")
                                .font(.system(size: 13)).foregroundStyle(Palette.ink3)
                            HStack(spacing: 6) {
                                GGBadge(text: chapter.status.label, tone: chapter.status.tone)
                                if chapter.paymentsEnabled { GGBadge(text: "Payments on", tone: .positive) }
                            }
                        }
                    }
                    .listRowBackground(Palette.surface)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
        .searchable(text: $query, prompt: "Search chapters")
    }
}

struct AdminChapterView: View {
    @Environment(AppSession.self) private var session
    let chapterId: String
    @State private var status = "verified"
    @State private var reason = ""
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        let chapter = session.admin.chapters.first { $0.id == chapterId }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let chapter {
                    GGPageHeader(title: chapter.name, description: chapter.university)
                    GGCard(padding: 16) {
                        labeled("Handle", chapter.slug)
                        labeled("Status", chapter.status.label)
                        labeled("Members", "\(chapter.members)")
                        labeled("Subscription", LedgerCopy.subscription(chapter.subscription))
                        labeled("Card payments", chapter.paymentsEnabled ? "On" : "Off")
                        labeled("Verified", chapter.verifiedAt.map { DateFormat.medium($0) } ?? "Not verified")
                    }
                    if let message { GGNotice(tone: message == "Status updated." ? .positive : .danger, message: message) }
                    if session.staffRole?.can(.adminOnly) == true {
                        GGCard(padding: 16) {
                            Text("Change status").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                            Picker("Status", selection: $status) {
                                Text("Verified").tag("verified")
                                Text("Suspended").tag("suspended")
                                Text("Closed").tag("closed")
                            }
                            .tint(Palette.accent)
                            GGField(label: "Reason") { GGTextArea(placeholder: "Required. This is recorded in the audit log.", text: $reason, minHeight: 80) }
                                .padding(.top, 8)
                            GGButton(title: "Update status", fillWidth: true, busy: busy) { Task { await save(chapter.id) } }
                                .padding(.top, 12)
                        }
                    }
                } else {
                    GGEmptyState(icon: "building.2", title: "Chapter not found")
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if let chapter { status = chapter.status.rawValue } }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(Palette.ink3)
            Spacer()
            Text(value).foregroundStyle(Palette.ink)
        }
        .font(.system(size: 14))
        .padding(.vertical, 5)
    }

    private func save(_ id: String) async {
        let text = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            message = "A reason is required and is recorded in the audit log."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.setChapterStatus(id: id, status: status, reason: text)
        }
        busy = false
        message = error ?? "Status updated."
    }
}

struct AdminBugList: View {
    @Environment(AppSession.self) private var session
    @State private var view = "open"

    var body: some View {
        let rows = session.admin.bugs.filter { bug in
            switch view {
            case "new": return bug.status == "new"
            case "closed": return ["fixed", "wont_fix", "duplicate", "cant_reproduce"].contains(bug.status)
            default: return ["new", "triaged", "in_progress"].contains(bug.status)
            }
        }
        List {
            Section {
                Picker("View", selection: $view) {
                    Text("Open").tag("open")
                    Text("New").tag("new")
                    Text("Closed").tag("closed")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Palette.canvas)
            }
            if rows.isEmpty {
                Text("No reports in this view.").foregroundStyle(Palette.ink3)
            } else {
                ForEach(rows) { bug in
                    NavigationLink(value: AdminRoute.bug(bug.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("#\(bug.number) · \(bug.page)")
                                .font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                            Text(bug.message).font(.system(size: 13)).foregroundStyle(Palette.ink2).lineLimit(2)
                            HStack(spacing: 6) {
                                GGBadge(text: bug.status.replacingOccurrences(of: "_", with: " "), tone: bug.status == "fixed" ? .positive : bug.status == "new" ? .accent : .neutral)
                                GGBadge(text: bug.severity, tone: bug.severity == "critical" ? .danger : .warning)
                            }
                        }
                    }
                    .listRowBackground(Palette.surface)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
    }
}

struct AdminBugView: View {
    @Environment(AppSession.self) private var session
    let bugId: String
    @State private var status = "triaged"
    @State private var severity = "medium"
    @State private var area = "other"
    @State private var comment = ""
    @State private var fix = ""
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        let bug = session.admin.bugs.first { $0.id == bugId }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let bug {
                    GGPageHeader(title: "Bug #\(bug.number)", description: "\(bug.page) · \(bug.reporter)")
                    GGCard(padding: 16) {
                        Text(bug.message).font(.system(size: 15)).foregroundStyle(Palette.ink)
                        if !bug.email.isEmpty {
                            Text(bug.email).font(.system(size: 13)).foregroundStyle(Palette.ink3).padding(.top, 8)
                        }
                        Text(DateFormat.medium(bug.createdAt)).font(.system(size: 12)).foregroundStyle(Palette.ink3).padding(.top, 6)
                    }
                    if let message { GGNotice(tone: message == "Saved." || message.hasPrefix("Fix") || message == "Note added." ? .positive : .danger, message: message) }
                    GGCard(padding: 16) {
                        Text("Triage").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                        Picker("Status", selection: $status) {
                            Text("New").tag("new")
                            Text("Triaged").tag("triaged")
                            Text("In progress").tag("in_progress")
                            Text("Won't fix").tag("wont_fix")
                            Text("Can't reproduce").tag("cant_reproduce")
                        }
                        .tint(Palette.accent)
                        Picker("Severity", selection: $severity) {
                            Text("Critical").tag("critical")
                            Text("High").tag("high")
                            Text("Medium").tag("medium")
                            Text("Low").tag("low")
                        }
                        .tint(Palette.accent)
                        Picker("Area", selection: $area) {
                            Text("Payments").tag("payments")
                            Text("Dues").tag("dues")
                            Text("Chat").tag("chat")
                            Text("Events").tag("events")
                            Text("Account").tag("account")
                            Text("Admin").tag("admin")
                            Text("Other").tag("other")
                        }
                        .tint(Palette.accent)
                        GGButton(title: "Save triage", fillWidth: true, busy: busy) { Task { await saveTriage() } }
                            .padding(.top, 10)
                    }
                    GGCard(padding: 16) {
                        GGField(label: "Internal note") { GGTextArea(placeholder: "What you found", text: $comment, minHeight: 80) }
                        GGButton(title: "Add note", kind: .secondary, fillWidth: true, busy: busy) { Task { await addComment() } }
                            .padding(.top, 10)
                    }
                    GGCard(padding: 16) {
                        GGField(label: "Fix summary") { GGTextArea(placeholder: "What changed", text: $fix, minHeight: 80) }
                        GGButton(title: "Log a fix", fillWidth: true, busy: busy) { Task { await logFix() } }
                            .padding(.top, 10)
                    }
                } else {
                    GGEmptyState(icon: "ant", title: "Report not found")
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if let bug {
                status = bug.status == "fixed" ? "triaged" : bug.status
                severity = bug.severity
                area = bug.area
                fix = bug.fixSummary
            }
        }
    }

    private func saveTriage() async {
        busy = true
        let error = await session.performAdmin { store in
            try await store.updateBug(id: bugId, status: status, severity: severity, area: area)
        }
        busy = false
        message = error ?? "Saved."
    }

    private func addComment() async {
        let text = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 2 else {
            message = "Write a note first."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.commentOnBug(id: bugId, body: text)
        }
        busy = false
        if error == nil { comment = "" }
        message = error ?? "Note added."
    }

    private func logFix() async {
        let summary = fix.trimmingCharacters(in: .whitespacesAndNewlines)
        guard summary.count >= 5 else {
            message = "Say what changed."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.logBugFix(id: bugId, summary: summary, ref: nil)
        }
        busy = false
        message = error ?? "Fix logged. The report is closed as fixed."
    }
}

struct AdminClosuresView: View {
    @Environment(AppSession.self) private var session
    @State private var notes: [String: String] = [:]
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Closure requests", description: "A chapter stays open until an administrator accepts the request.")
                if let message { GGNotice(tone: message.contains("closed") || message.contains("declined") ? .positive : .danger, message: message) }
                if session.admin.closures.isEmpty {
                    GGEmptyState(icon: "xmark.seal", title: "No closure requests", message: "Presidents send these from chapter settings.")
                }
                ForEach(session.admin.closures) { item in
                    GGCard(padding: 16) {
                        Text(item.chapterName).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                        Text([item.university, item.requester, DateFormat.medium(item.createdAt)].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.system(size: 13)).foregroundStyle(Palette.ink3).padding(.top, 4)
                        Text(item.reason).font(.system(size: 14)).foregroundStyle(Palette.ink2).padding(.top, 8)
                        GGField(label: "Note") {
                            GGTextField(placeholder: "Required to decline", text: Binding(
                                get: { notes[item.id] ?? "" },
                                set: { notes[item.id] = $0 }
                            ))
                        }
                        .padding(.top, 10)
                        HStack {
                            GGButton(title: "Accept", fillWidth: true, busy: busy) { Task { await decide(item.id, "accepted") } }
                            GGButton(title: "Decline", kind: .secondary, fillWidth: true, busy: busy) { Task { await decide(item.id, "declined") } }
                        }
                        .padding(.top, 10)
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
    }

    private func decide(_ id: String, _ decision: String) async {
        let note = (notes[id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if decision == "declined" && note.count < 3 {
            message = "Tell the chapter why this was declined."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.reviewClosure(id: id, decision: decision, note: note.nilIfEmpty)
        }
        busy = false
        message = error ?? (decision == "accepted" ? "Chapter closed." : "Request declined.")
    }
}

struct AdminRevenueView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        let revenue = session.admin.revenue
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Revenue", description: "Last 30 days. Subscriptions plus net platform fees.")
                if let revenue {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        metric("Subscriptions", MoneyFormat.cents(revenue.saasCents), "\(revenue.subscriptions) active")
                        metric("Net fees", MoneyFormat.cents(revenue.feesCents - revenue.feeRefundsCents), revenue.feeRefundsCents == 0 ? "No fee refunds" : "After refunds")
                        metric("Dues volume", MoneyFormat.cents(revenue.volumeCents), "\(revenue.payments) payments")
                        metric("Mismatches", "\(revenue.mismatches)", revenue.disputes == 0 ? "No disputes" : "\(revenue.disputes) disputes")
                    }
                    GGCard {
                        GGCardHeader(title: "By chapter")
                        if revenue.chapters.isEmpty {
                            Text("No chapter fees in this period.").font(.system(size: 14)).foregroundStyle(Palette.ink3).padding(16)
                        } else {
                            ForEach(revenue.chapters) { row in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name).foregroundStyle(Palette.ink)
                                        Text(row.university).font(.system(size: 12)).foregroundStyle(Palette.ink3)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(MoneyFormat.cents(row.feesCents)).font(.system(size: 14, weight: .medium).monospacedDigit()).foregroundStyle(Palette.ink)
                                        Text("\(row.payments) payments").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                                    }
                                }
                                .padding(14)
                            }
                        }
                    }
                } else {
                    GGEmptyState(icon: "chart.bar", title: "Revenue could not be loaded")
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
    }

    private func metric(_ title: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 12)).foregroundStyle(Palette.ink3)
            Text(value).font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.ink)
            Text(hint).font(.system(size: 12)).foregroundStyle(Palette.ink3)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct AdminReconciliationView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Reconciliation", description: "Payments where Stripe and the ledger disagree.")
                if session.admin.reconciliation.isEmpty {
                    GGEmptyState(icon: "checkmark.circle", title: "Everything reconciles", message: "Every online payment matches its ledger entries.")
                } else {
                    ForEach(session.admin.reconciliation) { row in
                        GGCard(padding: 16) {
                            Text(row.chapter).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                            GGBadge(text: row.issue, tone: row.issue.contains("mismatch") ? .danger : .warning)
                                .padding(.top, 6)
                            HStack {
                                Text(MoneyFormat.cents(row.amountCents)).foregroundStyle(Palette.ink)
                                Spacer()
                                Text("Fee \(MoneyFormat.cents(row.expectedFeeCents))")
                                    .foregroundStyle(Palette.ink3)
                            }
                            .font(.system(size: 13))
                            .padding(.top, 8)
                            if !row.note.isEmpty {
                                Text(row.note).font(.system(size: 12)).foregroundStyle(Palette.ink3).padding(.top, 4)
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

struct AdminPricingView: View {
    @Environment(AppSession.self) private var session
    @State private var code = "standard"
    @State private var name = "Standard dues pricing"
    @State private var percent = "1.5"
    @State private var fixed = ""
    @State private var minFee = ""
    @State private var maxFee = ""
    @State private var refundPolicy = "proportional"
    @State private var termsVersion = ""
    @State private var termsTitle = "Chapter payments agreement"
    @State private var termsSummary = ""
    @State private var termsBody = ""
    @State private var makeDefault = true
    @State private var confirm = false
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Pricing", description: "Published rules are immutable. Each chapter keeps the rule on the agreement it accepted until it accepts a new one.")
                if let message {
                    GGNotice(tone: message.contains("published") ? .positive : .danger, message: message)
                }
                GGCard {
                    GGCardHeader(title: "GreekGeek subscription", description: "Charged to each chapter through Stripe Billing.")
                    ForEach(session.admin.plans) { plan in
                        HStack {
                            Text(plan.name).foregroundStyle(Palette.ink)
                            Spacer()
                            Text("\(MoneyFormat.cents(plan.priceCents)) / \(plan.interval)")
                                .foregroundStyle(Palette.ink2)
                            if plan.active { GGBadge(text: "Active", tone: .positive) }
                        }
                        .font(.system(size: 14))
                        .padding(14)
                    }
                    if session.admin.plans.isEmpty {
                        Text("No plan in the database. The app uses the $30 monthly plan.")
                            .font(.system(size: 14)).foregroundStyle(Palette.ink3).padding(16)
                    }
                }
                GGCard {
                    GGCardHeader(title: "Dues pricing rules")
                    ForEach(session.admin.pricingRules) { rule in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(rule.name).foregroundStyle(Palette.ink)
                                Spacer()
                                if rule.isDefault { GGBadge(text: "Default", tone: .accent) }
                                if rule.status == "retired" { GGBadge(text: "Retired", tone: .neutral) }
                            }
                            Text("\(rule.code) v\(rule.version)")
                                .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                            Text(feeLine(rule))
                                .font(.system(size: 13)).foregroundStyle(Palette.ink2)
                            Text("\(rule.refundPolicy == "proportional" ? "Returned proportionally" : "Fee kept") · \(rule.chapterCount) chapters")
                                .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        }
                        .padding(14)
                    }
                }
                GGCard(padding: 16) {
                    Text("Publish a new version")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    Text("This creates a new rule and a matching agreement. Existing chapters do not change until they accept.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink3)
                        .padding(.bottom, 8)
                    GGField(label: "Rule code") { GGTextField(placeholder: "standard", text: $code) }
                    GGField(label: "Name") { GGTextField(placeholder: "Standard dues pricing", text: $name) }.padding(.top, 8)
                    GGField(label: "Platform fee (%)") { GGTextField(placeholder: "1.5", text: $percent, keyboard: .decimalPad) }.padding(.top, 8)
                    GGField(label: "Fixed fee per payment ($)") { GGTextField(placeholder: "Optional, at most 5.00", text: $fixed, keyboard: .decimalPad) }.padding(.top, 8)
                    GGField(label: "Minimum fee ($)") { GGTextField(placeholder: "Optional", text: $minFee, keyboard: .decimalPad) }.padding(.top, 8)
                    GGField(label: "Maximum fee ($)") { GGTextField(placeholder: "Optional", text: $maxFee, keyboard: .decimalPad) }.padding(.top, 8)
                    GGField(label: "On refunds") {
                        VStack(spacing: 8) {
                            refundChoice("proportional", "Return the fee in proportion to the refund")
                            refundChoice("none", "Keep the fee")
                        }
                    }
                    if let preview = feePreview {
                        Text(preview)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink3)
                            .padding(.top, 6)
                    }
                    Text("Chapter agreement")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 12)
                    Text("Chapters on this rule must accept this agreement version before they can collect dues again.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink3)
                    GGField(label: "Version") { GGTextField(placeholder: "2026-11", text: $termsVersion) }.padding(.top, 8)
                    GGField(label: "Title") { GGTextField(placeholder: "Chapter payments agreement", text: $termsTitle) }.padding(.top, 8)
                    GGField(label: "Summary of changes") { GGTextArea(placeholder: "What changed in this version", text: $termsSummary, minHeight: 72) }.padding(.top, 8)
                    GGField(label: "Full agreement") { GGTextArea(placeholder: "The full agreement text", text: $termsBody, minHeight: 160) }.padding(.top, 8)
                    Toggle("Make this the default for new chapters", isOn: $makeDefault)
                        .tint(Palette.accent)
                        .padding(.top, 8)
                    Toggle("I understand published rules cannot be edited, and existing chapters keep their current rule until they accept the new agreement.", isOn: $confirm)
                        .tint(Palette.accent)
                        .padding(.top, 4)
                    GGButton(title: "Publish pricing", fillWidth: true, busy: busy) { Task { await publish() } }
                        .padding(.top, 12)
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .onAppear {
            let current = session.admin.pricingRules.first { $0.isDefault && $0.status == "active" } ?? session.admin.pricingRules.first
            if let current {
                code = current.code.isEmpty ? "standard" : current.code
                name = current.name
                percent = String(format: "%g", Double(current.bps) / 100)
            }
        }
    }

    private func refundChoice(_ value: String, _ title: String) -> some View {
        Button {
            refundPolicy = value
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: refundPolicy == value ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(refundPolicy == value ? Palette.accent : Palette.ink3)
                    .padding(.top, 1)
                Text(title)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.subtle)
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(refundPolicy == value ? Palette.accent : Palette.lineStrong, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var feePreview: String? {
        guard let pct = Double(percent.replacingOccurrences(of: ",", with: ".")), pct >= 0, pct <= 10 else { return nil }
        let bps = Int((pct * 100).rounded())
        let fixedCents = MoneyFormat.dollarsToCents(fixed) ?? 0
        let samples = [5_000, 25_000, 60_000].map { amount in
            "\(MoneyFormat.cents(amount)) pays \(MoneyFormat.cents(PlatformFees.platformFee(amountCents: amount, bps: bps, fixedCents: fixedCents)))"
        }
        return "Preview: \(samples.joined(separator: " · "))"
    }

    private func feeLine(_ rule: AdminPricingRule) -> String {
        var parts = [PlatformFees.percentLabel(rule.bps)]
        if rule.fixedCents > 0 { parts.append("+ \(MoneyFormat.cents(rule.fixedCents))") }
        if let minCents = rule.minCents { parts.append("min \(MoneyFormat.cents(minCents))") }
        if let maxCents = rule.maxCents { parts.append("max \(MoneyFormat.cents(maxCents))") }
        return parts.joined(separator: " · ")
    }

    private func publish() async {
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let pct = Double(percent.replacingOccurrences(of: ",", with: "."))
        let version = termsVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = termsTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let summary = termsSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = termsBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedCode.range(of: #"^[a-z0-9_-]{3,40}$"#, options: .regularExpression) != nil else {
            message = "Use 3 to 40 lowercase letters, numbers, dashes, or underscores for the code."
            return
        }
        guard trimmedName.count >= 3 else { message = "Name the rule."; return }
        guard let pct, pct >= 0, pct <= 10 else { message = "Platform fee must be between 0% and 10%."; return }
        let fixedCents = fixed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0 : MoneyFormat.dollarsToCents(fixed)
        let minCents = minFee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : MoneyFormat.dollarsToCents(minFee)
        let maxCents = maxFee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : MoneyFormat.dollarsToCents(maxFee)
        if !fixed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && fixedCents == nil { message = "Enter a dollar amount for the fixed fee."; return }
        if !minFee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && minCents == nil { message = "Enter a dollar amount for the minimum fee."; return }
        if !maxFee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && maxCents == nil { message = "Enter a dollar amount for the maximum fee."; return }
        if let fixedCents, fixedCents > 500 { message = "The fixed fee is at most $5.00."; return }
        if let minCents, let maxCents, maxCents < minCents { message = "Maximum fee must be at least the minimum."; return }
        guard !version.isEmpty else { message = "Version the agreement."; return }
        guard title.count >= 3 else { message = "Title the agreement."; return }
        guard summary.count >= 10 else { message = "Summarize what changed."; return }
        guard body.count >= 50 else { message = "Include the full agreement text."; return }
        guard confirm else {
            message = "Confirm that chapters must accept the new agreement before it applies."
            return
        }
        busy = true
        let error = await session.performAdmin { store in
            try await store.publishPricingRule(
                code: trimmedCode,
                name: trimmedName,
                bps: Int((pct * 100).rounded()),
                fixedCents: fixedCents ?? 0,
                minCents: minCents,
                maxCents: maxCents,
                refundPolicy: refundPolicy,
                makeDefault: makeDefault,
                termsVersion: version,
                termsTitle: title,
                termsSummary: summary,
                termsBody: body
            )
        }
        busy = false
        message = error ?? "Pricing published. The public pricing page now shows the default rule."
    }
}

struct AdminEmailStatsView: View {
    @Environment(AppSession.self) private var session
    @State private var rangeKey = "30"

    private var rangeDays: Int? { rangeKey == "all" ? nil : Int(rangeKey) }

    var body: some View {
        let stats = session.admin.emailStats
        let period = rangeDays.map { "the last \($0) days" } ?? "all time"
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(
                    title: "Email stats",
                    description: "How outreach is doing over \(period). These numbers come from emails already sent and replies already received. Sending is not available here."
                )
                Picker("Range", selection: $rangeKey) {
                    Text("7 days").tag("7")
                    Text("30 days").tag("30")
                    Text("90 days").tag("90")
                    Text("All time").tag("all")
                }
                .pickerStyle(.segmented)
                .onChange(of: rangeKey) { _, _ in
                    Task { await session.loadEmailStats(rangeDays: rangeDays) }
                }
                if session.isLoadingEmailStats && stats.sent == 0 && stats.forms == 0 {
                    ProgressView().tint(Palette.accent).frame(maxWidth: .infinity).padding(.top, 24)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        metric("Emails sent", "\(stats.sent)", stats.failed > 0 ? "\(stats.failed) failed and not counted" : "Failed sends not counted")
                        metric("People emailed", "\(stats.people)", "At \(stats.schools) school\(stats.schools == 1 ? "" : "s")")
                        metric("Heard back", "\(stats.heardBack)", "\(percent(stats.emailedAndReplied, of: stats.people)) of people emailed · \(stats.replies) replies")
                        metric("Form submissions", "\(stats.forms)", "\(stats.demos) want a demo")
                        metric("Delivered", "\(stats.delivered)", "\(percent(stats.delivered, of: stats.sent)) of emails sent")
                        metric("Opened", "\(stats.opened)", "\(percent(stats.opened, of: stats.sent)) · opens are not proof of reading")
                        metric("Clicked a link", "\(stats.clicked)", "\(percent(stats.clicked, of: stats.sent)) of emails sent")
                        metric("Bounced", "\(stats.bounced)", "\(percent(stats.bounced, of: stats.sent)) of emails sent · \(stats.blocked) do not contact")
                    }
                    if stats.people == 0 && stats.forms == 0 {
                        GGEmptyState(icon: "chart.line.uptrend.xyaxis", title: "Nothing sent in \(period)", message: "Once outreach emails go out, the numbers show up here.")
                    } else {
                        GGCard {
                            GGCardHeader(title: "From email to form", description: "Of the \(stats.people) people emailed in \(period).")
                            VStack(alignment: .leading, spacing: 14) {
                                funnelRow("Emailed", stats.people, of: stats.people, note: "Got at least one email")
                                funnelRow("Delivered", stats.deliveredTo, of: stats.people, note: "Their mail server accepted it")
                                funnelRow("Opened", stats.openedBy, of: stats.people, note: "Opens are not proof of reading")
                                funnelRow("Replied", stats.emailedAndReplied, of: stats.people, note: "Wrote back at least once")
                                funnelRow("Filled out the form", stats.formFromEmailed, of: stats.people, note: "Submitted with the same email")
                            }
                            .padding(16)
                        }
                        GGCard(padding: 16) {
                            GGCardHeader(title: "Replies")
                            replyRow("Typical time to first reply", stats.medianReplyMinutes.map { DateFormat.compactDuration(minutes: $0) } ?? "No replies yet")
                            replyRow("Fastest first reply", stats.fastestReplyMinutes.map { DateFormat.compactDuration(minutes: $0) } ?? "No replies yet")
                            replyRow("Replies received", "\(stats.replies)")
                            replyRow("Unread replies", "\(stats.unread)")
                            Text("Typical is the median: half of people replied faster than this.")
                                .font(.system(size: 12))
                                .foregroundStyle(Palette.ink3)
                                .padding(.top, 8)
                        }
                    }
                    GGCard {
                        GGCardHeader(title: "Each week", description: "The last 12 weeks, oldest on the left.")
                        let peak = max(1, stats.weeks.map { max($0.sent, $0.replies) }.max() ?? 1)
                        HStack(alignment: .bottom, spacing: 6) {
                            ForEach(stats.weeks) { week in
                                HStack(alignment: .bottom, spacing: 2) {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Palette.accent)
                                        .frame(height: barHeight(week.sent, peak: peak))
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Palette.positive)
                                        .frame(height: barHeight(week.replies, peak: peak))
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .frame(height: 140)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        HStack(spacing: 6) {
                            ForEach(Array(stats.weeks.enumerated()), id: \.element.id) { index, week in
                                Text(index % 2 == 0 ? DateFormat.shortDay(week.start) : "")
                                    .font(.system(size: 10))
                                    .foregroundStyle(Palette.ink3)
                                    .frame(maxWidth: .infinity)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                        HStack(spacing: 16) {
                            legend(Palette.accent, "Sent")
                            legend(Palette.positive, "Replies")
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 14)
                    }
                    if !stats.topSchools.isEmpty {
                        GGCard {
                            GGCardHeader(title: "Schools", description: "Schools emailed in \(period), most replies first.")
                            ForEach(stats.topSchools) { school in
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(school.name).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink)
                                        Text("\(school.emailed) emailed · \(school.opened) opened")
                                            .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text("\(school.replied) replied").font(.system(size: 13).monospacedDigit()).foregroundStyle(Palette.ink)
                                        Text("\(school.forms) forms").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                                    }
                                }
                                .padding(14)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .task { await session.loadEmailStats(rangeDays: rangeDays) }
        .refreshable { await session.loadEmailStats(rangeDays: rangeDays) }
    }

    private func percent(_ part: Int, of whole: Int) -> String {
        guard whole > 0 else { return "0%" }
        let value = (Double(part) / Double(whole)) * 100
        if value > 0 && value < 10 { return String(format: "%.1f%%", value) }
        return "\(Int(value.rounded()))%"
    }

    private func barHeight(_ value: Int, peak: Int) -> CGFloat {
        if value <= 0 { return 0 }
        return max(2, CGFloat(value) / CGFloat(peak) * 140)
    }

    private func metric(_ title: String, _ value: String, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 12)).foregroundStyle(Palette.ink3)
            Text(value).font(.system(size: 18, weight: .semibold)).foregroundStyle(Palette.ink)
            Text(hint).font(.system(size: 12)).foregroundStyle(Palette.ink3)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func funnelRow(_ label: String, _ value: Int, of whole: Int, note: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.system(size: 14)).foregroundStyle(Palette.ink)
                Spacer()
                Text("\(value)")
                    .font(.system(size: 14).monospacedDigit())
                    .foregroundStyle(Palette.ink)
                Text(percent(value, of: whole))
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink3)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.subtle)
                    Capsule()
                        .fill(Palette.accent)
                        .frame(width: max(value > 0 ? 4 : 0, geo.size.width * CGFloat(whole == 0 ? 0 : Double(value) / Double(whole))))
                }
            }
            .frame(height: 8)
            Text(note).font(.system(size: 12)).foregroundStyle(Palette.ink3)
        }
    }

    private func replyRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.system(size: 14)).foregroundStyle(Palette.ink3)
            Spacer()
            Text(value).font(.system(size: 14).monospacedDigit()).foregroundStyle(Palette.ink)
        }
        .padding(.top, 8)
    }

    private func legend(_ color: Color, _ title: String) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(title).font(.system(size: 12)).foregroundStyle(Palette.ink2)
        }
    }
}

struct AdminOutreachView: View {
    @Environment(AppSession.self) private var session
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        List {
            if let message {
                Section { Text(message).foregroundStyle(Palette.ink2).font(.system(size: 14)) }
            }
            Section("Unread replies") {
                if session.admin.replies.isEmpty {
                    Text("No replies yet.").foregroundStyle(Palette.ink3)
                } else {
                    ForEach(session.admin.replies) { reply in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(reply.from).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink)
                                Spacer()
                                if reply.unread { GGBadge(text: "Unread", tone: .accent) }
                            }
                            Text(reply.subject).font(.system(size: 13)).foregroundStyle(Palette.ink2)
                            Text(reply.preview).font(.system(size: 12)).foregroundStyle(Palette.ink3).lineLimit(3)
                            if reply.unread {
                                Button("Mark read") {
                                    Task { await mark(reply.id) }
                                }
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Palette.accent)
                            }
                        }
                        .listRowBackground(Palette.surface)
                    }
                }
            }
            Section("Intro forms") {
                if session.admin.forms.isEmpty {
                    Text("No form submissions.").foregroundStyle(Palette.ink3)
                } else {
                    ForEach(session.admin.forms) { form in
                        NavigationLink(value: AdminRoute.form(form.id)) {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(form.name).foregroundStyle(Palette.ink)
                                    Spacer()
                                    if form.unread { GGBadge(text: "Unread", tone: .accent) }
                                }
                                Text([form.organization, form.school, form.role].filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.system(size: 13)).foregroundStyle(Palette.ink3)
                            }
                        }
                        .listRowBackground(Palette.surface)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
    }

    private func mark(_ id: String) async {
        busy = true
        let error = await session.performAdmin { store in
            try await store.markOutreachRead(replyId: id)
        }
        busy = false
        message = error
    }
}

struct AdminFormView: View {
    @Environment(AppSession.self) private var session
    let formId: String
    @State private var status = "new"
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        let form = session.admin.forms.first { $0.id == formId }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let form {
                    GGPageHeader(title: form.name, description: [form.organization, form.school].filter { !$0.isEmpty }.joined(separator: " · "))
                    GGCard(padding: 16) {
                        labeled("Role", form.role)
                        labeled("Email", form.email)
                        labeled("Interest", form.interest)
                        labeled("Status", form.status.replacingOccurrences(of: "_", with: " "))
                    }
                    if !form.notes.isEmpty {
                        GGCard(padding: 16) {
                            Text(form.notes).font(.system(size: 14)).foregroundStyle(Palette.ink2)
                        }
                    }
                    if let message { GGNotice(tone: message == "Saved." ? .positive : .danger, message: message) }
                    GGCard(padding: 16) {
                        Picker("Status", selection: $status) {
                            Text("New").tag("new")
                            Text("Contacted").tag("contacted")
                            Text("Meeting").tag("meeting")
                            Text("Archived").tag("archived")
                        }
                        .tint(Palette.accent)
                        GGButton(title: "Save and mark read", fillWidth: true, busy: busy) { Task { await save() } }
                            .padding(.top, 10)
                    }
                } else {
                    GGEmptyState(icon: "envelope", title: "Form not found")
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if let form { status = form.status } }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(Palette.ink3)
            Spacer()
            Text(value.isEmpty ? "—" : value).foregroundStyle(Palette.ink)
        }
        .font(.system(size: 14))
        .padding(.vertical, 5)
    }

    private func save() async {
        busy = true
        let error = await session.performAdmin { store in
            try await store.updateIntroForm(id: formId, status: status, markRead: true)
        }
        busy = false
        message = error ?? "Saved."
    }
}

struct AdminAuditView: View {
    @Environment(AppSession.self) private var session

    var body: some View {
        List {
            if session.admin.audit.isEmpty {
                Text("No audit events.").foregroundStyle(Palette.ink3)
            } else {
                ForEach(session.admin.audit) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.action).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink)
                        Text("\(row.actor) · \(row.chapter)")
                            .font(.system(size: 13)).foregroundStyle(Palette.ink3)
                        if !row.detail.isEmpty {
                            Text(row.detail).font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        }
                        Text(DateFormat.medium(row.when)).font(.system(size: 12)).foregroundStyle(Palette.ink3)
                    }
                    .listRowBackground(Palette.surface)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
