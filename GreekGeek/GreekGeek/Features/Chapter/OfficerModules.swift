import SwiftUI

struct FinancesView: View {
    let chapter: ChapterContext

    var body: some View {
        let summary = chapter.financeSummary
        let owing = chapter.memberBalances.filter { $0.balanceCents > 0 }.sorted { $0.balanceCents > $1.balanceCents }
        GGScreenStack {
            GGPageHeader(title: "Finances", description: "Dues, payments, and balances from the chapter ledger.")
            GGDesktopHint()
            if !chapter.canCollect {
                GGNotice(tone: .info, title: "Online dues collection is off", message: "You can still issue charges on the website. Card and bank payments turn on after Stripe setup.")
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                metric("Outstanding", MoneyFormat.cents(summary.outstandingCents), hint: "\(summary.membersWithBalance) members")
                metric("Collected", MoneyFormat.cents(summary.collectedCents), hint: "This period")
                metric("Clearing", MoneyFormat.cents(summary.processingCents), hint: "In progress")
                metric("Net received", MoneyFormat.cents(summary.netCents), hint: "After fees")
            }
            GGCard(padding: 16) {
                Text("This period")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                activityRow("Dues assessed", MoneyFormat.cents(summary.assessedCents))
                activityRow("Refunds", MoneyFormat.cents(summary.refundsCents))
                activityRow("Platform fees", MoneyFormat.cents(abs(summary.platformFeesCents)))
                activityRow("Stripe fees", MoneyFormat.cents(abs(summary.processingFeesCents)))
            }
            GGCard {
                GGCardHeader(title: "Who owes", description: owing.isEmpty ? "Everyone is paid up." : "Highest balances first")
                if owing.isEmpty {
                    GGEmptyState(icon: "checkmark.circle", title: "No balances due")
                        .padding(.vertical, 8)
                } else {
                    ForEach(owing.prefix(8)) { row in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.name)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Palette.ink)
                                Text(row.overdueCents > 0 ? "\(MoneyFormat.cents(row.overdueCents)) overdue" : row.memberClass.label)
                                    .font(.system(size: 12))
                                    .foregroundStyle(row.overdueCents > 0 ? Palette.warning : Palette.ink3)
                            }
                            Spacer()
                            Text(MoneyFormat.cents(row.balanceCents))
                                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Palette.ink)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
            GGCard {
                GGCardHeader(title: "Recent payments")
                let rows = Array(chapter.chapterPayments.prefix(8))
                if rows.isEmpty {
                    GGEmptyState(icon: "creditcard", title: "No payments yet")
                        .padding(.vertical, 8)
                } else {
                    ForEach(rows) { payment in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(payment.title.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .foregroundStyle(Palette.ink)
                                Text("\(payment.method) · \(DateFormat.medium(payment.createdAt))")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(MoneyFormat.cents(payment.amountCents))
                                    .font(.body.monospacedDigit())
                                    .foregroundStyle(Palette.ink)
                                GGBadge(text: payment.status.label, tone: payment.status.tone)
                            }
                        }
                        .padding(16)
                    }
                }
            }
            if !chapter.assessments.isEmpty {
                GGCard {
                    GGCardHeader(title: "Assessments")
                    ForEach(chapter.assessments.prefix(6)) { item in
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(Palette.ink)
                                Text("\(item.category) · \(item.memberCount) members")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                            Text(MoneyFormat.cents(item.outstandingCents))
                                .font(.system(size: 14, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Palette.ink)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
            GGDesktopHint()
        }
    }

    private func metric(_ label: String, _ value: String, hint: String?) -> some View {
        GGCard(padding: 14) {
            Text(label).font(.system(size: 12)).foregroundStyle(Palette.ink3)
            Text(value)
                .font(.system(size: 18, weight: .semibold).monospacedDigit())
                .foregroundStyle(Palette.ink)
                .padding(.top, 4)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            if let hint {
                Text(hint).font(.system(size: 11)).foregroundStyle(Palette.ink3).padding(.top, 4)
            }
        }
    }

    private func activityRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Palette.ink2)
            Spacer()
            Text(value).font(.body.monospacedDigit()).foregroundStyle(Palette.ink)
        }
        .font(.system(size: 14))
        .padding(.top, 10)
    }
}

struct RecruitmentView: View {
    let chapter: ChapterContext
    @State private var query = ""

    var body: some View {
        let dueCount = chapter.prospects.filter { prospect in
            if let date = prospect.followUpAt { return date <= Date() }
            return false
        }.count
        let offered = chapter.prospects.filter { $0.outcome == "offered" }.count
        let joined = chapter.prospects.filter { $0.outcome == "joined" }.count
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(
                    title: "Recruitment",
                    description: "Prospect records are visible only to members with recruitment access."
                )
                if chapter.stages.isEmpty {
                    GGEmptyState(icon: "person.badge.plus", title: "The pipeline is not set up", message: "Start with the standard stages, then add prospects.")
                    GGDesktopHint()
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        stat("Active prospects", "\(chapter.prospects.count)")
                        stat("Follow-ups due", "\(dueCount)")
                        stat("Offers out", "\(offered)")
                        stat("Joined", "\(joined)")
                    }
                    ForEach(chapter.stages) { stage in
                        let rows = chapter.prospects.filter {
                            $0.stageId == stage.id && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query))
                        }
                        GGCard {
                            GGCardHeader(title: stage.name, description: "\(rows.count) · \(stage.outcome.replacingOccurrences(of: "_", with: " "))")
                            if rows.isEmpty {
                                Text("Empty")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink3)
                                    .padding(16)
                            } else {
                                ForEach(rows) { prospect in
                                    HStack(alignment: .top, spacing: 10) {
                                        PersonAvatar(name: prospect.preferredName ?? prospect.name, size: 32)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(prospect.preferredName.map { "\($0) (\(prospect.name))" } ?? prospect.name)
                                                .font(.system(size: 14, weight: .medium))
                                                .foregroundStyle(Palette.ink)
                                            Text([prospect.classYear.map(String.init), prospect.major, prospect.school].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ").ifEmpty("No details yet"))
                                                .font(.system(size: 12))
                                                .foregroundStyle(Palette.ink3)
                                            HStack {
                                                Text(prospect.assignedTo ?? "Unassigned")
                                                    .font(.system(size: 12))
                                                    .foregroundStyle(Palette.ink3)
                                                Spacer()
                                                if let follow = prospect.followUpAt {
                                                    Text(DateFormat.shortDay(follow))
                                                        .font(.system(size: 12))
                                                        .foregroundStyle(follow <= Date() ? Palette.warning : Palette.ink3)
                                                }
                                            }
                                        }
                                    }
                                    .padding(14)
                                }
                            }
                        }
                    }
                    GGDesktopHint()
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .greekGeekScreen()
        .searchable(text: $query, prompt: "Search prospects")
    }

    private func stat(_ label: String, _ value: String) -> some View {
        GGCard(padding: 14) {
            Text(label).font(.system(size: 12)).foregroundStyle(Palette.ink3)
            Text(value).font(.system(size: 22, weight: .semibold).monospacedDigit()).foregroundStyle(Palette.ink).padding(.top, 4)
        }
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}

struct AnalyticsView: View {
    let chapter: ChapterContext

    var body: some View {
        let s = chapter.engagement
        let funnelMax = max(1, s.prospectsByStage.map(\.count).max() ?? 1)
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GGPageHeader(title: "Analytics", description: "Chapter-wide engagement for the last 90 days. Counts are aggregate.")
                Text("Membership and events")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    tile("Active members", "\(s.activeMembers)")
                    tile("Events held", "\(s.eventsHeld)", hint: "\(s.requiredEvents) required")
                    tile("Check-ins", "\(s.attendanceRecords)", hint: "Present or late")
                    tile("Required attendance", s.requiredAttendanceRate.map { "\(Int($0))%" } ?? "No data")
                }
                Text("Participation")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    tile("Messages sent", s.messagesSent.formatted())
                    if chapter.chapter.isEnabled(.philanthropy) {
                        tile("Approved hours", s.serviceHours.formatted())
                        tile("Members who served", "\(s.serviceParticipants)")
                    }
                }
                if chapter.chapter.isEnabled(.recruitment) && !s.prospectsByStage.isEmpty {
                    GGCard(padding: 16) {
                        Text("Recruitment pipeline")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        Text("Active prospects in each stage right now.")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink3)
                            .padding(.top, 2)
                        ForEach(s.prospectsByStage) { row in
                            HStack {
                                Text(row.stage)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink2)
                                    .frame(width: 88, alignment: .leading)
                                ProgressView(value: Double(row.count), total: Double(funnelMax))
                                    .tint(row.outcome == "joined" ? Palette.positive : Palette.accent)
                                Text("\(row.count)")
                                    .font(.system(size: 13).monospacedDigit())
                                    .foregroundStyle(Palette.ink)
                                    .frame(width: 28, alignment: .trailing)
                            }
                            .padding(.top, 10)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .greekGeekScreen()
    }

    private func tile(_ label: String, _ value: String, hint: String? = nil) -> some View {
        GGCard(padding: 16) {
            Text(label).font(.system(size: 12)).foregroundStyle(Palette.ink3)
            Text(value).font(.system(size: 24, weight: .semibold).monospacedDigit()).foregroundStyle(Palette.ink).padding(.top, 6)
            if let hint {
                Text(hint).font(.system(size: 11)).foregroundStyle(Palette.ink3).padding(.top, 4)
            }
        }
    }
}
