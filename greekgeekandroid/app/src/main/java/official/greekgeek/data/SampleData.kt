package official.greekgeek.data

import official.greekgeek.models.*
import official.greekgeek.models.Tone
import java.util.Calendar
import java.util.Date

object SampleData {
    val user = SessionUser(id = "user-jordan", email = "jordan@state.edu")

    val profile = Profile(
        id = "user-jordan",
        displayName = "Jordan",
        fullName = "Jordan Lee",
        avatarPath = null,
        graduationYear = 2027
    )

    val chapter = ChapterSummary(
        id = "ch-alpha-beta",
        slug = "sample-chapter",
        organizationName = "Alpha Beta",
        designation = "Alpha Chapter",
        greekLetters = "ΑΒ",
        status = ChapterStatus.VERIFIED,
        timezone = "America/Chicago",
        currency = "usd",
        modules = mapOf(
            ChapterModule.RECRUITMENT to true,
            ChapterModule.PHILANTHROPY to true,
            ChapterModule.HOUSING to true,
            ChapterModule.STANDARDS to true,
            ChapterModule.ACADEMICS to true
        ),
        university = University(name = "State University")
    )

    val membership = Membership(id = "mem-jordan", memberClass = MemberClass.ACTIVE, status = MembershipStatus.ACTIVE)

    val officerPermissions: Set<Permission> = Permission.entries.toSet()

    private fun addDays(days: Int): Date {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, days)
        return cal.time
    }

    private fun addHours(hours: Int): Date {
        val cal = Calendar.getInstance()
        cal.add(Calendar.HOUR_OF_DAY, hours)
        return cal.time
    }

    val myChapter = MyChapter(
        id = chapter.id,
        slug = chapter.slug,
        organizationName = chapter.organizationName,
        designation = chapter.designation,
        greekLetters = chapter.greekLetters,
        status = chapter.status,
        timezone = chapter.timezone,
        universityName = chapter.universityName,
        memberClass = MemberClass.ACTIVE,
        membershipId = membership.id,
        balanceCents = 18_500,
        processingCents = 0,
        nextDueDate = addDays(12)
    )

    val events: List<ChapterEvent> = listOf(
        ChapterEvent(
            id = "evt-meeting",
            chapterId = chapter.id,
            title = "Chapter meeting",
            startsAt = addDays(2),
            endsAt = Date(addDays(2).time + 5400 * 1000),
            location = "Chapter house, great room",
            attendanceRequired = true,
            timezone = chapter.timezone,
            details = "Weekly business meeting. Formal RSVPs are open.",
            rsvp = "going"
        ),
        ChapterEvent(
            id = "evt-foodbank",
            chapterId = chapter.id,
            title = "Food bank shift",
            startsAt = addDays(5),
            endsAt = Date(addDays(5).time + 10800 * 1000),
            location = "Community Food Bank",
            attendanceRequired = false,
            timezone = chapter.timezone,
            details = "Service hours count toward the philanthropy requirement.",
            rsvp = null
        ),
        ChapterEvent(
            id = "evt-formal",
            chapterId = chapter.id,
            title = "Spring formal",
            startsAt = addDays(21),
            endsAt = Date(addDays(21).time + 14400 * 1000),
            location = "The Grand Hall",
            attendanceRequired = false,
            timezone = chapter.timezone,
            details = "Black tie optional. RSVP by Friday.",
            rsvp = "maybe"
        )
    )

    val announcements: List<Announcement> = listOf(
        Announcement(
            id = "ann-1",
            title = "Chapter meeting moved to 7:30 Sunday",
            body = "Same room. Please be on time so we can vote on the formal budget.",
            pinned = true,
            requiresAck = true,
            acknowledged = false,
            publishedAt = addHours(-2),
            author = "Marcus Hill",
            audience = "All members"
        ),
        Announcement(
            id = "ann-2",
            title = "Formal RSVPs are open",
            body = "Please RSVP in Events by Friday so we can lock the headcount.",
            pinned = false,
            requiresAck = false,
            acknowledged = true,
            publishedAt = addHours(-1),
            author = "Devin Ortiz",
            audience = "All members"
        )
    )

    val members: List<DirectoryMember> = listOf(
        DirectoryMember(id = "user-jordan", membershipId = "mem-jordan", name = "Jordan Lee", email = "jordan@state.edu", memberClass = MemberClass.ACTIVE, status = MembershipStatus.ACTIVE, roles = listOf("Member"), graduationYear = 2027, house = "Chapter house"),
        DirectoryMember(id = "m-marcus", membershipId = "mem-marcus", name = "Marcus Hill", email = "marcus@state.edu", memberClass = MemberClass.ACTIVE, status = MembershipStatus.ACTIVE, roles = listOf("President"), graduationYear = 2026, house = "Chapter house"),
        DirectoryMember(id = "m-devin", membershipId = "mem-devin", name = "Devin Ortiz", email = "devin@state.edu", memberClass = MemberClass.ACTIVE, status = MembershipStatus.ACTIVE, roles = listOf("Treasurer"), graduationYear = 2026, house = "Chapter house"),
        DirectoryMember(id = "m-chris", membershipId = "mem-chris", name = "Chris Nguyen", email = "chris@state.edu", memberClass = MemberClass.ACTIVE, status = MembershipStatus.ACTIVE, roles = listOf("Philanthropy chair"), graduationYear = 2027, house = null),
        DirectoryMember(id = "m-sam", membershipId = "mem-sam", name = "Sam Patel", email = "sam@state.edu", memberClass = MemberClass.ACTIVE, status = MembershipStatus.ACTIVE, roles = listOf("Recruitment chair"), graduationYear = 2028, house = null),
        DirectoryMember(id = "m-tyler", membershipId = "mem-tyler", name = "Tyler Brooks", email = "tyler@state.edu", memberClass = MemberClass.NEW_MEMBER, status = MembershipStatus.ACTIVE, roles = emptyList(), graduationYear = 2029, house = null)
    )

    val charges: List<DuesCharge> = listOf(
        DuesCharge(
            id = "chg-spring",
            title = "Spring dues",
            category = "Dues",
            amountCents = 45_000,
            outstandingCents = 18_500,
            processingCents = 0,
            dueDate = addDays(12),
            status = "open",
            allowInstallments = true,
            maxInstallments = 3
        )
    )

    val payments: List<PaymentRecord> = listOf(
        PaymentRecord(id = "pay-1", title = "Spring dues", method = "Card", status = PaymentStatus.SUCCEEDED, amountCents = 26_500, createdAt = addDays(-20), receiptNumber = "GG-1042"),
        PaymentRecord(id = "pay-2", title = "Fall dues", method = "Bank transfer", status = PaymentStatus.SUCCEEDED, amountCents = 45_000, createdAt = addDays(-110), receiptNumber = "GG-0988")
    )

    val reimbursements: List<Reimbursement> = listOf(
        Reimbursement(id = "re-1", title = "Costco supplies for formal", amountCents = 8_432, status = "In review", submittedAt = addDays(-2), requester = "Chris Nguyen"),
        Reimbursement(id = "re-2", title = "Gas for food bank vans", amountCents = 4_600, status = "Approved", submittedAt = addDays(-9), requester = "Jordan Lee")
    )

    val conversations: List<Conversation> = listOf(
        Conversation(
            id = "devin",
            kind = ConversationKind.DIRECT,
            title = "Devin Ortiz",
            subtitle = "Direct message",
            unread = 1,
            messages = listOf(
                ChatMessage(id = "d1", from = "Devin Ortiz", body = "Can you look over the formal budget before Sunday?", time = "4:51 PM", reactions = emptyMap(), pinned = false, edited = false)
            )
        ),
        Conversation(
            id = "general",
            kind = ConversationKind.CHANNEL,
            title = "General",
            subtitle = "48 members",
            unread = 0,
            messages = listOf(
                ChatMessage(id = "g1", from = "Marcus Hill", body = "Chapter meeting moved to 7:30 Sunday. Same room.", time = "6:02 PM", reactions = mapOf("+1" to listOf("Devin Ortiz", "Chris Nguyen", "Sam Patel", "Tyler Brooks"), "check" to listOf("Sam Patel")), pinned = true, edited = false),
                ChatMessage(id = "g2", from = "Chris Nguyen", body = "Who's driving to the food bank Saturday? I have 3 seats.", time = "6:14 PM", reactions = mapOf("heart" to listOf("Marcus Hill")), pinned = false, edited = false),
                ChatMessage(id = "g3", from = "Devin Ortiz", body = "Formal RSVPs are open in Events. Please RSVP by Friday.", time = "6:21 PM", reactions = mapOf("+1" to listOf("Marcus Hill", "Jordan Lee")), pinned = false, edited = false)
            )
        ),
        Conversation(
            id = "exec",
            kind = ConversationKind.RESTRICTED,
            title = "Executive board",
            subtitle = "Officers",
            unread = 2,
            messages = listOf(
                ChatMessage(id = "e1", from = "Marcus Hill", body = "Let's review the formal budget before Sunday.", time = "5:44 PM", reactions = emptyMap(), pinned = false, edited = false)
            )
        )
    )

    val prospects: List<Prospect> = listOf(
        Prospect(id = "p1", name = "Alex Rivera", stageId = "s2", stage = "Invite", outcome = "open", school = "State University", assignedTo = "Sam Patel", lastActivity = "Coffee tomorrow"),
        Prospect(id = "p2", name = "Casey Morgan", stageId = "s1", stage = "Meet", outcome = "open", school = "State University", assignedTo = "Jordan Lee", lastActivity = "Came to philanthropy"),
        Prospect(id = "p3", name = "Riley Chen", stageId = "s3", stage = "Bid", outcome = "offered", school = "State University", assignedTo = "Marcus Hill", lastActivity = "Bid ready")
    )

    val ledger: List<LedgerEntry> = listOf(
        LedgerEntry(id = "l1", date = addDays(-2), memo = "Spring dues · Jordan Lee", debitCents = 18_500, creditCents = 0, account = "Accounts receivable"),
        LedgerEntry(id = "l2", date = addDays(-20), memo = "Card payment · Spring dues", debitCents = 0, creditCents = 26_500, account = "Stripe clearing"),
        LedgerEntry(id = "l3", date = addDays(-21), memo = "Platform fee 1.5%", debitCents = 398, creditCents = 0, account = "Platform fees")
    )

    val serviceHours: List<ServiceHour> = listOf(
        ServiceHour(id = "sh1", member = "Chris Nguyen", hours = 3, event = "Food bank", status = "Approved", date = addDays(-8)),
        ServiceHour(id = "sh2", member = "Jordan Lee", hours = 2, event = "Campus cleanup", status = "In review", date = addDays(-1))
    )

    val chores: List<HousingChore> = listOf(
        HousingChore(id = "c1", title = "Kitchen close", assignee = "Tyler Brooks", due = "Tonight", done = false),
        HousingChore(id = "c2", title = "Take out recycling", assignee = "Jordan Lee", due = "Sunday", done = true),
        HousingChore(id = "c3", title = "Vacuum great room", assignee = "Sam Patel", due = "Monday", done = false)
    )

    val policies: List<PolicyDoc> = listOf(
        PolicyDoc(id = "pol1", title = "Anti-hazing policy", version = "2026.1", acknowledged = true),
        PolicyDoc(id = "pol2", title = "House rules", version = "2026.2", acknowledged = false),
        PolicyDoc(id = "pol3", title = "Social event guidelines", version = "2026.1", acknowledged = false)
    )

    val studyGroups: List<StudyGroup> = listOf(
        StudyGroup(id = "sg1", title = "Organic chemistry", course = "CHEM 2100", nextMeeting = "Tue 7:00 PM", members = 6),
        StudyGroup(id = "sg2", title = "Microeconomics", course = "ECON 1015", nextMeeting = "Thu 6:30 PM", members = 4)
    )

    val officerStats: List<OfficerStat> = listOf(
        OfficerStat(id = "os1", label = "Dues outstanding", value = "$1,240", tone = Tone.WARNING),
        OfficerStat(id = "os2", label = "RSVPs this week", value = "31 / 48", tone = Tone.INFO),
        OfficerStat(id = "os3", label = "Open prospects", value = "12", tone = Tone.ACCENT),
        OfficerStat(id = "os4", label = "Unacknowledged policies", value = "9", tone = Tone.DANGER)
    )

    val notifications: List<AppNotification> = listOf(
        AppNotification(id = "n1", title = "Chapter meeting moved to 7:30 Sunday", body = "Same room.", createdAt = addHours(-2), readAt = null, link = "announcements"),
        AppNotification(id = "n2", title = "Spring dues due in 12 days", body = "$185.00 remaining.", createdAt = addHours(-6), readAt = null, link = "dues"),
        AppNotification(id = "n3", title = "Devin Ortiz mentioned you", body = "", createdAt = addHours(-11), readAt = addHours(-5), link = "chat", kind = "chat_mention")
    )

    val applications: List<ChapterApplication> = emptyList()

    val setupSteps: List<SetupStep> = listOf(
        SetupStep(id = "step1", title = "Verify chapter details", detail = "Confirm organization name, Greek designation, and campus.", actionTitle = "Review details", destination = ChapterDestination.SETTINGS, done = true),
        SetupStep(id = "step2", title = "Connect chapter Stripe", detail = "Connect your chapter's merchant Stripe account to collect dues directly.", actionTitle = "Connect Stripe", destination = ChapterDestination.FINANCES, done = true),
        SetupStep(id = "step3", title = "Create first dues charge", detail = "Set up your Spring semester assessment with installment options.", actionTitle = "Create assessment", destination = ChapterDestination.FINANCES, done = true),
        SetupStep(id = "step4", title = "Invite executive board", detail = "Send officer invitations to President, Treasurer, and Chairs.", actionTitle = "Invite officers", destination = ChapterDestination.SETTINGS, done = false),
        SetupStep(id = "step5", title = "Upload chapter bylaws", detail = "Add your chapter policies for members to acknowledge in Standards.", actionTitle = "Upload bylaws", destination = ChapterDestination.STANDARDS, done = false, optional = true)
    )

    val adminDashboard = AdminDashboard(
        pendingVerifications = 2,
        totalChapters = 14,
        openBugs = 3,
        monthlyRevenueCents = 42000,
        applications = listOf(
            AdminApplication(id = "app-1", organizationName = "Sigma Chi", designation = "Alpha Omega Chapter", universityName = "University of Michigan", applicantName = "Brad Thompson", applicantEmail = "brad@umich.edu", status = ApplicationStatus.PENDING_VERIFICATION),
            AdminApplication(id = "app-2", organizationName = "Kappa Kappa Gamma", designation = "Beta Epsilon", universityName = "University of Texas", applicantName = "Sarah Jenkins", applicantEmail = "sarah@utexas.edu", status = ApplicationStatus.PENDING_VERIFICATION)
        ),
        chapters = listOf(
            AdminChapterRow(id = "ch-1", name = "Alpha Beta (State University)", universityName = "State University", status = ChapterStatus.VERIFIED, memberCount = 48, balanceCents = 18500),
            AdminChapterRow(id = "ch-2", name = "Phi Delta Theta (Ohio State)", universityName = "Ohio State University", status = ChapterStatus.VERIFIED, memberCount = 62, balanceCents = 0),
            AdminChapterRow(id = "ch-3", name = "Delta Gamma (Indiana)", universityName = "Indiana University", status = ChapterStatus.VERIFIED, memberCount = 74, balanceCents = 42000)
        ),
        bugs = listOf(
            AdminBug(id = "b1", page = "/c/sample-chapter/dues", description = "Member was unable to select installment plan option on checkout", reporterEmail = "devin@state.edu", status = "open"),
            AdminBug(id = "b2", page = "/c/sample-chapter/events", description = "Check-in QR code refreshed a second early", reporterEmail = "sam@state.edu", status = "open")
        ),
        closures = emptyList(),
        auditRows = listOf(
            AdminAuditRow(id = "aud-1", actor = "Marcus Hill", action = "Published announcement 'Chapter meeting moved'", date = addHours(-2)),
            AdminAuditRow(id = "aud-2", actor = "Devin Ortiz", action = "Recorded offline payment $265.00", date = addDays(-20))
        )
    )

    fun context(): ChapterContext {
        return ChapterContext(
            chapter = chapter,
            membership = membership,
            permissions = officerPermissions,
            balance = MemberBalance(balanceCents = 18_500, processingCents = 0, nextDueDate = myChapter.nextDueDate),
            events = events,
            announcements = announcements,
            members = members,
            charges = charges,
            payments = payments,
            reimbursements = reimbursements,
            conversations = conversations,
            prospects = prospects,
            stages = listOf(
                RecruitmentStage(id = "s1", name = "Meet", position = 1, outcome = "open"),
                RecruitmentStage(id = "s2", name = "Invite", position = 2, outcome = "open"),
                RecruitmentStage(id = "s3", name = "Bid", position = 3, outcome = "offered")
            ),
            ledger = ledger,
            serviceHours = serviceHours,
            chores = chores,
            policies = policies,
            studyGroups = studyGroups,
            officerStats = officerStats,
            unreadMessages = 3,
            canCollect = true,
            finance = FinanceSnapshot(outstandingCents = 18_500, collectedCents = 71_500, processingCents = 0),
            financeSummary = FinanceSummary(collectedOnlineCents = 71_500, outstandingCents = 18_500),
            memberBalances = listOf(
                ChapterMemberBalance(id = "user-jordan", name = "Jordan Lee", balanceCents = 18_500, email = "jordan@state.edu"),
                ChapterMemberBalance(id = "m-marcus", name = "Marcus Hill", balanceCents = 0, email = "marcus@state.edu"),
                ChapterMemberBalance(id = "m-devin", name = "Devin Ortiz", balanceCents = 0, email = "devin@state.edu"),
                ChapterMemberBalance(id = "m-tyler", name = "Tyler Brooks", balanceCents = 45_000, email = "tyler@state.edu")
            ),
            assessments = listOf(
                ChapterAssessment(id = "ass-1", title = "Spring 2026 Chapter Dues", amountCents = 45_000, dueDate = addDays(12)),
                ChapterAssessment(id = "ass-2", title = "Formal Ticket Fee", amountCents = 7_500, dueDate = addDays(18))
            ),
            chapterPayments = payments,
            chapterReimbursements = reimbursements,
            budgetLines = listOf(
                BudgetLine(id = "b1", name = "Social & Formal", plannedCents = 120_000, spentCents = 45_000),
                BudgetLine(id = "b2", name = "Philanthropy", plannedCents = 30_000, spentCents = 12_500),
                BudgetLine(id = "b3", name = "Recruitment / Rush", plannedCents = 50_000, spentCents = 38_000)
            ),
            expenses = listOf(
                BudgetExpense(id = "ex-1", description = "DJ deposit for Formal", amountCents = 25_000, date = addDays(-5)),
                BudgetExpense(id = "ex-2", description = "Rush kickoff BBQ supplies", amountCents = 18_000, date = addDays(-14))
            ),
            monthlyCollections = listOf(
                MonthlyCollection(id = "m1", month = "Jan", amountCents = 450_000),
                MonthlyCollection(id = "m2", month = "Feb", amountCents = 320_000),
                MonthlyCollection(id = "m3", month = "Mar", amountCents = 210_000)
            ),
            engagement = EngagementSummary(activeMembers = 6),
            setupSteps = setupSteps,
            roles = listOf(
                ChapterRole(id = "r1", name = "President", isExec = true),
                ChapterRole(id = "r2", name = "Treasurer", isExec = true),
                ChapterRole(id = "r3", name = "Secretary", isExec = true),
                ChapterRole(id = "r4", name = "Philanthropy Chair", isExec = false)
            ),
            invitations = listOf(
                ChapterInvitation(id = "inv-1", email = "alex.newpledge@state.edu", role = "New Member", status = "pending"),
                ChapterInvitation(id = "inv-2", email = "cooper.pledge@state.edu", role = "New Member", status = "accepted")
            ),
            auditLogs = listOf(
                AuditEvent(id = "aud-1", actor = "Marcus Hill", action = "Created announcement", timestamp = addHours(-2), details = "Chapter meeting moved"),
                AuditEvent(id = "aud-2", actor = "Devin Ortiz", action = "Dues charge verified", timestamp = addDays(-12), details = "Spring dues")
            ),
            billing = BillingSnapshot(subscription = "active", canCollect = true),
            rooms = listOf(
                HousingRoom(id = "rm-1", roomNumber = "101", capacity = 2, occupants = listOf("Jordan Lee", "Devin Ortiz")),
                HousingRoom(id = "rm-2", roomNumber = "102", capacity = 2, occupants = listOf("Marcus Hill", "Chris Nguyen"))
            ),
            campaigns = listOf(
                Campaign(id = "cmp-1", title = "Spring Children's Hospital Drive", goalCents = 500_000, raisedCents = 385_000)
            ),
            profileDetails = ChapterProfileDetails(description = "Alpha Beta Chapter at State University, established 1924.")
        )
    }
}
