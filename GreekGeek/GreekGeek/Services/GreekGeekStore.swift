import Foundation

struct HomePayload {
    var profile: Profile?
    var chapters: [MyChapter]
    var applications: [ChapterApplication]
    var notifications: [AppNotification]
    var events: [ChapterEvent]
    var staffRole: StaffRole?
}

struct GreekGeekStore {
    let client: SupabaseClient
    let accessToken: String
    let userId: String
    let email: String

    func loadHome() async throws -> HomePayload {
        async let profile = loadProfile()
        async let memberships = loadMemberships()
        async let applications = loadApplications()
        async let notifications = loadNotifications()
        async let staff: StaffRole? = {
            try? await client.rpc("my_staff_role", parameters: [:], accessToken: accessToken)
        }()
        let chapters = try await memberships
        let events = await loadUpcomingEvents(chapterIds: chapters.map(\.id), timezoneById: Dictionary(uniqueKeysWithValues: chapters.map { ($0.id, $0.timezone) }))
        var withBalances: [MyChapter] = []
        for chapter in chapters {
            var copy = chapter
            if let balance = try? await client.rpc("member_balance", parameters: ["p_membership": .string(chapter.membershipId)], accessToken: accessToken) as BalanceDTO {
                copy.balanceCents = balance.balanceCents.value
                copy.processingCents = balance.processingCents.value
                copy.nextDueDate = balance.nextDueDate
            }
            withBalances.append(copy)
        }
        return HomePayload(
            profile: try await profile,
            chapters: withBalances,
            applications: (try? await applications) ?? [],
            notifications: (try? await notifications) ?? [],
            events: events,
            staffRole: await staff
        )
    }

    func loadChapter(slug: String) async throws -> ChapterContext {
        let combined = try await loadContext(slug: slug)
        let chapter = combined.chapter
        let membership = combined.membership
        let now = ISODate.timestamp()
        let from = ISODate.timestamp(Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date())
        let analyticsFrom = ISODate.timestamp(Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date())
        async let balance: BalanceDTO? = try? await client.rpc("member_balance", parameters: ["p_membership": .string(membership.id)], accessToken: accessToken)
        async let unread: Int? = {
            if let value: Int = try? await client.rpc("chapter_unread_total", parameters: ["p_chapter": .string(chapter.id)], accessToken: accessToken) {
                return value
            }
            return nil
        }()
        async let readiness: ReadinessDTO? = try? await client.rpc("chapter_payment_readiness", parameters: ["p_chapter": .string(chapter.id)], accessToken: accessToken)
        async let events = loadChapterEvents(chapterId: chapter.id, timezone: chapter.timezone, now: now)
        async let announcements = loadAnnouncements(chapterId: chapter.id)
        async let members = loadDirectory(chapterId: chapter.id)
        async let charges = loadCharges(membershipId: membership.id)
        async let payments = loadPayments(membershipId: membership.id)
        async let reimbursements = loadReimbursements(chapterId: chapter.id, officer: combined.permissions.contains(.financeView))
        async let conversations = loadConversations(chapterId: chapter.id)
        async let stages = loadStages(chapterId: chapter.id)
        async let prospects = loadProspects(chapterId: chapter.id)
        async let ledger = loadLedger(chapterId: chapter.id)
        async let hours = loadServiceHours(chapterId: chapter.id, officer: combined.permissions.contains(.philanthropyManage))
        async let chores = loadChores(chapterId: chapter.id, membershipId: membership.id)
        async let policies = loadPolicies(chapterId: chapter.id)
        async let groups = loadStudyGroups(chapterId: chapter.id)
        async let summary: FinanceSummaryDTO? = try? await client.rpc(
            "chapter_financial_summary",
            parameters: ["p_chapter": .string(chapter.id), "p_from": .string(from), "p_to": .string(ISODate.timestamp())],
            accessToken: accessToken
        )
        async let memberBalances = loadMemberBalances(chapterId: chapter.id)
        async let assessments = loadAssessments(chapterId: chapter.id)
        async let chapterPayments = loadChapterPayments(chapterId: chapter.id)
        async let budget = loadBudget(chapterId: chapter.id)
        async let monthly = loadMonthlyCollections(chapterId: chapter.id)
        async let engagement: EngagementDTO? = try? await client.rpc(
            "chapter_engagement_summary",
            parameters: ["p_chapter": .string(chapter.id), "p_from": .string(analyticsFrom), "p_to": .string(ISODate.timestamp())],
            accessToken: accessToken
        )
        async let roles = loadRoles(chapterId: chapter.id)
        async let invitations = loadInvitations(chapterId: chapter.id)
        async let audit = loadAudit(chapterId: chapter.id)
        async let details = loadChapterDetails(chapterId: chapter.id)
        async let rooms = loadRooms(chapterId: chapter.id)
        async let campaigns = loadCampaigns(chapterId: chapter.id)
        async let housingRequests = loadHousingRequests(chapterId: chapter.id)
        async let maintenance = loadMaintenance(chapterId: chapter.id)
        async let goals = loadAcademicGoals(chapterId: chapter.id)
        async let agreement = loadAgreement(chapterId: chapter.id)
        async let subscription = loadSubscription(chapterId: chapter.id)
        let bal = await balance
        let ready = await readiness
        let eventRows = (try? await events) ?? []
        let chargeRows = (try? await charges) ?? []
        let paymentRows = (try? await payments) ?? []
        let memberRows = await members
        let stageRows = await stages
        let policyRows = (try? await policies) ?? []
        let groupRows = (try? await groups) ?? []
        let inviteRows = await invitations
        let roleRows = await roles
        let roomRows = await rooms
        let campaignRows = await campaigns
        let reimburseRows = (try? await reimbursements) ?? []
        let budgetPair = await budget
        var prospectRows = await prospects
        let names = Dictionary(uniqueKeysWithValues: memberRows.map { ($0.membershipId, $0.name) })
        prospectRows = prospectRows.map { row in
            var copy = row
            if let stage = stageRows.first(where: { $0.id == row.stageId }) {
                copy.stage = stage.name
                copy.outcome = stage.outcome
            }
            if let owner = row.assignedTo, let mapped = names[owner] {
                copy.assignedTo = mapped
            }
            return copy
        }
        let financeSummary = (await summary)?.model ?? FinanceSummary()
        let finance = FinanceSnapshot(
            outstandingCents: financeSummary.outstandingCents != 0 ? financeSummary.outstandingCents : chargeRows.reduce(0) { $0 + $1.outstandingCents },
            collectedCents: financeSummary.collectedCents != 0 ? financeSummary.collectedCents : paymentRows.filter { $0.status == .succeeded }.reduce(0) { $0 + $1.amountCents },
            processingCents: financeSummary.processingCents != 0 ? financeSummary.processingCents : (bal?.processingCents.value ?? 0)
        )
        let profileDetails = await details
        let sub = await subscription
        let billing = BillingSnapshot(
            termsAccepted: ready?.termsAccepted ?? false,
            subscription: ready?.subscription ?? "none",
            canCollect: ready?.canCollect ?? false,
            verified: ready?.verified ?? (chapter.status == .verified),
            cardPayments: ready?.cardPayments ?? "not_started",
            payouts: ready?.payouts ?? "not_started",
            signerName: await agreement,
            periodEnd: sub?.currentPeriodEnd,
            amountCents: sub?.unitAmountCents ?? 3000
        )
        let setupSteps = makeSetupSteps(
            slug: chapter.slug,
            modules: chapter.modules,
            canManage: combined.permissions.contains(.chapterManage),
            canHousing: combined.permissions.contains(.housingManage),
            canPhilanthropy: combined.permissions.contains(.philanthropyManage),
            details: profileDetails,
            memberCount: memberRows.count,
            inviteCount: inviteRows.count,
            roles: roleRows,
            billing: billing,
            policyCount: policyRows.count,
            roomCount: roomRows.count,
            eventCount: eventRows.count,
            prospectCount: prospectRows.count,
            campaignCount: campaignRows.count,
            studyCount: groupRows.count
        )
        return ChapterContext(
            chapter: chapter,
            membership: membership,
            permissions: combined.permissions,
            balance: MemberBalance(balanceCents: bal?.balanceCents.value ?? 0, processingCents: bal?.processingCents.value ?? 0, nextDueDate: bal?.nextDueDate),
            events: eventRows,
            announcements: (try? await announcements) ?? [],
            members: memberRows,
            charges: chargeRows,
            payments: paymentRows,
            reimbursements: reimburseRows,
            conversations: ((try? await conversations) ?? []).map { conversation in
                var copy = conversation
                if let other = conversation.otherUserId {
                    copy.avatarPath = memberRows.first { $0.id.compare(other, options: .caseInsensitive) == .orderedSame }?.avatarPath
                }
                return copy
            },
            prospects: prospectRows,
            stages: stageRows,
            ledger: await ledger,
            serviceHours: await hours,
            chores: await chores,
            policies: policyRows,
            studyGroups: groupRows,
            officerStats: [],
            unreadMessages: await unread ?? 0,
            canCollect: billing.canCollect,
            finance: finance,
            financeSummary: financeSummary,
            memberBalances: await memberBalances,
            assessments: await assessments,
            chapterPayments: await chapterPayments,
            chapterReimbursements: reimburseRows,
            budgetLines: budgetPair.0,
            expenses: budgetPair.1,
            monthlyCollections: await monthly,
            engagement: (await engagement)?.model ?? EngagementSummary(activeMembers: memberRows.count),
            setupSteps: setupSteps,
            roles: roleRows,
            invitations: inviteRows,
            auditLogs: await audit,
            billing: billing,
            rooms: roomRows,
            campaigns: campaignRows,
            profileDetails: profileDetails,
            housingRequests: (await housingRequests).map { request in
                var copy = request
                copy.memberName = names[request.membershipId] ?? request.memberName
                return copy
            },
            maintenanceRequests: await maintenance,
            academicGoals: await goals
        )
    }

    func loadMessages(conversationId: String, names: [String: String] = [:]) async throws -> [ChatMessage] {
        let grouped = await loadMessages(conversationIds: [conversationId], names: names)
        return grouped[conversationId] ?? []
    }

    func loadMessages(conversationIds: [String], names: [String: String] = [:]) async -> [String: [ChatMessage]] {
        let ids = Array(Set(conversationIds.filter { !$0.isEmpty }))
        guard !ids.isEmpty else { return [:] }
        var rows: [MessageDTO] = []
        for chunk in stride(from: 0, to: ids.count, by: 12).map({ Array(ids[$0..<min($0 + 12, ids.count)]) }) {
            let fetched: [MessageDTO] = (try? await client.select(
                table: "messages",
                query: "select=id,conversation_id,sender_id,body,edited_at,deleted_at,pinned_at,created_at,reply_to_id&conversation_id=in.(\(chunk.joined(separator: ",")))&parent_id=is.null&deleted_at=is.null&order=created_at.desc&limit=240",
                accessToken: accessToken
            )) ?? []
            rows.append(contentsOf: fetched)
        }
        let visible = rows.filter { $0.deletedAt == nil }
        let quotes = Dictionary(uniqueKeysWithValues: visible.map { ($0.id, $0) })
        var grouped: [String: [ChatMessage]] = [:]
        for row in visible {
            let quote = row.replyToId.flatMap { quotes[$0] }
            grouped[row.conversationId, default: []].append(
                chatMessage(
                    from: row,
                    names: names,
                    quote: quote,
                    quoteName: quote.flatMap { names[$0.senderId] }
                )
            )
        }
        for id in grouped.keys {
            grouped[id] = Array((grouped[id] ?? []).reversed().suffix(80))
        }
        for id in ids where grouped[id] == nil {
            grouped[id] = []
        }
        return grouped
    }

    func sendMessage(conversationId: String, body: String, replyToId: String? = nil) async throws -> ChatMessage {
        struct Params: Encodable {
            let p_conversation: String
            let p_body: String
            let p_parent: AnyJSON
            let p_mentions: [String]
            let p_mention_roles: [String]
            let p_mention_all: Bool
            let p_attachments: [EmptyJSON]
            let p_reply_to: String?
        }
        let payload: OneOrMany<MessageDTO> = try await client.rpcEncodable(
            "send_message",
            parameters: Params(
                p_conversation: conversationId,
                p_body: body,
                p_parent: .null,
                p_mentions: [],
                p_mention_roles: [],
                p_mention_all: false,
                p_attachments: [],
                p_reply_to: replyToId
            ),
            accessToken: accessToken
        )
        guard let row = payload.first else {
            throw APIError.message("The message was sent, but GreekGeek did not return it.")
        }
        return chatMessage(from: row, names: [:])
    }

    func setReaction(messageId: String, conversationId: String, emoji: String, on: Bool) async {
        if on {
            struct Row: Encodable {
                let message_id: String
                let conversation_id: String
                let user_id: String
                let emoji: String
            }
            _ = try? await client.insert(table: "message_reactions", body: Row(message_id: messageId, conversation_id: conversationId, user_id: userId, emoji: emoji), accessToken: accessToken)
        } else {
            _ = try? await client.delete(
                table: "message_reactions",
                query: "message_id=eq.\(messageId)&user_id=eq.\(userId)&emoji=eq.\(emoji)",
                accessToken: accessToken
            )
        }
    }

    func acknowledgeAnnouncement(id: String) async {
        struct Row: Encodable { let announcement_id: String; let user_id: String }
        _ = try? await client.insert(table: "announcement_acks", body: Row(announcement_id: id, user_id: userId), accessToken: accessToken)
    }

    func rsvp(eventId: String, status: String) async {
        struct Params: Encodable { let p_event: String; let p_status: String }
        let _: EmptyJSON? = try? await client.rpcEncodable("rsvp_event", parameters: Params(p_event: eventId, p_status: status), accessToken: accessToken)
    }

    func markNotificationsRead() async {
        struct Params: Encodable {}
        let _: EmptyJSON? = try? await client.rpcEncodable("mark_notifications_read", parameters: Params(), accessToken: accessToken)
    }

    func updateProfile(fullName: String, displayName: String, graduationYear: Int?) async {
        struct Row: Encodable {
            let full_name: String
            let display_name: String
            let graduation_year: Int?
        }
        _ = try? await client.patch(
            table: "profiles",
            query: "id=eq.\(userId)",
            body: Row(full_name: fullName, display_name: displayName, graduation_year: graduationYear),
            accessToken: accessToken
        )
    }

    func submitReimbursement(chapterId: String, title: String, amountCents: Int) async {
        struct Row: Encodable {
            let chapter_id: String
            let user_id: String
            let description: String
            let amount_cents: Int
            let spent_on: String
        }
        let today = ISODate.day()
        _ = try? await client.insert(
            table: "reimbursement_requests",
            body: Row(chapter_id: chapterId, user_id: userId, description: title, amount_cents: amountCents, spent_on: today),
            accessToken: accessToken
        )
    }

    func logServiceHours(chapterId: String, organization: String, description: String?, hours: Double, servedOn: Date) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let user_id: String
            let organization: String
            let description: String?
            let hours: Double
            let served_on: String
        }
        try await client.insert(
            table: "service_hours",
            body: Row(
                chapter_id: chapterId,
                user_id: userId,
                organization: organization,
                description: description,
                hours: (hours * 4).rounded() / 4,
                served_on: ISODate.day(servedOn)
            ),
            accessToken: accessToken
        )
    }

    func reviewServiceHours(id: String, status: String) async throws {
        struct Row: Encodable {
            let status: String
            let reviewed_by: String
            let reviewed_at: String
        }
        try await client.patch(
            table: "service_hours",
            query: "id=eq.\(id)&status=eq.submitted",
            body: Row(status: status, reviewed_by: userId, reviewed_at: ISODate.timestamp()),
            accessToken: accessToken
        )
    }

    func createCampaign(chapterId: String, name: String, beneficiary: String, goalCents: Int?) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let created_by: String
            let name: String
            let beneficiary: String
            let goal_cents: Int?
        }
        try await client.insert(
            table: "fundraising_campaigns",
            body: Row(chapter_id: chapterId, created_by: userId, name: name, beneficiary: beneficiary, goal_cents: goalCents),
            accessToken: accessToken
        )
    }

    func submitHousingRequest(chapterId: String, term: String, roomIds: [String], roommateIds: [String], wantsSingle: Bool, notes: String?) async throws {
        struct Params: Encodable {
            let p_chapter: String
            let p_term: String
            let p_rooms: [String]
            let p_roommates: [String]
            let p_single: Bool
            let p_notes: String?
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "submit_housing_request",
            parameters: Params(p_chapter: chapterId, p_term: term, p_rooms: roomIds, p_roommates: roommateIds, p_single: wantsSingle, p_notes: notes),
            accessToken: accessToken
        )
    }

    func respondHousingRequest(id: String, status: String, response: String?) async throws {
        struct Params: Encodable {
            let p_request: String
            let p_status: String
            let p_response: String?
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "respond_housing_request",
            parameters: Params(p_request: id, p_status: status, p_response: response),
            accessToken: accessToken
        )
    }

    func saveHousingRoom(chapterId: String, name: String, floor: String?, capacity: Int, rentCents: Int?) async throws {
        struct Params: Encodable {
            let p_chapter: String
            let p_room: AnyJSON
            let p_name: String
            let p_floor: String?
            let p_capacity: Int
            let p_rent_cents: Int?
            let p_features: [String]
            let p_notes: String?
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "save_housing_room",
            parameters: Params(
                p_chapter: chapterId,
                p_room: .null,
                p_name: name,
                p_floor: floor,
                p_capacity: capacity,
                p_rent_cents: rentCents,
                p_features: [],
                p_notes: nil
            ),
            accessToken: accessToken
        )
    }

    func assignRoom(roomId: String, membershipId: String, startsOn: Date) async throws {
        struct Params: Encodable {
            let p_room: String
            let p_membership: String
            let p_starts_on: String
            let p_ends_on: AnyJSON
            let p_bed: AnyJSON
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "assign_room",
            parameters: Params(p_room: roomId, p_membership: membershipId, p_starts_on: ISODate.day(startsOn), p_ends_on: .null, p_bed: .null),
            accessToken: accessToken
        )
    }

    func submitMaintenance(chapterId: String, title: String, location: String?, description: String?, priority: String) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let submitted_by: String
            let title: String
            let location: String?
            let description: String?
            let priority: String
        }
        try await client.insert(
            table: "maintenance_requests",
            body: Row(chapter_id: chapterId, submitted_by: userId, title: title, location: location, description: description, priority: priority),
            accessToken: accessToken
        )
    }

    func updateMaintenance(id: String, status: String) async throws {
        struct Row: Encodable {
            let status: String
            let resolved_at: String?
        }
        let done = status == "resolved" || status == "closed"
        try await client.patch(
            table: "maintenance_requests",
            query: "id=eq.\(id)",
            body: Row(status: status, resolved_at: done ? ISODate.timestamp() : nil),
            accessToken: accessToken
        )
    }

    func publishAnnouncement(chapterId: String, title: String, body: String, audience: String, pinned: Bool, requiresAck: Bool) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let author_id: String
            let title: String
            let body: String
            let audience: String
            let pinned: Bool
            let requires_ack: Bool
            let comments_enabled: Bool
        }
        try await client.insert(
            table: "announcements",
            body: Row(
                chapter_id: chapterId,
                author_id: userId,
                title: title,
                body: body,
                audience: audience,
                pinned: pinned,
                requires_ack: requiresAck,
                comments_enabled: false
            ),
            accessToken: accessToken
        )
    }

    func createEvent(chapterId: String, title: String, location: String?, details: String?, startsAt: Date, endsAt: Date, timezone: String, attendanceRequired: Bool) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let created_by: String
            let title: String
            let location: String?
            let description: String?
            let starts_at: String
            let ends_at: String
            let timezone: String
            let attendance_required: Bool
            let category: String
            let visibility: String
        }
        try await client.insert(
            table: "events",
            body: Row(
                chapter_id: chapterId,
                created_by: userId,
                title: title,
                location: location,
                description: details,
                starts_at: ISODate.timestamp(startsAt),
                ends_at: ISODate.timestamp(endsAt),
                timezone: timezone,
                attendance_required: attendanceRequired,
                category: "chapter",
                visibility: "chapter"
            ),
            accessToken: accessToken
        )
    }

    func createPolicy(chapterId: String, title: String, category: String, body: String, requiresAck: Bool) async throws {
        struct Doc: Encodable {
            let chapter_id: String
            let created_by: String
            let title: String
            let category: String
            let requires_ack: Bool
        }
        struct Created: Decodable { let id: String }
        let created: [Created] = try await client.insertReturning(
            table: "policy_documents",
            body: Doc(chapter_id: chapterId, created_by: userId, title: title, category: category, requires_ack: requiresAck),
            accessToken: accessToken
        )
        guard let id = created.first?.id else { return }
        struct Params: Encodable {
            let p_policy: String
            let p_body: String
            let p_summary: String
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "publish_policy_version",
            parameters: Params(p_policy: id, p_body: body, p_summary: "Initial version"),
            accessToken: accessToken
        )
    }

    func fileIncident(chapterId: String, category: String, description: String, location: String?) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let reporter_id: String
            let category: String
            let description: String
            let location: String?
            let confidential_reporter: Bool
        }
        try await client.insert(
            table: "incident_reports",
            body: Row(chapter_id: chapterId, reporter_id: userId, category: category, description: description, location: location, confidential_reporter: true),
            accessToken: accessToken
        )
    }

    func createStudyGroup(chapterId: String, name: String, course: String?, meeting: String?) async throws {
        struct Group: Encodable {
            let chapter_id: String
            let created_by: String
            let name: String
            let course_code: String?
            let meeting_info: String?
        }
        let created: [GroupDTO] = try await client.insertReturning(
            table: "study_groups",
            body: Group(chapter_id: chapterId, created_by: userId, name: name, course_code: course, meeting_info: meeting),
            accessToken: accessToken
        )
        guard let id = created.first?.id else { return }
        struct Member: Encodable {
            let group_id: String
            let chapter_id: String
            let user_id: String
        }
        _ = try? await client.insert(table: "study_group_members", body: Member(group_id: id, chapter_id: chapterId, user_id: userId), accessToken: accessToken)
    }

    func toggleStudyGroup(chapterId: String, groupId: String, join: Bool) async throws {
        if join {
            struct Row: Encodable {
                let group_id: String
                let chapter_id: String
                let user_id: String
            }
            try await client.insert(table: "study_group_members", body: Row(group_id: groupId, chapter_id: chapterId, user_id: userId), accessToken: accessToken)
        } else {
            try await client.delete(
                table: "study_group_members",
                query: "group_id=eq.\(groupId)&user_id=eq.\(userId)",
                accessToken: accessToken
            )
        }
    }

    func addAcademicGoal(chapterId: String, title: String, targetDate: Date?, share: Bool) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let user_id: String
            let title: String
            let target_date: String?
            let share_with_scholarship: Bool
        }
        try await client.insert(
            table: "academic_goals",
            body: Row(
                chapter_id: chapterId,
                user_id: userId,
                title: title,
                target_date: targetDate.map { ISODate.day($0) },
                share_with_scholarship: share
            ),
            accessToken: accessToken
        )
    }

    func updateAcademicGoal(id: String, status: String) async throws {
        struct Row: Encodable { let status: String }
        try await client.patch(table: "academic_goals", query: "id=eq.\(id)&user_id=eq.\(userId)", body: Row(status: status), accessToken: accessToken)
    }

    func updateChapterProfile(chapterId: String, greekLetters: String, description: String, foundedYear: Int?, timezone: String) async throws {
        struct Row: Encodable {
            let greek_letters: String?
            let description: String?
            let founded_year: Int?
            let timezone: String
        }
        try await client.patch(
            table: "chapters",
            query: "id=eq.\(chapterId)",
            body: Row(
                greek_letters: greekLetters.isEmpty ? nil : greekLetters,
                description: description.isEmpty ? nil : description,
                founded_year: foundedYear,
                timezone: timezone
            ),
            accessToken: accessToken
        )
    }

    func updateChapterModules(chapterId: String, modules: [ChapterModule: Bool]) async throws {
        struct Row: Encodable {
            let modules: [String: Bool]
        }
        let payload = Dictionary(uniqueKeysWithValues: ChapterModule.allCases.map { ($0.rawValue, modules[$0] ?? false) })
        try await client.patch(table: "chapters", query: "id=eq.\(chapterId)", body: Row(modules: payload), accessToken: accessToken)
    }

    func addExistingMember(chapterId: String, email: String, memberClass: String) async throws -> String {
        struct Params: Encodable {
            let p_chapter: String
            let p_email: String
            let p_member_class: String
        }
        struct Result: Decodable {
            let status: String
        }
        let payload: OneOrMany<Result> = try await client.rpcEncodable(
            "add_existing_member",
            parameters: Params(p_chapter: chapterId, p_email: email, p_member_class: memberClass),
            accessToken: accessToken
        )
        return payload.first?.status ?? "no_account"
    }

    func updateMembership(membershipId: String, memberClass: MemberClass, status: MembershipStatus, reason: String?) async throws {
        struct Params: Encodable {
            let p_membership: String
            let p_member_class: String
            let p_status: String
            let p_reason: String?
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "update_membership",
            parameters: Params(
                p_membership: membershipId,
                p_member_class: memberClass.rawValue,
                p_status: status.rawValue,
                p_reason: reason
            ),
            accessToken: accessToken
        )
    }

    func removeChapterMember(membershipId: String, reason: String) async throws {
        struct Params: Encodable {
            let p_membership: String
            let p_reason: String
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "remove_chapter_member",
            parameters: Params(p_membership: membershipId, p_reason: reason),
            accessToken: accessToken
        )
    }

    func assignRole(chapterId: String, membershipId: String, roleId: String) async throws {
        struct Row: Encodable {
            let chapter_id: String
            let membership_id: String
            let role_id: String
            let assigned_by: String
        }
        try await client.insert(
            table: "role_assignments",
            body: Row(chapter_id: chapterId, membership_id: membershipId, role_id: roleId, assigned_by: userId),
            accessToken: accessToken
        )
    }

    func endRole(assignmentId: String, chapterId: String) async throws {
        struct Row: Encodable {
            let ends_at: String
            let ended_by: String
            let end_reason: String
        }
        try await client.patch(
            table: "role_assignments",
            query: "id=eq.\(assignmentId)&chapter_id=eq.\(chapterId)&ends_at=is.null",
            body: Row(ends_at: ISODate.timestamp(), ended_by: userId, end_reason: "Removed by officer"),
            accessToken: accessToken
        )
    }

    func submitBugReport(message: String, page: String, viewport: String?) async throws {
        struct Params: Encodable {
            let p_message: String
            let p_page: String
            let p_user_agent: String
            let p_viewport: String?
            let p_build: String
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "submit_bug_report",
            parameters: Params(
                p_message: message,
                p_page: page,
                p_user_agent: "GreekGeek iOS",
                p_viewport: viewport,
                p_build: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "ios"
            ),
            accessToken: accessToken
        )
    }

    private func loadProfile() async throws -> Profile? {
        let rows: [ProfileDTO] = try await client.select(
            table: "profiles",
            query: "select=id,display_name,full_name,avatar_path,graduation_year&id=eq.\(userId)",
            accessToken: accessToken
        )
        guard var profile = rows.first.map({
            Profile(id: $0.id, displayName: $0.displayName, fullName: $0.fullName, avatarPath: $0.avatarPath, graduationYear: $0.graduationYear)
        }) else { return nil }
        struct PhoneDTO: Decodable { let phone: String? }
        let details: [PhoneDTO] = (try? await client.select(
            table: "profile_details",
            query: "select=phone&user_id=eq.\(userId)",
            accessToken: accessToken
        )) ?? []
        profile.phone = details.first?.phone
        return profile
    }

    func loadNotificationSettings() async -> [NotificationKindSetting] {
        let kinds: [NotificationKindDTO] = (try? await client.select(
            table: "notification_kinds",
            query: "select=kind,label,description,default_in_app,default_email,required&order=label.asc",
            accessToken: accessToken
        )) ?? []
        let prefs: [NotificationPrefDTO] = (try? await client.select(
            table: "notification_preferences",
            query: "select=kind,in_app,email&user_id=eq.\(userId)",
            accessToken: accessToken
        )) ?? []
        let prefMap = Dictionary(uniqueKeysWithValues: prefs.map { ($0.kind, $0) })
        return kinds.map { kind in
            let pref = prefMap[kind.kind]
            return NotificationKindSetting(
                kind: kind.kind,
                label: kind.label,
                description: kind.description,
                required: kind.required ?? false,
                inApp: pref?.inApp ?? kind.defaultInApp ?? true,
                email: pref?.email ?? kind.defaultEmail ?? false
            )
        }
    }

    func saveNotificationSettings(_ settings: [NotificationKindSetting]) async throws {
        struct Pref: Encodable {
            let user_id: String
            let kind: String
            let in_app: Bool
            let email: Bool
            let sms: Bool
            let updated_at: String
        }
        let now = ISO8601DateFormatter().string(from: Date())
        let rows = settings.map {
            Pref(
                user_id: userId,
                kind: $0.kind,
                in_app: $0.required ? true : $0.inApp,
                email: $0.email,
                sms: false,
                updated_at: now
            )
        }
        do {
            try await client.upsert(table: "notification_preferences", onConflict: "user_id,kind", body: rows, accessToken: accessToken)
        } catch {
            struct PrefNoSMS: Encodable {
                let user_id: String
                let kind: String
                let in_app: Bool
                let email: Bool
                let updated_at: String
            }
            try await client.upsert(
                table: "notification_preferences",
                onConflict: "user_id,kind",
                body: rows.map { PrefNoSMS(user_id: $0.user_id, kind: $0.kind, in_app: $0.in_app, email: $0.email, updated_at: $0.updated_at) },
                accessToken: accessToken
            )
        }
    }

    private func loadMemberships() async throws -> [MyChapter] {
        let rows: [MembershipRowDTO] = try await client.select(
            table: "memberships",
            query: "select=id,member_class,chapter:chapters(id,slug,organization_name,designation,greek_letters,status,timezone,currency,university:universities(name))&user_id=eq.\(userId)&status=eq.active",
            accessToken: accessToken
        )
        return rows.compactMap { row in
            guard let chapter = row.chapter else { return nil }
            return MyChapter(
                id: chapter.id,
                slug: chapter.slug,
                organizationName: chapter.organizationName,
                designation: chapter.designation,
                greekLetters: chapter.greekLetters,
                status: chapter.status ?? .unclaimed,
                timezone: chapter.timezone ?? "America/Chicago",
                universityName: chapter.university?.name,
                memberClass: row.memberClass ?? .active,
                membershipId: row.id,
                balanceCents: 0,
                processingCents: 0,
                nextDueDate: nil
            )
        }
    }

    private func loadApplications() async throws -> [ChapterApplication] {
        let rows: [ApplicationDTO] = try await client.select(
            table: "chapter_applications",
            query: "select=id,kind,status,organization_name,designation,proposed_university_name,updated_at,university:universities(name)&applicant_id=eq.\(userId)&status=neq.withdrawn&order=updated_at.desc&limit=10",
            accessToken: accessToken
        )
        return rows.map {
            ChapterApplication(
                id: $0.id,
                kind: $0.kind ?? .newChapter,
                status: $0.status ?? .draft,
                organizationName: $0.organizationName,
                designation: $0.designation,
                universityName: $0.university?.name ?? $0.proposedUniversityName,
                updatedAt: $0.updatedAt ?? Date()
            )
        }
    }

    func loadNotifications() async throws -> [AppNotification] {
        let rows: [NotificationDTO] = try await client.select(
            table: "notifications",
            query: "select=id,kind,title,body,link,read_at,created_at&user_id=eq.\(userId)&order=created_at.desc&limit=30",
            accessToken: accessToken
        )
        return rows.map {
            AppNotification(id: $0.id, title: $0.title, body: $0.body ?? "", createdAt: $0.createdAt, readAt: $0.readAt, link: $0.link, kind: $0.kind)
        }
    }

    private func loadUpcomingEvents(chapterIds: [String], timezoneById: [String: String]) async -> [ChapterEvent] {
        guard !chapterIds.isEmpty else { return [] }
        let now = ISODate.timestamp()
        let ids = chapterIds.joined(separator: ",")
        let rows: [EventDTO] = (try? await client.select(
            table: "events",
            query: "select=id,chapter_id,title,starts_at,ends_at,location,attendance_required,timezone&chapter_id=in.(\(ids))&cancelled_at=is.null&ends_at=gte.\(now)&order=starts_at.asc&limit=8",
            accessToken: accessToken
        )) ?? []
        return rows.map { $0.event(fallbackTimezone: timezoneById[$0.chapterId] ?? "America/Chicago") }
    }

    private func loadContext(slug: String) async throws -> (chapter: ChapterSummary, membership: Membership, permissions: Set<Permission>) {
        if let combined: CombinedContextDTO = try? await client.rpc("my_chapter_context", parameters: ["p_slug": .string(slug)], accessToken: accessToken),
           let chapter = combined.chapter?.summary,
           let membership = combined.membership?.model {
            let permissions = Set((combined.permissions ?? []).compactMap(Permission.init(rawValue:)))
            return (chapter, membership, permissions)
        }
        let rows: [MembershipRowDTO] = try await client.select(
            table: "memberships",
            query: "select=id,member_class,status,chapter:chapters!inner(id,slug,organization_name,designation,greek_letters,status,timezone,currency,modules,university:universities(name))&user_id=eq.\(userId)&chapter.slug=eq.\(slug)&status=eq.active",
            accessToken: accessToken
        )
        guard let row = rows.first, let chapter = row.chapter?.summary else {
            throw APIError.message("You are not a member of that chapter.")
        }
        let perms: [String] = (try? await client.rpc("my_permissions", parameters: ["p_chapter": .string(chapter.id)], accessToken: accessToken)) ?? []
        return (
            chapter,
            Membership(id: row.id, memberClass: row.memberClass ?? .active, status: row.status ?? .active),
            Set(perms.compactMap(Permission.init(rawValue:)))
        )
    }

    private func loadChapterEvents(chapterId: String, timezone: String, now: String) async throws -> [ChapterEvent] {
        let rows: [EventDTO] = try await client.select(
            table: "events",
            query: "select=id,chapter_id,title,starts_at,ends_at,location,attendance_required,timezone,description&chapter_id=eq.\(chapterId)&cancelled_at=is.null&ends_at=gte.\(now)&order=starts_at.asc&limit=20",
            accessToken: accessToken
        )
        let ids = rows.map(\.id)
        var rsvpByEvent: [String: String] = [:]
        if !ids.isEmpty {
            let rsvps: [RsvpDTO] = (try? await client.select(
                table: "event_rsvps",
                query: "select=event_id,status&event_id=in.(\(ids.joined(separator: ",")))&user_id=eq.\(userId)",
                accessToken: accessToken
            )) ?? []
            rsvpByEvent = Dictionary(uniqueKeysWithValues: rsvps.map { ($0.eventId, $0.status) })
        }
        return rows.map { row in
            var event = row.event(fallbackTimezone: timezone)
            event.rsvp = rsvpByEvent[row.id]
            return event
        }
    }

    private func loadAnnouncements(chapterId: String) async throws -> [Announcement] {
        let rows: [AnnouncementDTO] = try await client.select(
            table: "announcements",
            query: "select=id,title,body,pinned,requires_ack,published_at,audience&chapter_id=eq.\(chapterId)&archived_at=is.null&order=pinned.desc,published_at.desc&limit=20",
            accessToken: accessToken
        )
        let ackIds = rows.filter(\.requiresAck).map(\.id)
        var acked = Set<String>()
        if !ackIds.isEmpty {
            let acks: [AckDTO] = (try? await client.select(
                table: "announcement_acks",
                query: "select=announcement_id&announcement_id=in.(\(ackIds.joined(separator: ",")))&user_id=eq.\(userId)",
                accessToken: accessToken
            )) ?? []
            acked = Set(acks.map(\.announcementId))
        }
        return rows.map {
            Announcement(
                id: $0.id,
                title: $0.title,
                body: $0.body,
                pinned: $0.pinned,
                requiresAck: $0.requiresAck && !acked.contains($0.id),
                publishedAt: $0.publishedAt ?? Date(),
                author: "",
                audience: $0.audience ?? "All members"
            )
        }
    }

    private func loadDirectory(chapterId: String) async -> [DirectoryMember] {
        struct Params: Encodable {
            let p_chapter: String
            let p_search: String?
            let p_class: String?
            let p_role: String?
            let p_status: String?
            let p_limit: Int
            let p_offset: Int
        }
        let assignments = await loadRoleAssignments(chapterId: chapterId)
        if let rows: [DirectoryDTO] = try? await client.rpcEncodable(
            "chapter_directory",
            parameters: Params(p_chapter: chapterId, p_search: nil, p_class: nil, p_role: nil, p_status: nil, p_limit: 200, p_offset: 0),
            accessToken: accessToken
        ), !rows.isEmpty {
            return rows.map { row in
                var member = row.member
                if let holds = assignments[member.membershipId] {
                    member.roleAssignments = holds
                    member.roles = holds.map(\.name)
                }
                return member
            }
        }
        let rows: [MembershipDirectoryDTO] = (try? await client.select(
            table: "memberships",
            query: "select=id,user_id,member_class,status,profile:profiles!memberships_user_id_fkey(display_name,full_name,avatar_path,graduation_year)&chapter_id=eq.\(chapterId)&status=in.(active,inactive,suspended)&limit=200",
            accessToken: accessToken
        )) ?? []
        return rows.map { row in
            let profile = row.profile
            let holds = assignments[row.id] ?? []
            return DirectoryMember(
                id: row.userId,
                membershipId: row.id,
                name: [profile?.displayName, profile?.fullName].compactMap { $0 }.first { !$0.isEmpty } ?? "Member",
                email: "",
                memberClass: row.memberClass ?? .active,
                status: row.status ?? .active,
                roles: holds.map(\.name),
                roleAssignments: holds,
                graduationYear: profile?.graduationYear,
                house: nil,
                avatarPath: profile?.avatarPath
            )
        }
    }

    private func loadRoleAssignments(chapterId: String) async -> [String: [MemberRoleAssignment]] {
        let rows: [AssignmentNameDTO] = (try? await client.select(
            table: "role_assignments",
            query: "select=id,membership_id,role:roles(name)&chapter_id=eq.\(chapterId)&ends_at=is.null",
            accessToken: accessToken
        )) ?? []
        var map: [String: [MemberRoleAssignment]] = [:]
        for row in rows {
            guard let id = row.id, let name = row.role?.name else { continue }
            map[row.membershipId, default: []].append(MemberRoleAssignment(id: id, name: name))
        }
        return map
    }

    private func loadCharges(membershipId: String) async throws -> [DuesCharge] {
        let rows: [ChargeDTO] = try await client.select(
            table: "member_assessment_balances",
            query: "select=id,title,category,amount_cents,outstanding_cents,processing_cents,due_date,status,allow_installments,max_installments&membership_id=eq.\(membershipId)&order=due_date.asc",
            accessToken: accessToken
        )
        return rows.map {
            DuesCharge(
                id: $0.id,
                title: $0.title,
                category: $0.category,
                amountCents: $0.amountCents,
                outstandingCents: $0.outstandingCents,
                processingCents: $0.processingCents,
                dueDate: $0.dueDate ?? Date(),
                status: $0.status,
                allowInstallments: $0.allowInstallments ?? false,
                maxInstallments: $0.maxInstallments ?? 0
            )
        }
    }

    private func loadPayments(membershipId: String) async throws -> [PaymentRecord] {
        let rows: [PaymentDTO] = try await client.select(
            table: "payments",
            query: "select=id,kind,method,status,amount_cents,created_at&membership_id=eq.\(membershipId)&status=neq.pending&order=created_at.desc&limit=40",
            accessToken: accessToken
        )
        return rows.map {
            PaymentRecord(
                id: $0.id,
                title: $0.kind ?? "Payment",
                method: $0.method ?? "Card",
                status: $0.status ?? .pending,
                amountCents: $0.amountCents,
                createdAt: $0.createdAt ?? Date(),
                receiptNumber: nil
            )
        }
    }

    private func loadReimbursements(chapterId: String, officer: Bool) async throws -> [Reimbursement] {
        let filter = officer ? "chapter_id=eq.\(chapterId)" : "chapter_id=eq.\(chapterId)&user_id=eq.\(userId)"
        let rows: [ReimbursementDTO] = try await client.select(
            table: "reimbursement_requests",
            query: "select=id,description,amount_cents,status,created_at&\(filter)&order=created_at.desc&limit=80",
            accessToken: accessToken
        )
        return rows.map {
            Reimbursement(
                id: $0.id,
                title: $0.description,
                amountCents: $0.amountCents,
                status: $0.status.capitalized,
                submittedAt: $0.createdAt ?? Date(),
                requester: email
            )
        }
    }

    private func loadConversations(chapterId: String) async -> [Conversation] {
        let rows: [ConversationDTO] = (try? await client.rpc("my_conversations", parameters: ["p_chapter": .string(chapterId)], accessToken: accessToken)) ?? []
        return rows.map { row in
            let kind = ConversationKind(rawValue: row.kind) ?? .channel
            let title = kind.isDirect ? (row.otherDisplayName ?? "Direct message") : (row.name ?? "Channel")
            let members = row.memberCount?.value ?? 0
            return Conversation(
                id: row.id,
                kind: kind,
                title: title,
                subtitle: kind.isDirect ? "Direct message" : (row.topic?.isEmpty == false ? row.topic! : "\(members) members"),
                unread: row.unreadCount?.value ?? 0,
                messages: [],
                didLoadMessages: false,
                otherUserId: row.otherUserId
            )
        }
    }

    private func loadStages(chapterId: String) async -> [RecruitmentStage] {
        let rows: [StageDTO] = (try? await client.select(
            table: "recruitment_stages",
            query: "select=id,name,position,outcome&chapter_id=eq.\(chapterId)&order=position.asc,name.asc",
            accessToken: accessToken
        )) ?? []
        return rows.map { RecruitmentStage(id: $0.id, name: $0.name, position: $0.position, outcome: $0.outcome ?? "open") }
    }

    private func loadProspects(chapterId: String) async -> [Prospect] {
        let rows: [ProspectDTO] = (try? await client.select(
            table: "prospects",
            query: "select=id,full_name,preferred_name,class_year,major,hometown,stage_id,owner_membership_id,next_follow_up_at,updated_at&chapter_id=eq.\(chapterId)&status=eq.active&order=updated_at.desc&limit=500",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            Prospect(
                id: $0.id,
                name: $0.fullName,
                preferredName: $0.preferredName,
                stageId: $0.stageId,
                stage: "Stage",
                outcome: "open",
                school: $0.hometown ?? "",
                major: $0.major,
                classYear: $0.classYear,
                assignedTo: $0.ownerMembershipId,
                followUpAt: $0.nextFollowUpAt,
                lastActivity: $0.nextFollowUpAt.map { DateFormat.relative($0) } ?? DateFormat.relative($0.updatedAt ?? Date())
            )
        }
    }

    private func loadLedger(chapterId: String) async -> [LedgerEntry] {
        let rows: [LedgerTxnDTO] = (try? await client.select(
            table: "ledger_transactions",
            query: "select=id,kind,description,occurred_at,ledger_entries(id,account,amount_cents)&chapter_id=eq.\(chapterId)&order=occurred_at.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        return rows.flatMap { txn in
            (txn.ledgerEntries ?? []).map { entry in
                let amount = entry.amountCents
                return LedgerEntry(
                    id: "\(entry.id)",
                    date: txn.occurredAt ?? Date(),
                    memo: [LedgerCopy.kind(txn.kind), txn.description].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                    debitCents: amount > 0 ? amount : 0,
                    creditCents: amount < 0 ? -amount : 0,
                    account: LedgerCopy.account(entry.account)
                )
            }
        }
    }

    private func loadServiceHours(chapterId: String, officer: Bool) async -> [ServiceHour] {
        let filter = officer ? "chapter_id=eq.\(chapterId)" : "chapter_id=eq.\(chapterId)&user_id=eq.\(userId)"
        let rows: [HoursDTO] = (try? await client.select(
            table: "service_hours",
            query: "select=id,user_id,organization,hours,served_on,status&\(filter)&order=served_on.desc&limit=80",
            accessToken: accessToken
        )) ?? []
        let names = await displayNames(userIds: rows.map(\.userId))
        return rows.map {
            ServiceHour(
                id: $0.id,
                userId: $0.userId,
                member: names[$0.userId] ?? ( $0.userId == userId ? "You" : "Member"),
                hours: $0.hours,
                event: $0.organization,
                status: $0.status.capitalized,
                date: $0.servedOn ?? Date()
            )
        }
    }

    private func loadChores(chapterId: String, membershipId: String) async -> [HousingChore] {
        let rows: [ChoreDTO] = (try? await client.select(
            table: "chores",
            query: "select=id,title,due_on,status&chapter_id=eq.\(chapterId)&assigned_membership_id=eq.\(membershipId)&order=due_on.desc&limit=20",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            HousingChore(id: $0.id, title: $0.title, assignee: "You", due: $0.dueOn.map { DateFormat.medium($0) } ?? "", done: $0.status == "done")
        }
    }

    private func loadPolicies(chapterId: String) async -> [PolicyDoc] {
        let rows: [PolicyDTO] = (try? await client.select(
            table: "policy_documents",
            query: "select=id,title,current_version,requires_ack,category&chapter_id=eq.\(chapterId)&current_version=gt.0&order=title.asc",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            PolicyDoc(id: $0.id, title: $0.title, version: "\($0.currentVersion)", acknowledged: !$0.requiresAck, category: $0.category ?? "general")
        }
    }

    private func loadStudyGroups(chapterId: String) async -> [StudyGroup] {
        let rows: [GroupDTO] = (try? await client.select(
            table: "study_groups",
            query: "select=id,name,course_code,meeting_info&chapter_id=eq.\(chapterId)&order=name.asc&limit=40",
            accessToken: accessToken
        )) ?? []
        let members: [GroupMemberDTO] = (try? await client.select(
            table: "study_group_members",
            query: "select=group_id,user_id&chapter_id=eq.\(chapterId)",
            accessToken: accessToken
        )) ?? []
        var counts: [String: Int] = [:]
        var joined = Set<String>()
        for row in members {
            counts[row.groupId, default: 0] += 1
            if row.userId == userId { joined.insert(row.groupId) }
        }
        return rows.map {
            StudyGroup(
                id: $0.id,
                title: $0.name,
                course: $0.courseCode ?? "",
                nextMeeting: $0.meetingInfo ?? "",
                members: counts[$0.id] ?? 0,
                joined: joined.contains($0.id)
            )
        }
    }

    private func loadAcademicGoals(chapterId: String) async -> [AcademicGoal] {
        let rows: [GoalDTO] = (try? await client.select(
            table: "academic_goals",
            query: "select=id,title,target_date,status,share_with_scholarship&chapter_id=eq.\(chapterId)&user_id=eq.\(userId)&order=created_at.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            AcademicGoal(id: $0.id, title: $0.title, targetDate: $0.targetDate, status: $0.status, shareWithScholarship: $0.shareWithScholarship)
        }
    }

    private func loadHousingRequests(chapterId: String) async -> [HousingRequest] {
        let rows: [HousingRequestDTO] = (try? await client.select(
            table: "housing_requests",
            query: "select=id,membership_id,term_label,notes,wants_single,status,response&chapter_id=eq.\(chapterId)&order=created_at.desc&limit=80",
            accessToken: accessToken
        )) ?? []
        let names: [String: String] = [:]
        return rows.map {
            HousingRequest(
                id: $0.id,
                membershipId: $0.membershipId,
                memberName: names[$0.membershipId] ?? "Member",
                term: $0.termLabel,
                notes: $0.notes,
                wantsSingle: $0.wantsSingle,
                status: $0.status,
                response: $0.response
            )
        }
    }

    private func loadMaintenance(chapterId: String) async -> [MaintenanceRequest] {
        let rows: [MaintenanceDTO] = (try? await client.select(
            table: "maintenance_requests",
            query: "select=id,title,location,priority,status,description&chapter_id=eq.\(chapterId)&order=created_at.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            MaintenanceRequest(id: $0.id, title: $0.title, location: $0.location, priority: $0.priority, status: $0.status, description: $0.description)
        }
    }

    private func loadMemberBalances(chapterId: String) async -> [ChapterMemberBalance] {
        let rows: [MemberBalanceRowDTO] = (try? await client.rpc(
            "chapter_member_balances",
            parameters: ["p_chapter": .string(chapterId)],
            accessToken: accessToken
        )) ?? []
        return rows.map {
            ChapterMemberBalance(
                id: $0.membershipId,
                name: [$0.displayName, $0.fullName].compactMap { $0 }.first { !$0.isEmpty } ?? "Member",
                memberClass: $0.memberClass ?? .active,
                status: $0.status ?? .active,
                balanceCents: $0.balanceCents.value,
                processingCents: $0.processingCents.value,
                overdueCents: $0.overdueCents.value
            )
        }
    }

    private func loadAssessments(chapterId: String) async -> [ChapterAssessment] {
        let rows: [AssessmentDTO] = (try? await client.select(
            table: "dues_assessments",
            query: "select=id,title,category,default_amount_cents,due_date,status,allow_installments&chapter_id=eq.\(chapterId)&status=neq.cancelled&order=due_date.desc",
            accessToken: accessToken
        )) ?? []
        let totals: [AssessmentBalanceDTO] = (try? await client.select(
            table: "member_assessment_balances",
            query: "select=assessment_id,amount_cents,outstanding_cents,status&chapter_id=eq.\(chapterId)",
            accessToken: accessToken
        )) ?? []
        var agg: [String: (count: Int, billed: Int, outstanding: Int)] = [:]
        for row in totals where row.status != "voided" {
            var value = agg[row.assessmentId] ?? (0, 0, 0)
            value.count += 1
            value.billed += row.amountCents
            value.outstanding += max(0, row.outstandingCents)
            agg[row.assessmentId] = value
        }
        return rows.map {
            let stats = agg[$0.id] ?? (0, 0, 0)
            return ChapterAssessment(
                id: $0.id,
                title: $0.title,
                category: LedgerCopy.assessmentCategory($0.category),
                amountCents: $0.defaultAmountCents,
                dueDate: $0.dueDate,
                status: $0.status,
                allowInstallments: $0.allowInstallments,
                billedCents: stats.billed,
                outstandingCents: stats.outstanding,
                memberCount: stats.count
            )
        }
    }

    private func loadChapterPayments(chapterId: String) async -> [PaymentRecord] {
        let rows: [PaymentDTO] = (try? await client.select(
            table: "payments",
            query: "select=id,kind,method,status,amount_cents,created_at&chapter_id=eq.\(chapterId)&status=neq.pending&order=created_at.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            PaymentRecord(
                id: $0.id,
                title: $0.kind ?? "Payment",
                method: $0.method ?? "Card",
                status: $0.status ?? .pending,
                amountCents: $0.amountCents,
                createdAt: $0.createdAt ?? Date(),
                receiptNumber: nil
            )
        }
    }

    private func loadBudget(chapterId: String) async -> ([BudgetLine], [BudgetExpense]) {
        let lines: [BudgetLineDTO] = (try? await client.select(
            table: "budget_lines",
            query: "select=id,category,planned_cents&chapter_id=eq.\(chapterId)&order=category.asc",
            accessToken: accessToken
        )) ?? []
        let expenses: [ExpenseDTO] = (try? await client.select(
            table: "expenses",
            query: "select=id,description,vendor,amount_cents,spent_on,budget_line_id&chapter_id=eq.\(chapterId)&order=spent_on.desc&limit=200",
            accessToken: accessToken
        )) ?? []
        var spent: [String: Int] = [:]
        for expense in expenses {
            if let line = expense.budgetLineId {
                spent[line, default: 0] += expense.amountCents
            }
        }
        return (
            lines.map { BudgetLine(id: $0.id, category: $0.category, plannedCents: $0.plannedCents, spentCents: spent[$0.id] ?? 0) },
            expenses.prefix(20).map {
                BudgetExpense(id: $0.id, description: $0.description, vendor: $0.vendor, amountCents: $0.amountCents, spentOn: $0.spentOn)
            }
        )
    }

    private func loadMonthlyCollections(chapterId: String) async -> [MonthlyCollection] {
        let rows: [MonthlyDTO] = (try? await client.rpc(
            "chapter_monthly_collections",
            parameters: ["p_chapter": .string(chapterId), "p_months": .int(12)],
            accessToken: accessToken
        )) ?? []
        return rows.map {
            MonthlyCollection(
                month: $0.month,
                onlineCents: $0.onlineCents,
                offlineCents: $0.offlineCents,
                platformFeeCents: $0.platformFeeCents,
                processingFeeCents: $0.processingFeeCents,
                refundsCents: $0.refundsCents,
                paymentsCount: $0.paymentsCount
            )
        }.reversed()
    }

    private func loadRoles(chapterId: String) async -> [ChapterRole] {
        let rows: [RoleDTO] = (try? await client.select(
            table: "roles",
            query: "select=id,key,name,description,kind,is_officer,is_owner,role_permissions(permission_key)&chapter_id=eq.\(chapterId)&order=sort_order.asc,name.asc",
            accessToken: accessToken
        )) ?? []
        let assignments: [RoleCountDTO] = (try? await client.select(
            table: "role_assignments",
            query: "select=role_id&chapter_id=eq.\(chapterId)&ends_at=is.null",
            accessToken: accessToken
        )) ?? []
        var counts: [String: Int] = [:]
        for row in assignments { counts[row.roleId, default: 0] += 1 }
        return rows.map {
            ChapterRole(
                id: $0.id,
                key: $0.key,
                name: $0.name,
                description: $0.description,
                kind: $0.kind,
                isOfficer: $0.isOfficer,
                isOwner: $0.isOwner,
                holders: counts[$0.id] ?? 0,
                permissionCount: $0.rolePermissions?.count ?? 0
            )
        }
    }

    private func loadInvitations(chapterId: String) async -> [ChapterInvitation] {
        let rows: [InviteDTO] = (try? await client.select(
            table: "chapter_invitations",
            query: "select=id,email,full_name,member_class,created_at&chapter_id=eq.\(chapterId)&status=eq.pending&order=created_at.desc&limit=80",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            ChapterInvitation(id: $0.id, email: $0.email, fullName: $0.fullName, memberClass: $0.memberClass ?? .active, createdAt: $0.createdAt ?? Date())
        }
    }

    private func loadAudit(chapterId: String) async -> [AuditEvent] {
        let rows: [AuditDTO] = (try? await client.select(
            table: "audit_logs",
            query: "select=id,actor_id,actor_kind,action,metadata,created_at&chapter_id=eq.\(chapterId)&order=id.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        let actorIds = Array(Set(rows.compactMap(\.actorId)))
        let names = await displayNames(userIds: actorIds)
        return rows.map {
            AuditEvent(
                id: "\($0.id)",
                when: $0.createdAt ?? Date(),
                actor: $0.actorId.flatMap { names[$0] } ?? ($0.actorKind ?? "System"),
                action: LedgerCopy.audit($0.action),
                detail: $0.metadataSummary
            )
        }
    }

    private func loadChapterDetails(chapterId: String) async -> ChapterProfileDetails {
        let rows: [ChapterDetailsDTO] = (try? await client.select(
            table: "chapters",
            query: "select=description,founded_year,verified_at,setup_skipped&id=eq.\(chapterId)",
            accessToken: accessToken
        )) ?? []
        guard let row = rows.first else { return ChapterProfileDetails() }
        return ChapterProfileDetails(
            description: row.description ?? "",
            foundedYear: row.foundedYear,
            verifiedAt: row.verifiedAt,
            setupSkipped: row.setupSkipped ?? []
        )
    }

    private func loadRooms(chapterId: String) async -> [HousingRoom] {
        let rooms: [RoomDTO] = (try? await client.select(
            table: "housing_rooms",
            query: "select=id,name,floor,capacity,rent_cents&chapter_id=eq.\(chapterId)&archived_at=is.null&order=name.asc",
            accessToken: accessToken
        )) ?? []
        let today = ISODate.day()
        let assignments: [RoomAssignDTO] = (try? await client.select(
            table: "room_assignments",
            query: "select=room_id,ends_on&chapter_id=eq.\(chapterId)&or=(ends_on.is.null,ends_on.gte.\(today))",
            accessToken: accessToken
        )) ?? []
        var occupied: [String: Int] = [:]
        for row in assignments { occupied[row.roomId, default: 0] += 1 }
        return rooms.map {
            HousingRoom(id: $0.id, name: $0.name, floor: $0.floor, capacity: $0.capacity ?? 1, occupied: occupied[$0.id] ?? 0, rentCents: $0.rentCents)
        }
    }

    private func loadCampaigns(chapterId: String) async -> [Campaign] {
        let rows: [CampaignDTO] = (try? await client.select(
            table: "fundraising_campaigns",
            query: "select=id,name,beneficiary,goal_cents,status&chapter_id=eq.\(chapterId)&order=created_at.desc&limit=30",
            accessToken: accessToken
        )) ?? []
        return rows.map {
            Campaign(id: $0.id, name: $0.name, beneficiary: $0.beneficiary, goalCents: $0.goalCents ?? 0, status: $0.status)
        }
    }

    private func loadAgreement(chapterId: String) async -> String? {
        let rows: [AgreementDTO] = (try? await client.select(
            table: "chapter_agreements",
            query: "select=signer_name&chapter_id=eq.\(chapterId)&superseded_at=is.null&limit=1",
            accessToken: accessToken
        )) ?? []
        return rows.first?.signerName
    }

    private func loadSubscription(chapterId: String) async -> SubscriptionDTO? {
        let rows: [SubscriptionDTO] = (try? await client.select(
            table: "chapter_subscriptions",
            query: "select=status,unit_amount_cents,current_period_end&chapter_id=eq.\(chapterId)&order=updated_at.desc&limit=1",
            accessToken: accessToken
        )) ?? []
        return rows.first
    }

    private func makeSetupSteps(
        slug: String,
        modules: [ChapterModule: Bool],
        canManage: Bool,
        canHousing: Bool,
        canPhilanthropy: Bool,
        details: ChapterProfileDetails,
        memberCount: Int,
        inviteCount: Int,
        roles: [ChapterRole],
        billing: BillingSnapshot,
        policyCount: Int,
        roomCount: Int,
        eventCount: Int,
        prospectCount: Int,
        campaignCount: Int,
        studyCount: Int
    ) -> [SetupStep] {
        let skipped = Set(details.setupSkipped)
        let officerAssigned = roles.contains { $0.key != "chapter_admin" && $0.holders > 0 && $0.isOfficer }
        let locked = billing.subscription != "active" && billing.subscription != "trialing" && billing.subscription != "past_due"
        let settings = "/settings"
        func step(id: String, title: String, detail: String, href: String, optional: Bool, complete: Bool) -> SetupStep {
            let wasSkipped = optional && skipped.contains(id) && !complete
            return SetupStep(
                id: id,
                title: title,
                detail: detail,
                href: href,
                done: complete || wasSkipped,
                skipped: wasSkipped,
                optional: optional,
                preview: locked && id != "billing"
            )
        }
        let housingOn = modules[.housing] ?? false
        let recruitOn = modules[.recruitment] ?? false
        let philOn = modules[.philanthropy] ?? false
        let acadOn = modules[.academics] ?? false
        let stdOn = modules[.standards] ?? false
        return [
            step(id: "profile", title: "Write the chapter profile", detail: "Add a short description in Settings so members can tell this account is yours. Confirm the time zone while you are there.", href: settings, optional: false, complete: details.description.trimmingCharacters(in: .whitespacesAndNewlines).count >= 20),
            step(id: "roster", title: "Invite the roster", detail: "Invite members from the Members page. A pending invitation is enough to finish this step.", href: "/settings/members", optional: false, complete: memberCount > 1 || inviteCount > 0),
            step(id: "officers", title: "Assign officer roles", detail: "Give someone treasurer, secretary, or another officer role. The chapter administrator role on its own leaves this step open.", href: "/settings/roles", optional: false, complete: officerAssigned),
            step(id: "billing", title: "Turn on dues collection", detail: billing.canCollect ? "Members can pay dues online." : "Accept the chapter agreement, start the monthly subscription, and connect Stripe.", href: "/settings/billing", optional: false, complete: billing.canCollect),
            step(id: "standards", title: "Publish a standards policy", detail: stdOn ? "Publish bylaws or a risk policy from Standards. Members can then read it and acknowledge it." : "Turn on Standards in Settings, then publish a policy. Skip this if you will write policies later.", href: stdOn ? "/standards" : settings, optional: true, complete: stdOn && policyCount > 0),
            step(id: "housing", title: "Set up the house", detail: housingOn ? (canHousing ? "Add the rooms and give each floor its own name. Skip this if the chapter does not have a house." : "A chapter administrator adds the rooms and names each floor.") : "Turn on Housing in Settings, then add rooms. Skip this if the chapter does not have a house.", href: housingOn ? "/housing" : settings, optional: true, complete: roomCount > 0),
            step(id: "events", title: "Schedule the first event", detail: "Create an event with a written description and any pictures members should see.", href: "/events", optional: true, complete: eventCount > 0),
            step(id: "recruitment", title: "Open recruitment", detail: recruitOn ? "Add a prospect or confirm the recruitment pipeline is ready." : "Turn on Recruitment in Settings and add a prospect, or skip this program.", href: recruitOn ? "/recruitment" : settings, optional: true, complete: recruitOn && prospectCount > 0),
            step(id: "philanthropy", title: "Start philanthropy", detail: philOn ? (canPhilanthropy ? "Add a fundraising campaign so service and donations have a home." : "A chapter administrator adds the first fundraising campaign.") : "Turn on Philanthropy in Settings and add a campaign, or skip this program.", href: philOn ? "/philanthropy" : settings, optional: true, complete: philOn && campaignCount > 0),
            step(id: "academics", title: "Start academics", detail: acadOn ? "Add a study group or a mentorship pair so academic support is in place." : "Turn on Academics in Settings and add a study group, or skip this program.", href: acadOn ? "/academics" : settings, optional: true, complete: acadOn && studyCount > 0)
        ]
    }

    private func chatMessage(from row: MessageDTO, names: [String: String], reactions: [String: [String]] = [:], quote: MessageDTO? = nil, quoteName: String? = nil) -> ChatMessage {
        ChatMessage(
            id: row.id,
            conversationId: row.conversationId,
            senderId: row.senderId,
            from: names[row.senderId] ?? "Member",
            body: row.body,
            createdAt: row.createdAt,
            time: DateFormat.clock(row.createdAt),
            reactions: reactions,
            pinned: row.pinnedAt != nil,
            edited: row.editedAt != nil,
            replyToId: row.replyToId ?? quote?.id,
            replyFrom: quote.map { quoteName ?? names[$0.senderId] ?? "Member" },
            replyBody: quote?.deletedAt == nil ? quote?.body : "This message was deleted."
        )
    }

    func displayNames(userIds: [String]) async -> [String: String] {
        let unique = Array(Set(userIds))
        guard !unique.isEmpty else { return [:] }
        let rows: [ProfileDTO] = (try? await client.select(
            table: "profiles",
            query: "select=id,display_name,full_name&id=in.(\(unique.joined(separator: ",")))",
            accessToken: accessToken
        )) ?? []
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.id, [$0.displayName, $0.fullName].compactMap { $0 }.first { !$0.isEmpty } ?? "Member") })
    }
}

struct FlexibleInt: Decodable {
    let value: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { value = 0; return }
        if let int = try? container.decode(Int.self) { value = int; return }
        if let double = try? container.decode(Double.self) { value = Int(double); return }
        if let string = try? container.decode(String.self) {
            if let int = Int(string) { value = int; return }
            if let double = Double(string) { value = Int(double); return }
        }
        value = 0
    }
}

private struct NotificationKindDTO: Decodable {
    let kind: String
    let label: String
    let description: String
    let defaultInApp: Bool?
    let defaultEmail: Bool?
    let required: Bool?
}

private struct NotificationPrefDTO: Decodable {
    let kind: String
    let inApp: Bool?
    let email: Bool?
}

private struct ProfileDTO: Decodable {
    let id: String
    let displayName: String?
    let fullName: String?
    let avatarPath: String?
    let graduationYear: Int?
}

struct NamedDTO: Decodable { let name: String? }

private struct ChapterDTO: Decodable {
    let id: String
    let slug: String
    let organizationName: String
    let designation: String?
    let greekLetters: String?
    let status: ChapterStatus?
    let timezone: String?
    let currency: String?
    let modules: [String: Bool]?
    let university: NamedDTO?

    var summary: ChapterSummary {
        var mapped: [ChapterModule: Bool] = [:]
        for (key, value) in modules ?? [:] {
            if let module = ChapterModule(rawValue: key) { mapped[module] = value }
        }
        return ChapterSummary(
            id: id,
            slug: slug,
            organizationName: organizationName,
            designation: designation,
            greekLetters: greekLetters,
            status: status ?? .unclaimed,
            timezone: timezone ?? "America/Chicago",
            currency: currency ?? "usd",
            modules: mapped,
            university: university?.name.map { University(name: $0) }
        )
    }
}

private struct MembershipRowDTO: Decodable {
    let id: String
    let memberClass: MemberClass?
    let status: MembershipStatus?
    let chapter: ChapterDTO?
}

private struct MembershipDTO: Decodable {
    let id: String
    let memberClass: MemberClass?
    let status: MembershipStatus?

    var model: Membership {
        Membership(id: id, memberClass: memberClass ?? .active, status: status ?? .active)
    }
}

private struct CombinedContextDTO: Decodable {
    let chapter: ChapterDTO?
    let membership: MembershipDTO?
    let permissions: [String]?
}

private struct BalanceDTO: Decodable {
    let balanceCents: FlexibleInt
    let processingCents: FlexibleInt
    let nextDueDate: Date?
}

private struct ReadinessDTO: Decodable {
    let canCollect: Bool?
    let termsAccepted: Bool?
    let verified: Bool?
    let subscription: String?
    let cardPayments: String?
    let payouts: String?
}

private struct ApplicationDTO: Decodable {
    let id: String
    let kind: ApplicationKind?
    let status: ApplicationStatus?
    let organizationName: String?
    let designation: String?
    let proposedUniversityName: String?
    let updatedAt: Date?
    let university: NamedDTO?
}

private struct NotificationDTO: Decodable {
    let id: String
    let kind: String?
    let title: String
    let body: String?
    let link: String?
    let readAt: Date?
    let createdAt: Date
}

private struct EventDTO: Decodable {
    let id: String
    let chapterId: String
    let title: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
    let attendanceRequired: Bool?
    let timezone: String?
    let description: String?

    func event(fallbackTimezone: String) -> ChapterEvent {
        ChapterEvent(
            id: id,
            chapterId: chapterId,
            title: title,
            startsAt: startsAt,
            endsAt: endsAt ?? startsAt.addingTimeInterval(3600),
            location: location,
            attendanceRequired: attendanceRequired ?? false,
            timezone: timezone ?? fallbackTimezone,
            details: description,
            rsvp: nil
        )
    }
}

private struct RsvpDTO: Decodable {
    let eventId: String
    let status: String
}

private struct AnnouncementDTO: Decodable {
    let id: String
    let title: String
    let body: String
    let pinned: Bool
    let requiresAck: Bool
    let publishedAt: Date?
    let audience: String?
}

private struct AckDTO: Decodable { let announcementId: String }

private struct RoleChipDTO: Decodable { let name: String? }

private struct DirectoryDTO: Decodable {
    let membershipId: String?
    let userId: String
    let displayName: String?
    let fullName: String?
    let avatarPath: String?
    let graduationYear: Int?
    let memberClass: MemberClass?
    let status: MembershipStatus?
    let roles: AnyJSON?
    let inHouse: Bool?

    var member: DirectoryMember {
        DirectoryMember(
            id: userId,
            membershipId: membershipId ?? userId,
            name: [displayName, fullName].compactMap { $0 }.first { !$0.isEmpty } ?? "Member",
            email: "",
            memberClass: memberClass ?? .active,
            status: status ?? .active,
            roles: roleNames,
            graduationYear: graduationYear,
            house: inHouse == true ? "In house" : (inHouse == false ? "Out of house" : nil),
            avatarPath: avatarPath
        )
    }

    var roleNames: [String] {
        switch roles {
        case .array(let items):
            return items.compactMap { item in
                if case .object(let object) = item, case .string(let name) = object["name"] { return name }
                return nil
            }
        default:
            return []
        }
    }
}

private struct MembershipDirectoryDTO: Decodable {
    let id: String
    let userId: String
    let memberClass: MemberClass?
    let status: MembershipStatus?
    let profile: NestedProfileDTO?
}

private struct NestedProfileDTO: Decodable {
    let displayName: String?
    let fullName: String?
    let avatarPath: String?
    let graduationYear: Int?
}

private struct AssignmentNameDTO: Decodable {
    let id: String?
    let membershipId: String
    let role: NamedDTO?
}

private struct ChargeDTO: Decodable {
    let id: String
    let title: String
    let category: String
    let amountCents: Int
    let outstandingCents: Int
    let processingCents: Int
    let dueDate: Date?
    let status: String
    let allowInstallments: Bool?
    let maxInstallments: Int?
}

private struct PaymentDTO: Decodable {
    let id: String
    let kind: String?
    let method: String?
    let status: PaymentStatus?
    let amountCents: Int
    let createdAt: Date?
}

private struct ReimbursementDTO: Decodable {
    let id: String
    let description: String
    let amountCents: Int
    let status: String
    let createdAt: Date?
}

private struct ConversationDTO: Decodable {
    let id: String
    let kind: String
    let name: String?
    let topic: String?
    let unreadCount: FlexibleInt?
    let otherUserId: String?
    let otherDisplayName: String?
    let memberCount: FlexibleInt?
}

private struct MessageDTO: Decodable {
    let id: String
    let conversationId: String
    let senderId: String
    let body: String
    let editedAt: Date?
    let deletedAt: Date?
    let pinnedAt: Date?
    let createdAt: Date
    let replyToId: String?
}

private struct ReactionDTO: Decodable {
    let messageId: String
    let userId: String
    let emoji: String
}

private struct ProspectDTO: Decodable {
    let id: String
    let fullName: String
    let preferredName: String?
    let classYear: Int?
    let major: String?
    let hometown: String?
    let stageId: String
    let ownerMembershipId: String?
    let nextFollowUpAt: Date?
    let updatedAt: Date?
}

private struct StageDTO: Decodable {
    let id: String
    let name: String
    let position: Int
    let outcome: String?
}

private struct LedgerTxnDTO: Decodable {
    let id: String
    let kind: String
    let description: String?
    let occurredAt: Date?
    let ledgerEntries: [LedgerLineDTO]?
}

private struct LedgerLineDTO: Decodable {
    let id: Int
    let account: String
    let amountCents: Int
}

private struct FinanceSummaryDTO: Decodable {
    let assessedCents: FlexibleInt?
    let voidedCents: FlexibleInt?
    let collectedOnlineCents: FlexibleInt?
    let collectedOfflineCents: FlexibleInt?
    let creditsCents: FlexibleInt?
    let refundsCents: FlexibleInt?
    let platformFeesCents: FlexibleInt?
    let processingFeesCents: FlexibleInt?
    let disputedCents: FlexibleInt?
    let payoutsCents: FlexibleInt?
    let outstandingCents: FlexibleInt?
    let stripeBalanceCents: FlexibleInt?
    let processingCents: FlexibleInt?
    let failedCount: FlexibleInt?
    let openDisputes: FlexibleInt?
    let membersWithBalance: FlexibleInt?

    var model: FinanceSummary {
        FinanceSummary(
            assessedCents: assessedCents?.value ?? 0,
            voidedCents: voidedCents?.value ?? 0,
            collectedOnlineCents: collectedOnlineCents?.value ?? 0,
            collectedOfflineCents: collectedOfflineCents?.value ?? 0,
            creditsCents: creditsCents?.value ?? 0,
            refundsCents: refundsCents?.value ?? 0,
            platformFeesCents: platformFeesCents?.value ?? 0,
            processingFeesCents: processingFeesCents?.value ?? 0,
            disputedCents: disputedCents?.value ?? 0,
            payoutsCents: payoutsCents?.value ?? 0,
            outstandingCents: outstandingCents?.value ?? 0,
            stripeBalanceCents: stripeBalanceCents?.value ?? 0,
            processingCents: processingCents?.value ?? 0,
            failedCount: failedCount?.value ?? 0,
            openDisputes: openDisputes?.value ?? 0,
            membersWithBalance: membersWithBalance?.value ?? 0
        )
    }
}

private struct MemberBalanceRowDTO: Decodable {
    let membershipId: String
    let fullName: String?
    let displayName: String?
    let memberClass: MemberClass?
    let status: MembershipStatus?
    let balanceCents: FlexibleInt
    let processingCents: FlexibleInt
    let overdueCents: FlexibleInt
}

private struct AssessmentDTO: Decodable {
    let id: String
    let title: String
    let category: String
    let defaultAmountCents: Int
    let dueDate: Date?
    let status: String
    let allowInstallments: Bool
}

private struct AssessmentBalanceDTO: Decodable {
    let assessmentId: String
    let amountCents: Int
    let outstandingCents: Int
    let status: String
}

private struct BudgetLineDTO: Decodable {
    let id: String
    let category: String
    let plannedCents: Int
}

private struct ExpenseDTO: Decodable {
    let id: String
    let description: String
    let vendor: String?
    let amountCents: Int
    let spentOn: Date?
    let budgetLineId: String?
}

private struct MonthlyDTO: Decodable {
    let month: String
    let onlineCents: Int
    let offlineCents: Int
    let platformFeeCents: Int
    let processingFeeCents: Int
    let refundsCents: Int
    let paymentsCount: Int
}

private struct EngagementDTO: Decodable {
    let activeMembers: FlexibleInt?
    let eventsHeld: FlexibleInt?
    let requiredEvents: FlexibleInt?
    let attendanceRecords: FlexibleInt?
    let requiredAttendanceRate: Double?
    let serviceHours: Double?
    let serviceParticipants: FlexibleInt?
    let messagesSent: FlexibleInt?
    let prospectsByStage: [FunnelDTO]?

    var model: EngagementSummary {
        EngagementSummary(
            activeMembers: activeMembers?.value ?? 0,
            eventsHeld: eventsHeld?.value ?? 0,
            requiredEvents: requiredEvents?.value ?? 0,
            attendanceRecords: attendanceRecords?.value ?? 0,
            requiredAttendanceRate: requiredAttendanceRate,
            serviceHours: serviceHours ?? 0,
            serviceParticipants: serviceParticipants?.value ?? 0,
            messagesSent: messagesSent?.value ?? 0,
            prospectsByStage: (prospectsByStage ?? []).map { FunnelStage(stage: $0.stage, outcome: $0.outcome, count: $0.count.value) }
        )
    }
}

private struct FunnelDTO: Decodable {
    let stage: String
    let outcome: String
    let count: FlexibleInt
}

private struct RoleDTO: Decodable {
    let id: String
    let key: String
    let name: String
    let description: String?
    let kind: String
    let isOfficer: Bool
    let isOwner: Bool
    let rolePermissions: [PermissionKeyDTO]?
}

private struct PermissionKeyDTO: Decodable { let permissionKey: String }
private struct RoleCountDTO: Decodable { let roleId: String }

private struct InviteDTO: Decodable {
    let id: String
    let email: String
    let fullName: String?
    let memberClass: MemberClass?
    let createdAt: Date?
}

private struct AuditDTO: Decodable {
    let id: Int
    let actorId: String?
    let actorKind: String?
    let action: String
    let metadata: AnyJSON?
    let createdAt: Date?

    var metadataSummary: String {
        guard case .object(let object) = metadata else { return "" }
        let keys = ["role", "name", "title", "reason", "toStatus", "toClass", "method"]
        return keys.compactMap { key in
            switch object[key] {
            case .string(let value): return value
            case .int(let value): return "\(value)"
            default: return nil
            }
        }.joined(separator: " · ")
    }
}

private struct ChapterDetailsDTO: Decodable {
    let description: String?
    let foundedYear: Int?
    let verifiedAt: Date?
    let setupSkipped: [String]?
}

private struct RoomDTO: Decodable {
    let id: String
    let name: String
    let floor: String?
    let capacity: Int?
    let rentCents: Int?
}

private struct RoomAssignDTO: Decodable {
    let roomId: String
    let endsOn: String?
}

private struct CampaignDTO: Decodable {
    let id: String
    let name: String
    let beneficiary: String?
    let goalCents: Int?
    let status: String
}

private struct AgreementDTO: Decodable { let signerName: String? }

private struct SubscriptionDTO: Decodable {
    let status: String?
    let unitAmountCents: Int?
    let currentPeriodEnd: Date?
}

private struct HoursDTO: Decodable {
    let id: String
    let userId: String
    let organization: String
    let hours: Double
    let servedOn: Date?
    let status: String
}

private struct ChoreDTO: Decodable {
    let id: String
    let title: String
    let dueOn: Date?
    let status: String
}

private struct PolicyDTO: Decodable {
    let id: String
    let title: String
    let currentVersion: Int
    let requiresAck: Bool
    let category: String?
}

private struct GroupMemberDTO: Decodable {
    let groupId: String
    let userId: String
}

private struct GoalDTO: Decodable {
    let id: String
    let title: String
    let targetDate: Date?
    let status: String
    let shareWithScholarship: Bool
}

private struct HousingRequestDTO: Decodable {
    let id: String
    let membershipId: String
    let termLabel: String
    let notes: String?
    let wantsSingle: Bool
    let status: String
    let response: String?
}

private struct MaintenanceDTO: Decodable {
    let id: String
    let title: String
    let location: String?
    let priority: String
    let status: String
    let description: String?
}

private struct GroupDTO: Decodable {
    let id: String
    let name: String
    let courseCode: String?
    let meetingInfo: String?
}
