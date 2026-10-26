import Foundation

extension GreekGeekStore {
    func loadAdminDashboard() async -> AdminDashboard {
        async let applications = loadAdminApplications()
        async let chapters = loadAdminChapters()
        async let bugs = loadAdminBugs()
        async let closures = loadAdminClosures()
        async let audit = loadAdminAudit()
        async let revenue = loadAdminRevenue()
        async let recon = loadAdminReconciliation()
        async let pricing = loadAdminPricing()
        async let plans = loadAdminPlans()
        async let replies = loadAdminReplies()
        async let forms = loadAdminForms()
        return AdminDashboard(
            applications: await applications,
            chapters: await chapters,
            bugs: await bugs,
            closures: await closures,
            audit: await audit,
            revenue: await revenue,
            reconciliation: await recon,
            pricingRules: await pricing,
            plans: await plans,
            replies: await replies,
            forms: await forms
        )
    }

    func reviewApplication(id: String, decision: String, message: String?, note: String?) async throws {
        struct Params: Encodable {
            let p_application: String
            let p_decision: String
            let p_message: String?
            let p_internal_note: String?
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "review_chapter_application",
            parameters: Params(p_application: id, p_decision: decision, p_message: message, p_internal_note: note),
            accessToken: accessToken
        )
    }

    func addApplicationNote(id: String, note: String) async throws {
        struct Params: Encodable {
            let p_application: String
            let p_note: String
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "add_application_note",
            parameters: Params(p_application: id, p_note: note),
            accessToken: accessToken
        )
    }

    func setChapterStatus(id: String, status: String, reason: String) async throws {
        struct Params: Encodable {
            let p_chapter: String
            let p_status: String
            let p_reason: String
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "platform_set_chapter_status",
            parameters: Params(p_chapter: id, p_status: status, p_reason: reason),
            accessToken: accessToken
        )
    }

    func reviewClosure(id: String, decision: String, note: String?) async throws {
        struct Params: Encodable {
            let p_request: String
            let p_decision: String
            let p_note: String?
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "review_chapter_closure",
            parameters: Params(p_request: id, p_decision: decision, p_note: note),
            accessToken: accessToken
        )
    }

    func updateBug(id: String, status: String, severity: String, area: String) async throws {
        struct Row: Encodable {
            let status: String
            let severity: String
            let area: String
        }
        try await client.patch(table: "bug_reports", query: "id=eq.\(id)", body: Row(status: status, severity: severity, area: area), accessToken: accessToken)
    }

    func logBugFix(id: String, summary: String, ref: String?) async throws {
        struct Row: Encodable {
            let status: String
            let fix_summary: String
            let fix_ref: String?
            let duplicate_of: AnyJSON
        }
        try await client.patch(
            table: "bug_reports",
            query: "id=eq.\(id)",
            body: Row(status: "fixed", fix_summary: summary, fix_ref: ref, duplicate_of: .null),
            accessToken: accessToken
        )
    }

    func commentOnBug(id: String, body: String) async throws {
        struct Row: Encodable {
            let report_id: String
            let actor_id: String
            let kind: String
            let body: String
        }
        try await client.insert(
            table: "bug_report_events",
            body: Row(report_id: id, actor_id: userId, kind: "comment", body: body),
            accessToken: accessToken
        )
    }

    func markOutreachRead(replyId: String) async throws {
        struct Row: Encodable { let read_at: String }
        try await client.patch(table: "outreach_emails", query: "id=eq.\(replyId)", body: Row(read_at: ISODate.timestamp()), accessToken: accessToken)
    }

    func loadEmailStats(rangeDays: Int?) async -> AdminEmailStats {
        let day: TimeInterval = 24 * 60 * 60
        let now = Date()
        let since = rangeDays.map { now.addingTimeInterval(-Double($0) * day) }
        let chartStart = now.addingTimeInterval(-12 * 7 * day)
        var emailQuery = "select=contact_id,direction,status,occurred_at,delivered_at,opened_at,clicked_at&order=occurred_at.asc,id.asc"
        if let since {
            emailQuery += "&occurred_at=gte.\(isoQuery(min(since, chartStart)))"
        }
        let emails: [AdminStatEmailDTO] = await client.selectPages(
            table: "outreach_emails",
            query: emailQuery,
            accessToken: accessToken
        )
        let contacts: [AdminStatContactDTO] = await client.selectPages(
            table: "outreach_contacts",
            query: "select=id,email_normalized,university,university_id,first_sent_at,replied_at,do_not_contact,unread_replies&order=id.asc",
            accessToken: accessToken
        )
        var formQuery = "select=email,created_at,interest&order=created_at.asc,id.asc"
        if let since {
            formQuery += "&created_at=gte.\(isoQuery(since))"
        }
        let submissions: [AdminStatFormDTO] = await client.selectPages(
            table: "intro_responses",
            query: formQuery,
            accessToken: accessToken
        )
        let blocked = await client.count(table: "outreach_contacts", query: "do_not_contact=eq.true", accessToken: accessToken)
        return AdminEmailStatsBuilder.build(
            emails: emails,
            contacts: contacts,
            submissions: submissions,
            blocked: blocked,
            since: since,
            chartStart: chartStart,
            rangeDays: rangeDays
        )
    }

    private func isoQuery(_ date: Date) -> String {
        date.ISO8601Format()
    }

    func publishPricingRule(
        code: String,
        name: String,
        bps: Int,
        fixedCents: Int,
        minCents: Int?,
        maxCents: Int?,
        refundPolicy: String,
        makeDefault: Bool,
        termsVersion: String,
        termsTitle: String,
        termsSummary: String,
        termsBody: String
    ) async throws {
        struct Params: Encodable {
            let p_code: String
            let p_name: String
            let p_bps: Int
            let p_fixed: Int
            let p_min: AnyJSON
            let p_max: AnyJSON
            let p_refund_policy: String
            let p_make_default: Bool
            let p_terms_version: String
            let p_terms_title: String
            let p_terms_summary: String
            let p_terms_body: String
        }
        let _: EmptyJSON = try await client.rpcEncodable(
            "platform_publish_pricing_rule",
            parameters: Params(
                p_code: code,
                p_name: name,
                p_bps: bps,
                p_fixed: fixedCents,
                p_min: minCents.map { .int($0) } ?? .null,
                p_max: maxCents.map { .int($0) } ?? .null,
                p_refund_policy: refundPolicy,
                p_make_default: makeDefault,
                p_terms_version: termsVersion,
                p_terms_title: termsTitle,
                p_terms_summary: termsSummary,
                p_terms_body: termsBody
            ),
            accessToken: accessToken
        )
    }

    func updateIntroForm(id: String, status: String, markRead: Bool) async throws {
        struct Row: Encodable {
            let status: String
            let read_at: String?
        }
        try await client.patch(
            table: "intro_responses",
            query: "id=eq.\(id)",
            body: Row(status: status, read_at: markRead ? ISODate.timestamp() : nil),
            accessToken: accessToken
        )
    }

    private func loadAdminApplications() async -> [AdminApplication] {
        let rows: [AdminApplicationDTO] = (try? await client.select(
            table: "chapter_applications",
            query: "select=id,kind,status,organization_name,designation,proposed_university_name,verification_method,institutional_email_verified_at,appeal_count,submitted_at,decided_at,officer_statement,institutional_email,national_contact_name,national_contact_email,fsl_contact_name,fsl_contact_email,applicant_id,applicant_full_name,intended_role,greek_letters,university:universities(name),applicant:profiles!chapter_applications_applicant_id_fkey(display_name,full_name)&status=neq.draft&order=submitted_at.asc.nullslast&limit=80",
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminChapters() async -> [AdminChapterRow] {
        struct Params: Encodable {
            let p_search: AnyJSON
            let p_status: AnyJSON
            let p_limit: Int
            let p_offset: Int
        }
        let rows: [AdminChapterDTO] = (try? await client.rpcEncodable(
            "platform_chapter_overview",
            parameters: Params(p_search: .null, p_status: .null, p_limit: 80, p_offset: 0),
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminBugs() async -> [AdminBug] {
        let rows: [AdminBugDTO] = (try? await client.select(
            table: "bug_reports",
            query: "select=id,number,status,severity,area,page,message,reporter_name,reporter_email,created_at,fix_summary&order=created_at.desc&limit=80",
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminClosures() async -> [AdminClosure] {
        let rows: [AdminClosureDTO] = (try? await client.select(
            table: "chapter_closure_requests",
            query: "select=id,reason,created_at,requester:profiles!chapter_closure_requests_requested_by_fkey(display_name,full_name),chapter:chapters(organization_name,designation,university:universities(name))&status=eq.pending&order=created_at.asc",
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminAudit() async -> [AdminAuditRow] {
        let rows: [AdminAuditDTO] = (try? await client.select(
            table: "audit_logs",
            query: "select=id,chapter_id,actor_id,actor_kind,action,metadata,created_at&or=(chapter_id.is.null,action.like.verification.*,action.like.chapter.status*,action.like.pricing.*)&order=id.desc&limit=50",
            accessToken: accessToken
        )) ?? []
        let actorIds = Array(Set(rows.compactMap(\.actorId)))
        let chapterIds = Array(Set(rows.compactMap(\.chapterId)))
        let names = await displayNames(userIds: actorIds)
        var chapters: [String: String] = [:]
        if !chapterIds.isEmpty {
            let chapterRows: [AdminNamedChapterDTO] = (try? await client.select(
                table: "chapters",
                query: "select=id,organization_name,designation&id=in.(\(chapterIds.joined(separator: ",")))",
                accessToken: accessToken
            )) ?? []
            chapters = Dictionary(uniqueKeysWithValues: chapterRows.map {
                ($0.id, [$0.organizationName, $0.designation].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", "))
            })
        }
        return rows.map { row in
            AdminAuditRow(
                id: String(row.id),
                when: row.createdAt ?? Date(),
                action: LedgerCopy.audit(row.action),
                actor: row.actorId.flatMap { names[$0] } ?? row.actorKind?.replacingOccurrences(of: "_", with: " ").capitalized ?? "System",
                chapter: row.chapterId.flatMap { chapters[$0] } ?? "Platform",
                detail: row.detail
            )
        }
    }

    private func loadAdminRevenue() async -> AdminRevenue? {
        struct Params: Encodable {
            let p_from: String
            let p_to: String
        }
        let from = ISODate.timestamp(Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date())
        guard let row: AdminRevenueDTO = try? await client.rpcEncodable(
            "platform_revenue_summary",
            parameters: Params(p_from: from, p_to: ISODate.timestamp()),
            accessToken: accessToken
        ) else { return nil }
        return row.model
    }

    private func loadAdminReconciliation() async -> [AdminReconRow] {
        struct Params: Encodable { let p_limit: Int }
        let rows: [AdminReconDTO] = (try? await client.rpcEncodable(
            "platform_reconciliation_queue",
            parameters: Params(p_limit: 80),
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminPricing() async -> [AdminPricingRule] {
        let rows: [AdminPricingDTO] = (try? await client.select(
            table: "pricing_rules",
            query: "select=id,code,version,name,platform_fee_bps,platform_fee_fixed_cents,min_fee_cents,max_fee_cents,refund_policy,status,is_default,effective_at&order=effective_at.desc.nullslast&limit=40",
            accessToken: accessToken
        )) ?? []
        let agreements: [AdminAgreementCountDTO] = (try? await client.select(
            table: "chapter_agreements",
            query: "select=pricing_rule_id&superseded_at=is.null",
            accessToken: accessToken
        )) ?? []
        var counts: [String: Int] = [:]
        for row in agreements {
            if let id = row.pricingRuleId { counts[id, default: 0] += 1 }
        }
        return rows.map { row in
            var model = row.model
            model.chapterCount = counts[row.id] ?? 0
            return model
        }
    }

    private func loadAdminPlans() async -> [AdminSaasPlan] {
        let rows: [AdminPlanDTO] = (try? await client.select(
            table: "saas_plans",
            query: "select=code,name,price_cents,billing_interval,active&order=price_cents.asc",
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminReplies() async -> [AdminOutreachReply] {
        let rows: [AdminReplyDTO] = (try? await client.select(
            table: "outreach_emails",
            query: "select=id,from_email,to_email,subject,body,created_at,read_at&direction=eq.reply&order=created_at.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }

    private func loadAdminForms() async -> [AdminIntroForm] {
        let rows: [AdminFormDTO] = (try? await client.select(
            table: "intro_responses",
            query: "select=id,created_at,full_name,role,organization,email,interest,notes,status,read_at,university:universities(name)&order=created_at.desc&limit=40",
            accessToken: accessToken
        )) ?? []
        return rows.map(\.model)
    }
}

enum PublishedPricingClient {
    static func load() async -> PublishedPricing {
        guard let client = try? SupabaseClient(), let key = AppConfig.supabaseAnonKey else {
            return .builtIn
        }
        let plans: [PublishedPlanDTO] = (try? await client.select(
            table: "saas_plans",
            query: "select=name,price_cents,billing_interval,features&code=eq.chapter_monthly&active=eq.true&limit=1",
            accessToken: key
        )) ?? []
        let rules: [PublishedRuleDTO] = (try? await client.select(
            table: "pricing_rules",
            query: "select=platform_fee_bps,platform_fee_fixed_cents,min_fee_cents,max_fee_cents,refund_policy&is_default=eq.true&status=eq.active&limit=1",
            accessToken: key
        )) ?? []
        var pricing = PublishedPricing.builtIn
        if let plan = plans.first {
            pricing.monthlyCents = plan.priceCents ?? pricing.monthlyCents
            pricing.interval = plan.billingInterval ?? pricing.interval
            let extras = ["Card and US bank (ACH) payments", "Installment plans at no extra cost"]
            if let features = plan.featureList, !features.isEmpty {
                pricing.features = features + extras.filter { extra in !features.contains(extra) }
            }
        }
        if let rule = rules.first {
            pricing.feeBps = rule.platformFeeBps ?? pricing.feeBps
            pricing.fixedCents = rule.platformFeeFixedCents ?? 0
            pricing.minCents = rule.minFeeCents
            pricing.maxCents = rule.maxFeeCents
            pricing.refundPolicy = rule.refundPolicy ?? "proportional"
        }
        return pricing
    }
}

private struct PublishedPlanDTO: Decodable {
    let name: String?
    let priceCents: Int?
    let billingInterval: String?
    let features: AnyJSON?

    var featureList: [String]? {
        guard case .array(let items) = features else { return nil }
        let names = items.compactMap { item -> String? in
            if case .string(let value) = item { return value }
            return nil
        }
        return names.isEmpty ? nil : names
    }
}

private struct PublishedRuleDTO: Decodable {
    let platformFeeBps: Int?
    let platformFeeFixedCents: Int?
    let minFeeCents: Int?
    let maxFeeCents: Int?
    let refundPolicy: String?
}

private struct AdminPersonDTO: Decodable {
    let displayName: String?
    let fullName: String?

    var name: String {
        [fullName, displayName].compactMap { $0 }.first { !$0.isEmpty } ?? "Unknown"
    }
}

private struct AdminApplicationDTO: Decodable {
    let id: String
    let kind: ApplicationKind?
    let status: ApplicationStatus?
    let organizationName: String?
    let designation: String?
    let proposedUniversityName: String?
    let verificationMethod: String?
    let institutionalEmailVerifiedAt: Date?
    let appealCount: Int?
    let submittedAt: Date?
    let decidedAt: Date?
    let officerStatement: String?
    let institutionalEmail: String?
    let nationalContactName: String?
    let nationalContactEmail: String?
    let fslContactName: String?
    let fslContactEmail: String?
    let applicantId: String?
    let applicantFullName: String?
    let intendedRole: String?
    let greekLetters: String?
    let university: NamedDTO?
    let applicant: AdminPersonDTO?

    var model: AdminApplication {
        let title = [organizationName, designation].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        let school = university?.name ?? proposedUniversityName ?? "No school"
        let national = [nationalContactName, nationalContactEmail].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let fsl = [fslContactName, fslContactEmail].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return AdminApplication(
            id: id,
            kind: kind ?? .newChapter,
            status: status ?? .pendingVerification,
            title: title.isEmpty ? "Untitled application" : title,
            university: school,
            applicantName: applicant?.name ?? applicantFullName ?? "Applicant",
            applicantId: applicantId ?? "",
            method: (verificationMethod ?? "not chosen").replacingOccurrences(of: "_", with: " "),
            emailVerified: institutionalEmailVerifiedAt != nil,
            appealCount: appealCount ?? 0,
            submittedAt: submittedAt,
            decidedAt: decidedAt,
            statement: officerStatement ?? "",
            institutionalEmail: institutionalEmail ?? "",
            intendedRole: (intendedRole ?? "not given").replacingOccurrences(of: "_", with: " "),
            nationalContact: national,
            fslContact: fsl,
            greekLetters: greekLetters ?? ""
        )
    }
}

private struct AdminChapterDTO: Decodable {
    let id: String
    let slug: String?
    let organizationName: String?
    let designation: String?
    let university: String?
    let status: ChapterStatus?
    let verifiedAt: Date?
    let activeMembers: FlexibleInt?
    let subscriptionStatus: String?
    let paymentsEnabled: Bool?

    var model: AdminChapterRow {
        AdminChapterRow(
            id: id,
            slug: slug ?? "",
            name: [organizationName, designation].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", "),
            university: university ?? "—",
            status: status ?? .unclaimed,
            members: activeMembers?.value ?? 0,
            subscription: subscriptionStatus ?? "none",
            paymentsEnabled: paymentsEnabled ?? false,
            verifiedAt: verifiedAt
        )
    }
}

private struct AdminBugDTO: Decodable {
    let id: String
    let number: Int?
    let status: String?
    let severity: String?
    let area: String?
    let page: String?
    let message: String
    let reporterName: String?
    let reporterEmail: String?
    let createdAt: Date?
    let fixSummary: String?

    var model: AdminBug {
        AdminBug(
            id: id,
            number: number ?? 0,
            status: status ?? "new",
            severity: severity ?? "medium",
            area: area ?? "other",
            page: page ?? "/",
            message: message,
            reporter: reporterName ?? "Anonymous",
            email: reporterEmail ?? "",
            createdAt: createdAt ?? Date(),
            fixSummary: fixSummary ?? ""
        )
    }
}

private struct AdminClosureDTO: Decodable {
    let id: String
    let reason: String
    let createdAt: Date?
    let requester: AdminPersonDTO?
    let chapter: AdminClosureChapterDTO?

    var model: AdminClosure {
        AdminClosure(
            id: id,
            chapterName: chapter?.label ?? "Chapter",
            university: chapter?.university?.name ?? "",
            requester: requester?.name ?? "Officer",
            reason: reason,
            createdAt: createdAt ?? Date()
        )
    }
}

private struct AdminClosureChapterDTO: Decodable {
    let organizationName: String?
    let designation: String?
    let university: NamedDTO?

    var label: String {
        let text = [organizationName, designation].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return text.isEmpty ? "Chapter" : text
    }
}

private struct AdminAuditDTO: Decodable {
    let id: Int
    let chapterId: String?
    let actorId: String?
    let actorKind: String?
    let action: String
    let metadata: AnyJSON?
    let createdAt: Date?

    var detail: String {
        guard case .object(let object) = metadata else { return "" }
        return ["reason", "status", "name", "code", "toStatus"].compactMap { key in
            switch object[key] {
            case .string(let value): return value
            default: return nil
            }
        }.joined(separator: " · ")
    }
}

private struct AdminNamedChapterDTO: Decodable {
    let id: String
    let organizationName: String?
    let designation: String?
}

private struct AdminRevenueDTO: Decodable {
    let eligibleVolumeCents: FlexibleInt?
    let platformFeesCents: FlexibleInt?
    let feeRefundsCents: FlexibleInt?
    let refundedVolumeCents: FlexibleInt?
    let disputesOpened: FlexibleInt?
    let paymentsCount: FlexibleInt?
    let mismatches: FlexibleInt?
    let saasRevenueCents: FlexibleInt?
    let activeSubscriptions: FlexibleInt?
    let byChapter: [AdminRevenueChapterDTO]?

    var model: AdminRevenue {
        AdminRevenue(
            saasCents: saasRevenueCents?.value ?? 0,
            feesCents: platformFeesCents?.value ?? 0,
            feeRefundsCents: feeRefundsCents?.value ?? 0,
            volumeCents: eligibleVolumeCents?.value ?? 0,
            payments: paymentsCount?.value ?? 0,
            subscriptions: activeSubscriptions?.value ?? 0,
            mismatches: mismatches?.value ?? 0,
            refundedVolumeCents: refundedVolumeCents?.value ?? 0,
            disputes: disputesOpened?.value ?? 0,
            chapters: (byChapter ?? []).map(\.model)
        )
    }
}

private struct AdminRevenueChapterDTO: Decodable {
    let chapterId: String?
    let chapter: String?
    let university: String?
    let volumeCents: FlexibleInt?
    let feesCents: FlexibleInt?
    let payments: FlexibleInt?

    var model: AdminRevenueChapter {
        AdminRevenueChapter(
            id: chapterId ?? UUID().uuidString,
            name: chapter ?? "Chapter",
            university: university ?? "",
            volumeCents: volumeCents?.value ?? 0,
            feesCents: feesCents?.value ?? 0,
            payments: payments?.value ?? 0
        )
    }
}

private struct AdminReconDTO: Decodable {
    let paymentId: String
    let chapter: String?
    let status: String?
    let amountCents: FlexibleInt?
    let platformFeeCents: FlexibleInt?
    let applicationFeeCents: FlexibleInt?
    let reconciliationStatus: String?
    let reconciliationNote: String?
    let createdAt: Date?

    var model: AdminReconRow {
        let issue: String
        if reconciliationStatus == "mismatch" {
            issue = "Amount mismatch"
        } else if status == "processing" {
            issue = "Still processing"
        } else {
            issue = "Fee not synced"
        }
        return AdminReconRow(
            id: paymentId,
            chapter: chapter ?? "Chapter",
            issue: issue,
            amountCents: amountCents?.value ?? 0,
            expectedFeeCents: platformFeeCents?.value ?? 0,
            stripeFeeCents: applicationFeeCents?.value,
            createdAt: createdAt ?? Date(),
            note: reconciliationNote ?? ""
        )
    }
}

private struct AdminPricingDTO: Decodable {
    let id: String
    let code: String?
    let version: Int?
    let name: String?
    let platformFeeBps: Int?
    let platformFeeFixedCents: Int?
    let minFeeCents: Int?
    let maxFeeCents: Int?
    let refundPolicy: String?
    let status: String?
    let isDefault: Bool?
    let effectiveAt: Date?

    var model: AdminPricingRule {
        AdminPricingRule(
            id: id,
            name: name ?? "Rule",
            code: code ?? "",
            version: version ?? 1,
            bps: platformFeeBps ?? 0,
            fixedCents: platformFeeFixedCents ?? 0,
            minCents: minFeeCents,
            maxCents: maxFeeCents,
            refundPolicy: refundPolicy ?? "proportional",
            isDefault: isDefault ?? false,
            status: status ?? "active",
            effectiveAt: effectiveAt,
            chapterCount: 0
        )
    }
}

private struct AdminAgreementCountDTO: Decodable {
    let pricingRuleId: String?
}

private struct AdminPlanDTO: Decodable {
    let code: String
    let name: String?
    let priceCents: Int?
    let billingInterval: String?
    let active: Bool?

    var model: AdminSaasPlan {
        AdminSaasPlan(
            id: code,
            name: name ?? code,
            priceCents: priceCents ?? 3000,
            interval: billingInterval ?? "month",
            active: active ?? false
        )
    }
}

private struct AdminReplyDTO: Decodable {
    let id: String
    let fromEmail: String?
    let toEmail: String?
    let subject: String?
    let body: String?
    let createdAt: Date?
    let readAt: Date?

    var model: AdminOutreachReply {
        AdminOutreachReply(
            id: id,
            from: fromEmail ?? "Unknown sender",
            subject: (subject?.isEmpty == false ? subject : nil) ?? "(no subject)",
            preview: String((body ?? "").prefix(160)),
            createdAt: createdAt ?? Date(),
            unread: readAt == nil
        )
    }
}

private enum AdminEmailStatsBuilder {
    static func build(
        emails: [AdminStatEmailDTO],
        contacts: [AdminStatContactDTO],
        submissions: [AdminStatFormDTO],
        blocked: Int,
        since: Date?,
        chartStart: Date,
        rangeDays: Int?
    ) -> AdminEmailStats {
        let sentStatuses: Set<String> = ["sent", "delivered", "bounced"]
        let inRange = emails.filter { email in
            guard let since else { return true }
            guard let at = email.occurred else { return false }
            return at >= since
        }
        let sent = inRange.filter { $0.direction == "sent" && sentStatuses.contains($0.status ?? "") }
        let failed = inRange.filter { $0.direction == "sent" && $0.status == "failed" }.count
        let replies = inRange.filter { $0.direction == "reply" }
        let delivered = sent.filter { $0.delivered != nil }.count
        let opened = sent.filter { $0.opened != nil }.count
        let clicked = sent.filter { $0.clicked != nil }.count
        let bounced = sent.filter { $0.status == "bounced" }.count
        let emailed = Set(sent.compactMap(\.contactId))
        let heardBack = Set(replies.compactMap(\.contactId))
        let emailedAndReplied = emailed.intersection(heardBack).count
        let deliveredTo = Set(sent.filter { $0.delivered != nil }.compactMap(\.contactId))
        let openedBy = Set(sent.filter { $0.opened != nil }.compactMap(\.contactId))
        let contactById = Dictionary(uniqueKeysWithValues: contacts.map { ($0.id, $0) })
        let submittedEmails = Set(submissions.compactMap { $0.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty })
        let formFromEmailed = emailed.filter { id in
            guard let email = contactById[id]?.emailNormalized?.lowercased() else { return false }
            return submittedEmails.contains(email)
        }.count
        let schools = Set(emailed.compactMap { id -> String? in
            let contact = contactById[id]
            let key = contact?.universityId ?? contact?.university
            return (key?.isEmpty == false) ? key : nil
        })
        let replyMs: [Double] = contacts.compactMap { contact in
            guard let first = contact.firstSent, let replied = contact.replied, replied > first else { return nil }
            if let since, replied < since { return nil }
            return replied.timeIntervalSince(first) * 1000
        }
        let sortedTimes = replyMs.sorted()
        let medianMs: Double? = {
            guard !sortedTimes.isEmpty else { return nil }
            let middle = sortedTimes.count / 2
            if sortedTimes.count % 2 == 1 { return sortedTimes[middle] }
            return (sortedTimes[middle - 1] + sortedTimes[middle]) / 2
        }()
        let weekLength: TimeInterval = 7 * 24 * 60 * 60
        var weeks = (0..<12).map { index in
            AdminEmailWeek(start: chartStart.addingTimeInterval(Double(index) * weekLength), sent: 0, replies: 0)
        }
        for email in emails {
            guard let at = email.occurred, at >= chartStart else { continue }
            let index = min(11, max(0, Int(at.timeIntervalSince(chartStart) / weekLength)))
            if email.direction == "sent" && sentStatuses.contains(email.status ?? "") {
                weeks[index].sent += 1
            }
            if email.direction == "reply" {
                weeks[index].replies += 1
            }
        }
        var bySchool: [String: AdminEmailSchool] = [:]
        for id in emailed {
            guard let contact = contactById[id] else { continue }
            let key = contact.universityId ?? contact.university ?? "unknown"
            var entry = bySchool[key] ?? AdminEmailSchool(id: key, name: contact.university ?? "Unknown school", emailed: 0, opened: 0, replied: 0, forms: 0)
            entry.emailed += 1
            if openedBy.contains(id) { entry.opened += 1 }
            if heardBack.contains(id) { entry.replied += 1 }
            if let email = contact.emailNormalized?.lowercased(), submittedEmails.contains(email) { entry.forms += 1 }
            bySchool[key] = entry
        }
        let topSchools = bySchool.values.sorted {
            if $0.replied != $1.replied { return $0.replied > $1.replied }
            if $0.forms != $1.forms { return $0.forms > $1.forms }
            if $0.emailed != $1.emailed { return $0.emailed > $1.emailed }
            return $0.name < $1.name
        }.prefix(10).map { $0 }
        return AdminEmailStats(
            rangeDays: rangeDays,
            sent: sent.count,
            failed: failed,
            people: emailed.count,
            schools: schools.count,
            heardBack: heardBack.count,
            replies: replies.count,
            forms: submissions.count,
            demos: submissions.filter { $0.interest == "demo" }.count,
            delivered: delivered,
            opened: opened,
            clicked: clicked,
            bounced: bounced,
            blocked: blocked,
            unread: contacts.reduce(0) { $0 + ($1.unreadReplies ?? 0) },
            emailedAndReplied: emailedAndReplied,
            deliveredTo: deliveredTo.count,
            openedBy: openedBy.count,
            formFromEmailed: formFromEmailed,
            medianReplyMinutes: medianMs.map { Int(($0 / 60_000).rounded()) },
            fastestReplyMinutes: sortedTimes.min().map { Int(($0 / 60_000).rounded()) },
            weeks: weeks,
            topSchools: Array(topSchools)
        )
    }
}

private struct AdminStatEmailDTO: Decodable {
    let contactId: String?
    let direction: String?
    let status: String?
    let occurredAt: String?
    let deliveredAt: String?
    let openedAt: String?
    let clickedAt: String?

    var occurred: Date? { occurredAt.flatMap(ISODate.parse) }
    var delivered: Date? { deliveredAt.flatMap(ISODate.parse) }
    var opened: Date? { openedAt.flatMap(ISODate.parse) }
    var clicked: Date? { clickedAt.flatMap(ISODate.parse) }
}

private struct AdminStatContactDTO: Decodable {
    let id: String
    let emailNormalized: String?
    let university: String?
    let universityId: String?
    let firstSentAt: String?
    let repliedAt: String?
    let doNotContact: Bool?
    let unreadReplies: Int?

    var firstSent: Date? { firstSentAt.flatMap(ISODate.parse) }
    var replied: Date? { repliedAt.flatMap(ISODate.parse) }
}

private struct AdminStatFormDTO: Decodable {
    let email: String?
    let createdAt: String?
    let interest: String?
}

private struct AdminFormDTO: Decodable {
    let id: String
    let createdAt: Date?
    let fullName: String?
    let role: String?
    let organization: String?
    let email: String?
    let interest: String?
    let notes: String?
    let status: String?
    let readAt: Date?
    let university: NamedDTO?

    var model: AdminIntroForm {
        AdminIntroForm(
            id: id,
            name: fullName ?? "Contact",
            organization: organization ?? "",
            role: role ?? "",
            email: email ?? "",
            school: university?.name ?? "",
            interest: interest ?? "",
            notes: notes ?? "",
            status: status ?? "new",
            unread: readAt == nil,
            createdAt: createdAt ?? Date()
        )
    }
}
