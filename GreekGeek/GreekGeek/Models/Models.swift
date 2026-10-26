import Foundation

enum Permission: String, CaseIterable, Codable, Hashable {
    case chapterManage = "chapter.manage"
    case chapterOwnership = "chapter.ownership"
    case membersManage = "members.manage"
    case rolesManage = "roles.manage"
    case committeesManage = "committees.manage"
    case financeView = "finance.view"
    case financeManage = "finance.manage"
    case financeRefund = "finance.refund"
    case paymentsConfigure = "payments.configure"
    case chatManage = "chat.manage"
    case chatModerate = "chat.moderate"
    case announcementsPublish = "announcements.publish"
    case announcementsOfficers = "announcements.officers"
    case eventsManage = "events.manage"
    case attendanceView = "attendance.view"
    case attendanceManage = "attendance.manage"
    case recruitmentView = "recruitment.view"
    case recruitmentManage = "recruitment.manage"
    case philanthropyManage = "philanthropy.manage"
    case housingManage = "housing.manage"
    case standardsView = "standards.view"
    case standardsManage = "standards.manage"
    case academicsManage = "academics.manage"
    case analyticsView = "analytics.view"
    case auditView = "audit.view"
}

enum ChapterModule: String, CaseIterable, Codable, Identifiable {
    case recruitment
    case philanthropy
    case housing
    case standards
    case academics

    var id: String { rawValue }

    var title: String {
        switch self {
        case .recruitment: return "Recruitment"
        case .philanthropy: return "Philanthropy"
        case .housing: return "Housing"
        case .standards: return "Standards"
        case .academics: return "Academics"
        }
    }
}

enum MemberClass: String, Codable, CaseIterable {
    case newMember = "new_member"
    case active
    case associate
    case alumni

    var label: String {
        switch self {
        case .newMember: return "New member"
        case .active: return "Active"
        case .associate: return "Associate"
        case .alumni: return "Alumni"
        }
    }
}

enum MembershipStatus: String, Codable, CaseIterable {
    case active
    case inactive
    case suspended
    case ended

    var label: String {
        switch self {
        case .active: return "Active"
        case .inactive: return "Inactive"
        case .suspended: return "Suspended"
        case .ended: return "Former member"
        }
    }
}

enum ChapterStatus: String, Codable {
    case verified
    case unclaimed
    case suspended
    case closed
    case pending

    var label: String {
        switch self {
        case .verified: return "Verified"
        case .unclaimed: return "Unclaimed"
        case .suspended: return "Suspended"
        case .closed: return "Closed"
        case .pending: return "Pending"
        }
    }

    var tone: Tone {
        switch self {
        case .verified: return .positive
        case .suspended: return .danger
        case .unclaimed, .closed, .pending: return .neutral
        }
    }
}

enum StaffRole: String, Codable {
    case admin
    case reviewer
    case support
    case finance

    var label: String {
        switch self {
        case .admin: return "Administrator"
        case .reviewer: return "Reviewer"
        case .support: return "Support"
        case .finance: return "Finance"
        }
    }

    func can(_ capability: AdminCapability) -> Bool {
        if self == .admin { return true }
        switch capability {
        case .verification: return self == .reviewer
        case .chapters: return self == .support || self == .reviewer || self == .finance
        case .financeTools: return self == .finance
        case .bugs: return self == .support
        case .adminOnly: return false
        }
    }
}

enum AdminCapability {
    case verification
    case chapters
    case financeTools
    case bugs
    case adminOnly
}

enum ApplicationStatus: String, Codable {
    case draft
    case pendingVerification = "pending_verification"
    case infoRequested = "info_requested"
    case verified
    case rejected
    case suspended
    case withdrawn

    var label: String {
        switch self {
        case .draft: return "Draft"
        case .pendingVerification: return "Under review"
        case .infoRequested: return "Information requested"
        case .verified: return "Verified"
        case .rejected: return "Not approved"
        case .suspended: return "Suspended"
        case .withdrawn: return "Withdrawn"
        }
    }

    var tone: Tone {
        switch self {
        case .draft, .withdrawn: return .neutral
        case .pendingVerification: return .info
        case .infoRequested: return .warning
        case .verified: return .positive
        case .rejected, .suspended: return .danger
        }
    }
}

enum ApplicationKind: String, Codable {
    case newChapter = "new_chapter"
    case claimExisting = "claim_existing"
    case recovery

    var label: String {
        switch self {
        case .newChapter: return "New chapter"
        case .claimExisting: return "Claim a listed chapter"
        case .recovery: return "Recover administrator access"
        }
    }
}

enum PaymentStatus: String, Codable {
    case pending
    case processing
    case succeeded
    case failed
    case canceled
    case partiallyRefunded = "partially_refunded"
    case refunded
    case disputed
    case disputeLost = "dispute_lost"

    var label: String {
        switch self {
        case .pending: return "Awaiting payment"
        case .processing: return "Processing"
        case .succeeded: return "Paid"
        case .failed: return "Failed"
        case .canceled: return "Canceled"
        case .partiallyRefunded: return "Partially refunded"
        case .refunded: return "Refunded"
        case .disputed: return "Disputed"
        case .disputeLost: return "Dispute lost"
        }
    }

    var tone: Tone {
        switch self {
        case .succeeded: return .positive
        case .processing: return .info
        case .failed, .disputeLost, .disputed: return .danger
        case .partiallyRefunded, .refunded: return .warning
        default: return .neutral
        }
    }
}

enum ConversationKind: String, Codable {
    case direct
    case channel
    case restricted
    case chapterMain = "chapter_main"
    case announcement
    case exec
    case committee

    var isDirect: Bool { self == .direct }
}

struct SessionUser: Identifiable, Hashable {
    let id: String
    var email: String
}

struct Profile: Identifiable, Hashable {
    let id: String
    var displayName: String?
    var fullName: String?
    var avatarPath: String?
    var graduationYear: Int?
    var phone: String? = nil

    var personName: String {
        if let displayName, !displayName.isEmpty { return displayName }
        if let fullName, !fullName.isEmpty { return fullName }
        return "Member"
    }

    var firstName: String {
        if let displayName, !displayName.isEmpty { return displayName }
        return fullName?.split(separator: " ").first.map(String.init) ?? ""
    }
}

struct University: Hashable {
    var name: String
}

struct ChapterSummary: Identifiable, Hashable {
    let id: String
    var slug: String
    var organizationName: String
    var designation: String?
    var greekLetters: String?
    var status: ChapterStatus
    var timezone: String
    var currency: String
    var modules: [ChapterModule: Bool]
    var university: University?

    var universityName: String? { university?.name }

    func isEnabled(_ module: ChapterModule) -> Bool {
        modules[module] ?? false
    }
}

struct Membership: Identifiable, Hashable {
    let id: String
    var memberClass: MemberClass
    var status: MembershipStatus
}

struct MyChapter: Identifiable, Hashable {
    let id: String
    var slug: String
    var organizationName: String
    var designation: String?
    var greekLetters: String?
    var status: ChapterStatus
    var timezone: String
    var universityName: String?
    var memberClass: MemberClass
    var membershipId: String
    var balanceCents: Int
    var processingCents: Int
    var nextDueDate: Date?
}

struct MemberBalance: Hashable {
    var balanceCents: Int
    var processingCents: Int
    var nextDueDate: Date?
}

struct ChapterEvent: Identifiable, Hashable {
    let id: String
    var chapterId: String
    var title: String
    var startsAt: Date
    var endsAt: Date
    var location: String?
    var attendanceRequired: Bool
    var timezone: String
    var details: String?
    var rsvp: String?
}

struct Announcement: Identifiable, Hashable {
    let id: String
    var title: String
    var body: String
    var pinned: Bool
    var requiresAck: Bool
    var publishedAt: Date
    var author: String
    var audience: String
}

struct MemberRoleAssignment: Identifiable, Hashable {
    let id: String
    var name: String
}

struct DirectoryMember: Identifiable, Hashable {
    let id: String
    var membershipId: String
    var name: String
    var email: String
    var memberClass: MemberClass
    var status: MembershipStatus
    var roles: [String]
    var roleAssignments: [MemberRoleAssignment] = []
    var graduationYear: Int?
    var house: String?
    var avatarPath: String?
}

struct DuesCharge: Identifiable, Hashable {
    let id: String
    var title: String
    var category: String
    var amountCents: Int
    var outstandingCents: Int
    var processingCents: Int
    var dueDate: Date
    var status: String
    var allowInstallments: Bool
    var maxInstallments: Int
}

struct PaymentRecord: Identifiable, Hashable {
    let id: String
    var title: String
    var method: String
    var status: PaymentStatus
    var amountCents: Int
    var createdAt: Date
    var receiptNumber: String?
}

struct Reimbursement: Identifiable, Hashable {
    let id: String
    var title: String
    var amountCents: Int
    var status: String
    var submittedAt: Date
    var requester: String
}

struct ChatMessage: Identifiable, Hashable {
    let id: String
    var conversationId: String = ""
    var senderId: String = ""
    var from: String
    var body: String
    var createdAt: Date = Date()
    var time: String
    var reactions: [String: [String]]
    var pinned: Bool
    var edited: Bool
    var pending: Bool = false
    var replyToId: String? = nil
    var replyFrom: String? = nil
    var replyBody: String? = nil

    func isFrom(_ userId: String?) -> Bool {
        guard let userId, !userId.isEmpty, !senderId.isEmpty else { return false }
        return senderId.compare(userId, options: .caseInsensitive) == .orderedSame
    }
}

struct Conversation: Identifiable, Hashable {
    let id: String
    var kind: ConversationKind
    var title: String
    var subtitle: String
    var unread: Int
    var messages: [ChatMessage]
    var didLoadMessages: Bool = false
    var otherUserId: String? = nil
    var avatarPath: String? = nil
}

struct AppNotification: Identifiable, Hashable {
    let id: String
    var title: String
    var body: String
    var createdAt: Date
    var readAt: Date?
    var link: String?
    var kind: String? = nil

    var isChat: Bool {
        kind == "chat_message" || kind == "chat_mention" || (link?.contains("/chat/") == true)
    }

    var displayTitle: String { title }

    var displayBody: String {
        guard isChat else { return body }
        return ""
    }
}

struct ChapterApplication: Identifiable, Hashable {
    let id: String
    var kind: ApplicationKind
    var status: ApplicationStatus
    var organizationName: String?
    var designation: String?
    var universityName: String?
    var updatedAt: Date
}

struct Prospect: Identifiable, Hashable {
    let id: String
    var name: String
    var preferredName: String?
    var stageId: String
    var stage: String
    var outcome: String
    var school: String
    var major: String?
    var classYear: Int?
    var assignedTo: String?
    var followUpAt: Date?
    var lastActivity: String
}

struct RecruitmentStage: Identifiable, Hashable {
    let id: String
    var name: String
    var position: Int
    var outcome: String
}

struct SetupStep: Identifiable, Hashable {
    let id: String
    var title: String
    var detail: String
    var href: String
    var done: Bool
    var skipped: Bool
    var optional: Bool
    var preview: Bool

    var destination: ChapterDestination {
        if href.contains("/events") { return .events }
        if href.contains("/housing") { return .housing }
        if href.contains("/standards") { return .standards }
        if href.contains("/recruitment") { return .recruitment }
        if href.contains("/philanthropy") { return .philanthropy }
        if href.contains("/academics") { return .academics }
        return .settings
    }

    var actionTitle: String {
        if preview { return "Activate subscription" }
        if done { return "Open" }
        return "Go to this step"
    }
}

struct FinanceSummary: Hashable {
    var assessedCents: Int = 0
    var voidedCents: Int = 0
    var collectedOnlineCents: Int = 0
    var collectedOfflineCents: Int = 0
    var creditsCents: Int = 0
    var refundsCents: Int = 0
    var platformFeesCents: Int = 0
    var processingFeesCents: Int = 0
    var disputedCents: Int = 0
    var payoutsCents: Int = 0
    var outstandingCents: Int = 0
    var stripeBalanceCents: Int = 0
    var processingCents: Int = 0
    var failedCount: Int = 0
    var openDisputes: Int = 0
    var membersWithBalance: Int = 0

    var collectedCents: Int { collectedOnlineCents + collectedOfflineCents }
    var netCents: Int { collectedCents - abs(platformFeesCents) - abs(processingFeesCents) - refundsCents }
}

struct ChapterMemberBalance: Identifiable, Hashable {
    let id: String
    var name: String
    var memberClass: MemberClass
    var status: MembershipStatus
    var balanceCents: Int
    var processingCents: Int
    var overdueCents: Int
}

struct ChapterAssessment: Identifiable, Hashable {
    let id: String
    var title: String
    var category: String
    var amountCents: Int
    var dueDate: Date?
    var status: String
    var allowInstallments: Bool
    var billedCents: Int
    var outstandingCents: Int
    var memberCount: Int
}

struct BudgetLine: Identifiable, Hashable {
    let id: String
    var category: String
    var plannedCents: Int
    var spentCents: Int
}

struct BudgetExpense: Identifiable, Hashable {
    let id: String
    var description: String
    var vendor: String?
    var amountCents: Int
    var spentOn: Date?
}

struct MonthlyCollection: Identifiable, Hashable {
    var id: String { month }
    var month: String
    var onlineCents: Int
    var offlineCents: Int
    var platformFeeCents: Int
    var processingFeeCents: Int
    var refundsCents: Int
    var paymentsCount: Int
}

struct EngagementSummary: Hashable {
    var activeMembers: Int = 0
    var eventsHeld: Int = 0
    var requiredEvents: Int = 0
    var attendanceRecords: Int = 0
    var requiredAttendanceRate: Double?
    var serviceHours: Double = 0
    var serviceParticipants: Int = 0
    var messagesSent: Int = 0
    var prospectsByStage: [FunnelStage] = []
}

struct FunnelStage: Identifiable, Hashable {
    var id: String { stage }
    var stage: String
    var outcome: String
    var count: Int
}

struct ChapterRole: Identifiable, Hashable {
    let id: String
    var key: String
    var name: String
    var description: String?
    var kind: String
    var isOfficer: Bool
    var isOwner: Bool
    var holders: Int
    var permissionCount: Int
}

struct ChapterInvitation: Identifiable, Hashable {
    let id: String
    var email: String
    var fullName: String?
    var memberClass: MemberClass
    var createdAt: Date
}

struct AuditEvent: Identifiable, Hashable {
    let id: String
    var when: Date
    var actor: String
    var action: String
    var detail: String
}

struct AdminDashboard {
    var applications: [AdminApplication] = []
    var chapters: [AdminChapterRow] = []
    var bugs: [AdminBug] = []
    var closures: [AdminClosure] = []
    var audit: [AdminAuditRow] = []
    var revenue: AdminRevenue?
    var reconciliation: [AdminReconRow] = []
    var pricingRules: [AdminPricingRule] = []
    var plans: [AdminSaasPlan] = []
    var replies: [AdminOutreachReply] = []
    var forms: [AdminIntroForm] = []
    var emailStats: AdminEmailStats = AdminEmailStats()
}

struct NotificationKindSetting: Identifiable, Hashable {
    var id: String { kind }
    var kind: String
    var label: String
    var description: String
    var required: Bool
    var inApp: Bool
    var email: Bool

    var group: String {
        switch kind {
        case "event_posted", "event_reminder": return "Events"
        case "housing_update", "housing_request": return "Housing"
        case "chat_mention", "chat_message": return "Messages"
        case "announcement", "policy_update", "task_assigned": return "Chapter"
        case "dues_assessed", "dues_reminder", "payment_receipt", "payment_failed", "payment_refunded", "reimbursement_update": return "Money"
        case "philanthropy_update", "academic_update": return "Academics and service"
        case "recruitment_followup": return "Recruitment"
        case "membership_added", "membership_removed", "verification_update": return "Account"
        default: return "More"
        }
    }

    var isStaffKind: Bool {
        kind == "bug_report" || kind == "marketing_alert"
    }
}

enum NotificationSettingGroup: String, CaseIterable {
    case events = "Events"
    case housing = "Housing"
    case messages = "Messages"
    case chapter = "Chapter"
    case money = "Money"
    case service = "Academics and service"
    case recruitment = "Recruitment"
    case account = "Account"
    case more = "More"
}

struct AdminEmailWeek: Identifiable, Hashable {
    var id: Date { start }
    var start: Date
    var sent: Int
    var replies: Int
}

struct AdminEmailSchool: Identifiable, Hashable {
    let id: String
    var name: String
    var emailed: Int
    var opened: Int
    var replied: Int
    var forms: Int
}

struct AdminEmailStats: Hashable {
    var rangeDays: Int? = 30
    var sent: Int = 0
    var failed: Int = 0
    var people: Int = 0
    var schools: Int = 0
    var heardBack: Int = 0
    var replies: Int = 0
    var forms: Int = 0
    var demos: Int = 0
    var delivered: Int = 0
    var opened: Int = 0
    var clicked: Int = 0
    var bounced: Int = 0
    var blocked: Int = 0
    var unread: Int = 0
    var emailedAndReplied: Int = 0
    var deliveredTo: Int = 0
    var openedBy: Int = 0
    var formFromEmailed: Int = 0
    var medianReplyMinutes: Int? = nil
    var fastestReplyMinutes: Int? = nil
    var weeks: [AdminEmailWeek] = []
    var topSchools: [AdminEmailSchool] = []
}

struct AdminApplication: Identifiable, Hashable {
    let id: String
    var kind: ApplicationKind
    var status: ApplicationStatus
    var title: String
    var university: String
    var applicantName: String
    var applicantId: String
    var method: String
    var emailVerified: Bool
    var appealCount: Int
    var submittedAt: Date?
    var decidedAt: Date?
    var statement: String
    var institutionalEmail: String
    var intendedRole: String
    var nationalContact: String
    var fslContact: String
    var greekLetters: String
}

struct AdminChapterRow: Identifiable, Hashable {
    let id: String
    var slug: String
    var name: String
    var university: String
    var status: ChapterStatus
    var members: Int
    var subscription: String
    var paymentsEnabled: Bool
    var verifiedAt: Date?
}

struct AdminBug: Identifiable, Hashable {
    let id: String
    var number: Int
    var status: String
    var severity: String
    var area: String
    var page: String
    var message: String
    var reporter: String
    var email: String
    var createdAt: Date
    var fixSummary: String
}

struct AdminClosure: Identifiable, Hashable {
    let id: String
    var chapterName: String
    var university: String
    var requester: String
    var reason: String
    var createdAt: Date
}

struct AdminAuditRow: Identifiable, Hashable {
    let id: String
    var when: Date
    var action: String
    var actor: String
    var chapter: String
    var detail: String
}

struct AdminRevenue: Hashable {
    var saasCents: Int
    var feesCents: Int
    var feeRefundsCents: Int
    var volumeCents: Int
    var payments: Int
    var subscriptions: Int
    var mismatches: Int
    var refundedVolumeCents: Int
    var disputes: Int
    var chapters: [AdminRevenueChapter]
}

struct AdminRevenueChapter: Identifiable, Hashable {
    let id: String
    var name: String
    var university: String
    var volumeCents: Int
    var feesCents: Int
    var payments: Int
}

struct AdminReconRow: Identifiable, Hashable {
    let id: String
    var chapter: String
    var issue: String
    var amountCents: Int
    var expectedFeeCents: Int
    var stripeFeeCents: Int?
    var createdAt: Date
    var note: String
}

struct AdminPricingRule: Identifiable, Hashable {
    let id: String
    var name: String
    var code: String
    var version: Int
    var bps: Int
    var fixedCents: Int
    var minCents: Int?
    var maxCents: Int?
    var refundPolicy: String
    var isDefault: Bool
    var status: String
    var effectiveAt: Date?
    var chapterCount: Int
}

struct PublishedPricing: Hashable {
    var monthlyCents: Int = 3000
    var interval: String = "month"
    var feeBps: Int = 150
    var fixedCents: Int = 0
    var minCents: Int? = nil
    var maxCents: Int? = nil
    var refundPolicy: String = "proportional"
    var features: [String] = [
        "Unlimited members, officers, and alumni",
        "Dues, installments, and offline payment tracking",
        "Chat, events, recruitment, and standards tools",
        "Auditable ledger and exports",
        "Card and US bank (ACH) payments",
        "Installment plans at no extra cost"
    ]

    static let builtIn = PublishedPricing()
}

struct AdminSaasPlan: Identifiable, Hashable {
    let id: String
    var name: String
    var priceCents: Int
    var interval: String
    var active: Bool
}

struct AdminOutreachReply: Identifiable, Hashable {
    let id: String
    var from: String
    var subject: String
    var preview: String
    var createdAt: Date
    var unread: Bool
}

struct AdminIntroForm: Identifiable, Hashable {
    let id: String
    var name: String
    var organization: String
    var role: String
    var email: String
    var school: String
    var interest: String
    var notes: String
    var status: String
    var unread: Bool
    var createdAt: Date
}

struct BillingSnapshot: Hashable {
    var termsAccepted: Bool = false
    var subscription: String = "none"
    var canCollect: Bool = false
    var verified: Bool = false
    var cardPayments: String = "not_started"
    var payouts: String = "not_started"
    var signerName: String?
    var periodEnd: Date?
    var amountCents: Int = 3000
}

struct HousingRoom: Identifiable, Hashable {
    let id: String
    var name: String
    var floor: String?
    var capacity: Int
    var occupied: Int
    var rentCents: Int?
}

struct Campaign: Identifiable, Hashable {
    let id: String
    var name: String
    var beneficiary: String?
    var goalCents: Int
    var status: String
}

struct ChapterProfileDetails: Hashable {
    var description: String = ""
    var foundedYear: Int?
    var verifiedAt: Date?
    var setupSkipped: [String] = []
}

struct LedgerEntry: Identifiable, Hashable {
    let id: String
    var date: Date
    var memo: String
    var debitCents: Int
    var creditCents: Int
    var account: String
}

struct ServiceHour: Identifiable, Hashable {
    let id: String
    var userId: String = ""
    var member: String
    var hours: Double
    var event: String
    var status: String
    var date: Date
}

struct HousingChore: Identifiable, Hashable {
    let id: String
    var title: String
    var assignee: String
    var due: String
    var done: Bool
}

struct PolicyDoc: Identifiable, Hashable {
    let id: String
    var title: String
    var version: String
    var acknowledged: Bool
    var category: String = "general"
}

struct StudyGroup: Identifiable, Hashable {
    let id: String
    var title: String
    var course: String
    var nextMeeting: String
    var members: Int
    var joined: Bool = false
}

struct AcademicGoal: Identifiable, Hashable {
    let id: String
    var title: String
    var targetDate: Date?
    var status: String
    var shareWithScholarship: Bool
}

struct HousingRequest: Identifiable, Hashable {
    let id: String
    var membershipId: String
    var memberName: String
    var term: String
    var notes: String?
    var wantsSingle: Bool
    var status: String
    var response: String?
}

struct MaintenanceRequest: Identifiable, Hashable {
    let id: String
    var title: String
    var location: String?
    var priority: String
    var status: String
    var description: String?
}

struct OfficerStat: Identifiable, Hashable {
    let id: String
    var label: String
    var value: String
    var tone: Tone
}

struct FinanceSnapshot: Hashable {
    var outstandingCents: Int
    var collectedCents: Int
    var processingCents: Int
}

struct ChapterContext: Hashable {
    var chapter: ChapterSummary
    var membership: Membership
    var permissions: Set<Permission>
    var balance: MemberBalance
    var events: [ChapterEvent]
    var announcements: [Announcement]
    var members: [DirectoryMember]
    var charges: [DuesCharge]
    var payments: [PaymentRecord]
    var reimbursements: [Reimbursement]
    var conversations: [Conversation]
    var prospects: [Prospect]
    var stages: [RecruitmentStage]
    var ledger: [LedgerEntry]
    var serviceHours: [ServiceHour]
    var chores: [HousingChore]
    var policies: [PolicyDoc]
    var studyGroups: [StudyGroup]
    var officerStats: [OfficerStat]
    var unreadMessages: Int
    var canCollect: Bool
    var finance: FinanceSnapshot
    var financeSummary: FinanceSummary
    var memberBalances: [ChapterMemberBalance]
    var assessments: [ChapterAssessment]
    var chapterPayments: [PaymentRecord]
    var chapterReimbursements: [Reimbursement]
    var budgetLines: [BudgetLine]
    var expenses: [BudgetExpense]
    var monthlyCollections: [MonthlyCollection]
    var engagement: EngagementSummary
    var setupSteps: [SetupStep]
    var roles: [ChapterRole]
    var invitations: [ChapterInvitation]
    var auditLogs: [AuditEvent]
    var billing: BillingSnapshot
    var rooms: [HousingRoom]
    var campaigns: [Campaign]
    var profileDetails: ChapterProfileDetails
    var housingRequests: [HousingRequest] = []
    var maintenanceRequests: [MaintenanceRequest] = []
    var academicGoals: [AcademicGoal] = []

    func can(_ permission: Permission) -> Bool {
        permissions.contains(permission)
    }
}

enum LedgerCopy {
    static func kind(_ raw: String) -> String {
        switch raw {
        case "assessment": return "Charge"
        case "assessment_void": return "Charge voided"
        case "payment": return "Online payment"
        case "offline_payment": return "Offline payment"
        case "platform_fee": return "Platform fee"
        case "processing_fee": return "Stripe processing fee"
        case "credit": return "Credit"
        case "late_fee": return "Late fee"
        case "refund": return "Refund"
        case "payout": return "Payout to bank"
        default: return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func account(_ raw: String) -> String {
        switch raw {
        case "member_receivable": return "Member receivables"
        case "dues_revenue": return "Dues revenue"
        case "stripe_balance": return "Stripe balance"
        case "cash_on_hand": return "Cash and checks"
        case "bank_deposits": return "Bank deposits"
        case "platform_fees": return "Platform fees"
        case "processing_fees": return "Processing fees"
        case "credits_issued": return "Credits issued"
        case "disputed_funds": return "Disputed funds"
        default: return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func assessmentCategory(_ raw: String) -> String {
        switch raw {
        case "dues": return "Dues"
        case "new_member_fee": return "New member fee"
        case "fine": return "Fine"
        case "housing": return "Housing"
        case "event": return "Event"
        default: return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func assessmentStatus(_ raw: String) -> String {
        switch raw {
        case "draft": return "Draft"
        case "issued": return "Sent"
        case "closed": return "Closed"
        case "cancelled": return "Cancelled"
        default: return raw.capitalized
        }
    }

    static func subscription(_ raw: String) -> String {
        switch raw {
        case "active": return "Active"
        case "trialing": return "Trial"
        case "past_due": return "Payment overdue"
        case "canceled": return "Canceled"
        case "unpaid": return "Unpaid"
        case "incomplete": return "Awaiting first payment"
        case "none": return "Not started"
        default: return raw.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func audit(_ raw: String) -> String {
        switch raw {
        case "membership.updated": return "Changed membership"
        case "role.assigned": return "Assigned a role"
        case "role.ended": return "Removed a role"
        case "role.created": return "Created a role"
        case "role.updated": return "Edited a role"
        case "role.deleted": return "Deleted a role"
        case "invitation.created": return "Sent an invitation"
        case "invitation.accepted": return "Accepted an invitation"
        case "invitation.revoked": return "Revoked an invitation"
        case "chapter.ownership_transferred": return "Granted administrator access"
        case "chapter.verified": return "Chapter verified"
        case "agreement.accepted": return "Accepted the platform agreement"
        case "assessment.issued": return "Issued an assessment"
        default: return raw.replacingOccurrences(of: ".", with: " ").replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

enum ChapterDestination: String, CaseIterable, Identifiable, Hashable {
    case overview
    case setup
    case chat
    case announcements
    case events
    case directory
    case dues
    case reimbursements
    case finances
    case recruitment
    case analytics
    case philanthropy
    case housing
    case standards
    case academics
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .setup: return "Setup"
        case .chat: return "Messages"
        case .announcements: return "Announcements"
        case .events: return "Events"
        case .directory: return "Directory"
        case .dues: return "My dues"
        case .reimbursements: return "Reimbursements"
        case .finances: return "Finances"
        case .recruitment: return "Recruitment"
        case .analytics: return "Analytics"
        case .philanthropy: return "Philanthropy"
        case .housing: return "Housing"
        case .standards: return "Standards"
        case .academics: return "Academics"
        case .settings: return "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .setup: return "checklist"
        case .chat: return "bubble.left.and.bubble.right"
        case .announcements: return "megaphone"
        case .events: return "calendar"
        case .directory: return "person.2"
        case .dues: return "creditcard"
        case .reimbursements: return "doc.text"
        case .finances: return "wallet.pass"
        case .recruitment: return "person.badge.plus"
        case .analytics: return "chart.bar"
        case .philanthropy: return "heart"
        case .housing: return "house"
        case .standards: return "building.columns"
        case .academics: return "book"
        case .settings: return "gearshape"
        }
    }
}

struct NavItem: Identifiable, Hashable {
    let id: ChapterDestination
    var badge: Int?
    var tag: String?

    var title: String { id.title }
    var symbol: String { id.symbol }
}

struct NavGroup: Identifiable, Hashable {
    let id: String
    var label: String?
    var items: [NavItem]
}
