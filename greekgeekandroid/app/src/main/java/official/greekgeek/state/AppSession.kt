package official.greekgeek.state

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import official.greekgeek.design.DateFormat
import official.greekgeek.models.*
import official.greekgeek.services.AuthSession
import official.greekgeek.services.GreekGeekStore
import official.greekgeek.services.SupabaseClient
import official.greekgeek.services.NotificationInboxClient
import official.greekgeek.services.DeviceNotifications
import official.greekgeek.services.AppConfig
import android.content.Context
import java.util.Date
import java.util.UUID

enum class AppFlow {
    MARKETING,
    SIGNED_IN
}

class AppSession : ViewModel() {
    var flow by mutableStateOf(AppFlow.MARKETING)
    var user by mutableStateOf<SessionUser?>(null)
    var profile by mutableStateOf<Profile?>(null)
    var chapters by mutableStateOf<List<MyChapter>>(emptyList())
    var applications by mutableStateOf<List<ChapterApplication>>(emptyList())
    var notifications by mutableStateOf<List<AppNotification>>(emptyList())
    var upcomingEvents by mutableStateOf<List<ChapterEvent>>(emptyList())
    var selectedChapter by mutableStateOf<ChapterContext?>(null)
    var presentedChapterSlug by mutableStateOf<String?>(null)
    var viewingConversationId by mutableStateOf<String?>(null)
    var staffRole by mutableStateOf<StaffRole?>(null)
    var isRestoring by mutableStateOf(true)
    var isLoadingChapter by mutableStateOf(false)
    var lastError by mutableStateOf<String?>(null)
    var chatError by mutableStateOf<String?>(null)
    var actionMessage by mutableStateOf<String?>(null)
    var pendingResetPassword by mutableStateOf(false)
    var pendingInviteToken by mutableStateOf<String?>(null)
    var admin by mutableStateOf(AdminDashboard())
    var isLoadingAdmin by mutableStateOf(false)
    var adminError by mutableStateOf<String?>(null)
    var isLoadingEmailStats by mutableStateOf(false)

    private var authSession: AuthSession? = null
    private val client = SupabaseClient()
    private var store = GreekGeekStore(client)
    private var notificationInboxClient: NotificationInboxClient? = null
    private var appContext: Context? = null

    fun initNotifications(context: Context) {
        appContext = context.applicationContext
        connectNotifications()
    }

    fun connectNotifications() {
        val ctx = appContext ?: return
        val uid = user?.id ?: return
        val token = store.accessToken ?: return
        notificationInboxClient?.disconnect()
        notificationInboxClient = NotificationInboxClient(
            baseURL = AppConfig.SUPABASE_URL,
            anonKey = AppConfig.SUPABASE_ANON_KEY,
            accessToken = token,
            userId = uid
        ).apply {
            onInsert = { notif ->
                viewModelScope.launch {
                    notifications = listOf(notif) + notifications
                    DeviceNotifications.post(ctx, notif, unreadCount)
                }
            }
            connect()
        }
    }

    val isSignedIn: Boolean get() = user != null
    val unreadCount: Int get() = notifications.count { it.readAt == null }
    val firstName: String get() = profile?.firstName ?: ""

    init {
        bootstrap()
    }

    fun bootstrap() {
        viewModelScope.launch {
            // Restore initial state or stay on marketing
            isRestoring = false
        }
    }

    fun signIn(email: String, password: String, onComplete: (Boolean) -> Unit) {
        viewModelScope.launch {
            lastError = null
            try {
                val session = client.signIn(email, password)
                authSession = session
                store = GreekGeekStore(client, session.accessToken, session.userId, session.email)
                user = SessionUser(id = session.userId, email = session.email)
                hydrateFromNetwork()
                flow = AppFlow.SIGNED_IN
                onComplete(true)
            } catch (e: Exception) {
                lastError = e.message ?: "Sign in failed"
                onComplete(false)
            }
        }
    }

    fun signUp(fullName: String, email: String, password: String, onComplete: (String?) -> Unit) {
        viewModelScope.launch {
            lastError = null
            try {
                val session = client.signUp(email, password, fullName)
                if (session != null) {
                    authSession = session
                    store = GreekGeekStore(client, session.accessToken, session.userId, session.email)
                    user = SessionUser(id = session.userId, email = session.email)
                    hydrateFromNetwork()
                    flow = AppFlow.SIGNED_IN
                    onComplete(null)
                } else {
                    onComplete("Check your email. It can take a minute to arrive. Check spam if you don't see it.")
                }
            } catch (e: Exception) {
                lastError = e.message ?: "Sign up failed"
                onComplete(lastError)
            }
        }
    }

    fun requestPasswordReset(email: String, onComplete: (String?) -> Unit) {
        viewModelScope.launch {
            lastError = null
            try {
                client.requestPasswordReset(email)
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not request password reset")
            }
        }
    }

    fun updatePassword(password: String, onComplete: (Boolean) -> Unit) {
        viewModelScope.launch {
            val token = authSession?.accessToken
            if (token != null) {
                try {
                    client.updatePassword(token, password)
                    pendingResetPassword = false
                    onComplete(true)
                } catch (e: Exception) {
                    lastError = e.message
                    onComplete(false)
                }
            } else {
                onComplete(false)
            }
        }
    }

    fun signOut() {
        notificationInboxClient?.disconnect()
        notificationInboxClient = null
        val token = authSession?.accessToken
        if (token != null) {
            viewModelScope.launch { client.signOut(token) }
        }
        authSession = null
        user = null
        profile = null
        chapters = emptyList()
        applications = emptyList()
        notifications = emptyList()
        upcomingEvents = emptyList()
        selectedChapter = null
        presentedChapterSlug = null
        viewingConversationId = null
        staffRole = null
        admin = AdminDashboard()
        lastError = null
        chatError = null
        actionMessage = null
        isLoadingChapter = false
        flow = AppFlow.MARKETING
    }

    fun openChapter(chapter: MyChapter) {
        presentedChapterSlug = chapter.slug
        loadChapter(chapter.slug)
    }

    fun loadChapter(slug: String) {
        viewModelScope.launch {
            isLoadingChapter = true
            lastError = null
            try {
                delay(100) // smooth transition
                selectedChapter = store.loadChapter(slug)
                presentedChapterSlug = slug
            } catch (e: Exception) {
                lastError = e.message
                selectedChapter = null
            } finally {
                isLoadingChapter = false
            }
        }
    }

    fun closeChapter() {
        selectedChapter = null
        presentedChapterSlug = null
        viewingConversationId = null
    }

    fun refreshInbox() {
        viewModelScope.launch {
            try {
                notifications = store.loadNotifications()
            } catch (_: Exception) {}
        }
    }

    fun markNotificationsRead() {
        notifications = notifications.map { it.copy(readAt = Date()) }
        viewModelScope.launch {
            store.markNotificationsRead()
        }
    }

    fun avatarPath(forUserId: String?): String? {
        if (forUserId.isNullOrEmpty()) return null
        if (forUserId == user?.id) return profile?.avatarPath
        return selectedChapter?.members?.firstOrNull { it.id == forUserId }?.avatarPath
    }

    val memberNames: Map<String, String>
        get() = selectedChapter?.members?.associate { it.id to it.name } ?: emptyMap()

    fun conversation(id: String): Conversation? {
        return selectedChapter?.conversations?.firstOrNull { it.id == id }
    }

    suspend fun refreshConversation(conversationId: String) {
        try {
            val msgs = store.loadMessages(conversationId, memberNames)
            val chapter = selectedChapter ?: return
            val updated = chapter.conversations.map { conv ->
                if (conv.id == conversationId) {
                    conv.copy(
                        messages = msgs,
                        didLoadMessages = true,
                        subtitle = msgs.lastOrNull()?.body ?: conv.subtitle
                    )
                } else conv
            }
            selectedChapter = chapter.copy(conversations = updated)
        } catch (_: Exception) {}
    }

    fun loadConversationMessages(conversationId: String) {
        viewModelScope.launch {
            refreshConversation(conversationId)
        }
    }

    fun sendMessage(conversationId: String, body: String, replyTo: ChatMessage? = null) {
        val text = body.trim()
        if (text.isEmpty()) return
        chatError = null
        val chapter = selectedChapter ?: return

        val newMessage = ChatMessage(
            id = "msg-${UUID.randomUUID()}",
            conversationId = conversationId,
            from = "You",
            senderId = user?.id,
            body = text,
            time = DateFormat.clock(Date()),
            replyToId = replyTo?.id,
            replyFrom = replyTo?.let { if (it.isFrom(user?.id)) "You" else it.from },
            replyBody = replyTo?.body,
            pending = true
        )

        val updatedConvs = chapter.conversations.map { conv ->
            if (conv.id == conversationId) {
                conv.copy(
                    messages = conv.messages + newMessage,
                    subtitle = text
                )
            } else conv
        }
        selectedChapter = chapter.copy(conversations = updatedConvs)

        viewModelScope.launch {
            try {
                store.sendMessage(conversationId, text, replyTo?.id)
                refreshConversation(conversationId)
            } catch (e: Exception) {
                chatError = e.message
            }
        }
    }

    fun toggleReaction(conversationId: String, messageId: String, emoji: String) {
        val chapter = selectedChapter ?: return
        val currentName = profile?.personName ?: "Member"

        var willAdd = false
        val updatedConvs = chapter.conversations.map { conv ->
            if (conv.id == conversationId) {
                val updatedMessages = conv.messages.map { msg ->
                    if (msg.id == messageId) {
                        val currentUsers = msg.reactions[emoji] ?: emptyList()
                        willAdd = !currentUsers.contains(currentName)
                        val newUsers = if (currentUsers.contains(currentName)) {
                            currentUsers - currentName
                        } else {
                            currentUsers + currentName
                        }
                        val newReactions = msg.reactions.toMutableMap()
                        if (newUsers.isEmpty()) {
                            newReactions.remove(emoji)
                        } else {
                            newReactions[emoji] = newUsers
                        }
                        msg.copy(reactions = newReactions)
                    } else msg
                }
                conv.copy(messages = updatedMessages)
            } else conv
        }
        selectedChapter = chapter.copy(conversations = updatedConvs)

        viewModelScope.launch {
            store.setReaction(messageId, conversationId, emoji, willAdd)
        }
    }

    fun rsvpEvent(eventId: String, status: String) {
        val chapter = selectedChapter ?: return
        val currentRsvp = chapter.events.firstOrNull { it.id == eventId }?.rsvp
        val newStatus = if (currentRsvp == status) "not_going" else status
        val updatedEvents = chapter.events.map { event ->
            if (event.id == eventId) {
                event.copy(rsvp = if (event.rsvp == status) null else status)
            } else event
        }
        selectedChapter = chapter.copy(events = updatedEvents)
        upcomingEvents = upcomingEvents.map { event ->
            if (event.id == eventId) {
                event.copy(rsvp = if (event.rsvp == status) null else status)
            } else event
        }
        viewModelScope.launch {
            store.rsvp(eventId, newStatus)
        }
    }

    fun acknowledgeAnnouncement(announcementId: String) {
        val chapter = selectedChapter ?: return
        val updated = chapter.announcements.map { ann ->
            if (ann.id == announcementId) {
                ann.copy(acknowledged = true)
            } else ann
        }
        selectedChapter = chapter.copy(announcements = updated)
        viewModelScope.launch {
            store.acknowledgeAnnouncement(announcementId)
        }
    }

    fun addAnnouncement(title: String, body: String, pinned: Boolean, requiresAck: Boolean, audience: String) {
        val chapter = selectedChapter ?: return
        val newAnn = Announcement(
            id = "ann-${UUID.randomUUID()}",
            title = title,
            body = body,
            pinned = pinned,
            requiresAck = requiresAck,
            acknowledged = false,
            publishedAt = Date(),
            author = profile?.personName ?: "Officer",
            audience = audience
        )
        selectedChapter = chapter.copy(announcements = listOf(newAnn) + chapter.announcements)
        viewModelScope.launch {
            store.publishAnnouncement(chapter.chapter.id, title, body, audience, pinned, requiresAck)
        }
    }

    fun addEvent(title: String, startsAt: Date, endsAt: Date, location: String, required: Boolean, details: String) {
        val chapter = selectedChapter ?: return
        val newEvent = ChapterEvent(
            id = "evt-${UUID.randomUUID()}",
            chapterId = chapter.chapter.id,
            title = title,
            startsAt = startsAt,
            endsAt = endsAt,
            location = location,
            attendanceRequired = required,
            timezone = chapter.chapter.timezone,
            details = details
        )
        selectedChapter = chapter.copy(events = chapter.events + newEvent)
        upcomingEvents = upcomingEvents + newEvent
        viewModelScope.launch {
            store.createEvent(chapter.chapter.id, title, location, details, startsAt, endsAt, chapter.chapter.timezone, required)
        }
    }

    fun addProspect(name: String, stage: String, school: String, assignedTo: String?) {
        val chapter = selectedChapter ?: return
        val newProspect = Prospect(
            id = "p-${UUID.randomUUID()}",
            name = name,
            stageId = "s1",
            stage = stage,
            school = school,
            assignedTo = assignedTo ?: profile?.personName,
            lastActivity = "Added just now"
        )
        selectedChapter = chapter.copy(prospects = chapter.prospects + newProspect)
    }

    fun updateProspectStage(prospectId: String, newStage: String) {
        val chapter = selectedChapter ?: return
        val updated = chapter.prospects.map { p ->
            if (p.id == prospectId) p.copy(stage = newStage, lastActivity = "Moved to $newStage") else p
        }
        selectedChapter = chapter.copy(prospects = updated)
    }

    fun payDues(chargeId: String, amountCents: Int, method: String) {
        val chapter = selectedChapter ?: return
        val receiptNum = "GG-${(1000..9999).random()}"
        val newPay = PaymentRecord(
            id = "pay-${UUID.randomUUID()}",
            title = "Dues payment",
            method = method,
            status = PaymentStatus.SUCCEEDED,
            amountCents = amountCents,
            createdAt = Date(),
            receiptNumber = receiptNum
        )
        val updatedCharges = chapter.charges.map { c ->
            if (c.id == chargeId) {
                c.copy(outstandingCents = maxOf(0, c.outstandingCents - amountCents))
            } else c
        }
        val remainingBal = maxOf(0, chapter.balance.balanceCents - amountCents)
        selectedChapter = chapter.copy(
            charges = updatedCharges,
            payments = listOf(newPay) + chapter.payments,
            balance = chapter.balance.copy(balanceCents = remainingBal)
        )
        chapters = chapters.map { c ->
            if (c.id == chapter.chapter.id) c.copy(balanceCents = remainingBal) else c
        }
    }

    fun recordOfflinePayment(memberId: String, amountCents: Int, method: String, memo: String) {
        val chapter = selectedChapter ?: return
        val newPay = PaymentRecord(
            id = "pay-${UUID.randomUUID()}",
            title = memo.ifBlank { "Offline payment ($method)" },
            method = method,
            status = PaymentStatus.SUCCEEDED,
            amountCents = amountCents,
            createdAt = Date(),
            receiptNumber = "REC-${(1000..9999).random()}"
        )
        val newLedger = LedgerEntry(
            id = "led-${UUID.randomUUID()}",
            date = Date(),
            memo = "$memo · Recorded by ${profile?.personName ?: "Treasurer"}",
            debitCents = 0,
            creditCents = amountCents,
            account = "Cash / Venmo clearing"
        )
        selectedChapter = chapter.copy(
            payments = listOf(newPay) + chapter.payments,
            ledger = listOf(newLedger) + chapter.ledger
        )
    }

    fun createAssessment(title: String, amountCents: Int, dueDate: Date) {
        val chapter = selectedChapter ?: return
        val newAssessment = ChapterAssessment(
            id = "ass-${UUID.randomUUID()}",
            title = title,
            amountCents = amountCents,
            dueDate = dueDate
        )
        selectedChapter = chapter.copy(assessments = chapter.assessments + newAssessment)
    }

    fun submitReimbursement(title: String, amountCents: Int) {
        val chapter = selectedChapter ?: return
        val newReimbursement = Reimbursement(
            id = "re-${UUID.randomUUID()}",
            title = title,
            amountCents = amountCents,
            status = "In review",
            submittedAt = Date(),
            requester = profile?.personName ?: "Member"
        )
        selectedChapter = chapter.copy(reimbursements = listOf(newReimbursement) + chapter.reimbursements)
        viewModelScope.launch {
            store.submitReimbursement(chapter.chapter.id, title, amountCents)
        }
    }

    fun logServiceHours(hours: Int, event: String) {
        val chapter = selectedChapter ?: return
        val newHours = ServiceHour(
            id = "sh-${UUID.randomUUID()}",
            member = profile?.personName ?: "Member",
            hours = hours,
            event = event,
            status = "In review",
            date = Date()
        )
        selectedChapter = chapter.copy(serviceHours = listOf(newHours) + chapter.serviceHours)
        viewModelScope.launch {
            store.logServiceHours(chapter.chapter.id, event, null, hours.toDouble(), Date())
        }
    }

    fun toggleChore(choreId: String) {
        val chapter = selectedChapter ?: return
        val updated = chapter.chores.map { c ->
            if (c.id == choreId) c.copy(done = !c.done) else c
        }
        selectedChapter = chapter.copy(chores = updated)
    }

    fun acknowledgePolicy(policyId: String) {
        val chapter = selectedChapter ?: return
        val updated = chapter.policies.map { p ->
            if (p.id == policyId) p.copy(acknowledged = true) else p
        }
        selectedChapter = chapter.copy(policies = updated)
    }

    fun updateProfile(fullName: String, displayName: String, graduationYear: Int?) {
        profile = profile?.copy(
            fullName = fullName,
            displayName = displayName.ifEmpty { null },
            graduationYear = graduationYear
        )
        viewModelScope.launch {
            store.updateProfile(fullName, displayName, graduationYear)
        }
    }

    fun submitChapterApplication(orgName: String, designation: String, greekLetters: String, university: String) {
        val newApp = ChapterApplication(
            id = "app-${UUID.randomUUID()}",
            organizationName = orgName,
            designation = designation,
            greekLetters = greekLetters,
            universityName = university,
            kind = ApplicationKind.NEW_CHAPTER,
            status = ApplicationStatus.PENDING_VERIFICATION,
            submittedAt = Date()
        )
        applications = listOf(newApp) + applications
    }

    fun reportBug(page: String, description: String) {
        submitBugReport(description, page)
    }

    fun submitBugReport(message: String, page: String, onComplete: (String?) -> Unit = {}) {
        viewModelScope.launch {
            try {
                store.submitBugReport(message, page)
                val newBug = AdminBug(
                    id = "b-${UUID.randomUUID()}",
                    page = page,
                    description = message,
                    reporterEmail = user?.email ?: "user@state.edu",
                    createdAt = Date(),
                    status = "open"
                )
                admin = admin.copy(
                    bugs = listOf(newBug) + admin.bugs,
                    openBugs = admin.openBugs + 1
                )
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not submit bug report.")
            }
        }
    }

    fun createPolicy(title: String, category: String, body: String, requiresAck: Boolean, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.createPolicy(chapterId, title, category, body, requiresAck)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not publish policy.")
            }
        }
    }

    fun addAcademicGoal(title: String, targetDate: Date?, share: Boolean, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.addAcademicGoal(chapterId, title, targetDate, share)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not save goal.")
            }
        }
    }

    fun setAcademicGoalStatus(goalId: String, status: String) {
        val chapter = selectedChapter ?: return
        val updatedGoals = chapter.academicGoals.map {
            if (it.id == goalId) it.copy(status = status) else it
        }
        selectedChapter = chapter.copy(academicGoals = updatedGoals)
        viewModelScope.launch {
            store.setAcademicGoalStatus(goalId, status)
        }
    }

    fun createStudyGroup(name: String, course: String?, meeting: String?, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.createStudyGroup(chapterId, name, course, meeting)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not create study group.")
            }
        }
    }

    fun updateChapterProfile(greekLetters: String, description: String, foundedYear: Int?, timezone: String, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.updateChapterProfile(chapterId, greekLetters, description, foundedYear, timezone)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not update profile.")
            }
        }
    }

    fun updateChapterModules(modules: Map<ChapterModule, Boolean>, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.updateChapterModules(chapterId, modules)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not update modules.")
            }
        }
    }

    fun addExistingMember(email: String, memberClass: String, onComplete: (String?, String?) -> Unit) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete(null, "No active chapter")
        viewModelScope.launch {
            try {
                val status = store.addExistingMember(chapterId, email, memberClass)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(status, null)
            } catch (e: Exception) {
                onComplete(null, e.message ?: "Could not invite member.")
            }
        }
    }

    fun saveHousingRoom(name: String, floor: String?, capacity: Int, rentCents: Int?, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.saveHousingRoom(chapterId, name, floor, capacity, rentCents)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not save room.")
            }
        }
    }

    fun submitHousingRequest(term: String, roomIds: List<String>, wantsSingle: Boolean, notes: String?, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.submitHousingRequest(chapterId, term, roomIds, emptyList(), wantsSingle, notes)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not submit housing request.")
            }
        }
    }

    fun submitMaintenance(title: String, location: String?, description: String?, priority: String, onComplete: (String?) -> Unit = {}) {
        val chapterId = selectedChapter?.chapter?.id ?: return onComplete("No active chapter")
        viewModelScope.launch {
            try {
                store.submitMaintenance(chapterId, title, location, description, priority)
                loadChapter(selectedChapter?.chapter?.slug ?: "")
                onComplete(null)
            } catch (e: Exception) {
                onComplete(e.message ?: "Could not submit maintenance request.")
            }
        }
    }

    // Admin dashboard operations
    fun loadAdmin() {
        viewModelScope.launch {
            isLoadingAdmin = true
            adminError = null
            try {
                admin = store.loadAdminDashboard()
            } catch (e: Exception) {
                adminError = e.localizedMessage ?: "Failed to load admin data"
            } finally {
                isLoadingAdmin = false
            }
        }
    }

    suspend fun performAdmin(block: suspend (GreekGeekStore) -> String?): String? {
        adminError = null
        val err = block(store)
        if (err != null) {
            adminError = err
        } else {
            admin = store.loadAdminDashboard()
        }
        return err
    }

    suspend fun loadEmailStats(rangeDays: Int?) {
        isLoadingEmailStats = true
        try {
            val stats = store.loadEmailStats(rangeDays)
            admin = admin.copy(emailStats = stats)
        } finally {
            isLoadingEmailStats = false
        }
    }

    suspend fun loadRevenue() {
        val rev = store.loadAdminRevenue()
        if (rev != null) {
            admin = admin.copy(revenue = rev)
        }
    }

    suspend fun loadNotificationSettings(): List<NotificationKindSetting> {
        return store.loadNotificationSettings()
    }

    suspend fun saveNotificationSettings(settings: List<NotificationKindSetting>): String? {
        return store.saveNotificationSettings(settings)
    }

    fun verifyApplication(appId: String) {
        viewModelScope.launch {
            performAdmin { it.reviewApplication(appId, "verified", null, null) }
        }
    }

    fun rejectApplication(appId: String) {
        viewModelScope.launch {
            performAdmin { it.reviewApplication(appId, "rejected", "Application rejected by reviewer", null) }
        }
    }

    fun updateBugStatus(bugId: String, status: String) {
        viewModelScope.launch {
            performAdmin { it.updateBug(bugId, status, "medium", "other") }
        }
    }

    private suspend fun hydrateFromNetwork() {
        val payload = store.loadHome()
        profile = payload.profile ?: Profile(id = user?.id ?: "", displayName = null, fullName = null)
        chapters = payload.chapters
        applications = payload.applications
        notifications = payload.notifications
        upcomingEvents = payload.events
        staffRole = payload.staffRole
        admin = store.loadAdminDashboard()
        connectNotifications()
    }

    override fun onCleared() {
        super.onCleared()
        notificationInboxClient?.disconnect()
        notificationInboxClient = null
    }
}
