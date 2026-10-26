import Foundation

enum SampleData {
    static let user = SessionUser(id: "user-jordan", email: "jordan@state.edu")

    static let profile = Profile(
        id: "user-jordan",
        displayName: "Jordan",
        fullName: "Jordan Lee",
        avatarPath: nil,
        graduationYear: 2027
    )

    static let chapter = ChapterSummary(
        id: "ch-alpha-beta",
        slug: "sample-chapter",
        organizationName: "Alpha Beta",
        designation: "Alpha Chapter",
        greekLetters: "ΑΒ",
        status: .verified,
        timezone: "America/Chicago",
        currency: "usd",
        modules: [
            .recruitment: true,
            .philanthropy: true,
            .housing: true,
            .standards: true,
            .academics: true
        ],
        university: University(name: "State University")
    )

    static let membership = Membership(id: "mem-jordan", memberClass: .active, status: .active)

    static let officerPermissions: Set<Permission> = Set(Permission.allCases)

    static let myChapter = MyChapter(
        id: chapter.id,
        slug: chapter.slug,
        organizationName: chapter.organizationName,
        designation: chapter.designation,
        greekLetters: chapter.greekLetters,
        status: chapter.status,
        timezone: chapter.timezone,
        universityName: chapter.universityName,
        memberClass: .active,
        membershipId: membership.id,
        balanceCents: 18_500,
        processingCents: 0,
        nextDueDate: Calendar.current.date(byAdding: .day, value: 12, to: Date())
    )

    static let events: [ChapterEvent] = {
        let cal = Calendar.current
        let now = Date()
        return [
            ChapterEvent(
                id: "evt-meeting",
                chapterId: chapter.id,
                title: "Chapter meeting",
                startsAt: cal.date(byAdding: .day, value: 2, to: now) ?? now,
                endsAt: cal.date(byAdding: .day, value: 2, to: now)?.addingTimeInterval(5400) ?? now,
                location: "Chapter house, great room",
                attendanceRequired: true,
                timezone: chapter.timezone,
                details: "Weekly business meeting. Formal RSVPs are open.",
                rsvp: "going"
            ),
            ChapterEvent(
                id: "evt-foodbank",
                chapterId: chapter.id,
                title: "Food bank shift",
                startsAt: cal.date(byAdding: .day, value: 5, to: now) ?? now,
                endsAt: cal.date(byAdding: .day, value: 5, to: now)?.addingTimeInterval(10_800) ?? now,
                location: "Community Food Bank",
                attendanceRequired: false,
                timezone: chapter.timezone,
                details: "Service hours count toward the philanthropy requirement.",
                rsvp: nil
            ),
            ChapterEvent(
                id: "evt-formal",
                chapterId: chapter.id,
                title: "Spring formal",
                startsAt: cal.date(byAdding: .day, value: 21, to: now) ?? now,
                endsAt: cal.date(byAdding: .day, value: 21, to: now)?.addingTimeInterval(14_400) ?? now,
                location: "The Grand Hall",
                attendanceRequired: false,
                timezone: chapter.timezone,
                details: "Black tie optional. RSVP by Friday.",
                rsvp: "maybe"
            )
        ]
    }()

    static let announcements: [Announcement] = [
        Announcement(
            id: "ann-1",
            title: "Chapter meeting moved to 7:30 Sunday",
            body: "Same room. Please be on time so we can vote on the formal budget.",
            pinned: true,
            requiresAck: true,
            publishedAt: Date().addingTimeInterval(-7200),
            author: "Marcus Hill",
            audience: "All members"
        ),
        Announcement(
            id: "ann-2",
            title: "Formal RSVPs are open",
            body: "Please RSVP in Events by Friday so we can lock the headcount.",
            pinned: false,
            requiresAck: false,
            publishedAt: Date().addingTimeInterval(-3600),
            author: "Devin Ortiz",
            audience: "All members"
        )
    ]

    static let members: [DirectoryMember] = [
        DirectoryMember(id: "user-jordan", membershipId: "mem-jordan", name: "Jordan Lee", email: "jordan@state.edu", memberClass: .active, status: .active, roles: ["Member"], graduationYear: 2027, house: "Chapter house"),
        DirectoryMember(id: "m-marcus", membershipId: "mem-marcus", name: "Marcus Hill", email: "marcus@state.edu", memberClass: .active, status: .active, roles: ["President"], graduationYear: 2026, house: "Chapter house"),
        DirectoryMember(id: "m-devin", membershipId: "mem-devin", name: "Devin Ortiz", email: "devin@state.edu", memberClass: .active, status: .active, roles: ["Treasurer"], graduationYear: 2026, house: "Chapter house"),
        DirectoryMember(id: "m-chris", membershipId: "mem-chris", name: "Chris Nguyen", email: "chris@state.edu", memberClass: .active, status: .active, roles: ["Philanthropy chair"], graduationYear: 2027, house: nil),
        DirectoryMember(id: "m-sam", membershipId: "mem-sam", name: "Sam Patel", email: "sam@state.edu", memberClass: .active, status: .active, roles: ["Recruitment chair"], graduationYear: 2028, house: nil),
        DirectoryMember(id: "m-tyler", membershipId: "mem-tyler", name: "Tyler Brooks", email: "tyler@state.edu", memberClass: .newMember, status: .active, roles: [], graduationYear: 2029, house: nil)
    ]

    static let charges: [DuesCharge] = [
        DuesCharge(
            id: "chg-spring",
            title: "Spring dues",
            category: "Dues",
            amountCents: 45_000,
            outstandingCents: 18_500,
            processingCents: 0,
            dueDate: Calendar.current.date(byAdding: .day, value: 12, to: Date()) ?? Date(),
            status: "open",
            allowInstallments: true,
            maxInstallments: 3
        )
    ]

    static let payments: [PaymentRecord] = [
        PaymentRecord(id: "pay-1", title: "Spring dues", method: "Card", status: .succeeded, amountCents: 26_500, createdAt: Date().addingTimeInterval(-86400 * 20), receiptNumber: "GG-1042"),
        PaymentRecord(id: "pay-2", title: "Fall dues", method: "Bank transfer", status: .succeeded, amountCents: 45_000, createdAt: Date().addingTimeInterval(-86400 * 110), receiptNumber: "GG-0988")
    ]

    static let reimbursements: [Reimbursement] = [
        Reimbursement(id: "re-1", title: "Costco supplies for formal", amountCents: 8_432, status: "In review", submittedAt: Date().addingTimeInterval(-86400 * 2), requester: "Chris Nguyen"),
        Reimbursement(id: "re-2", title: "Gas for food bank vans", amountCents: 4_600, status: "Approved", submittedAt: Date().addingTimeInterval(-86400 * 9), requester: "Jordan Lee")
    ]

    static let conversations: [Conversation] = [
        Conversation(
            id: "devin",
            kind: .direct,
            title: "Devin Ortiz",
            subtitle: "Direct message",
            unread: 1,
            messages: [
                ChatMessage(id: "d1", from: "Devin Ortiz", body: "Can you look over the formal budget before Sunday?", time: "4:51 PM", reactions: [:], pinned: false, edited: false)
            ]
        ),
        Conversation(
            id: "general",
            kind: .channel,
            title: "General",
            subtitle: "48 members",
            unread: 0,
            messages: [
                ChatMessage(id: "g1", from: "Marcus Hill", body: "Chapter meeting moved to 7:30 Sunday. Same room.", time: "6:02 PM", reactions: ["+1": ["Devin Ortiz", "Chris Nguyen", "Sam Patel", "Tyler Brooks"], "check": ["Sam Patel"]], pinned: true, edited: false),
                ChatMessage(id: "g2", from: "Chris Nguyen", body: "Who's driving to the food bank Saturday? I have 3 seats.", time: "6:14 PM", reactions: ["heart": ["Marcus Hill"]], pinned: false, edited: false),
                ChatMessage(id: "g3", from: "Devin Ortiz", body: "Formal RSVPs are open in Events. Please RSVP by Friday.", time: "6:21 PM", reactions: ["+1": ["Marcus Hill", "Jordan Lee"]], pinned: false, edited: false)
            ]
        ),
        Conversation(
            id: "exec",
            kind: .restricted,
            title: "Executive board",
            subtitle: "Officers",
            unread: 2,
            messages: [
                ChatMessage(id: "e1", from: "Marcus Hill", body: "Let's review the formal budget before Sunday.", time: "5:44 PM", reactions: [:], pinned: false, edited: false)
            ]
        )
    ]

    static let prospects: [Prospect] = [
        Prospect(id: "p1", name: "Alex Rivera", stageId: "s2", stage: "Invite", outcome: "open", school: "State University", assignedTo: "Sam Patel", lastActivity: "Coffee tomorrow"),
        Prospect(id: "p2", name: "Casey Morgan", stageId: "s1", stage: "Meet", outcome: "open", school: "State University", assignedTo: "Jordan Lee", lastActivity: "Came to philanthropy"),
        Prospect(id: "p3", name: "Riley Chen", stageId: "s3", stage: "Bid", outcome: "offered", school: "State University", assignedTo: "Marcus Hill", lastActivity: "Bid ready")
    ]

    static let ledger: [LedgerEntry] = [
        LedgerEntry(id: "l1", date: Date().addingTimeInterval(-86400 * 2), memo: "Spring dues · Jordan Lee", debitCents: 18_500, creditCents: 0, account: "Accounts receivable"),
        LedgerEntry(id: "l2", date: Date().addingTimeInterval(-86400 * 20), memo: "Card payment · Spring dues", debitCents: 0, creditCents: 26_500, account: "Stripe clearing"),
        LedgerEntry(id: "l3", date: Date().addingTimeInterval(-86400 * 21), memo: "Platform fee 1.5%", debitCents: 398, creditCents: 0, account: "Platform fees")
    ]

    static let serviceHours: [ServiceHour] = [
        ServiceHour(id: "sh1", member: "Chris Nguyen", hours: 3, event: "Food bank", status: "Approved", date: Date().addingTimeInterval(-86400 * 8)),
        ServiceHour(id: "sh2", member: "Jordan Lee", hours: 2, event: "Campus cleanup", status: "In review", date: Date().addingTimeInterval(-86400 * 1))
    ]

    static let chores: [HousingChore] = [
        HousingChore(id: "c1", title: "Kitchen close", assignee: "Tyler Brooks", due: "Tonight", done: false),
        HousingChore(id: "c2", title: "Take out recycling", assignee: "Jordan Lee", due: "Sunday", done: true),
        HousingChore(id: "c3", title: "Vacuum great room", assignee: "Sam Patel", due: "Monday", done: false)
    ]

    static let policies: [PolicyDoc] = [
        PolicyDoc(id: "pol1", title: "Anti-hazing policy", version: "2026.1", acknowledged: true),
        PolicyDoc(id: "pol2", title: "House rules", version: "2026.2", acknowledged: false),
        PolicyDoc(id: "pol3", title: "Social event guidelines", version: "2026.1", acknowledged: false)
    ]

    static let studyGroups: [StudyGroup] = [
        StudyGroup(id: "sg1", title: "Organic chemistry", course: "CHEM 2100", nextMeeting: "Tue 7:00 PM", members: 6),
        StudyGroup(id: "sg2", title: "Microeconomics", course: "ECON 1015", nextMeeting: "Thu 6:30 PM", members: 4)
    ]

    static let officerStats: [OfficerStat] = [
        OfficerStat(id: "os1", label: "Dues outstanding", value: "$1,240", tone: .warning),
        OfficerStat(id: "os2", label: "RSVPs this week", value: "31 / 48", tone: .info),
        OfficerStat(id: "os3", label: "Open prospects", value: "12", tone: .accent),
        OfficerStat(id: "os4", label: "Unacknowledged policies", value: "9", tone: .danger)
    ]

    static let notifications: [AppNotification] = [
        AppNotification(id: "n1", title: "Chapter meeting moved to 7:30 Sunday", body: "Same room.", createdAt: Date().addingTimeInterval(-5400), readAt: nil, link: "announcements"),
        AppNotification(id: "n2", title: "Spring dues due in 12 days", body: "$185.00 remaining.", createdAt: Date().addingTimeInterval(-20_000), readAt: nil, link: "dues"),
        AppNotification(id: "n3", title: "Devin Ortiz mentioned you", body: "", createdAt: Date().addingTimeInterval(-40_000), readAt: Date(), link: "chat", kind: "chat_mention")
    ]

    static let applications: [ChapterApplication] = []

    static func context() -> ChapterContext {
        ChapterContext(
            chapter: chapter,
            membership: membership,
            permissions: officerPermissions,
            balance: MemberBalance(balanceCents: 18_500, processingCents: 0, nextDueDate: myChapter.nextDueDate),
            events: events,
            announcements: announcements,
            members: members,
            charges: charges,
            payments: payments,
            reimbursements: reimbursements,
            conversations: conversations,
            prospects: prospects,
            stages: [
                RecruitmentStage(id: "s1", name: "Meet", position: 1, outcome: "open"),
                RecruitmentStage(id: "s2", name: "Invite", position: 2, outcome: "open"),
                RecruitmentStage(id: "s3", name: "Bid", position: 3, outcome: "offered")
            ],
            ledger: ledger,
            serviceHours: serviceHours,
            chores: chores,
            policies: policies,
            studyGroups: studyGroups,
            officerStats: officerStats,
            unreadMessages: 3,
            canCollect: true,
            finance: FinanceSnapshot(outstandingCents: 18_500, collectedCents: 71_500, processingCents: 0),
            financeSummary: FinanceSummary(collectedOnlineCents: 71_500, outstandingCents: 18_500),
            memberBalances: [],
            assessments: [],
            chapterPayments: payments,
            chapterReimbursements: reimbursements,
            budgetLines: [],
            expenses: [],
            monthlyCollections: [],
            engagement: EngagementSummary(activeMembers: 6),
            setupSteps: [],
            roles: [],
            invitations: [],
            auditLogs: [],
            billing: BillingSnapshot(subscription: "active", canCollect: true),
            rooms: [],
            campaigns: [],
            profileDetails: ChapterProfileDetails(description: "Campus chapter.")
        )
    }
}
