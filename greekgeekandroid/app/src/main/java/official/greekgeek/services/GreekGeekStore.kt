package official.greekgeek.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import official.greekgeek.design.DateFormat
import official.greekgeek.design.ISODate
import official.greekgeek.models.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Date
import java.util.UUID

data class HomePayload(
    val profile: Profile?,
    val chapters: List<MyChapter>,
    val applications: List<ChapterApplication>,
    val notifications: List<AppNotification>,
    val events: List<ChapterEvent>,
    val staffRole: StaffRole?
)

class GreekGeekStore(
    private val client: SupabaseClient = SupabaseClient(),
    val accessToken: String? = null,
    private val userId: String? = null,
    private val email: String? = null
) {
    private fun JSONObject.optStringOrNull(name: String): String? =
        if (has(name) && !isNull(name)) optString(name) else null

    private fun JSONObject.optIntOrNull(name: String): Int? =
        if (has(name) && !isNull(name)) optInt(name) else null

    private fun JSONObject.optDoubleOrNull(name: String): Double? =
        if (has(name) && !isNull(name)) optDouble(name) else null

    suspend fun loadHome(): HomePayload = withContext(Dispatchers.IO) {
        val token = accessToken ?: throw SupabaseException("Not authenticated")

        // 1. Profile
        val profileJson = try {
            val arr = client.select("profiles", "select=id,display_name,full_name,avatar_path,graduation_year&id=eq.$userId", token)
            if (arr.length() > 0) arr.getJSONObject(0) else null
        } catch (_: Exception) { null }

        val profile = profileJson?.let {
            Profile(
                id = it.optString("id", userId ?: ""),
                displayName = it.optStringOrNull("display_name"),
                fullName = it.optStringOrNull("full_name"),
                avatarPath = it.optStringOrNull("avatar_path"),
                graduationYear = it.optIntOrNull("graduation_year")
            )
        } ?: Profile(id = userId ?: "", displayName = email?.substringBefore("@"), fullName = email?.substringBefore("@"))

        // 2. Memberships -> Chapters
        val membershipsArr = try {
            client.select(
                "memberships",
                "select=id,member_class,chapter:chapters(id,slug,organization_name,designation,greek_letters,status,timezone,currency,university:universities(name))&user_id=eq.$userId&status=eq.active",
                token
            )
        } catch (_: Exception) { JSONArray() }

        val chaptersList = mutableListOf<MyChapter>()
        for (i in 0 until membershipsArr.length()) {
            val row = membershipsArr.getJSONObject(i)
            val chapterObj = row.optJSONObject("chapter") ?: continue
            val membershipId = row.optString("id")
            val univObj = chapterObj.optJSONObject("university")

            var balanceCents = 0
            var processingCents = 0
            var nextDueDate: Date? = null

            // Balance RPC
            try {
                val balRes = client.rpc("member_balance", JSONObject().put("p_membership", membershipId), token)
                if (balRes is JSONObject) {
                    balanceCents = balRes.optInt("balance_cents", 0)
                    processingCents = balRes.optInt("processing_cents", 0)
                    nextDueDate = balRes.optStringOrNull("next_due_date")?.let { ISODate.parse(it) }
                }
            } catch (_: Exception) {}

            chaptersList.add(
                MyChapter(
                    id = chapterObj.optString("id"),
                    slug = chapterObj.optString("slug"),
                    organizationName = chapterObj.optString("organization_name"),
                    designation = chapterObj.optStringOrNull("designation"),
                    greekLetters = chapterObj.optStringOrNull("greek_letters"),
                    status = ChapterStatus.from(chapterObj.optString("status")),
                    timezone = chapterObj.optString("timezone", "America/Chicago"),
                    universityName = univObj?.optStringOrNull("name"),
                    memberClass = MemberClass.from(row.optString("member_class")),
                    membershipId = membershipId,
                    balanceCents = balanceCents,
                    processingCents = processingCents,
                    nextDueDate = nextDueDate
                )
            )
        }

        // 3. Applications
        val appsArr = try {
            client.select(
                "chapter_applications",
                "select=id,kind,status,organization_name,designation,proposed_university_name,updated_at,university:universities(name)&applicant_id=eq.$userId&status=neq.withdrawn&order=updated_at.desc&limit=10",
                token
            )
        } catch (_: Exception) { JSONArray() }
        val appsList = mutableListOf<ChapterApplication>()
        for (i in 0 until appsArr.length()) {
            val row = appsArr.getJSONObject(i)
            val univ = row.optJSONObject("university")?.optStringOrNull("name") ?: row.optStringOrNull("proposed_university_name")
            appsList.add(
                ChapterApplication(
                    id = row.optString("id"),
                    organizationName = row.optStringOrNull("organization_name"),
                    designation = row.optStringOrNull("designation"),
                    universityName = univ,
                    kind = ApplicationKind.from(row.optString("kind")),
                    status = ApplicationStatus.from(row.optString("status")),
                    submittedAt = row.optStringOrNull("updated_at")?.let { ISODate.parse(it) }
                )
            )
        }

        // 4. Notifications
        val notifsList = loadNotifications()

        // 5. Upcoming events
        val eventsList = mutableListOf<ChapterEvent>()
        if (chaptersList.isNotEmpty()) {
            val now = ISODate.timestamp()
            val ids = chaptersList.joinToString(",") { it.id }
            val eventsArr = try {
                client.select(
                    "events",
                    "select=id,chapter_id,title,starts_at,ends_at,location,attendance_required,timezone&chapter_id=in.($ids)&cancelled_at=is.null&ends_at=gte.$now&order=starts_at.asc&limit=8",
                    token
                )
            } catch (_: Exception) { JSONArray() }
            for (i in 0 until eventsArr.length()) {
                val row = eventsArr.getJSONObject(i)
                eventsList.add(
                    ChapterEvent(
                        id = row.optString("id"),
                        chapterId = row.optString("chapter_id"),
                        title = row.optString("title"),
                        startsAt = row.optStringOrNull("starts_at")?.let { ISODate.parse(it) } ?: Date(),
                        endsAt = row.optStringOrNull("ends_at")?.let { ISODate.parse(it) } ?: Date(),
                        location = row.optStringOrNull("location"),
                        attendanceRequired = row.optBoolean("attendance_required", false),
                        timezone = row.optString("timezone", "America/Chicago")
                    )
                )
            }
        }

        // 6. Staff Role
        val staffRole = try {
            val res = client.rpc("my_staff_role", JSONObject(), token)
            if (res is String) StaffRole.from(res) else null
        } catch (_: Exception) { null }

        HomePayload(
            profile = profile,
            chapters = chaptersList,
            applications = appsList,
            notifications = notifsList,
            events = eventsList,
            staffRole = staffRole
        )
    }

    suspend fun loadChapter(slug: String): ChapterContext = withContext(Dispatchers.IO) {
        val token = accessToken ?: throw SupabaseException("Not authenticated")

        // 1. Context: Chapter Summary, Membership, and Permissions
        var chapterSummary: ChapterSummary? = null
        var membership: Membership? = null
        val permissions = mutableSetOf<Permission>()

        try {
            val combined = client.rpc("my_chapter_context", JSONObject().put("p_slug", slug), token)
            if (combined is JSONObject) {
                val chapObj = combined.optJSONObject("chapter")
                val memObj = combined.optJSONObject("membership")
                if (chapObj != null && memObj != null) {
                    val univObj = chapObj.optJSONObject("university")
                    val modulesMap = mutableMapOf<ChapterModule, Boolean>()
                    val modsJson = chapObj.optJSONObject("modules")
                    if (modsJson != null) {
                        for (mod in ChapterModule.entries) {
                            modulesMap[mod] = modsJson.optBoolean(mod.rawValue, false)
                        }
                    }
                    chapterSummary = ChapterSummary(
                        id = chapObj.optString("id"),
                        slug = chapObj.optString("slug"),
                        organizationName = chapObj.optString("organization_name"),
                        designation = chapObj.optStringOrNull("designation"),
                        greekLetters = chapObj.optStringOrNull("greek_letters"),
                        status = ChapterStatus.from(chapObj.optString("status")),
                        timezone = chapObj.optString("timezone", "America/Chicago"),
                        currency = chapObj.optString("currency", "usd"),
                        modules = modulesMap,
                        university = univObj?.optStringOrNull("name")?.let { University(it) }
                    )
                    membership = Membership(
                        id = memObj.optString("id"),
                        memberClass = MemberClass.from(memObj.optString("member_class")),
                        status = MembershipStatus.from(memObj.optString("status"))
                    )
                    val permsArr = combined.optJSONArray("permissions")
                    if (permsArr != null) {
                        for (p in 0 until permsArr.length()) {
                            Permission.from(permsArr.getString(p))?.let { permissions.add(it) }
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        // Fallback context query if RPC was not used
        if (chapterSummary == null || membership == null) {
            val fallbackArr = client.select(
                "memberships",
                "select=id,member_class,status,chapter:chapters!inner(id,slug,organization_name,designation,greek_letters,status,timezone,currency,modules,university:universities(name))&user_id=eq.$userId&chapter.slug=eq.$slug&status=eq.active",
                token
            )
            if (fallbackArr.length() == 0) {
                throw SupabaseException("You are not an active member of that chapter.")
            }
            val row = fallbackArr.getJSONObject(0)
            val chapObj = row.getJSONObject("chapter")
            val univObj = chapObj.optJSONObject("university")
            val modulesMap = mutableMapOf<ChapterModule, Boolean>()
            val modsJson = chapObj.optJSONObject("modules")
            if (modsJson != null) {
                for (mod in ChapterModule.entries) {
                    modulesMap[mod] = modsJson.optBoolean(mod.rawValue, false)
                }
            }
            chapterSummary = ChapterSummary(
                id = chapObj.optString("id"),
                slug = chapObj.optString("slug"),
                organizationName = chapObj.optString("organization_name"),
                designation = chapObj.optStringOrNull("designation"),
                greekLetters = chapObj.optStringOrNull("greek_letters"),
                status = ChapterStatus.from(chapObj.optString("status")),
                timezone = chapObj.optString("timezone", "America/Chicago"),
                currency = chapObj.optString("currency", "usd"),
                modules = modulesMap,
                university = univObj?.optStringOrNull("name")?.let { University(it) }
            )
            membership = Membership(
                id = row.optString("id"),
                memberClass = MemberClass.from(row.optString("member_class")),
                status = MembershipStatus.from(row.optString("status"))
            )
            try {
                val permsRes = client.rpc("my_permissions", JSONObject().put("p_chapter", chapterSummary.id), token)
                if (permsRes is JSONArray) {
                    for (p in 0 until permsRes.length()) {
                        Permission.from(permsRes.getString(p))?.let { permissions.add(it) }
                    }
                }
            } catch (_: Exception) {}
        }

        val chapter = chapterSummary
        val mem = membership
        val now = ISODate.timestamp()

        // 2. Member Balance
        var memberBalance = MemberBalance()
        try {
            val balRes = client.rpc("member_balance", JSONObject().put("p_membership", mem.id), token)
            if (balRes is JSONObject) {
                memberBalance = MemberBalance(
                    balanceCents = balRes.optInt("balance_cents", 0),
                    processingCents = balRes.optInt("processing_cents", 0),
                    nextDueDate = balRes.optStringOrNull("next_due_date")?.let { ISODate.parse(it) }
                )
            }
        } catch (_: Exception) {}

        // 3. Payment Readiness & Billing
        var canCollect = false
        var billing = BillingSnapshot()
        try {
            val readyRes = client.rpc("chapter_payment_readiness", JSONObject().put("p_chapter", chapter.id), token)
            val rObj = when (readyRes) {
                is JSONArray -> if (readyRes.length() > 0) readyRes.getJSONObject(0) else null
                is JSONObject -> readyRes
                else -> null
            }
            if (rObj != null) {
                canCollect = rObj.optBoolean("can_collect", false)
                billing = billing.copy(
                    canCollect = canCollect,
                    termsAccepted = rObj.optBoolean("terms_accepted", false),
                    verified = rObj.optBoolean("verified", false),
                    subscription = rObj.optString("subscription", "none"),
                    cardPayments = rObj.optString("card_payments", "not_started"),
                    payouts = rObj.optString("payouts", "not_started")
                )
            }
        } catch (_: Exception) {}

        try {
            val agArr = client.select("chapter_agreements", "select=signer_name&chapter_id=eq.${chapter.id}&superseded_at=is.null&limit=1", token)
            if (agArr.length() > 0) {
                billing = billing.copy(signerName = agArr.getJSONObject(0).optStringOrNull("signer_name"))
            }
        } catch (_: Exception) {}

        try {
            val subArr = client.select("chapter_subscriptions", "select=status,unit_amount_cents,current_period_end&chapter_id=eq.${chapter.id}&order=updated_at.desc&limit=1", token)
            if (subArr.length() > 0) {
                val s = subArr.getJSONObject(0)
                billing = billing.copy(
                    subscription = s.optString("status", billing.subscription),
                    amountCents = s.optInt("unit_amount_cents", 3000),
                    periodEnd = s.optStringOrNull("current_period_end")?.let { ISODate.parse(it) }
                )
            }
        } catch (_: Exception) {}

        // 4. Chapter Events & RSVPs
        val eventsList = mutableListOf<ChapterEvent>()
        try {
            val evArr = client.select(
                "events",
                "select=id,chapter_id,title,starts_at,ends_at,location,attendance_required,timezone,description&chapter_id=eq.${chapter.id}&cancelled_at=is.null&ends_at=gte.$now&order=starts_at.asc&limit=20",
                token
            )
            val eventIds = mutableListOf<String>()
            for (i in 0 until evArr.length()) {
                val r = evArr.getJSONObject(i)
                val id = r.optString("id")
                eventIds.add(id)
                eventsList.add(
                    ChapterEvent(
                        id = id,
                        chapterId = r.optString("chapter_id"),
                        title = r.optString("title"),
                        startsAt = r.optStringOrNull("starts_at")?.let { ISODate.parse(it) } ?: Date(),
                        endsAt = r.optStringOrNull("ends_at")?.let { ISODate.parse(it) } ?: Date(),
                        location = r.optStringOrNull("location"),
                        attendanceRequired = r.optBoolean("attendance_required", false),
                        timezone = r.optString("timezone", chapter.timezone),
                        details = r.optStringOrNull("description")
                    )
                )
            }
            if (eventIds.isNotEmpty()) {
                val rsvps = client.select("event_rsvps", "select=event_id,status&event_id=in.(${eventIds.joinToString(",")})&user_id=eq.$userId", token)
                val rsvpMap = mutableMapOf<String, String>()
                for (r in 0 until rsvps.length()) {
                    val obj = rsvps.getJSONObject(r)
                    rsvpMap[obj.optString("event_id")] = obj.optString("status")
                }
                for (ev in eventsList) {
                    ev.rsvp = rsvpMap[ev.id]
                }
            }
        } catch (_: Exception) {}

        // 5. Announcements & Acks
        val announcementsList = mutableListOf<Announcement>()
        try {
            val annArr = client.select(
                "announcements",
                "select=id,title,body,pinned,requires_ack,published_at,audience&chapter_id=eq.${chapter.id}&archived_at=is.null&order=pinned.desc,published_at.desc&limit=20",
                token
            )
            val ackIds = mutableListOf<String>()
            for (i in 0 until annArr.length()) {
                val r = annArr.getJSONObject(i)
                val id = r.optString("id")
                val reqAck = r.optBoolean("requires_ack", false)
                if (reqAck) ackIds.add(id)
                announcementsList.add(
                    Announcement(
                        id = id,
                        title = r.optString("title"),
                        body = r.optString("body"),
                        pinned = r.optBoolean("pinned", false),
                        requiresAck = reqAck,
                        acknowledged = !reqAck,
                        publishedAt = r.optStringOrNull("published_at")?.let { ISODate.parse(it) } ?: Date(),
                        audience = r.optString("audience", "All members")
                    )
                )
            }
            if (ackIds.isNotEmpty()) {
                val acks = client.select("announcement_acks", "select=announcement_id&announcement_id=in.(${ackIds.joinToString(",")})&user_id=eq.$userId", token)
                val ackSet = mutableSetOf<String>()
                for (a in 0 until acks.length()) {
                    ackSet.add(acks.getJSONObject(a).optString("announcement_id"))
                }
                for (an in announcementsList) {
                    if (an.requiresAck) an.acknowledged = ackSet.contains(an.id)
                }
            }
        } catch (_: Exception) {}

        // 6. Directory Members
        val membersList = mutableListOf<DirectoryMember>()
        try {
            val dirParams = JSONObject().apply {
                put("p_chapter", chapter.id)
                put("p_search", JSONObject.NULL)
                put("p_class", JSONObject.NULL)
                put("p_role", JSONObject.NULL)
                put("p_status", JSONObject.NULL)
                put("p_limit", 200)
                put("p_offset", 0)
            }
            val dirRes = try { client.rpc("chapter_directory", dirParams, token) } catch (_: Exception) { null }
            if (dirRes is JSONArray && dirRes.length() > 0) {
                for (m in 0 until dirRes.length()) {
                    val r = dirRes.getJSONObject(m)
                    val rolesArr = r.optJSONArray("roles")
                    val rolesList = mutableListOf<String>()
                    if (rolesArr != null) {
                        for (k in 0 until rolesArr.length()) {
                            val item = rolesArr.opt(k)
                            if (item is JSONObject) rolesList.add(item.optString("name"))
                            else if (item is String) rolesList.add(item)
                        }
                    }
                    val displayName = r.optStringOrNull("display_name")
                    val fullName = r.optStringOrNull("full_name")
                    val pName = listOfNotNull(displayName, fullName).firstOrNull { it.isNotBlank() } ?: r.optString("name", "Member")
                    val inHouse = if (r.has("in_house") && !r.isNull("in_house")) {
                        if (r.optBoolean("in_house")) "In house" else "Out of house"
                    } else r.optStringOrNull("room_name")

                    membersList.add(
                        DirectoryMember(
                            id = r.optString("user_id"),
                            membershipId = r.optStringOrNull("membership_id") ?: r.optString("id"),
                            name = pName,
                            email = r.optString("email", ""),
                            memberClass = MemberClass.from(r.optString("member_class")),
                            status = MembershipStatus.from(r.optString("status")),
                            roles = rolesList,
                            graduationYear = r.optIntOrNull("graduation_year"),
                            house = inHouse,
                            avatarPath = r.optStringOrNull("avatar_path")
                        )
                    )
                }
            } else {
                // Fallback query
                val fallbackDir = try {
                    client.select(
                        "memberships",
                        "select=id,user_id,member_class,status&chapter_id=eq.${chapter.id}&status=in.(active,inactive,suspended)&limit=200",
                        token
                    )
                } catch (_: Exception) { JSONArray() }

                val uids = mutableListOf<String>()
                for (m in 0 until fallbackDir.length()) {
                    val u = fallbackDir.getJSONObject(m).optString("user_id")
                    if (u.isNotEmpty()) uids.add(u)
                }
                val profMap = mutableMapOf<String, JSONObject>()
                if (uids.isNotEmpty()) {
                    try {
                        val pArr = client.select(
                            "profiles",
                            "select=id,display_name,full_name,avatar_path,graduation_year&id=in.(${uids.joinToString(",")})",
                            token
                        )
                        for (pIdx in 0 until pArr.length()) {
                            val pObj = pArr.getJSONObject(pIdx)
                            profMap[pObj.optString("id")] = pObj
                        }
                    } catch (_: Exception) {}
                }

                for (m in 0 until fallbackDir.length()) {
                    val r = fallbackDir.getJSONObject(m)
                    val uid = r.optString("user_id")
                    val p = profMap[uid]
                    val pName = listOfNotNull(p?.optStringOrNull("display_name"), p?.optStringOrNull("full_name")).firstOrNull { it.isNotBlank() } ?: "Member"
                    membersList.add(
                        DirectoryMember(
                            id = uid,
                            membershipId = r.optString("id"),
                            name = pName,
                            email = "",
                            memberClass = MemberClass.from(r.optString("member_class")),
                            status = MembershipStatus.from(r.optString("status")),
                            graduationYear = p?.optIntOrNull("graduation_year"),
                            avatarPath = p?.optStringOrNull("avatar_path")
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // 7. Member Charges
        val chargesList = mutableListOf<DuesCharge>()
        try {
            val chArr = client.select(
                "member_assessment_balances",
                "select=id,title,category,amount_cents,outstanding_cents,processing_cents,due_date,status,allow_installments,max_installments&membership_id=eq.${mem.id}&order=due_date.asc",
                token
            )
            for (i in 0 until chArr.length()) {
                val r = chArr.getJSONObject(i)
                chargesList.add(
                    DuesCharge(
                        id = r.optString("id"),
                        title = r.optString("title"),
                        category = r.optString("category", "Dues"),
                        amountCents = r.optInt("amount_cents", 0),
                        outstandingCents = r.optInt("outstanding_cents", 0),
                        processingCents = r.optInt("processing_cents", 0),
                        dueDate = r.optStringOrNull("due_date")?.let { ISODate.parse(it) } ?: Date(),
                        status = r.optString("status", "open"),
                        allowInstallments = r.optBoolean("allow_installments", false),
                        maxInstallments = r.optInt("max_installments", 1)
                    )
                )
            }
        } catch (_: Exception) {}

        // 8. Member Payments
        val paymentsList = mutableListOf<PaymentRecord>()
        try {
            val payArr = client.select(
                "payments",
                "select=id,kind,method,status,amount_cents,created_at&membership_id=eq.${mem.id}&status=neq.pending&order=created_at.desc&limit=40",
                token
            )
            for (i in 0 until payArr.length()) {
                val r = payArr.getJSONObject(i)
                paymentsList.add(
                    PaymentRecord(
                        id = r.optString("id"),
                        title = r.optString("kind", "Payment"),
                        method = r.optString("method", "Card"),
                        status = PaymentStatus.from(r.optString("status")),
                        amountCents = r.optInt("amount_cents", 0),
                        createdAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date()
                    )
                )
            }
        } catch (_: Exception) {}

        // 9. Reimbursements
        val reimbursementsList = mutableListOf<Reimbursement>()
        try {
            val officer = permissions.contains(Permission.FINANCE_VIEW)
            val filter = if (officer) "chapter_id=eq.${chapter.id}" else "chapter_id=eq.${chapter.id}&user_id=eq.$userId"
            val rmArr = client.select(
                "reimbursement_requests",
                "select=id,description,amount_cents,status,created_at&$filter&order=created_at.desc&limit=80",
                token
            )
            for (i in 0 until rmArr.length()) {
                val r = rmArr.getJSONObject(i)
                reimbursementsList.add(
                    Reimbursement(
                        id = r.optString("id"),
                        title = r.optString("description"),
                        amountCents = r.optInt("amount_cents", 0),
                        status = r.optString("status", "pending").replaceFirstChar { it.uppercase() },
                        submittedAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date(),
                        requester = email ?: "Member"
                    )
                )
            }
        } catch (_: Exception) {}

        // 10. Conversations
        val conversationsList = mutableListOf<Conversation>()
        var unreadCount = 0
        try {
            val convRes = client.rpc("my_conversations", JSONObject().put("p_chapter", chapter.id), token)
            if (convRes is JSONArray) {
                for (c in 0 until convRes.length()) {
                    val r = convRes.getJSONObject(c)
                    val kind = ConversationKind.from(r.optString("kind"))
                    val isDirect = (kind == ConversationKind.DIRECT)
                    val title = if (isDirect) (r.optStringOrNull("other_display_name") ?: "Direct message") else (r.optStringOrNull("name") ?: "Channel")
                    val topic = r.optStringOrNull("topic")
                    val memberCount = r.optInt("member_count", 0)
                    val unread = r.optInt("unread_count", 0)
                    unreadCount += unread
                    conversationsList.add(
                        Conversation(
                            id = r.optString("id"),
                            kind = kind,
                            title = title,
                            subtitle = if (isDirect) "Direct message" else if (!topic.isNullOrEmpty()) topic else "$memberCount members",
                            unread = unread,
                            messages = emptyList(),
                            didLoadMessages = false
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // 11. Recruitment Stages & Prospects
        val stagesList = mutableListOf<RecruitmentStage>()
        val prospectsList = mutableListOf<Prospect>()
        try {
            val stArr = client.select("recruitment_stages", "select=id,name,position,outcome&chapter_id=eq.${chapter.id}&order=position.asc,name.asc", token)
            for (i in 0 until stArr.length()) {
                val r = stArr.getJSONObject(i)
                stagesList.add(
                    RecruitmentStage(
                        id = r.optString("id"),
                        name = r.optString("name"),
                        position = r.optInt("position", 0),
                        outcome = r.optString("outcome", "open")
                    )
                )
            }
            val stageMap = stagesList.associateBy { it.id }

            val prArr = client.select("prospects", "select=id,full_name,preferred_name,class_year,major,hometown,stage_id,owner_membership_id,next_follow_up_at,updated_at&chapter_id=eq.${chapter.id}&status=eq.active&order=updated_at.desc&limit=500", token)
            val memberNames = membersList.associate { it.membershipId to it.name }
            for (i in 0 until prArr.length()) {
                val r = prArr.getJSONObject(i)
                val stId = r.optString("stage_id")
                val st = stageMap[stId]
                val ownerId = r.optStringOrNull("owner_membership_id")
                val followUp = r.optStringOrNull("next_follow_up_at")?.let { ISODate.parse(it) }
                prospectsList.add(
                    Prospect(
                        id = r.optString("id"),
                        name = r.optString("full_name"),
                        preferredName = r.optStringOrNull("preferred_name"),
                        stageId = stId,
                        stage = st?.name ?: "Stage",
                        outcome = st?.outcome ?: "open",
                        school = r.optString("hometown", ""),
                        major = r.optStringOrNull("major"),
                        classYear = r.optIntOrNull("class_year"),
                        assignedTo = ownerId?.let { memberNames[it] ?: it },
                        followUpAt = followUp,
                        lastActivity = r.optStringOrNull("next_follow_up_at") ?: r.optStringOrNull("updated_at")
                    )
                )
            }
        } catch (_: Exception) {}

        // 12. Ledger Entries
        val ledgerList = mutableListOf<LedgerEntry>()
        try {
            val lArr = client.select("ledger_transactions", "select=id,kind,description,occurred_at,ledger_entries(id,account,amount_cents)&chapter_id=eq.${chapter.id}&order=occurred_at.desc&limit=40", token)
            for (i in 0 until lArr.length()) {
                val txn = lArr.getJSONObject(i)
                val date = txn.optStringOrNull("occurred_at")?.let { ISODate.parse(it) } ?: Date()
                val desc = txn.optString("description", "")
                val entriesArr = txn.optJSONArray("ledger_entries")
                if (entriesArr != null) {
                    for (e in 0 until entriesArr.length()) {
                        val entry = entriesArr.getJSONObject(e)
                        val amt = entry.optInt("amount_cents", 0)
                        ledgerList.add(
                            LedgerEntry(
                                id = entry.optString("id"),
                                date = date,
                                memo = desc.ifEmpty { txn.optString("kind", "Transaction") },
                                debitCents = if (amt > 0) amt else 0,
                                creditCents = if (amt < 0) -amt else 0,
                                account = entry.optString("account", "General")
                            )
                        )
                    }
                }
            }
        } catch (_: Exception) {}

        // 13. Service Hours
        val serviceHoursList = mutableListOf<ServiceHour>()
        try {
            val officer = permissions.contains(Permission.PHILANTHROPY_MANAGE)
            val filter = if (officer) "chapter_id=eq.${chapter.id}" else "chapter_id=eq.${chapter.id}&user_id=eq.$userId"
            val shArr = client.select("service_hours", "select=id,user_id,organization,hours,served_on,status&$filter&order=served_on.desc&limit=80", token)
            for (i in 0 until shArr.length()) {
                val r = shArr.getJSONObject(i)
                serviceHoursList.add(
                    ServiceHour(
                        id = r.optString("id"),
                        member = if (r.optString("user_id") == userId) "You" else "Member",
                        hours = r.optDouble("hours", 0.0).toInt(),
                        event = r.optString("organization"),
                        status = r.optString("status", "pending").replaceFirstChar { it.uppercase() },
                        date = r.optStringOrNull("served_on")?.let { ISODate.parse(it) } ?: Date()
                    )
                )
            }
        } catch (_: Exception) {}

        // 14. Chores
        val choresList = mutableListOf<HousingChore>()
        try {
            val chArr = client.select("chores", "select=id,title,due_on,status&chapter_id=eq.${chapter.id}&assigned_membership_id=eq.${mem.id}&order=due_on.desc&limit=20", token)
            for (i in 0 until chArr.length()) {
                val r = chArr.getJSONObject(i)
                choresList.add(
                    HousingChore(
                        id = r.optString("id"),
                        title = r.optString("title"),
                        assignee = "You",
                        due = r.optString("due_on", ""),
                        done = r.optString("status") == "done"
                    )
                )
            }
        } catch (_: Exception) {}

        // 15. Policies
        val policiesList = mutableListOf<PolicyDoc>()
        try {
            val polArr = client.select("policy_documents", "select=id,title,current_version,requires_ack,category&chapter_id=eq.${chapter.id}&current_version=gt.0&order=title.asc", token)
            for (i in 0 until polArr.length()) {
                val r = polArr.getJSONObject(i)
                policiesList.add(
                    PolicyDoc(
                        id = r.optString("id"),
                        title = r.optString("title"),
                        version = "${r.optInt("current_version", 1)}",
                        acknowledged = !r.optBoolean("requires_ack", false)
                    )
                )
            }
        } catch (_: Exception) {}

        // 16. Study Groups
        val studyGroupsList = mutableListOf<StudyGroup>()
        try {
            val sgArr = client.select("study_groups", "select=id,name,course_code,meeting_info&chapter_id=eq.${chapter.id}&order=name.asc&limit=40", token)
            for (i in 0 until sgArr.length()) {
                val r = sgArr.getJSONObject(i)
                studyGroupsList.add(
                    StudyGroup(
                        id = r.optString("id"),
                        title = r.optString("name"),
                        course = r.optString("course_code", ""),
                        nextMeeting = r.optString("meeting_info", ""),
                        members = 0
                    )
                )
            }
        } catch (_: Exception) {}

        // 17. Officer Financial Tools: Summary, Assessments, Member Balances, Budget, Collections
        var financeSummary = FinanceSummary()
        val memberBalancesList = mutableListOf<ChapterMemberBalance>()
        val assessmentsList = mutableListOf<ChapterAssessment>()
        val budgetLinesList = mutableListOf<BudgetLine>()
        val expensesList = mutableListOf<BudgetExpense>()
        val monthlyList = mutableListOf<MonthlyCollection>()

        if (permissions.contains(Permission.FINANCE_VIEW)) {
            try {
                val cal = Calendar.getInstance()
                cal.add(Calendar.DAY_OF_YEAR, -90)
                val fromStr = ISODate.timestamp(cal.time)
                val toStr = ISODate.timestamp()
                val fsRes = client.rpc("chapter_financial_summary", JSONObject().put("p_chapter", chapter.id).put("p_from", fromStr).put("p_to", toStr), token)
                if (fsRes is JSONObject) {
                    fun flexInt(k: String): Int {
                        val v = fsRes.opt(k)
                        return when (v) {
                            is Number -> v.toInt()
                            is JSONObject -> v.optInt("value", 0)
                            else -> 0
                        }
                    }
                    financeSummary = FinanceSummary(
                        assessedCents = flexInt("assessed_cents"),
                        voidedCents = flexInt("voided_cents"),
                        collectedOnlineCents = flexInt("collected_online_cents"),
                        collectedOfflineCents = flexInt("collected_offline_cents"),
                        creditsCents = flexInt("credits_cents"),
                        refundsCents = flexInt("refunds_cents"),
                        platformFeesCents = flexInt("platform_fees_cents"),
                        processingFeesCents = flexInt("processing_fees_cents"),
                        disputedCents = flexInt("disputed_cents"),
                        payoutsCents = flexInt("payouts_cents"),
                        outstandingCents = flexInt("outstanding_cents"),
                        stripeBalanceCents = flexInt("stripe_balance_cents"),
                        processingCents = flexInt("processing_cents"),
                        failedCount = flexInt("failed_count"),
                        openDisputes = flexInt("open_disputes"),
                        membersWithBalance = flexInt("members_with_balance")
                    )
                }
            } catch (_: Exception) {}

            try {
                val mbRes = client.rpc("chapter_member_balances", JSONObject().put("p_chapter", chapter.id), token)
                if (mbRes is JSONArray) {
                    for (i in 0 until mbRes.length()) {
                        val r = mbRes.getJSONObject(i)
                        val mClassStr = r.optString("member_class")
                        val mClass = MemberClass.entries.firstOrNull { it.name.equals(mClassStr, true) } ?: MemberClass.ACTIVE
                        memberBalancesList.add(
                            ChapterMemberBalance(
                                id = r.optString("membership_id"),
                                name = listOfNotNull(r.optStringOrNull("display_name"), r.optStringOrNull("full_name")).firstOrNull { it.isNotBlank() } ?: "Member",
                                balanceCents = r.optInt("balance_cents", 0),
                                email = "",
                                overdueCents = r.optInt("overdue_cents", 0),
                                memberClass = mClass
                            )
                        )
                    }
                }
            } catch (_: Exception) {}

            try {
                val asArr = client.select("dues_assessments", "select=id,title,category,default_amount_cents,due_date,status,allow_installments&chapter_id=eq.${chapter.id}&status=neq.cancelled&order=due_date.desc", token)
                for (i in 0 until asArr.length()) {
                    val r = asArr.getJSONObject(i)
                    assessmentsList.add(
                        ChapterAssessment(
                            id = r.optString("id"),
                            title = r.optString("title"),
                            amountCents = r.optInt("default_amount_cents", 0),
                            dueDate = r.optStringOrNull("due_date")?.let { ISODate.parse(it) } ?: Date(),
                            category = r.optString("category", "dues"),
                            memberCount = 0,
                            outstandingCents = 0
                        )
                    )
                }
            } catch (_: Exception) {}

            try {
                val blArr = client.select("budget_lines", "select=id,category,planned_cents&chapter_id=eq.${chapter.id}&order=category.asc", token)
                for (i in 0 until blArr.length()) {
                    val r = blArr.getJSONObject(i)
                    budgetLinesList.add(
                        BudgetLine(
                            id = r.optString("id"),
                            name = r.optString("category"),
                            plannedCents = r.optInt("planned_cents", 0),
                            spentCents = 0
                        )
                    )
                }
            } catch (_: Exception) {}

            try {
                val expArr = client.select("expenses", "select=id,description,vendor,amount_cents,spent_on,budget_line_id&chapter_id=eq.${chapter.id}&order=spent_on.desc&limit=40", token)
                for (i in 0 until expArr.length()) {
                    val r = expArr.getJSONObject(i)
                    expensesList.add(
                        BudgetExpense(
                            id = r.optString("id"),
                            description = r.optString("description"),
                            amountCents = r.optInt("amount_cents", 0),
                            date = r.optStringOrNull("spent_on")?.let { ISODate.parse(it) } ?: Date()
                        )
                    )
                }
            } catch (_: Exception) {}

            try {
                val mcRes = client.rpc("chapter_monthly_collections", JSONObject().put("p_chapter", chapter.id).put("p_months", 12), token)
                if (mcRes is JSONArray) {
                    for (i in 0 until mcRes.length()) {
                        val r = mcRes.getJSONObject(i)
                        monthlyList.add(
                            MonthlyCollection(
                                id = r.optString("month"),
                                month = r.optString("month"),
                                amountCents = r.optInt("online_cents", 0) + r.optInt("offline_cents", 0)
                            )
                        )
                    }
                }
            } catch (_: Exception) {}
        }

        // 18. Roles & Invitations
        val rolesList = mutableListOf<ChapterRole>()
        val invitationsList = mutableListOf<ChapterInvitation>()
        try {
            val roArr = client.select("roles", "select=id,key,name,description,kind,is_officer,is_owner&chapter_id=eq.${chapter.id}&order=sort_order.asc,name.asc", token)
            for (i in 0 until roArr.length()) {
                val r = roArr.getJSONObject(i)
                rolesList.add(
                    ChapterRole(
                        id = r.optString("id"),
                        name = r.optString("name"),
                        isExec = r.optBoolean("is_officer", false)
                    )
                )
            }
        } catch (_: Exception) {}

        try {
            val invArr = client.select("chapter_invitations", "select=id,email,full_name,member_class,created_at&chapter_id=eq.${chapter.id}&status=eq.pending&order=created_at.desc&limit=80", token)
            for (i in 0 until invArr.length()) {
                val r = invArr.getJSONObject(i)
                invitationsList.add(
                    ChapterInvitation(
                        id = r.optString("id"),
                        email = r.optString("email"),
                        role = r.optString("member_class", "Active"),
                        status = "pending"
                    )
                )
            }
        } catch (_: Exception) {}

        // 19. Audit Logs
        val auditList = mutableListOf<AuditEvent>()
        try {
            val auArr = client.select("audit_logs", "select=id,actor_id,actor_kind,action,metadata,created_at&chapter_id=eq.${chapter.id}&order=id.desc&limit=40", token)
            for (i in 0 until auArr.length()) {
                val r = auArr.getJSONObject(i)
                val whenDate = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date()
                val meta = r.opt("metadata")
                val detailStr = if (meta is JSONObject) meta.toString() else meta?.toString() ?: ""
                auditList.add(
                    AuditEvent(
                        id = r.optString("id"),
                        whenDate = whenDate,
                        actor = r.optString("actor_kind", "Officer"),
                        action = r.optString("action"),
                        detail = detailStr
                    )
                )
            }
        } catch (_: Exception) {}

        // 20. Housing Rooms & Occupancy
        val roomsList = mutableListOf<HousingRoom>()
        try {
            val rmArr = client.select("housing_rooms", "select=id,name,floor,capacity,rent_cents&chapter_id=eq.${chapter.id}&archived_at=is.null&order=name.asc", token)
            val today = ISODate.format(Date()).substringBefore("T")
            val assignArr = try {
                client.select("room_assignments", "select=room_id,ends_on&chapter_id=eq.${chapter.id}&or=(ends_on.is.null,ends_on.gte.$today)", token)
            } catch (_: Exception) { JSONArray() }
            val occupiedCount = mutableMapOf<String, Int>()
            for (i in 0 until assignArr.length()) {
                val rId = assignArr.getJSONObject(i).optString("room_id")
                occupiedCount[rId] = (occupiedCount[rId] ?: 0) + 1
            }
            for (i in 0 until rmArr.length()) {
                val r = rmArr.getJSONObject(i)
                val rId = r.optString("id")
                roomsList.add(
                    HousingRoom(
                        id = rId,
                        name = r.optString("name"),
                        floor = r.optStringOrNull("floor"),
                        capacity = r.optInt("capacity", 1),
                        occupied = occupiedCount[rId] ?: 0,
                        rentCents = r.optIntOrNull("rent_cents")
                    )
                )
            }
        } catch (_: Exception) {}

        // 20b. Housing Requests
        val housingRequestsList = mutableListOf<HousingRequest>()
        try {
            val hrArr = client.select("housing_requests", "select=id,membership_id,term_label,notes,wants_single,status,response&chapter_id=eq.${chapter.id}&order=created_at.desc&limit=80", token)
            val namesMap = membersList.associate { it.membershipId to it.name }
            for (i in 0 until hrArr.length()) {
                val r = hrArr.getJSONObject(i)
                val mId = r.optString("membership_id")
                housingRequestsList.add(
                    HousingRequest(
                        id = r.optString("id"),
                        membershipId = mId,
                        memberName = namesMap[mId] ?: "Member",
                        term = r.optString("term_label"),
                        notes = r.optStringOrNull("notes"),
                        wantsSingle = r.optBoolean("wants_single", false),
                        status = r.optString("status", "pending"),
                        response = r.optStringOrNull("response")
                    )
                )
            }
        } catch (_: Exception) {}

        // 20c. Maintenance Requests
        val maintenanceRequestsList = mutableListOf<MaintenanceRequest>()
        try {
            val mrArr = client.select("maintenance_requests", "select=id,title,location,priority,status,description&chapter_id=eq.${chapter.id}&order=created_at.desc&limit=40", token)
            for (i in 0 until mrArr.length()) {
                val r = mrArr.getJSONObject(i)
                maintenanceRequestsList.add(
                    MaintenanceRequest(
                        id = r.optString("id"),
                        title = r.optString("title"),
                        location = r.optStringOrNull("location"),
                        priority = r.optString("priority", "normal"),
                        status = r.optString("status", "submitted"),
                        description = r.optStringOrNull("description")
                    )
                )
            }
        } catch (_: Exception) {}

        // 20d. Academic Goals
        val academicGoalsList = mutableListOf<AcademicGoal>()
        try {
            val agArr = client.select("academic_goals", "select=id,title,target_date,status,share_with_scholarship&chapter_id=eq.${chapter.id}&user_id=eq.$userId&order=created_at.desc&limit=30", token)
            for (i in 0 until agArr.length()) {
                val r = agArr.getJSONObject(i)
                academicGoalsList.add(
                    AcademicGoal(
                        id = r.optString("id"),
                        title = r.optString("title"),
                        targetDate = r.optStringOrNull("target_date")?.let { ISODate.parse(it) },
                        status = r.optString("status", "active"),
                        shareWithScholarship = r.optBoolean("share_with_scholarship", false)
                    )
                )
            }
        } catch (_: Exception) {}

        // 21. Campaigns
        val campaignsList = mutableListOf<Campaign>()
        try {
            val cpArr = client.select("fundraising_campaigns", "select=id,name,beneficiary,goal_cents,status&chapter_id=eq.${chapter.id}&order=created_at.desc&limit=30", token)
            for (i in 0 until cpArr.length()) {
                val r = cpArr.getJSONObject(i)
                campaignsList.add(
                    Campaign(
                        id = r.optString("id"),
                        title = r.optString("name"),
                        goalCents = r.optInt("goal_cents", 0),
                        raisedCents = 0,
                        beneficiary = r.optString("beneficiary", ""),
                        status = r.optString("status", "active")
                    )
                )
            }
        } catch (_: Exception) {}

        // 22. Profile Details
        var profileDetails = ChapterProfileDetails()
        try {
            val detArr = client.select("chapters", "select=description,founded_year,verified_at&id=eq.${chapter.id}", token)
            if (detArr.length() > 0) {
                val r = detArr.getJSONObject(0)
                profileDetails = ChapterProfileDetails(
                    description = r.optString("description", ""),
                    foundedYear = r.optIntOrNull("founded_year"),
                    verifiedAt = r.optStringOrNull("verified_at")?.let { ISODate.parse(it) }
                )
            }
        } catch (_: Exception) {}

        // 23. Engagement Summary
        var engagement = EngagementSummary()
        try {
            val cal = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -90) }
            val fromStr = ISODate.format(cal.time)
            val toStr = ISODate.format(Date())
            val engParams = JSONObject().apply {
                put("p_chapter", chapter.id)
                put("p_from", fromStr)
                put("p_to", toStr)
            }
            val engRes = client.rpc("chapter_engagement_summary", engParams, token)
            val engObj = when (engRes) {
                is JSONArray -> if (engRes.length() > 0) engRes.getJSONObject(0) else null
                is JSONObject -> engRes
                else -> null
            }
            if (engObj != null) {
                val funnel = mutableListOf<FunnelStage>()
                val fArr = engObj.optJSONArray("prospects_by_stage")
                if (fArr != null) {
                    for (fi in 0 until fArr.length()) {
                        val fo = fArr.getJSONObject(fi)
                        val countVal = if (fo.optJSONObject("count") != null) fo.getJSONObject("count").optInt("value", 0) else fo.optInt("count", 0)
                        funnel.add(
                            FunnelStage(
                                stage = fo.optString("stage"),
                                outcome = fo.optString("outcome", "open"),
                                count = countVal
                            )
                        )
                    }
                }
                fun flexInt(key: String): Int {
                    val v = engObj.opt(key)
                    return when (v) {
                        is Number -> v.toInt()
                        is JSONObject -> v.optInt("value", 0)
                        else -> 0
                    }
                }
                fun flexDouble(key: String): Double {
                    val v = engObj.opt(key)
                    return when (v) {
                        is Number -> v.toDouble()
                        is JSONObject -> v.optDouble("value", 0.0)
                        else -> 0.0
                    }
                }
                engagement = EngagementSummary(
                    activeMembers = flexInt("active_members"),
                    eventsHeld = flexInt("events_held"),
                    requiredEvents = flexInt("required_events"),
                    attendanceRecords = flexInt("attendance_records"),
                    requiredAttendanceRate = if (engObj.has("required_attendance_rate") && !engObj.isNull("required_attendance_rate")) engObj.optDouble("required_attendance_rate") else null,
                    serviceHours = flexDouble("service_hours"),
                    serviceParticipants = flexInt("service_participants"),
                    messagesSent = flexInt("messages_sent"),
                    prospectsByStage = funnel
                )
            }
        } catch (_: Exception) {}

        // 24. Setup Steps
        val setupSteps = mutableListOf<SetupStep>()
        setupSteps.add(
            SetupStep(
                id = "profile",
                title = "Write the chapter profile",
                detail = "Add a short description in Settings so members can tell this account is yours.",
                actionTitle = "Open settings",
                destination = ChapterDestination.SETTINGS,
                done = profileDetails.description.length >= 20
            )
        )
        setupSteps.add(
            SetupStep(
                id = "roster",
                title = "Invite the roster",
                detail = "Invite members from the Members page. A pending invitation finishes this step.",
                actionTitle = "Invite members",
                destination = ChapterDestination.DIRECTORY,
                done = membersList.size > 1 || invitationsList.isNotEmpty()
            )
        )
        setupSteps.add(
            SetupStep(
                id = "officers",
                title = "Assign officer roles",
                detail = "Give someone treasurer, secretary, or another officer role.",
                actionTitle = "Assign officers",
                destination = ChapterDestination.SETTINGS,
                done = rolesList.any { it.isExec }
            )
        )
        setupSteps.add(
            SetupStep(
                id = "billing",
                title = "Turn on dues collection",
                detail = if (canCollect) "Members can pay dues online." else "Accept the agreement, start the subscription, and connect Stripe.",
                actionTitle = "Set up dues",
                destination = ChapterDestination.SETTINGS,
                done = canCollect
            )
        )

        // Officer Stats
        val officerStats = listOf(
            OfficerStat("active_members", "Active Members", "${membersList.size}", Tone.ACCENT),
            OfficerStat("unpaid_dues", "Unpaid Dues", "${chargesList.count { it.outstandingCents > 0 }}", Tone.WARNING),
            OfficerStat("upcoming_events", "Events Scheduled", "${eventsList.size}", Tone.INFO),
            OfficerStat("prospects_total", "Active Prospects", "${prospectsList.size}", Tone.POSITIVE)
        )

        ChapterContext(
            chapter = chapter,
            membership = mem,
            permissions = permissions,
            balance = memberBalance,
            events = eventsList,
            announcements = announcementsList,
            members = membersList,
            charges = chargesList,
            payments = paymentsList,
            reimbursements = reimbursementsList,
            conversations = conversationsList,
            prospects = prospectsList,
            stages = stagesList,
            ledger = ledgerList,
            serviceHours = serviceHoursList,
            chores = choresList,
            policies = policiesList,
            studyGroups = studyGroupsList,
            officerStats = officerStats,
            unreadMessages = unreadCount,
            canCollect = canCollect,
            financeSummary = financeSummary,
            memberBalances = memberBalancesList,
            assessments = assessmentsList,
            budgetLines = budgetLinesList,
            expenses = expensesList,
            monthlyCollections = monthlyList,
            engagement = engagement,
            roles = rolesList,
            invitations = invitationsList,
            auditLogs = auditList,
            rooms = roomsList,
            campaigns = campaignsList,
            profileDetails = profileDetails,
            setupSteps = setupSteps,
            billing = billing,
            housingRequests = housingRequestsList,
            maintenanceRequests = maintenanceRequestsList,
            academicGoals = academicGoalsList
        )
    }

    suspend fun loadMessages(conversationId: String, names: Map<String, String> = emptyMap()): List<ChatMessage> = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext emptyList()
        val arr = try {
            client.select(
                "messages",
                "select=id,conversation_id,sender_id,body,edited_at,deleted_at,pinned_at,created_at,reply_to_id&conversation_id=eq.$conversationId&parent_id=is.null&deleted_at=is.null&order=created_at.desc&limit=80",
                token
            )
        } catch (_: Exception) { JSONArray() }

        val rows = mutableListOf<JSONObject>()
        val senderIds = mutableSetOf<String>()
        val quotes = mutableMapOf<String, JSONObject>()

        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            if (r.optStringOrNull("deleted_at") == null) {
                rows.add(r)
                quotes[r.optString("id")] = r
                val sId = r.optString("sender_id")
                if (sId.isNotEmpty()) senderIds.add(sId)
            }
        }

        val resolvedNames = names.toMutableMap()
        val missing = senderIds.filter { !resolvedNames.containsKey(it) }
        if (missing.isNotEmpty()) {
            try {
                val pArr = client.select("profiles", "select=id,display_name,full_name&id=in.(${missing.joinToString(",")})", token)
                for (i in 0 until pArr.length()) {
                    val p = pArr.getJSONObject(i)
                    val pName = listOfNotNull(p.optStringOrNull("display_name"), p.optStringOrNull("full_name")).firstOrNull { it.isNotBlank() } ?: "Member"
                    resolvedNames[p.optString("id")] = pName
                }
            } catch (_: Exception) {}
        }

        val list = mutableListOf<ChatMessage>()
        for (row in rows) {
            val createdAt = row.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date()
            val senderId = row.optString("sender_id")
            val senderName = if (senderId == userId) "You" else (resolvedNames[senderId] ?: "Member")
            val replyToId = row.optStringOrNull("reply_to_id")
            val quote = replyToId?.let { quotes[it] }
            val quoteSender = quote?.optString("sender_id")
            val quoteName = if (quoteSender != null) {
                if (quoteSender == userId) "You" else (resolvedNames[quoteSender] ?: "Member")
            } else null
            val quoteBody = quote?.let {
                if (it.optStringOrNull("deleted_at") == null) it.optString("body") else "This message was deleted."
            }

            list.add(
                ChatMessage(
                    id = row.optString("id"),
                    conversationId = row.optString("conversation_id"),
                    from = senderName,
                    senderId = senderId,
                    body = row.optString("body"),
                    time = DateFormat.clock(createdAt),
                    pinned = row.optStringOrNull("pinned_at") != null,
                    edited = row.optStringOrNull("edited_at") != null,
                    replyToId = replyToId,
                    replyFrom = quoteName,
                    replyBody = quoteBody
                )
            )
        }
        list.reversed()
    }

    suspend fun sendMessage(conversationId: String, body: String, replyToId: String? = null): ChatMessage = withContext(Dispatchers.IO) {
        val token = accessToken ?: throw SupabaseException("Not authenticated")
        val params = JSONObject().apply {
            put("p_conversation", conversationId)
            put("p_body", body.trim())
            put("p_parent", JSONObject.NULL)
            put("p_mentions", JSONArray())
            put("p_mention_roles", JSONArray())
            put("p_mention_all", false)
            put("p_attachments", JSONArray())
            put("p_reply_to", replyToId ?: JSONObject.NULL)
        }
        val res = client.rpc("send_message", params, token)
        val row = when (res) {
            is JSONArray -> if (res.length() > 0) res.getJSONObject(0) else null
            is JSONObject -> res
            else -> null
        }
        val now = Date()
        ChatMessage(
            id = row?.optString("id") ?: UUID.randomUUID().toString(),
            conversationId = conversationId,
            from = "You",
            senderId = userId,
            body = body.trim(),
            time = DateFormat.clock(now)
        )
    }

    suspend fun setReaction(messageId: String, conversationId: String, emoji: String, on: Boolean) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        if (on) {
            val body = JSONObject().apply {
                put("message_id", messageId)
                put("conversation_id", conversationId)
                put("user_id", userId)
                put("emoji", emoji)
            }
            try { client.insert("message_reactions", body, token) } catch (_: Exception) {}
        } else {
            try { client.delete("message_reactions", "message_id=eq.$messageId&user_id=eq.$userId&emoji=eq.$emoji", token) } catch (_: Exception) {}
        }
    }

    suspend fun rsvp(eventId: String, status: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_event", eventId)
            put("p_status", status)
        }
        try { client.rpc("rsvp_event", params, token) } catch (_: Exception) {}
    }

    suspend fun acknowledgeAnnouncement(id: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("announcement_id", id)
            put("user_id", userId)
        }
        try { client.insert("announcement_acks", body, token) } catch (_: Exception) {}
    }

    suspend fun loadNotifications(): List<AppNotification> = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext emptyList()
        val notifsArr = try {
            client.select(
                "notifications",
                "select=id,kind,title,body,link,read_at,created_at&user_id=eq.$userId&order=created_at.desc&limit=30",
                token
            )
        } catch (_: Exception) { JSONArray() }
        val list = mutableListOf<AppNotification>()
        for (i in 0 until notifsArr.length()) {
            val row = notifsArr.getJSONObject(i)
            list.add(
                AppNotification(
                    id = row.optString("id"),
                    title = row.optString("title"),
                    body = row.optString("body"),
                    createdAt = row.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date(),
                    readAt = row.optStringOrNull("read_at")?.let { ISODate.parse(it) },
                    link = row.optStringOrNull("link"),
                    kind = row.optStringOrNull("kind")
                )
            )
        }
        list
    }

    suspend fun markNotificationsRead() = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        try { client.rpc("mark_notifications_read", JSONObject(), token) } catch (_: Exception) {}
    }

    suspend fun updateProfile(fullName: String, displayName: String, graduationYear: Int?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("full_name", fullName)
            put("display_name", displayName)
            put("graduation_year", graduationYear ?: JSONObject.NULL)
        }
        try { client.patch("profiles", "id=eq.$userId", body, token) } catch (_: Exception) {}
    }

    suspend fun reportBug(page: String, description: String) = withContext(Dispatchers.IO) {
        submitBugReport(description, page, null)
    }

    suspend fun submitBugReport(message: String, page: String, viewport: String? = null) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_message", message)
            put("p_page", page)
            put("p_user_agent", "GreekGeek Android")
            put("p_viewport", viewport ?: JSONObject.NULL)
            put("p_build", "android")
        }
        try { client.rpc("submit_bug_report", params, token) } catch (_: Exception) {}
    }

    suspend fun submitReimbursement(chapterId: String, title: String, amountCents: Int) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("user_id", userId)
            put("description", title)
            put("amount_cents", amountCents)
            put("spent_on", ISODate.day())
        }
        try { client.insert("reimbursement_requests", body, token) } catch (_: Exception) {}
    }

    suspend fun logServiceHours(chapterId: String, organization: String, description: String?, hours: Double, servedOn: Date) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("user_id", userId)
            put("organization", organization)
            put("description", description ?: JSONObject.NULL)
            put("hours", hours)
            put("served_on", ISODate.day(servedOn))
        }
        try { client.insert("service_hours", body, token) } catch (_: Exception) {}
    }

    suspend fun reviewServiceHours(id: String, status: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("status", status)
            put("reviewed_by", userId)
            put("reviewed_at", ISODate.timestamp())
        }
        try { client.patch("service_hours", "id=eq.$id&status=eq.submitted", body, token) } catch (_: Exception) {}
    }

    suspend fun createCampaign(chapterId: String, name: String, beneficiary: String, goalCents: Int?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("created_by", userId)
            put("name", name)
            put("beneficiary", beneficiary)
            put("goal_cents", goalCents ?: JSONObject.NULL)
        }
        try { client.insert("fundraising_campaigns", body, token) } catch (_: Exception) {}
    }

    suspend fun submitHousingRequest(chapterId: String, term: String, roomIds: List<String>, roommateIds: List<String>, wantsSingle: Boolean, notes: String?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_chapter", chapterId)
            put("p_term", term)
            put("p_rooms", JSONArray(roomIds))
            put("p_roommates", JSONArray(roommateIds))
            put("p_single", wantsSingle)
            put("p_notes", notes ?: JSONObject.NULL)
        }
        try { client.rpc("submit_housing_request", params, token) } catch (_: Exception) {}
    }

    suspend fun respondHousingRequest(id: String, status: String, response: String?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_request", id)
            put("p_status", status)
            put("p_response", response ?: JSONObject.NULL)
        }
        try { client.rpc("respond_housing_request", params, token) } catch (_: Exception) {}
    }

    suspend fun saveHousingRoom(chapterId: String, name: String, floor: String?, capacity: Int, rentCents: Int?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_chapter", chapterId)
            put("p_room", JSONObject.NULL)
            put("p_name", name)
            put("p_floor", floor ?: JSONObject.NULL)
            put("p_capacity", capacity)
            put("p_rent_cents", rentCents ?: JSONObject.NULL)
            put("p_features", JSONArray())
            put("p_notes", JSONObject.NULL)
        }
        try { client.rpc("save_housing_room", params, token) } catch (_: Exception) {}
    }

    suspend fun submitMaintenance(chapterId: String, title: String, location: String?, description: String?, priority: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("submitted_by", userId)
            put("title", title)
            put("location", location ?: JSONObject.NULL)
            put("description", description ?: JSONObject.NULL)
            put("priority", priority)
        }
        try { client.insert("maintenance_requests", body, token) } catch (_: Exception) {}
    }

    suspend fun publishAnnouncement(chapterId: String, title: String, body: String, audience: String, pinned: Boolean, requiresAck: Boolean) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val payload = JSONObject().apply {
            put("chapter_id", chapterId)
            put("author_id", userId)
            put("title", title)
            put("body", body)
            put("audience", audience)
            put("pinned", pinned)
            put("requires_ack", requiresAck)
            put("comments_enabled", false)
        }
        try { client.insert("announcements", payload, token) } catch (_: Exception) {}
    }

    suspend fun createEvent(chapterId: String, title: String, location: String?, details: String?, startsAt: Date, endsAt: Date, timezone: String, attendanceRequired: Boolean) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val payload = JSONObject().apply {
            put("chapter_id", chapterId)
            put("created_by", userId)
            put("title", title)
            put("location", location ?: JSONObject.NULL)
            put("description", details ?: JSONObject.NULL)
            put("starts_at", ISODate.timestamp(startsAt))
            put("ends_at", ISODate.timestamp(endsAt))
            put("timezone", timezone)
            put("attendance_required", attendanceRequired)
            put("category", "chapter")
            put("visibility", "chapter")
        }
        try { client.insert("events", payload, token) } catch (_: Exception) {}
    }

    suspend fun createPolicy(chapterId: String, title: String, category: String, body: String, requiresAck: Boolean) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val doc = JSONObject().apply {
            put("chapter_id", chapterId)
            put("created_by", userId)
            put("title", title)
            put("category", category)
            put("requires_ack", requiresAck)
        }
        val rep = client.insert("policy_documents", doc, token, returnRepresentation = true)
        val arr = try { rep?.let { JSONArray(it) } } catch (_: Exception) { null }
        val id = arr?.optJSONObject(0)?.optString("id") ?: return@withContext
        val params = JSONObject().apply {
            put("p_policy", id)
            put("p_body", body)
            put("p_summary", "Initial version")
        }
        try { client.rpc("publish_policy_version", params, token) } catch (_: Exception) {}
    }

    suspend fun createStudyGroup(chapterId: String, name: String, course: String?, meeting: String?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("created_by", userId)
            put("name", name)
            put("course_code", course ?: JSONObject.NULL)
            put("meeting_info", meeting ?: JSONObject.NULL)
        }
        val rep = client.insert("study_groups", body, token, returnRepresentation = true)
        val arr = try { rep?.let { JSONArray(it) } } catch (_: Exception) { null }
        val id = arr?.optJSONObject(0)?.optString("id") ?: return@withContext
        val mem = JSONObject().apply {
            put("group_id", id)
            put("chapter_id", chapterId)
            put("user_id", userId)
        }
        try { client.insert("study_group_members", mem, token) } catch (_: Exception) {}
    }

    suspend fun addAcademicGoal(chapterId: String, title: String, targetDate: Date?, share: Boolean) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("user_id", userId)
            put("title", title)
            put("target_date", targetDate?.let { ISODate.day(it) } ?: JSONObject.NULL)
            put("share_with_scholarship", share)
        }
        try { client.insert("academic_goals", body, token) } catch (_: Exception) {}
    }

    suspend fun setAcademicGoalStatus(goalId: String, status: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().put("status", status)
        try { client.patch("academic_goals", "id=eq.$goalId", body, token) } catch (_: Exception) {}
    }

    suspend fun updateChapterProfile(chapterId: String, greekLetters: String, description: String, foundedYear: Int?, timezone: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("greek_letters", greekLetters.ifEmpty { JSONObject.NULL })
            put("description", description.ifEmpty { JSONObject.NULL })
            put("founded_year", foundedYear ?: JSONObject.NULL)
            put("timezone", timezone)
        }
        try { client.patch("chapters", "id=eq.$chapterId", body, token) } catch (_: Exception) {}
    }

    suspend fun updateChapterModules(chapterId: String, modules: Map<ChapterModule, Boolean>) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val mods = JSONObject()
        for ((m, v) in modules) {
            mods.put(m.rawValue, v)
        }
        val body = JSONObject().apply { put("modules", mods) }
        try { client.patch("chapters", "id=eq.$chapterId", body, token) } catch (_: Exception) {}
    }

    suspend fun addExistingMember(chapterId: String, email: String, memberClass: String): String = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "no_token"
        val params = JSONObject().apply {
            put("p_chapter", chapterId)
            put("p_email", email.trim())
            put("p_member_class", memberClass)
        }
        val res = try { client.rpc("add_existing_member", params, token) } catch (_: Exception) { null }
        if (res is JSONArray && res.length() > 0) {
            res.getJSONObject(0).optString("status", "no_account")
        } else if (res is JSONObject) {
            res.optString("status", "no_account")
        } else {
            "no_account"
        }
    }

    suspend fun updateMembership(membershipId: String, memberClass: MemberClass, status: MembershipStatus, reason: String?) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_membership", membershipId)
            put("p_member_class", memberClass.rawValue)
            put("p_status", status.rawValue)
            put("p_reason", reason ?: JSONObject.NULL)
        }
        try { client.rpc("update_membership", params, token) } catch (_: Exception) {}
    }

    suspend fun removeChapterMember(membershipId: String, reason: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val params = JSONObject().apply {
            put("p_membership", membershipId)
            put("p_reason", reason)
        }
        try { client.rpc("remove_chapter_member", params, token) } catch (_: Exception) {}
    }

    suspend fun assignRole(chapterId: String, membershipId: String, roleId: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("chapter_id", chapterId)
            put("membership_id", membershipId)
            put("role_id", roleId)
            put("assigned_by", userId)
        }
        try { client.insert("role_assignments", body, token) } catch (_: Exception) {}
    }

    suspend fun endRole(assignmentId: String, chapterId: String) = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext
        val body = JSONObject().apply {
            put("ends_at", ISODate.timestamp())
            put("ended_by", userId)
            put("end_reason", "Removed by officer")
        }
        try { client.patch("role_assignments", "id=eq.$assignmentId&chapter_id=eq.$chapterId&ends_at=is.null", body, token) } catch (_: Exception) {}
    }

    // ==========================================
    // Notification Settings
    // ==========================================

    suspend fun loadNotificationSettings(): List<NotificationKindSetting> = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext emptyList()
        val uid = userId ?: return@withContext emptyList()

        val kindsList = mutableListOf<NotificationKindSetting>()
        try {
            val kindsArr = client.select("notification_kinds", "select=kind,label,description,default_in_app,default_email,required&order=label.asc", token)
            val prefsArr = try {
                client.select("notification_preferences", "select=kind,in_app,email&user_id=eq.$uid", token)
            } catch (_: Exception) { JSONArray() }

            val prefMap = mutableMapOf<String, Pair<Boolean, Boolean>>()
            for (i in 0 until prefsArr.length()) {
                val p = prefsArr.getJSONObject(i)
                val k = p.optString("kind")
                val inApp = p.optBoolean("in_app", true)
                val email = p.optBoolean("email", false)
                prefMap[k] = Pair(inApp, email)
            }

            for (i in 0 until kindsArr.length()) {
                val kObj = kindsArr.getJSONObject(i)
                val kind = kObj.optString("kind")
                val label = kObj.optString("label", kind)
                val desc = kObj.optString("description", "")
                val req = kObj.optBoolean("required", false)
                val defInApp = kObj.optBoolean("default_in_app", true)
                val defEmail = kObj.optBoolean("default_email", false)

                val pref = prefMap[kind]
                val inApp = pref?.first ?: defInApp
                val email = pref?.second ?: defEmail

                kindsList.add(
                    NotificationKindSetting(
                        kind = kind,
                        label = label,
                        description = desc,
                        required = req,
                        inApp = if (req) true else inApp,
                        email = email
                    )
                )
            }
        } catch (_: Exception) {}
        kindsList
    }

    suspend fun saveNotificationSettings(settings: List<NotificationKindSetting>): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val uid = userId ?: return@withContext "Not authenticated"
        val now = ISODate.timestamp()

        try {
            val rows = JSONArray()
            for (s in settings) {
                rows.put(
                    JSONObject().apply {
                        put("user_id", uid)
                        put("kind", s.kind)
                        put("in_app", if (s.required) true else s.inApp)
                        put("email", s.email)
                        put("sms", false)
                        put("updated_at", now)
                    }
                )
            }
            client.upsert("notification_preferences", "user_id,kind", rows, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to save settings"
        }
    }

    // ==========================================
    // Admin Dashboard Queries
    // ==========================================

    suspend fun loadAdminDashboard(): AdminDashboard = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext AdminDashboard()

        // 1. Applications
        val appsList = mutableListOf<AdminApplication>()
        try {
            val aArr = client.select("chapter_applications", "select=id,kind,status,organization_name,designation,proposed_university_name,verification_method,institutional_email_verified_at,appeal_count,submitted_at,decided_at,officer_statement,institutional_email,national_contact_name,national_contact_email,fsl_contact_name,fsl_contact_email,applicant_id,applicant_full_name,intended_role,greek_letters,university:universities(name)&status=neq.draft&order=submitted_at.asc.nullslast&limit=80", token)
            for (i in 0 until aArr.length()) {
                val r = aArr.getJSONObject(i)
                val univ = r.optJSONObject("university")?.optStringOrNull("name") ?: r.optStringOrNull("proposed_university_name") ?: "University"
                val kindStr = r.optString("kind", "new_chapter")
                val kind = ApplicationKind.entries.firstOrNull { it.rawValue.equals(kindStr, true) } ?: ApplicationKind.NEW_CHAPTER
                val statusStr = r.optString("status", "pending_verification")
                val appStatus = ApplicationStatus.from(statusStr)
                val orgName = r.optString("organization_name", "Chapter")
                val desig = r.optString("designation", "")
                val title = if (desig.isNotBlank()) "$orgName ($desig)" else orgName
                appsList.add(
                    AdminApplication(
                        id = r.optString("id"),
                        kind = kind,
                        status = appStatus,
                        title = title,
                        university = univ,
                        applicantName = listOfNotNull(r.optStringOrNull("applicant_full_name"), r.optStringOrNull("applicant_id")).firstOrNull { it.isNotBlank() } ?: "Applicant",
                        applicantId = r.optString("applicant_id", ""),
                        method = r.optString("verification_method", "email"),
                        emailVerified = r.optStringOrNull("institutional_email_verified_at") != null,
                        appealCount = r.optInt("appeal_count", 0),
                        submittedAt = r.optStringOrNull("submitted_at")?.let { ISODate.parse(it) },
                        decidedAt = r.optStringOrNull("decided_at")?.let { ISODate.parse(it) },
                        statement = r.optString("officer_statement", ""),
                        institutionalEmail = r.optString("institutional_email", ""),
                        intendedRole = r.optString("intended_role", ""),
                        nationalContact = listOfNotNull(r.optStringOrNull("national_contact_name"), r.optStringOrNull("national_contact_email")).filter { it.isNotBlank() }.joinToString(" "),
                        fslContact = listOfNotNull(r.optStringOrNull("fsl_contact_name"), r.optStringOrNull("fsl_contact_email")).filter { it.isNotBlank() }.joinToString(" "),
                        greekLetters = r.optString("greek_letters", ""),
                        organizationName = orgName,
                        designation = desig,
                        universityName = univ,
                        applicantEmail = r.optString("institutional_email", "")
                    )
                )
            }
        } catch (_: Exception) {}

        // 2. Chapters Overview
        val chaptersList = mutableListOf<AdminChapterRow>()
        try {
            val params = JSONObject().apply {
                put("p_search", JSONObject.NULL)
                put("p_status", JSONObject.NULL)
                put("p_limit", 80)
                put("p_offset", 0)
            }
            val res = client.rpc("platform_chapter_overview", params, token)
            if (res is JSONArray) {
                for (i in 0 until res.length()) {
                    val r = res.getJSONObject(i)
                    val st = ChapterStatus.from(r.optString("status", "verified"))
                    chaptersList.add(
                        AdminChapterRow(
                            id = r.optString("id"),
                            slug = r.optString("slug", ""),
                            name = r.optString("name", "Chapter"),
                            university = r.optString("university", ""),
                            status = st,
                            members = r.optInt("members", 0),
                            subscription = r.optString("subscription", "none"),
                            paymentsEnabled = r.optBoolean("payments_enabled", false),
                            verifiedAt = r.optStringOrNull("verified_at")?.let { ISODate.parse(it) }
                        )
                    )
                }
            } else {
                val chArr = client.select("chapters", "select=id,slug,organization_name,designation,status,university:universities(name)&order=created_at.desc&limit=80", token)
                for (i in 0 until chArr.length()) {
                    val r = chArr.getJSONObject(i)
                    val univ = r.optJSONObject("university")?.optStringOrNull("name") ?: ""
                    chaptersList.add(
                        AdminChapterRow(
                            id = r.optString("id"),
                            slug = r.optString("slug", ""),
                            name = "${r.optString("organization_name")} ${r.optString("designation", "")}".trim(),
                            university = univ,
                            status = ChapterStatus.from(r.optString("status"))
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // 3. Bug Reports
        val bugsList = mutableListOf<AdminBug>()
        try {
            val bgArr = client.select("bug_reports", "select=id,number,status,severity,area,page,message,reporter_name,reporter_email,created_at,fix_summary&order=created_at.desc&limit=80", token)
            for (i in 0 until bgArr.length()) {
                val r = bgArr.getJSONObject(i)
                bugsList.add(
                    AdminBug(
                        id = r.optString("id"),
                        number = r.optInt("number", i + 1),
                        status = r.optString("status", "new"),
                        severity = r.optString("severity", "medium"),
                        area = r.optString("area", "other"),
                        page = r.optString("page", ""),
                        message = r.optString("message", ""),
                        reporter = r.optString("reporter_name", "Reporter"),
                        email = r.optString("reporter_email", ""),
                        createdAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date(),
                        fixSummary = r.optString("fix_summary", "")
                    )
                )
            }
        } catch (_: Exception) {}

        // 4. Closure Requests
        val closuresList = mutableListOf<AdminClosure>()
        try {
            val clArr = client.select("chapter_closure_requests", "select=id,reason,created_at,requester:profiles!chapter_closure_requests_requested_by_fkey(display_name,full_name),chapter:chapters(organization_name,designation,university:universities(name))&status=eq.pending&order=created_at.asc", token)
            for (i in 0 until clArr.length()) {
                val r = clArr.getJSONObject(i)
                val chObj = r.optJSONObject("chapter")
                val univ = chObj?.optJSONObject("university")?.optStringOrNull("name") ?: ""
                val chName = chObj?.let { "${it.optString("organization_name")} ${it.optString("designation", "")}".trim() } ?: "Chapter"
                val reqObj = r.optJSONObject("requester")
                val reqName = listOfNotNull(reqObj?.optStringOrNull("display_name"), reqObj?.optStringOrNull("full_name")).firstOrNull { it.isNotBlank() } ?: "Requester"
                closuresList.add(
                    AdminClosure(
                        id = r.optString("id"),
                        chapterName = chName,
                        university = univ,
                        requester = reqName,
                        reason = r.optString("reason", ""),
                        createdAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date()
                    )
                )
            }
        } catch (_: Exception) {}

        // 5. Audit Log
        val auditList = mutableListOf<AdminAuditRow>()
        try {
            val auArr = client.select("audit_logs", "select=id,chapter_id,actor_id,actor_kind,action,metadata,created_at&or=(chapter_id.is.null,action.like.verification.*,action.like.chapter.status*,action.like.pricing.*)&order=id.desc&limit=50", token)
            for (i in 0 until auArr.length()) {
                val r = auArr.getJSONObject(i)
                auditList.add(
                    AdminAuditRow(
                        id = r.optString("id"),
                        whenDate = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date(),
                        action = r.optString("action", "Action"),
                        actor = r.optStringOrNull("actor_kind")?.replace("_", " ")?.replaceFirstChar { it.uppercase() } ?: "System",
                        chapter = if (r.has("chapter_id") && !r.isNull("chapter_id")) "Chapter" else "Platform",
                        detail = r.optJSONObject("metadata")?.toString() ?: ""
                    )
                )
            }
        } catch (_: Exception) {}

        // 6. Revenue Summary
        val adminRevenue = loadAdminRevenue()

        // 7. Reconciliation Queue
        val reconList = mutableListOf<AdminReconRow>()
        try {
            val recRes = client.rpc("platform_reconciliation_queue", JSONObject().put("p_limit", 80), token)
            if (recRes is JSONArray) {
                for (i in 0 until recRes.length()) {
                    val r = recRes.getJSONObject(i)
                    reconList.add(
                        AdminReconRow(
                            id = r.optString("id"),
                            chapter = r.optString("chapter", "Chapter"),
                            issue = r.optString("issue", "Discrepancy"),
                            amountCents = r.optInt("amount_cents", 0),
                            expectedFeeCents = r.optInt("expected_fee_cents", 0),
                            stripeFeeCents = if (r.has("stripe_fee_cents") && !r.isNull("stripe_fee_cents")) r.optInt("stripe_fee_cents") else null,
                            createdAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date(),
                            note = r.optString("note", "")
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // 8. Pricing Rules
        val pricingRulesList = mutableListOf<AdminPricingRule>()
        try {
            val prArr = client.select("pricing_rules", "select=id,code,version,name,platform_fee_bps,platform_fee_fixed_cents,min_fee_cents,max_fee_cents,refund_policy,status,is_default,effective_at&order=effective_at.desc.nullslast&limit=40", token)
            for (i in 0 until prArr.length()) {
                val r = prArr.getJSONObject(i)
                pricingRulesList.add(
                    AdminPricingRule(
                        id = r.optString("id"),
                        name = r.optString("name", "Standard"),
                        code = r.optString("code", "standard"),
                        version = r.optInt("version", 1),
                        bps = r.optInt("platform_fee_bps", 150),
                        fixedCents = r.optInt("platform_fee_fixed_cents", 0),
                        minCents = if (r.has("min_fee_cents") && !r.isNull("min_fee_cents")) r.optInt("min_fee_cents") else null,
                        maxCents = if (r.has("max_fee_cents") && !r.isNull("max_fee_cents")) r.optInt("max_fee_cents") else null,
                        refundPolicy = r.optString("refund_policy", "proportional"),
                        isDefault = r.optBoolean("is_default", false),
                        status = r.optString("status", "active"),
                        effectiveAt = r.optStringOrNull("effective_at")?.let { ISODate.parse(it) }
                    )
                )
            }
        } catch (_: Exception) {}

        // 9. SaaS Plans
        val plansList = mutableListOf<AdminSaasPlan>()
        try {
            val plArr = client.select("saas_plans", "select=code,name,price_cents,billing_interval,active&order=price_cents.asc", token)
            for (i in 0 until plArr.length()) {
                val r = plArr.getJSONObject(i)
                plansList.add(
                    AdminSaasPlan(
                        id = r.optString("code"),
                        name = r.optString("name", "Chapter subscription"),
                        priceCents = r.optInt("price_cents", 3000),
                        interval = r.optString("billing_interval", "month"),
                        active = r.optBoolean("active", true)
                    )
                )
            }
        } catch (_: Exception) {}

        // 10. Outreach Replies
        val repliesList = mutableListOf<AdminOutreachReply>()
        try {
            val reArr = client.select("outreach_emails", "select=id,from_email,to_email,subject,body,created_at,read_at&direction=eq.reply&order=created_at.desc&limit=40", token)
            for (i in 0 until reArr.length()) {
                val r = reArr.getJSONObject(i)
                repliesList.add(
                    AdminOutreachReply(
                        id = r.optString("id"),
                        from = r.optString("from_email", ""),
                        subject = r.optString("subject", "(No subject)"),
                        preview = r.optString("body", "").take(140),
                        createdAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date(),
                        unread = r.optStringOrNull("read_at") == null
                    )
                )
            }
        } catch (_: Exception) {}

        // 11. Intro Forms
        val formsList = mutableListOf<AdminIntroForm>()
        try {
            val foArr = client.select("intro_responses", "select=id,created_at,full_name,role,organization,email,interest,notes,status,read_at,university:universities(name)&order=created_at.desc&limit=40", token)
            for (i in 0 until foArr.length()) {
                val r = foArr.getJSONObject(i)
                val univ = r.optJSONObject("university")?.optStringOrNull("name") ?: ""
                formsList.add(
                    AdminIntroForm(
                        id = r.optString("id"),
                        name = r.optString("full_name", "Prospective Chapter"),
                        organization = r.optString("organization", ""),
                        role = r.optString("role", ""),
                        email = r.optString("email", ""),
                        school = univ,
                        interest = r.optString("interest", ""),
                        notes = r.optString("notes", ""),
                        status = r.optString("status", "new"),
                        unread = r.optStringOrNull("read_at") == null,
                        createdAt = r.optStringOrNull("created_at")?.let { ISODate.parse(it) } ?: Date()
                    )
                )
            }
        } catch (_: Exception) {}

        val openBugsCount = bugsList.count { listOf("new", "triaged", "in_progress").contains(it.status) }
        val pendingCount = appsList.count { it.status == ApplicationStatus.PENDING_VERIFICATION }

        AdminDashboard(
            pendingVerifications = pendingCount,
            totalChapters = chaptersList.size,
            openBugs = openBugsCount,
            monthlyRevenueCents = adminRevenue?.saasCents ?: 0,
            applications = appsList,
            chapters = chaptersList,
            bugs = bugsList,
            closures = closuresList,
            audit = auditList,
            revenue = adminRevenue,
            reconciliation = reconList,
            pricingRules = pricingRulesList,
            plans = plansList,
            replies = repliesList,
            forms = formsList,
            emailStats = AdminEmailStats()
        )
    }

    // ==========================================
    // Admin Mutation Actions
    // ==========================================

    suspend fun reviewApplication(id: String, decision: String, message: String?, note: String?): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val params = JSONObject().apply {
            put("p_application", id)
            put("p_decision", decision)
            put("p_message", message?.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            put("p_internal_note", note?.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
        }
        try {
            client.rpc("review_chapter_application", params, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to submit decision"
        }
    }

    suspend fun addApplicationNote(id: String, note: String): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val params = JSONObject().apply {
            put("p_application", id)
            put("p_note", note)
        }
        try {
            client.rpc("add_application_note", params, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to add note"
        }
    }

    suspend fun setChapterStatus(id: String, status: String, reason: String): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val params = JSONObject().apply {
            put("p_chapter", id)
            put("p_status", status)
            put("p_reason", reason)
        }
        try {
            client.rpc("platform_set_chapter_status", params, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to update chapter status"
        }
    }

    suspend fun reviewClosure(id: String, decision: String, note: String?): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val params = JSONObject().apply {
            put("p_request", id)
            put("p_decision", decision)
            put("p_note", note?.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
        }
        try {
            client.rpc("review_chapter_closure", params, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to review closure"
        }
    }

    suspend fun updateBug(id: String, status: String, severity: String, area: String): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val body = JSONObject().apply {
            put("status", status)
            put("severity", severity)
            put("area", area)
        }
        try {
            client.patch("bug_reports", "id=eq.$id", body, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to update bug report"
        }
    }

    suspend fun logBugFix(id: String, summary: String, ref: String?): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val body = JSONObject().apply {
            put("status", "fixed")
            put("fix_summary", summary)
            put("fix_ref", ref ?: JSONObject.NULL)
            put("duplicate_of", JSONObject.NULL)
        }
        try {
            client.patch("bug_reports", "id=eq.$id", body, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to log bug fix"
        }
    }

    suspend fun commentOnBug(id: String, body: String): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val uid = userId ?: return@withContext "Not authenticated"
        val payload = JSONObject().apply {
            put("report_id", id)
            put("actor_id", uid)
            put("kind", "comment")
            put("body", body)
        }
        try {
            client.insert("bug_report_events", payload, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to post note"
        }
    }

    suspend fun markOutreachRead(replyId: String): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val body = JSONObject().apply {
            put("read_at", ISODate.timestamp())
        }
        try {
            client.patch("outreach_emails", "id=eq.$replyId", body, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to mark read"
        }
    }

    suspend fun updateIntroForm(id: String, status: String, markRead: Boolean): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val body = JSONObject().apply {
            put("status", status)
            if (markRead) put("read_at", ISODate.timestamp())
        }
        try {
            client.patch("intro_responses", "id=eq.$id", body, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to update form"
        }
    }

    suspend fun publishPricingRule(
        code: String,
        name: String,
        bps: Int,
        fixedCents: Int,
        minCents: Int?,
        maxCents: Int?,
        refundPolicy: String,
        makeDefault: Boolean,
        termsVersion: String,
        termsTitle: String,
        termsSummary: String,
        termsBody: String
    ): String? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext "Not authenticated"
        val params = JSONObject().apply {
            put("p_code", code)
            put("p_name", name)
            put("p_bps", bps)
            put("p_fixed", fixedCents)
            put("p_min", minCents ?: JSONObject.NULL)
            put("p_max", maxCents ?: JSONObject.NULL)
            put("p_refund_policy", refundPolicy)
            put("p_make_default", makeDefault)
            put("p_terms_version", termsVersion)
            put("p_terms_title", termsTitle)
            put("p_terms_summary", termsSummary)
            put("p_terms_body", termsBody)
        }
        try {
            client.rpc("platform_publish_pricing_rule", params, token)
            null
        } catch (e: Exception) {
            e.localizedMessage ?: "Failed to publish pricing"
        }
    }

    suspend fun loadAdminRevenue(): AdminRevenue? = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext null
        try {
            val cal = Calendar.getInstance()
            cal.add(Calendar.DAY_OF_YEAR, -30)
            val fromStr = ISODate.timestamp(cal.time)
            val toStr = ISODate.timestamp()
            val revObj = client.rpc("platform_revenue_summary", JSONObject().put("p_from", fromStr).put("p_to", toStr), token)
            val parsedObj: JSONObject? = when (revObj) {
                is JSONObject -> revObj
                is String -> try { JSONObject(revObj) } catch (_: Exception) { null }
                else -> null
            }
            if (parsedObj == null) return@withContext null

            fun flexLong(vararg keys: String): Long {
                for (k in keys) {
                    val v = parsedObj.opt(k)
                    if (v is Number) return v.toLong()
                    if (v is String) {
                        val parsed = v.toLongOrNull()
                        if (parsed != null) return parsed
                    }
                    if (v is JSONObject) {
                        val inner = v.opt("value")
                        if (inner is Number) return inner.toLong()
                        if (inner is String) {
                            val parsed = inner.toLongOrNull()
                            if (parsed != null) return parsed
                        }
                    }
                }
                return 0L
            }

            fun flexInt(vararg keys: String): Int = flexLong(*keys).toInt()

            val revChapters = mutableListOf<AdminRevenueChapter>()
            val chArr = parsedObj.optJSONArray("by_chapter") ?: parsedObj.optJSONArray("chapters")
            if (chArr != null) {
                for (i in 0 until chArr.length()) {
                    val c = chArr.getJSONObject(i)
                    revChapters.add(
                        AdminRevenueChapter(
                            id = c.optString("chapter_id").ifEmpty { c.optString("id") },
                            name = c.optString("chapter").ifEmpty { c.optString("name", "Chapter") },
                            university = c.optString("university", ""),
                            volumeCents = (c.opt("volume_cents") as? Number)?.toLong()
                                ?: c.optString("volume_cents").toLongOrNull() ?: 0L,
                            feesCents = (c.opt("fees_cents") as? Number)?.toLong()
                                ?: c.optString("fees_cents").toLongOrNull() ?: 0L,
                            payments = (c.opt("payments") as? Number)?.toInt()
                                ?: c.optString("payments").toIntOrNull() ?: 0
                        )
                    )
                }
            }

            AdminRevenue(
                saasCents = flexLong("saas_revenue_cents", "saas_cents"),
                feesCents = flexLong("platform_fees_cents", "fees_cents"),
                feeRefundsCents = flexLong("fee_refunds_cents"),
                volumeCents = flexLong("eligible_volume_cents", "volume_cents"),
                payments = flexInt("payments_count", "payments"),
                subscriptions = flexInt("active_subscriptions", "subscriptions"),
                mismatches = flexInt("mismatches"),
                refundedVolumeCents = flexLong("refunded_volume_cents"),
                disputes = flexInt("disputes_opened", "disputes"),
                chapters = revChapters
            )
        } catch (e: Exception) {
            android.util.Log.e("GreekGeekAdmin", "Failed to load platform_revenue_summary", e)
            null
        }
    }

    suspend fun loadEmailStats(rangeDays: Int?): AdminEmailStats = withContext(Dispatchers.IO) {
        val token = accessToken ?: return@withContext AdminEmailStats(rangeDays = rangeDays)
        try {
            val dayMs = 24L * 60 * 60 * 1000
            val now = Date()
            val since = rangeDays?.let { Date(now.time - it * dayMs) }
            val chartStart = Date(now.time - 12L * 7 * dayMs)

            var emailQuery = "select=contact_id,direction,status,occurred_at,delivered_at,opened_at,clicked_at&order=occurred_at.asc,id.asc"
            if (since != null) {
                val querySince = if (since < chartStart) since else chartStart
                emailQuery += "&occurred_at=gte.${ISODate.timestamp(querySince)}"
            }

            val emailsArr = client.selectPages("outreach_emails", emailQuery, token)
            val emails = ArrayList<AdminStatEmailDTO>(emailsArr.length())
            for (i in 0 until emailsArr.length()) {
                val e = emailsArr.optJSONObject(i) ?: continue
                emails.add(
                    AdminStatEmailDTO(
                        contactId = e.optStringOrNull("contact_id"),
                        direction = e.optStringOrNull("direction"),
                        status = e.optStringOrNull("status"),
                        occurred = e.optStringOrNull("occurred_at")?.let { ISODate.parse(it) },
                        delivered = e.optStringOrNull("delivered_at")?.let { ISODate.parse(it) },
                        opened = e.optStringOrNull("opened_at")?.let { ISODate.parse(it) },
                        clicked = e.optStringOrNull("clicked_at")?.let { ISODate.parse(it) }
                    )
                )
            }

            val contactQuery = "select=id,email_normalized,university,university_id,first_sent_at,replied_at,do_not_contact,unread_replies&order=id.asc"
            val contactsArr = client.selectPages("outreach_contacts", contactQuery, token)
            val contacts = ArrayList<AdminStatContactDTO>(contactsArr.length())
            for (i in 0 until contactsArr.length()) {
                val c = contactsArr.optJSONObject(i) ?: continue
                contacts.add(
                    AdminStatContactDTO(
                        id = c.optString("id"),
                        emailNormalized = c.optStringOrNull("email_normalized"),
                        university = c.optStringOrNull("university"),
                        universityId = c.optStringOrNull("university_id"),
                        firstSent = c.optStringOrNull("first_sent_at")?.let { ISODate.parse(it) },
                        replied = c.optStringOrNull("replied_at")?.let { ISODate.parse(it) },
                        doNotContact = if (c.has("do_not_contact") && !c.isNull("do_not_contact")) c.optBoolean("do_not_contact") else null,
                        unreadReplies = c.optIntOrNull("unread_replies")
                    )
                )
            }

            var formQuery = "select=email,created_at,interest&order=created_at.asc,id.asc"
            if (since != null) {
                formQuery += "&created_at=gte.${ISODate.timestamp(since)}"
            }
            val formsArr = client.selectPages("intro_responses", formQuery, token)
            val submissions = ArrayList<AdminStatFormDTO>(formsArr.length())
            for (i in 0 until formsArr.length()) {
                val f = formsArr.optJSONObject(i) ?: continue
                submissions.add(
                    AdminStatFormDTO(
                        email = f.optStringOrNull("email"),
                        createdAt = f.optStringOrNull("created_at")?.let { ISODate.parse(it) },
                        interest = f.optStringOrNull("interest")
                    )
                )
            }

            val blocked = client.count("outreach_contacts", "do_not_contact=eq.true", token)

            buildEmailStats(
                emails = emails,
                contacts = contacts,
                submissions = submissions,
                blocked = blocked,
                since = since,
                chartStart = chartStart,
                rangeDays = rangeDays
            )
        } catch (e: Exception) {
            android.util.Log.e("GreekGeekAdmin", "Failed to load email stats", e)
            AdminEmailStats(rangeDays = rangeDays)
        }
    }

    private fun buildEmailStats(
        emails: List<AdminStatEmailDTO>,
        contacts: List<AdminStatContactDTO>,
        submissions: List<AdminStatFormDTO>,
        blocked: Int,
        since: Date?,
        chartStart: Date,
        rangeDays: Int?
    ): AdminEmailStats {
        val sentStatuses = setOf("sent", "delivered", "bounced")
        val inRange = emails.filter { email ->
            if (since == null) true
            else {
                val at = email.occurred
                at != null && at >= since
            }
        }
        val sent = inRange.filter { it.direction == "sent" && sentStatuses.contains(it.status ?: "") }
        val failed = inRange.count { it.direction == "sent" && it.status == "failed" }
        val replies = inRange.filter { it.direction == "reply" }
        val delivered = sent.count { it.delivered != null }
        val opened = sent.count { it.opened != null }
        val clicked = sent.count { it.clicked != null }
        val bounced = sent.count { it.status == "bounced" }
        val emailed = sent.mapNotNull { it.contactId }.toSet()
        val heardBack = replies.mapNotNull { it.contactId }.toSet()
        val emailedAndReplied = emailed.intersect(heardBack).size
        val deliveredTo = sent.filter { it.delivered != null }.mapNotNull { it.contactId }.toSet()
        val openedBy = sent.filter { it.opened != null }.mapNotNull { it.contactId }.toSet()
        val contactById = contacts.associateBy { it.id }
        val submittedEmails = submissions.mapNotNull { it.email?.trim()?.lowercase() }.filter { it.isNotEmpty() }.toSet()
        val formFromEmailed = emailed.count { id ->
            val email = contactById[id]?.emailNormalized?.lowercase()
            email != null && submittedEmails.contains(email)
        }
        val schools = emailed.mapNotNull { id ->
            val contact = contactById[id]
            val key = if (!contact?.universityId.isNullOrEmpty()) contact?.universityId else contact?.university
            if (!key.isNullOrEmpty()) key else null
        }.toSet()
        val replyMs = contacts.mapNotNull { contact ->
            val first = contact.firstSent
            val replied = contact.replied
            if (first != null && replied != null && replied > first) {
                if (since != null && replied < since) null
                else (replied.time - first.time).toDouble()
            } else null
        }
        val sortedTimes = replyMs.sorted()
        val medianMs = if (sortedTimes.isEmpty()) null else {
            val middle = sortedTimes.size / 2
            if (sortedTimes.size % 2 == 1) sortedTimes[middle]
            else (sortedTimes[middle - 1] + sortedTimes[middle]) / 2.0
        }
        val weekLengthMs = 7L * 24 * 60 * 60 * 1000
        val weeks = (0 until 12).map { index ->
            AdminEmailWeek(
                start = Date(chartStart.time + index * weekLengthMs),
                sent = 0,
                replies = 0
            )
        }.toMutableList()
        for (email in emails) {
            val at = email.occurred ?: continue
            if (at < chartStart) continue
            val index = ((at.time - chartStart.time) / weekLengthMs).toInt().coerceIn(0, 11)
            if (email.direction == "sent" && sentStatuses.contains(email.status ?: "")) {
                weeks[index].sent += 1
            }
            if (email.direction == "reply") {
                weeks[index].replies += 1
            }
        }
        val bySchool = mutableMapOf<String, AdminEmailSchool>()
        for (id in emailed) {
            val contact = contactById[id] ?: continue
            val key = contact.universityId ?: contact.university ?: "unknown"
            val entry = bySchool.getOrPut(key) {
                AdminEmailSchool(
                    name = contact.university ?: "Unknown school",
                    emailed = 0,
                    opened = 0,
                    replied = 0,
                    forms = 0
                )
            }
            entry.emailed += 1
            if (openedBy.contains(id)) entry.opened += 1
            if (heardBack.contains(id)) entry.replied += 1
            val email = contact.emailNormalized?.lowercase()
            if (email != null && submittedEmails.contains(email)) {
                entry.forms += 1
            }
        }
        val topSchools = bySchool.values.sortedWith(
            compareByDescending<AdminEmailSchool> { it.replied }
                .thenByDescending { it.forms }
                .thenByDescending { it.emailed }
                .thenBy { it.name }
        ).take(10)

        return AdminEmailStats(
            rangeDays = rangeDays,
            sent = sent.size,
            failed = failed,
            people = emailed.size,
            schools = schools.size,
            heardBack = heardBack.size,
            replies = replies.size,
            forms = submissions.size,
            demos = submissions.count { (it.interest ?: "").contains("demo", ignoreCase = true) },
            delivered = delivered,
            opened = opened,
            clicked = clicked,
            bounced = bounced,
            blocked = blocked,
            unread = contacts.sumOf { it.unreadReplies ?: 0 },
            emailedAndReplied = emailedAndReplied,
            deliveredTo = deliveredTo.size,
            openedBy = openedBy.size,
            formFromEmailed = formFromEmailed,
            medianReplyMinutes = medianMs?.let { Math.round(it / 60000.0).toInt() },
            fastestReplyMinutes = sortedTimes.minOrNull()?.let { Math.round(it / 60000.0).toInt() },
            weeks = weeks,
            topSchools = topSchools
        )
    }
}

private data class AdminStatEmailDTO(
    val contactId: String?,
    val direction: String?,
    val status: String?,
    val occurred: Date?,
    val delivered: Date?,
    val opened: Date?,
    val clicked: Date?
)

private data class AdminStatContactDTO(
    val id: String,
    val emailNormalized: String?,
    val university: String?,
    val universityId: String?,
    val firstSent: Date?,
    val replied: Date?,
    val doNotContact: Boolean?,
    val unreadReplies: Int?
)

private data class AdminStatFormDTO(
    val email: String?,
    val createdAt: Date?,
    val interest: String?
)
