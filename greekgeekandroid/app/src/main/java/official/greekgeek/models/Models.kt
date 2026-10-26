package official.greekgeek.models

import androidx.compose.ui.graphics.Color
import official.greekgeek.theme.Palette
import java.util.Date

enum class Tone {
    NEUTRAL,
    ACCENT,
    POSITIVE,
    WARNING,
    DANGER,
    INFO,
    GOLD;

    val foreground: Color
        get() = when (this) {
            NEUTRAL -> Palette.ink2
            ACCENT -> Palette.accent
            POSITIVE -> Palette.positive
            WARNING -> Palette.warning
            DANGER -> Palette.danger
            INFO -> Palette.info
            GOLD -> Palette.gold
        }

    val soft: Color
        get() = when (this) {
            NEUTRAL -> Palette.subtle
            ACCENT -> Palette.accentSoft
            POSITIVE -> Palette.positiveSoft
            WARNING -> Palette.warningSoft
            DANGER -> Palette.dangerSoft
            INFO -> Palette.infoSoft
            GOLD -> Palette.goldSoft
        }
}


enum class Permission(val rawValue: String) {
    CHAPTER_MANAGE("chapter.manage"),
    CHAPTER_OWNERSHIP("chapter.ownership"),
    MEMBERS_MANAGE("members.manage"),
    ROLES_MANAGE("roles.manage"),
    COMMITTEES_MANAGE("committees.manage"),
    FINANCE_VIEW("finance.view"),
    FINANCE_MANAGE("finance.manage"),
    FINANCE_REFUND("finance.refund"),
    PAYMENTS_CONFIGURE("payments.configure"),
    CHAT_MANAGE("chat.manage"),
    CHAT_MODERATE("chat.moderate"),
    ANNOUNCEMENTS_PUBLISH("announcements.publish"),
    ANNOUNCEMENTS_OFFICERS("announcements.officers"),
    EVENTS_MANAGE("events.manage"),
    ATTENDANCE_VIEW("attendance.view"),
    ATTENDANCE_MANAGE("attendance.manage"),
    RECRUITMENT_VIEW("recruitment.view"),
    RECRUITMENT_MANAGE("recruitment.manage"),
    PHILANTHROPY_MANAGE("philanthropy.manage"),
    HOUSING_MANAGE("housing.manage"),
    STANDARDS_VIEW("standards.view"),
    STANDARDS_MANAGE("standards.manage"),
    ACADEMICS_MANAGE("academics.manage"),
    ANALYTICS_VIEW("analytics.view"),
    AUDIT_VIEW("audit.view");

    companion object {
        fun from(raw: String): Permission? = entries.firstOrNull { it.rawValue == raw }
    }
}

enum class ChapterModule(val rawValue: String, val title: String) {
    RECRUITMENT("recruitment", "Recruitment"),
    PHILANTHROPY("philanthropy", "Philanthropy"),
    HOUSING("housing", "Housing"),
    STANDARDS("standards", "Standards"),
    ACADEMICS("academics", "Academics");

    val id: String get() = rawValue

    companion object {
        fun from(raw: String): ChapterModule? = entries.firstOrNull { it.rawValue == raw }
    }
}

enum class MemberClass(val rawValue: String, val label: String) {
    NEW_MEMBER("new_member", "New member"),
    ACTIVE("active", "Active"),
    ASSOCIATE("associate", "Associate"),
    ALUMNI("alumni", "Alumni");

    companion object {
        fun from(raw: String): MemberClass = entries.firstOrNull { it.rawValue == raw } ?: ACTIVE
    }
}

enum class MembershipStatus(val rawValue: String, val label: String) {
    ACTIVE("active", "Active"),
    INACTIVE("inactive", "Inactive"),
    SUSPENDED("suspended", "Suspended"),
    ENDED("ended", "Former member");

    companion object {
        fun from(raw: String): MembershipStatus = entries.firstOrNull { it.rawValue == raw } ?: ACTIVE
    }
}

enum class ChapterStatus(val rawValue: String, val label: String, val tone: Tone) {
    VERIFIED("verified", "Verified", Tone.POSITIVE),
    UNCLAIMED("unclaimed", "Unclaimed", Tone.NEUTRAL),
    SUSPENDED("suspended", "Suspended", Tone.DANGER),
    CLOSED("closed", "Closed", Tone.NEUTRAL),
    PENDING("pending", "Pending", Tone.NEUTRAL);

    companion object {
        fun from(raw: String): ChapterStatus = entries.firstOrNull { it.rawValue == raw } ?: VERIFIED
    }
}

enum class StaffRole(val rawValue: String, val label: String) {
    ADMIN("admin", "Administrator"),
    REVIEWER("reviewer", "Reviewer"),
    SUPPORT("support", "Support"),
    FINANCE("finance", "Finance");

    fun can(capability: AdminCapability): Boolean {
        if (this == ADMIN) return true
        return when (capability) {
            AdminCapability.VERIFICATION -> this == REVIEWER
            AdminCapability.CHAPTERS -> this == SUPPORT || this == REVIEWER || this == FINANCE
            AdminCapability.FINANCE_TOOLS -> this == FINANCE
            AdminCapability.BUGS -> this == SUPPORT
            AdminCapability.ADMIN_ONLY -> false
        }
    }

    companion object {
        fun from(raw: String): StaffRole? = entries.firstOrNull { it.rawValue == raw }
    }
}

enum class AdminCapability {
    VERIFICATION,
    CHAPTERS,
    FINANCE_TOOLS,
    BUGS,
    ADMIN_ONLY
}

enum class ApplicationStatus(val rawValue: String, val label: String, val tone: Tone) {
    DRAFT("draft", "Draft", Tone.NEUTRAL),
    PENDING_VERIFICATION("pending_verification", "In review", Tone.WARNING),
    INFO_REQUESTED("info_requested", "Needs info", Tone.WARNING),
    VERIFIED("verified", "Approved", Tone.POSITIVE),
    REJECTED("rejected", "Rejected", Tone.DANGER),
    SUSPENDED("suspended", "Suspended", Tone.DANGER),
    WITHDRAWN("withdrawn", "Withdrawn", Tone.NEUTRAL);

    companion object {
        fun from(raw: String): ApplicationStatus = entries.firstOrNull { it.rawValue == raw } ?: DRAFT
    }
}

enum class ApplicationKind(val rawValue: String, val label: String) {
    NEW_CHAPTER("new_chapter", "New chapter"),
    CLAIM_CHAPTER("claim_chapter", "Claimed chapter");

    companion object {
        fun from(raw: String): ApplicationKind = entries.firstOrNull { it.rawValue == raw } ?: NEW_CHAPTER
    }
}

enum class PaymentStatus(val rawValue: String, val label: String, val tone: Tone) {
    PENDING("pending", "Pending", Tone.WARNING),
    SUCCEEDED("succeeded", "Paid", Tone.POSITIVE),
    FAILED("failed", "Failed", Tone.DANGER),
    REFUNDED("refunded", "Refunded", Tone.NEUTRAL),
    DISPUTED("disputed", "Disputed", Tone.DANGER);

    companion object {
        fun from(raw: String): PaymentStatus = entries.firstOrNull { it.rawValue == raw } ?: SUCCEEDED
    }
}

enum class ConversationKind(val rawValue: String) {
    DIRECT("direct"),
    CHANNEL("channel"),
    RESTRICTED("restricted");

    companion object {
        fun from(raw: String): ConversationKind = entries.firstOrNull { it.rawValue == raw } ?: CHANNEL
    }
}

data class SessionUser(
    val id: String,
    val email: String
)

data class Profile(
    val id: String,
    var displayName: String? = null,
    var fullName: String? = null,
    var avatarPath: String? = null,
    var graduationYear: Int? = null
) {
    val personName: String
        get() {
            if (!displayName.isNullOrBlank()) return displayName!!
            if (!fullName.isNullOrBlank()) return fullName!!
            return "Member"
        }

    val firstName: String
        get() = personName.split(" ").firstOrNull() ?: ""
}

data class University(
    val name: String
)

data class ChapterSummary(
    val id: String,
    val slug: String,
    val organizationName: String,
    val designation: String? = null,
    val greekLetters: String? = null,
    val status: ChapterStatus = ChapterStatus.VERIFIED,
    val timezone: String = "America/Chicago",
    val currency: String = "usd",
    val modules: Map<ChapterModule, Boolean> = emptyMap(),
    val university: University? = null
) {
    val universityName: String? get() = university?.name

    fun isEnabled(module: ChapterModule): Boolean = modules[module] ?: false
}

data class Membership(
    val id: String,
    val memberClass: MemberClass = MemberClass.ACTIVE,
    val status: MembershipStatus = MembershipStatus.ACTIVE
)

data class MyChapter(
    val id: String,
    val slug: String,
    val organizationName: String,
    val designation: String? = null,
    val greekLetters: String? = null,
    val status: ChapterStatus = ChapterStatus.VERIFIED,
    val timezone: String = "America/Chicago",
    val universityName: String? = null,
    val memberClass: MemberClass = MemberClass.ACTIVE,
    val membershipId: String,
    val balanceCents: Int = 0,
    val processingCents: Int = 0,
    val nextDueDate: Date? = null
)

data class MemberBalance(
    val balanceCents: Int = 0,
    val processingCents: Int = 0,
    val nextDueDate: Date? = null
)

data class ChapterEvent(
    val id: String,
    val chapterId: String = "",
    val title: String,
    val startsAt: Date,
    val endsAt: Date,
    val location: String? = null,
    val attendanceRequired: Boolean = false,
    val timezone: String = "America/Chicago",
    val details: String? = null,
    var rsvp: String? = null
)

data class Announcement(
    val id: String,
    val title: String,
    val body: String,
    val pinned: Boolean = false,
    val requiresAck: Boolean = false,
    var acknowledged: Boolean = false,
    val publishedAt: Date = Date(),
    val author: String = "Officer",
    val audience: String = "All members"
)

data class MemberRoleAssignment(
    val roleId: String,
    val roleName: String
)

data class DirectoryMember(
    val id: String,
    val membershipId: String,
    val name: String,
    val email: String,
    val memberClass: MemberClass = MemberClass.ACTIVE,
    val status: MembershipStatus = MembershipStatus.ACTIVE,
    val roles: List<String> = emptyList(),
    val graduationYear: Int? = null,
    val house: String? = null,
    val avatarPath: String? = null
)

data class DuesCharge(
    val id: String,
    val title: String,
    val category: String = "Dues",
    val amountCents: Int,
    var outstandingCents: Int,
    val processingCents: Int = 0,
    val dueDate: Date,
    val status: String = "open",
    val allowInstallments: Boolean = false,
    val maxInstallments: Int = 1
)

data class PaymentRecord(
    val id: String,
    val title: String,
    val method: String,
    val status: PaymentStatus = PaymentStatus.SUCCEEDED,
    val amountCents: Int,
    val createdAt: Date = Date(),
    val receiptNumber: String? = null
)

data class Reimbursement(
    val id: String,
    val title: String,
    val amountCents: Int,
    val status: String = "In review",
    val submittedAt: Date = Date(),
    val requester: String
)

data class ChatMessage(
    val id: String,
    val conversationId: String = "",
    val from: String,
    val senderId: String? = null,
    val body: String,
    val time: String,
    var reactions: Map<String, List<String>> = emptyMap(),
    val pinned: Boolean = false,
    val edited: Boolean = false,
    val replyTo: ChatMessage? = null,
    val replyToId: String? = null,
    val replyFrom: String? = null,
    val replyBody: String? = null,
    val pending: Boolean = false
) {
    fun isFrom(userId: String?): Boolean {
        if (userId.isNullOrEmpty() || senderId.isNullOrEmpty()) return false
        return senderId.equals(userId, ignoreCase = true)
    }
}

data class Conversation(
    val id: String,
    val kind: ConversationKind = ConversationKind.CHANNEL,
    val title: String,
    var subtitle: String? = null,
    var unread: Int = 0,
    var messages: List<ChatMessage> = emptyList(),
    var didLoadMessages: Boolean = true
)

data class AppNotification(
    val id: String,
    val title: String,
    val body: String,
    val createdAt: Date = Date(),
    var readAt: Date? = null,
    val link: String? = null,
    val kind: String? = null
)

data class ChapterApplication(
    val id: String,
    val organizationName: String? = null,
    val designation: String? = null,
    val greekLetters: String? = null,
    val universityName: String? = null,
    val kind: ApplicationKind = ApplicationKind.NEW_CHAPTER,
    val status: ApplicationStatus = ApplicationStatus.DRAFT,
    val submittedAt: Date? = null
)

data class Prospect(
    val id: String,
    val name: String,
    val preferredName: String? = null,
    val stageId: String,
    var stage: String,
    var outcome: String = "open",
    val school: String = "",
    val major: String? = null,
    val classYear: Int? = null,
    var assignedTo: String? = null,
    var followUpAt: Date? = null,
    var lastActivity: String? = null
)

data class RecruitmentStage(
    val id: String,
    val name: String,
    val position: Int,
    val outcome: String
)

data class SetupStep(
    val id: String,
    val title: String,
    val detail: String,
    val actionTitle: String,
    val destination: ChapterDestination,
    var done: Boolean = false,
    val optional: Boolean = false,
    val skipped: Boolean = false,
    val preview: Boolean = false
)

data class FinanceSummary(
    val assessedCents: Int = 0,
    val voidedCents: Int = 0,
    val collectedOnlineCents: Int = 0,
    val collectedOfflineCents: Int = 0,
    val creditsCents: Int = 0,
    val refundsCents: Int = 0,
    val platformFeesCents: Int = 0,
    val processingFeesCents: Int = 0,
    val disputedCents: Int = 0,
    val payoutsCents: Int = 0,
    val outstandingCents: Int = 0,
    val stripeBalanceCents: Int = 0,
    val processingCents: Int = 0,
    val failedCount: Int = 0,
    val openDisputes: Int = 0,
    val membersWithBalance: Int = 0
) {
    val collectedCents: Int get() = collectedOnlineCents + collectedOfflineCents
    val netCents: Int get() = collectedCents - kotlin.math.abs(platformFeesCents) - kotlin.math.abs(processingFeesCents) - refundsCents
}

data class ChapterMemberBalance(
    val id: String,
    val name: String,
    val balanceCents: Int,
    val email: String = "",
    val overdueCents: Int = 0,
    val memberClass: MemberClass = MemberClass.ACTIVE
)

data class ChapterAssessment(
    val id: String,
    val title: String,
    val amountCents: Int = 0,
    val dueDate: Date = Date(),
    val category: String = "dues",
    val memberCount: Int = 0,
    val outstandingCents: Int = 0
)

data class BudgetLine(
    val id: String,
    val name: String,
    val plannedCents: Int,
    val spentCents: Int
)

data class BudgetExpense(
    val id: String,
    val description: String,
    val amountCents: Int,
    val date: Date
)

data class MonthlyCollection(
    val id: String,
    val month: String,
    val amountCents: Int
)

data class FunnelStage(
    val stage: String = "",
    val outcome: String = "open",
    val count: Int = 0,
    val id: String = stage,
    val name: String = stage
)

data class EngagementSummary(
    val activeMembers: Int = 0,
    val eventsHeld: Int = 0,
    val requiredEvents: Int = 0,
    val attendanceRecords: Int = 0,
    val requiredAttendanceRate: Double? = null,
    val serviceHours: Double = 0.0,
    val serviceParticipants: Int = 0,
    val messagesSent: Int = 0,
    val prospectsByStage: List<FunnelStage> = emptyList()
)

data class ChapterRole(
    val id: String,
    val key: String = "",
    val name: String,
    val description: String? = null,
    val kind: String = "custom",
    val isOfficer: Boolean = false,
    val isOwner: Boolean = false,
    val holders: Int = 0,
    val permissionCount: Int = 0,
    val isExec: Boolean = isOfficer
)

data class ChapterInvitation(
    val id: String,
    val email: String,
    val fullName: String? = null,
    val memberClass: MemberClass = MemberClass.ACTIVE,
    val createdAt: Date = Date(),
    val role: String = "",
    val status: String = "pending"
)

data class AuditEvent(
    val id: String,
    val whenDate: Date = Date(),
    val actor: String,
    val action: String,
    val detail: String = "",
    val timestamp: Date = whenDate,
    val details: String? = detail
) {
    val `when`: Date get() = whenDate
}

data class AdminDashboard(
    val pendingVerifications: Int = 0,
    val totalChapters: Int = 0,
    val openBugs: Int = 0,
    val monthlyRevenueCents: Long = 0L,
    var applications: List<AdminApplication> = emptyList(),
    var chapters: List<AdminChapterRow> = emptyList(),
    var bugs: List<AdminBug> = emptyList(),
    var closures: List<AdminClosure> = emptyList(),
    var audit: List<AdminAuditRow> = emptyList(),
    var revenue: AdminRevenue? = null,
    var reconciliation: List<AdminReconRow> = emptyList(),
    var pricingRules: List<AdminPricingRule> = emptyList(),
    var plans: List<AdminSaasPlan> = emptyList(),
    var replies: List<AdminOutreachReply> = emptyList(),
    var forms: List<AdminIntroForm> = emptyList(),
    var emailStats: AdminEmailStats = AdminEmailStats(),
    val auditRows: List<AdminAuditRow> = audit
)

data class AdminApplication(
    val id: String,
    var kind: ApplicationKind = ApplicationKind.NEW_CHAPTER,
    var status: ApplicationStatus = ApplicationStatus.PENDING_VERIFICATION,
    var title: String = "",
    var university: String = "",
    var applicantName: String = "",
    var applicantId: String = "",
    var method: String = "email",
    var emailVerified: Boolean = false,
    var appealCount: Int = 0,
    var submittedAt: Date? = null,
    var decidedAt: Date? = null,
    var statement: String = "",
    var institutionalEmail: String = "",
    var intendedRole: String = "",
    var nationalContact: String = "",
    var fslContact: String = "",
    var greekLetters: String = "",
    // Compatibility fields
    val organizationName: String = title,
    val designation: String = "",
    val universityName: String = university,
    val applicantEmail: String = institutionalEmail
)

data class AdminChapterRow(
    val id: String,
    var slug: String = "",
    var name: String = "",
    var university: String = "",
    var status: ChapterStatus = ChapterStatus.VERIFIED,
    var members: Int = 0,
    var subscription: String = "none",
    var paymentsEnabled: Boolean = false,
    var verifiedAt: Date? = null,
    // Compatibility
    val universityName: String = university,
    val memberCount: Int = members,
    val balanceCents: Int = 0
)

data class AdminBug(
    val id: String,
    var number: Int = 0,
    var status: String = "new",
    var severity: String = "medium",
    var area: String = "other",
    var page: String = "",
    var message: String = "",
    var reporter: String = "",
    var email: String = "",
    var createdAt: Date = Date(),
    var fixSummary: String = "",
    // Compatibility
    val description: String = message,
    val reporterEmail: String = email
)

data class AdminClosure(
    val id: String,
    var chapterName: String = "",
    var university: String = "",
    var requester: String = "",
    var reason: String = "",
    var createdAt: Date = Date(),
    // Compatibility
    val requestedBy: String = requester,
    val date: Date = createdAt
)

data class AdminAuditRow(
    val id: String,
    var whenDate: Date = Date(),
    var action: String = "",
    var actor: String = "",
    var chapter: String = "",
    var detail: String = "",
    val date: Date = whenDate
) {
    val `when`: Date get() = whenDate
}

data class AdminRevenue(
    var saasCents: Long = 0L,
    var feesCents: Long = 0L,
    var feeRefundsCents: Long = 0L,
    var volumeCents: Long = 0L,
    var payments: Int = 0,
    var subscriptions: Int = 0,
    var mismatches: Int = 0,
    var refundedVolumeCents: Long = 0L,
    var disputes: Int = 0,
    var chapters: List<AdminRevenueChapter> = emptyList()
)

data class AdminRevenueChapter(
    val id: String,
    var name: String = "",
    var university: String = "",
    var volumeCents: Long = 0L,
    var feesCents: Long = 0L,
    var payments: Int = 0
)

data class AdminReconRow(
    val id: String,
    var chapter: String = "",
    var issue: String = "",
    var amountCents: Int = 0,
    var expectedFeeCents: Int = 0,
    var stripeFeeCents: Int? = null,
    var createdAt: Date = Date(),
    var note: String = ""
)

data class AdminPricingRule(
    val id: String,
    var name: String = "",
    var code: String = "",
    var version: Int = 1,
    var bps: Int = 150,
    var fixedCents: Int = 0,
    var minCents: Int? = null,
    var maxCents: Int? = null,
    var refundPolicy: String = "proportional",
    var isDefault: Boolean = false,
    var status: String = "active",
    var effectiveAt: Date? = null,
    var chapterCount: Int = 0
)

data class AdminSaasPlan(
    val id: String,
    var name: String = "",
    var priceCents: Int = 3000,
    var interval: String = "month",
    var active: Boolean = true
)

data class AdminOutreachReply(
    val id: String,
    var from: String = "",
    var subject: String = "",
    var preview: String = "",
    var createdAt: Date = Date(),
    var unread: Boolean = false
)

data class AdminIntroForm(
    val id: String,
    var name: String = "",
    var organization: String = "",
    var role: String = "",
    var email: String = "",
    var school: String = "",
    var interest: String = "",
    var notes: String = "",
    var status: String = "new",
    var unread: Boolean = false,
    var createdAt: Date = Date()
)

data class AdminEmailStats(
    var rangeDays: Int? = 30,
    var sent: Int = 0,
    var failed: Int = 0,
    var people: Int = 0,
    var schools: Int = 0,
    var heardBack: Int = 0,
    var replies: Int = 0,
    var forms: Int = 0,
    var demos: Int = 0,
    var delivered: Int = 0,
    var opened: Int = 0,
    var clicked: Int = 0,
    var bounced: Int = 0,
    var blocked: Int = 0,
    var unread: Int = 0,
    var emailedAndReplied: Int = 0,
    var deliveredTo: Int = 0,
    var openedBy: Int = 0,
    var formFromEmailed: Int = 0,
    var medianReplyMinutes: Int? = null,
    var fastestReplyMinutes: Int? = null,
    var weeks: List<AdminEmailWeek> = emptyList(),
    var topSchools: List<AdminEmailSchool> = emptyList()
)

data class AdminEmailWeek(
    val start: Date,
    var sent: Int = 0,
    var replies: Int = 0
) {
    val id: Date get() = start
}

data class AdminEmailSchool(
    val name: String,
    var emailed: Int = 0,
    var opened: Int = 0,
    var replied: Int = 0,
    var forms: Int = 0
) {
    val id: String get() = name
}

data class NotificationKindSetting(
    val kind: String,
    var label: String,
    var description: String,
    var required: Boolean = false,
    var inApp: Boolean = true,
    var email: Boolean = false
) {
    val id: String get() = kind

    val group: String get() = when (kind) {
        "event_posted", "event_reminder" -> "Events"
        "housing_update", "housing_request" -> "Housing"
        "chat_mention", "chat_message" -> "Messages"
        "announcement", "policy_update", "task_assigned" -> "Chapter"
        "dues_assessed", "dues_reminder", "payment_receipt", "payment_failed", "payment_refunded", "reimbursement_update" -> "Money"
        "philanthropy_update", "academic_update" -> "Academics and service"
        "recruitment_followup" -> "Recruitment"
        "membership_added", "membership_removed", "verification_update" -> "Account"
        else -> "More"
    }

    val isStaffKind: Boolean get() = kind == "bug_report" || kind == "marketing_alert"
}

enum class NotificationSettingGroup(val rawValue: String) {
    EVENTS("Events"),
    HOUSING("Housing"),
    MESSAGES("Messages"),
    CHAPTER("Chapter"),
    MONEY("Money"),
    SERVICE("Academics and service"),
    RECRUITMENT("Recruitment"),
    ACCOUNT("Account"),
    MORE("More");

    companion object {
        fun allCases(): List<NotificationSettingGroup> = entries
    }
}

data class HousingRoom(
    val id: String,
    val name: String = "",
    val floor: String? = null,
    val capacity: Int = 1,
    val occupied: Int = 0,
    val rentCents: Int? = null,
    val occupants: List<String> = emptyList(),
    val roomNumber: String = name
)

data class Campaign(
    val id: String,
    val title: String,
    val goalCents: Int,
    val raisedCents: Int = 0,
    val beneficiary: String = "",
    val status: String = "active"
)

data class ChapterProfileDetails(
    val description: String = "",
    val foundedYear: Int? = null,
    val verifiedAt: Date? = null,
    val setupSkipped: List<String> = emptyList()
)

data class LedgerEntry(
    val id: String,
    val date: Date = Date(),
    val memo: String,
    val debitCents: Int = 0,
    val creditCents: Int = 0,
    val account: String
)

data class ServiceHour(
    val id: String,
    val member: String,
    val hours: Int,
    val event: String,
    var status: String = "In review",
    val date: Date = Date()
)

data class HousingChore(
    val id: String,
    val title: String,
    val assignee: String,
    val due: String,
    var done: Boolean = false
)

data class PolicyDoc(
    val id: String,
    val title: String,
    val version: String,
    var acknowledged: Boolean = false,
    val category: String = "general"
)

data class StudyGroup(
    val id: String,
    val title: String,
    val course: String,
    val nextMeeting: String,
    var members: Int = 0,
    var joined: Boolean = false
)

data class AcademicGoal(
    val id: String,
    val title: String,
    val targetDate: Date? = null,
    val status: String = "active",
    val shareWithScholarship: Boolean = false,
    val targetGpa: String = "",
    val semester: String = ""
)

data class HousingRequest(
    val id: String,
    val membershipId: String = "",
    val memberName: String = "Member",
    val term: String = "",
    val notes: String? = null,
    val wantsSingle: Boolean = false,
    val status: String = "pending",
    val response: String? = null,
    val requester: String = memberName,
    val roomType: String = if (wantsSingle) "Single" else "Double"
)

data class MaintenanceRequest(
    val id: String,
    val title: String = "",
    val location: String? = null,
    val priority: String = "normal",
    var status: String = "submitted",
    val description: String? = null,
    val room: String = location ?: ""
)

data class OfficerStat(
    val id: String,
    val label: String,
    val value: String,
    val tone: Tone = Tone.NEUTRAL
)

data class FinanceSnapshot(
    val outstandingCents: Int = 0,
    val collectedCents: Int = 0,
    val processingCents: Int = 0
)

data class BillingSnapshot(
    val termsAccepted: Boolean = false,
    val subscription: String = "none",
    val canCollect: Boolean = false,
    val verified: Boolean = false,
    val cardPayments: String = "not_started",
    val payouts: String = "not_started",
    val signerName: String? = null,
    val periodEnd: Date? = null,
    val amountCents: Int = 3000
)

data class ChapterContext(
    val chapter: ChapterSummary,
    val membership: Membership,
    val permissions: Set<Permission> = emptySet(),
    val balance: MemberBalance = MemberBalance(),
    var events: List<ChapterEvent> = emptyList(),
    var announcements: List<Announcement> = emptyList(),
    var members: List<DirectoryMember> = emptyList(),
    var charges: List<DuesCharge> = emptyList(),
    var payments: List<PaymentRecord> = emptyList(),
    var reimbursements: List<Reimbursement> = emptyList(),
    var conversations: List<Conversation> = emptyList(),
    var prospects: List<Prospect> = emptyList(),
    val stages: List<RecruitmentStage> = emptyList(),
    var ledger: List<LedgerEntry> = emptyList(),
    var serviceHours: List<ServiceHour> = emptyList(),
    var chores: List<HousingChore> = emptyList(),
    var policies: List<PolicyDoc> = emptyList(),
    var studyGroups: List<StudyGroup> = emptyList(),
    var officerStats: List<OfficerStat> = emptyList(),
    var unreadMessages: Int = 0,
    val canCollect: Boolean = true,
    val finance: FinanceSnapshot = FinanceSnapshot(),
    val financeSummary: FinanceSummary = FinanceSummary(),
    val memberBalances: List<ChapterMemberBalance> = emptyList(),
    var assessments: List<ChapterAssessment> = emptyList(),
    val chapterPayments: List<PaymentRecord> = emptyList(),
    val chapterReimbursements: List<Reimbursement> = emptyList(),
    val budgetLines: List<BudgetLine> = emptyList(),
    val expenses: List<BudgetExpense> = emptyList(),
    val monthlyCollections: List<MonthlyCollection> = emptyList(),
    val engagement: EngagementSummary = EngagementSummary(),
    val setupSteps: List<SetupStep> = emptyList(),
    val roles: List<ChapterRole> = emptyList(),
    val invitations: List<ChapterInvitation> = emptyList(),
    val auditLogs: List<AuditEvent> = emptyList(),
    val billing: BillingSnapshot = BillingSnapshot(),
    val rooms: List<HousingRoom> = emptyList(),
    val campaigns: List<Campaign> = emptyList(),
    val profileDetails: ChapterProfileDetails = ChapterProfileDetails(),
    var housingRequests: List<HousingRequest> = emptyList(),
    var maintenanceRequests: List<MaintenanceRequest> = emptyList(),
    var academicGoals: List<AcademicGoal> = emptyList()
) {
    fun can(permission: Permission): Boolean = permissions.contains(permission)
}

enum class ChapterDestination(val rawValue: String, val title: String) {
    OVERVIEW("overview", "Overview"),
    SETUP("setup", "Chapter setup"),
    CHAT("chat", "Chat"),
    ANNOUNCEMENTS("announcements", "Announcements"),
    EVENTS("events", "Events"),
    DIRECTORY("directory", "Directory"),
    DUES("dues", "Dues"),
    REIMBURSEMENTS("reimbursements", "Reimbursements"),
    FINANCES("finances", "Finances"),
    RECRUITMENT("recruitment", "Recruitment"),
    ANALYTICS("analytics", "Analytics"),
    PHILANTHROPY("philanthropy", "Philanthropy"),
    HOUSING("housing", "Housing"),
    STANDARDS("standards", "Standards"),
    ACADEMICS("academics", "Academics"),
    SETTINGS("settings", "Settings");

    companion object {
        fun from(raw: String): ChapterDestination = entries.firstOrNull { it.rawValue == raw } ?: OVERVIEW
    }
}

data class NavItem(
    val id: ChapterDestination,
    val badge: Int? = null,
    val tag: String? = null
) {
    val title: String get() = id.title
}

data class NavGroup(
    val id: String,
    val label: String? = null,
    val items: List<NavItem>
)
