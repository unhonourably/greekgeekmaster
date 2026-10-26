package official.greekgeek.features.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import official.greekgeek.design.*
import official.greekgeek.models.*
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette

// ==========================================
// DESTINATIONS & ROUTES
// ==========================================

enum class AdminDestination(
    val title: String,
    val icon: ImageVector,
    val capability: AdminCapability
) {
    VERIFICATION("Verification", Icons.Default.Shield, AdminCapability.VERIFICATION),
    CHAPTERS("Chapters", Icons.Default.Domain, AdminCapability.CHAPTERS),
    REVENUE("Revenue", Icons.Default.BarChart, AdminCapability.FINANCE_TOOLS),
    RECONCILIATION("Reconciliation", Icons.Default.AccountBalance, AdminCapability.FINANCE_TOOLS),
    PRICING("Pricing", Icons.Default.Sell, AdminCapability.ADMIN_ONLY),
    OUTREACH("Outreach", Icons.Default.Email, AdminCapability.ADMIN_ONLY),
    EMAIL_STATS("Email stats", Icons.AutoMirrored.Filled.TrendingUp, AdminCapability.ADMIN_ONLY),
    BUGS("Bug reports", Icons.Default.BugReport, AdminCapability.BUGS),
    CLOSURES("Closures", Icons.Default.Cancel, AdminCapability.ADMIN_ONLY),
    AUDIT("Audit log", Icons.Default.HistoryEdu, AdminCapability.ADMIN_ONLY)
}

sealed class AdminRoute {
    data class Section(val destination: AdminDestination) : AdminRoute()
    data class Application(val applicationId: String) : AdminRoute()
    data class Chapter(val chapterId: String) : AdminRoute()
    data class Bug(val bugId: String) : AdminRoute()
    data class Form(val formId: String) : AdminRoute()
}

// ==========================================
// MAIN MODAL CONTAINER
// ==========================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminHomeModal(
    session: AppSession,
    onDismiss: () -> Unit
) {
    val routeStack = remember { mutableStateListOf<AdminRoute>() }

    LaunchedEffect(Unit) {
        session.loadAdmin()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.canvas,
        dragHandle = null
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
        ) {
            val currentRoute = routeStack.lastOrNull()
            if (currentRoute == null) {
                AdminHomeView(
                    session = session,
                    onNavigate = { routeStack.add(it) },
                    onDismiss = onDismiss
                )
            } else {
                when (currentRoute) {
                    is AdminRoute.Section -> {
                        AdminSectionView(
                            destination = currentRoute.destination,
                            session = session,
                            onNavigate = { routeStack.add(it) },
                            onBack = { routeStack.removeAt(routeStack.lastIndex) },
                            onDismiss = onDismiss
                        )
                    }
                    is AdminRoute.Application -> {
                        AdminApplicationView(
                            applicationId = currentRoute.applicationId,
                            session = session,
                            onBack = { routeStack.removeAt(routeStack.lastIndex) },
                            onDismiss = onDismiss
                        )
                    }
                    is AdminRoute.Chapter -> {
                        AdminChapterView(
                            chapterId = currentRoute.chapterId,
                            session = session,
                            onBack = { routeStack.removeAt(routeStack.lastIndex) },
                            onDismiss = onDismiss
                        )
                    }
                    is AdminRoute.Bug -> {
                        AdminBugView(
                            bugId = currentRoute.bugId,
                            session = session,
                            onBack = { routeStack.removeAt(routeStack.lastIndex) },
                            onDismiss = onDismiss
                        )
                    }
                    is AdminRoute.Form -> {
                        AdminFormView(
                            formId = currentRoute.formId,
                            session = session,
                            onBack = { routeStack.removeAt(routeStack.lastIndex) },
                            onDismiss = onDismiss
                        )
                    }
                }
            }
        }
    }
}

// ==========================================
// ADMIN HOME VIEW
// ==========================================

@Composable
fun AdminHomeView(
    session: AppSession,
    onNavigate: (AdminRoute) -> Unit,
    onDismiss: () -> Unit
) {
    val role = session.staffRole
    val admin = session.admin

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        // Navigation Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Platform admin",
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Done",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.accent,
                modifier = Modifier.clickable(onClick = onDismiss)
            )
        }
        ListRowDivider()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (role != null) {
                Text(
                    text = "Signed in as ${role.label.lowercase()}.",
                    fontSize = 13.sp,
                    color = Palette.ink3
                )
            }

            if (session.adminError != null) {
                GGNotice(tone = Tone.DANGER, message = session.adminError ?: "")
            }

            // Trust Section
            if (role?.can(AdminCapability.VERIFICATION) == true) {
                AdminSectionCard(title = "Trust") {
                    val count = admin.applications.count { it.status == ApplicationStatus.PENDING_VERIFICATION }
                    AdminRowItem(
                        destination = AdminDestination.VERIFICATION,
                        count = count,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.VERIFICATION)) }
                    )
                }
            }

            // Chapters Section
            if (role?.can(AdminCapability.CHAPTERS) == true) {
                AdminSectionCard(title = "Chapters") {
                    AdminRowItem(
                        destination = AdminDestination.CHAPTERS,
                        count = admin.chapters.size,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.CHAPTERS)) }
                    )
                }
            }

            // Finance Section
            if (role?.can(AdminCapability.FINANCE_TOOLS) == true) {
                AdminSectionCard(title = "Finance") {
                    AdminRowItem(
                        destination = AdminDestination.REVENUE,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.REVENUE)) }
                    )
                    ListRowDivider()
                    AdminRowItem(
                        destination = AdminDestination.RECONCILIATION,
                        count = admin.reconciliation.size,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.RECONCILIATION)) }
                    )
                }
            }

            // Growth Section
            if (role?.can(AdminCapability.ADMIN_ONLY) == true) {
                AdminSectionCard(title = "Growth") {
                    val unreadReplies = admin.replies.count { it.unread }
                    val unreadForms = admin.forms.count { it.unread }
                    AdminRowItem(
                        destination = AdminDestination.OUTREACH,
                        count = unreadReplies + unreadForms,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.OUTREACH)) }
                    )
                    ListRowDivider()
                    AdminRowItem(
                        destination = AdminDestination.EMAIL_STATS,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.EMAIL_STATS)) }
                    )
                }
            }

            // Support Section
            if (role?.can(AdminCapability.BUGS) == true) {
                AdminSectionCard(title = "Support") {
                    val openBugs = admin.bugs.count { listOf("new", "triaged", "in_progress").contains(it.status) }
                    AdminRowItem(
                        destination = AdminDestination.BUGS,
                        count = openBugs,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.BUGS)) }
                    )
                }
            }

            // Platform Section
            if (role?.can(AdminCapability.ADMIN_ONLY) == true) {
                AdminSectionCard(title = "Platform") {
                    AdminRowItem(
                        destination = AdminDestination.CLOSURES,
                        count = admin.closures.size,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.CLOSURES)) }
                    )
                    ListRowDivider()
                    AdminRowItem(
                        destination = AdminDestination.PRICING,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.PRICING)) }
                    )
                    ListRowDivider()
                    AdminRowItem(
                        destination = AdminDestination.AUDIT,
                        onClick = { onNavigate(AdminRoute.Section(AdminDestination.AUDIT)) }
                    )
                }
            }
        }
    }
}

@Composable
private fun AdminSectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title.uppercase(),
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp,
            color = Palette.ink3,
            modifier = Modifier.padding(start = 4.dp)
        )
        GGCard {
            content()
        }
    }
}

@Composable
private fun AdminRowItem(
    destination: AdminDestination,
    count: Int = 0,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = destination.icon,
            contentDescription = destination.title,
            tint = Palette.ink,
            modifier = Modifier.size(20.dp)
        )
        Text(
            text = destination.title,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            color = Palette.ink,
            modifier = Modifier.weight(1f)
        )
        if (count > 0) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(Palette.accent)
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "$count",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.onAccent
                )
            }
        }
        Icon(
            imageVector = Icons.Default.ChevronRight,
            contentDescription = null,
            tint = Palette.ink3,
            modifier = Modifier.size(18.dp)
        )
    }
}

// ==========================================
// SUB-SCREEN WRAPPER
// ==========================================

@Composable
fun AdminSectionView(
    destination: AdminDestination,
    session: AppSession,
    onNavigate: (AdminRoute) -> Unit,
    onBack: () -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        // App bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = Palette.ink
                )
            }
            Text(
                text = destination.title,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Done",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.accent,
                modifier = Modifier
                    .clickable(onClick = onDismiss)
                    .padding(end = 12.dp)
            )
        }
        ListRowDivider()

        Box(modifier = Modifier.weight(1f)) {
            when (destination) {
                AdminDestination.VERIFICATION -> AdminVerificationList(session, onNavigate)
                AdminDestination.CHAPTERS -> AdminChapterList(session, onNavigate)
                AdminDestination.REVENUE -> AdminRevenueView(session)
                AdminDestination.RECONCILIATION -> AdminReconciliationView(session)
                AdminDestination.PRICING -> AdminPricingView(session)
                AdminDestination.OUTREACH -> AdminOutreachView(session, onNavigate)
                AdminDestination.EMAIL_STATS -> AdminEmailStatsView(session)
                AdminDestination.BUGS -> AdminBugList(session, onNavigate)
                AdminDestination.CLOSURES -> AdminClosuresView(session)
                AdminDestination.AUDIT -> AdminAuditView(session)
            }
        }
    }
}

// ==========================================
// 1. VERIFICATION LIST
// ==========================================

@Composable
fun AdminVerificationList(
    session: AppSession,
    onNavigate: (AdminRoute) -> Unit
) {
    var viewTab by remember { mutableStateOf("open") }
    val allApps = session.admin.applications

    val filtered = allApps.filter { app ->
        when (viewTab) {
            "waiting" -> app.status == ApplicationStatus.INFO_REQUESTED
            "decided" -> listOf(ApplicationStatus.VERIFIED, ApplicationStatus.REJECTED, ApplicationStatus.SUSPENDED, ApplicationStatus.WITHDRAWN).contains(app.status)
            else -> app.status == ApplicationStatus.PENDING_VERIFICATION
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Segmented Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Palette.subtle)
                .padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            listOf("open" to "Needs review", "waiting" to "Waiting", "decided" to "Decided").forEach { (key, label) ->
                val isSel = viewTab == key
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSel) Palette.surface else Palette.subtle)
                        .clickable { viewTab = key }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        fontSize = 13.sp,
                        fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSel) Palette.ink else Palette.ink3
                    )
                }
            }
        }

        if (filtered.isEmpty()) {
            GGEmptyState(
                icon = Icons.Default.Check,
                title = if (viewTab == "open") "Nothing to review." else "No applications in this view."
            )
        } else {
            GGCard {
                filtered.forEachIndexed { index, app ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onNavigate(AdminRoute.Application(app.id)) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = app.title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            color = Palette.ink
                        )
                        Text(
                            text = "${app.university} · ${app.kind.label}",
                            fontSize = 13.sp,
                            color = Palette.ink3
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            GGBadge(text = app.status.label, tone = app.status.tone)
                            if (app.emailVerified) GGBadge(text = "Email confirmed", tone = Tone.POSITIVE)
                            if (app.appealCount > 0) GGBadge(text = "Appeal", tone = Tone.INFO)
                        }
                    }
                    if (index < filtered.size - 1) ListRowDivider()
                }
            }
        }
    }
}

// ==========================================
// 2. APPLICATION DETAIL VIEW
// ==========================================

@Composable
fun AdminApplicationView(
    applicationId: String,
    session: AppSession,
    onBack: () -> Unit,
    onDismiss: () -> Unit
) {
    val application = session.admin.applications.firstOrNull { it.id == applicationId }
    var decision by remember { mutableStateOf("verified") }
    var message by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf(false) }
    var statusNotice by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Palette.ink)
            }
            Text(
                text = application?.title ?: "Application",
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Done",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.accent,
                modifier = Modifier
                    .clickable(onClick = onDismiss)
                    .padding(end = 12.dp)
            )
        }
        ListRowDivider()

        if (application == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                GGEmptyState(icon = Icons.Default.Shield, title = "Application not found")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GGPageHeader(title = application.title, description = "${application.kind.label} · ${application.university}")
                GGBadge(text = application.status.label, tone = application.status.tone)

                GGCard(padding = 16.dp) {
                    labeledRow("Applicant", application.applicantName)
                    labeledRow("Officer role", application.intendedRole)
                    labeledRow("Method", application.method.replaceFirstChar { it.uppercase() })
                    labeledRow("School email", if (application.institutionalEmail.isEmpty()) "—" else application.institutionalEmail)
                    labeledRow("National contact", if (application.nationalContact.isEmpty()) "—" else application.nationalContact)
                    labeledRow("FSL contact", if (application.fslContact.isEmpty()) "—" else application.fslContact)
                    if (application.greekLetters.isNotEmpty()) labeledRow("Letters", application.greekLetters)
                }

                if (application.statement.isNotEmpty()) {
                    GGCard(padding = 16.dp) {
                        Text(text = "Officer statement", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                        Text(text = application.statement, fontSize = 14.sp, color = Palette.ink2, modifier = Modifier.padding(top = 6.dp))
                    }
                }

                if (statusNotice != null) {
                    val isPos = statusNotice!!.contains("verified") || statusNotice!!.contains("sent") || statusNotice!!.contains("Note")
                    GGNotice(tone = if (isPos) Tone.POSITIVE else Tone.DANGER, message = statusNotice ?: "")
                }

                if (application.applicantId == session.user?.id) {
                    GGNotice(tone = Tone.WARNING, message = "You cannot decide your own application.")
                } else if (application.status == ApplicationStatus.PENDING_VERIFICATION || application.status == ApplicationStatus.INFO_REQUESTED) {
                    GGCard(padding = 16.dp) {
                        Text(text = "Decision", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                        Spacer(modifier = Modifier.height(10.dp))

                        listOf(
                            "verified" to "Verify",
                            "info_requested" to "Ask for information",
                            "rejected" to "Reject",
                            "suspended" to "Suspend"
                        ).forEach { (key, label) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { decision = key }
                                    .padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                RadioButton(
                                    selected = decision == key,
                                    onClick = { decision = key },
                                    colors = RadioButtonDefaults.colors(selectedColor = Palette.accent)
                                )
                                Text(text = label, fontSize = 14.sp, color = Palette.ink)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        GGField(label = "Message to applicant") {
                            GGTextArea(
                                value = message,
                                onValueChange = { message = it },
                                placeholder = "Required unless you are verifying",
                                minHeight = 90.dp
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        GGField(label = "Internal note") {
                            GGTextArea(
                                value = note,
                                onValueChange = { note = it },
                                placeholder = "Optional, staff only",
                                minHeight = 72.dp
                            )
                        }

                        if (decision == "verified") {
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Checkbox(
                                    checked = confirm,
                                    onCheckedChange = { confirm = it },
                                    colors = CheckboxDefaults.colors(checkedColor = Palette.accent)
                                )
                                Text(text = "The evidence supports verification", fontSize = 14.sp, color = Palette.ink)
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        GGButton(
                            title = "Submit decision",
                            fillWidth = true,
                            busy = busy
                        ) {
                            if (decision == "verified" && !confirm) {
                                statusNotice = "Confirm that the evidence supports verification."
                                return@GGButton
                            }
                            if (decision != "verified" && message.isBlank()) {
                                statusNotice = "Explain the decision to the applicant."
                                return@GGButton
                            }
                            busy = true
                            session.viewModelScope.launch {
                                val err = session.performAdmin { store ->
                                    store.reviewApplication(application.id, decision, message.trim().takeIf { it.isNotEmpty() }, note.trim().takeIf { it.isNotEmpty() })
                                }
                                busy = false
                                statusNotice = err ?: (if (decision == "verified") "Chapter verified." else if (decision == "info_requested") "Request sent." else "Decision submitted.")
                            }
                        }
                    }
                }

                GGCard(padding = 16.dp) {
                    Text(text = "Internal note", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                    Spacer(modifier = Modifier.height(8.dp))
                    GGField(label = "Note") {
                        GGTextArea(
                            value = note,
                            onValueChange = { note = it },
                            placeholder = "Visible to staff only",
                            minHeight = 72.dp
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    GGButton(
                        title = "Add note",
                        kind = GGButtonKind.SECONDARY,
                        fillWidth = true,
                        busy = busy
                    ) {
                        val text = note.trim()
                        if (text.isEmpty()) {
                            statusNotice = "Write a note."
                            return@GGButton
                        }
                        busy = true
                        session.viewModelScope.launch {
                            val err = session.performAdmin { store ->
                                store.addApplicationNote(application.id, text)
                            }
                            busy = false
                            if (err == null) note = ""
                            statusNotice = err ?: "Note added."
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 3. CHAPTERS LIST & DETAIL
// ==========================================

@Composable
fun AdminChapterList(
    session: AppSession,
    onNavigate: (AdminRoute) -> Unit
) {
    var query by remember { mutableStateOf("") }
    val chapters = session.admin.chapters

    val filtered = chapters.filter { ch ->
        query.isBlank() || ch.name.contains(query, ignoreCase = true) || ch.university.contains(query, ignoreCase = true) || ch.slug.contains(query, ignoreCase = true)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        GGTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = "Search chapters..."
        )

        if (filtered.isEmpty()) {
            Text(text = "No chapters match.", fontSize = 14.sp, color = Palette.ink3)
        } else {
            GGCard {
                filtered.forEachIndexed { index, chapter ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onNavigate(AdminRoute.Chapter(chapter.id)) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(text = chapter.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                        Text(text = "${chapter.university} · ${chapter.members} members", fontSize = 13.sp, color = Palette.ink3)
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            GGBadge(text = chapter.status.label, tone = chapter.status.tone)
                            if (chapter.paymentsEnabled) GGBadge(text = "Payments on", tone = Tone.POSITIVE)
                        }
                    }
                    if (index < filtered.size - 1) ListRowDivider()
                }
            }
        }
    }
}

@Composable
fun AdminChapterView(
    chapterId: String,
    session: AppSession,
    onBack: () -> Unit,
    onDismiss: () -> Unit
) {
    val chapter = session.admin.chapters.firstOrNull { it.id == chapterId }
    var status by remember { mutableStateOf(chapter?.status?.rawValue ?: "verified") }
    var reason by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Palette.ink)
            }
            Text(
                text = chapter?.name ?: "Chapter",
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Done",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.accent,
                modifier = Modifier
                    .clickable(onClick = onDismiss)
                    .padding(end = 12.dp)
            )
        }
        ListRowDivider()

        if (chapter == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                GGEmptyState(icon = Icons.Default.Domain, title = "Chapter not found")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GGPageHeader(title = chapter.name, description = chapter.university)
                GGCard(padding = 16.dp) {
                    labeledRow("Handle", chapter.slug)
                    labeledRow("Status", chapter.status.label)
                    labeledRow("Members", "${chapter.members}")
                    labeledRow("Subscription", chapter.subscription)
                    labeledRow("Card payments", if (chapter.paymentsEnabled) "On" else "Off")
                    labeledRow("Verified", chapter.verifiedAt?.let { DateFormat.medium(it) } ?: "Not verified")
                }

                if (message != null) {
                    GGNotice(tone = if (message == "Status updated.") Tone.POSITIVE else Tone.DANGER, message = message ?: "")
                }

                if (session.staffRole?.can(AdminCapability.ADMIN_ONLY) == true) {
                    GGCard(padding = 16.dp) {
                        Text(text = "Change status", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                        Spacer(modifier = Modifier.height(10.dp))
                        listOf("verified" to "Verified", "suspended" to "Suspended", "closed" to "Closed").forEach { (key, label) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { status = key }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                RadioButton(selected = status == key, onClick = { status = key }, colors = RadioButtonDefaults.colors(selectedColor = Palette.accent))
                                Text(text = label, fontSize = 14.sp, color = Palette.ink)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        GGField(label = "Reason") {
                            GGTextArea(
                                value = reason,
                                onValueChange = { reason = it },
                                placeholder = "Required. This is recorded in the audit log.",
                                minHeight = 80.dp
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        GGButton(
                            title = "Update status",
                            fillWidth = true,
                            busy = busy
                        ) {
                            val text = reason.trim()
                            if (text.isEmpty()) {
                                message = "A reason is required and is recorded in the audit log."
                                return@GGButton
                            }
                            busy = true
                            session.viewModelScope.launch {
                                val err = session.performAdmin { store ->
                                    store.setChapterStatus(chapter.id, status, text)
                                }
                                busy = false
                                message = err ?: "Status updated."
                            }
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 4. REVENUE & RECONCILIATION
// ==========================================

@Composable
fun AdminRevenueView(session: AppSession) {
    val revenue = session.admin.revenue
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        if (revenue == null) {
            session.loadRevenue()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Revenue", description = "Last 30 days. Subscriptions plus net platform fees.")
        if (session.isLoadingAdmin && revenue == null) {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Palette.accent)
            }
        } else if (revenue == null) {
            GGEmptyState(
                icon = Icons.Default.BarChart,
                title = "Revenue could not be loaded",
                message = "Tap below to try loading revenue again."
            )
            GGButton(
                title = "Retry",
                size = GGButtonSize.SM,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                coroutineScope.launch { session.loadRevenue() }
            }
        } else {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AdminMetricBox("Subscriptions", MoneyFormat.cents(revenue.saasCents), "${revenue.subscriptions} active", Modifier.weight(1f))
                AdminMetricBox("Net fees", MoneyFormat.cents(revenue.feesCents - revenue.feeRefundsCents), if (revenue.feeRefundsCents == 0L) "No fee refunds" else "After refunds", Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AdminMetricBox("Dues volume", MoneyFormat.cents(revenue.volumeCents), "${revenue.payments} payments", Modifier.weight(1f))
                AdminMetricBox("Mismatches", "${revenue.mismatches}", if (revenue.disputes == 0) "No disputes" else "${revenue.disputes} disputes", Modifier.weight(1f))
            }

            GGCard {
                GGCardHeader(title = "By chapter")
                if (revenue.chapters.isEmpty()) {
                    Text(text = "No chapter fees in this period.", fontSize = 14.sp, color = Palette.ink3, modifier = Modifier.padding(16.dp))
                } else {
                    revenue.chapters.forEachIndexed { index, row ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(text = row.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                                Text(text = row.university, fontSize = 12.sp, color = Palette.ink3)
                            }
                            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(text = MoneyFormat.cents(row.feesCents), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                                Text(text = "${row.payments} payments", fontSize = 12.sp, color = Palette.ink3)
                            }
                        }
                        if (index < revenue.chapters.size - 1) ListRowDivider()
                    }
                }
            }
        }
    }
}

@Composable
fun AdminReconciliationView(session: AppSession) {
    val rows = session.admin.reconciliation

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Reconciliation", description = "Payments where Stripe and the ledger disagree.")
        if (rows.isEmpty()) {
            GGEmptyState(icon = Icons.Default.CheckCircle, title = "Everything reconciles", message = "Every online payment matches its ledger entries.")
        } else {
            rows.forEach { row ->
                GGCard(padding = 16.dp) {
                    Text(text = row.chapter, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                    GGBadge(text = row.issue, tone = if (row.issue.contains("mismatch")) Tone.DANGER else Tone.WARNING)
                    Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text(text = MoneyFormat.cents(row.amountCents), fontSize = 13.sp, color = Palette.ink)
                        Spacer(modifier = Modifier.weight(1f))
                        Text(text = "Fee ${MoneyFormat.cents(row.expectedFeeCents)}", fontSize = 13.sp, color = Palette.ink3)
                    }
                    if (row.note.isNotEmpty()) {
                        Text(text = row.note, fontSize = 12.sp, color = Palette.ink3, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
    }
}

// ==========================================
// 5. PRICING VIEW
// ==========================================

@Composable
fun AdminPricingView(session: AppSession) {
    var code by remember { mutableStateOf("standard") }
    var name by remember { mutableStateOf("Standard dues pricing") }
    var percent by remember { mutableStateOf("1.5") }
    var fixed by remember { mutableStateOf("") }
    var minFee by remember { mutableStateOf("") }
    var maxFee by remember { mutableStateOf("") }
    var refundPolicy by remember { mutableStateOf("proportional") }
    var termsVersion by remember { mutableStateOf("") }
    var termsTitle by remember { mutableStateOf("Chapter payments agreement") }
    var termsSummary by remember { mutableStateOf("") }
    var termsBody by remember { mutableStateOf("") }
    var makeDefault by remember { mutableStateOf(true) }
    var confirm by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Pricing", description = "Published rules are immutable. Each chapter keeps the rule on the agreement it accepted until it accepts a new one.")

        if (message != null) {
            GGNotice(tone = if (message!!.contains("published")) Tone.POSITIVE else Tone.DANGER, message = message ?: "")
        }

        GGCard {
            GGCardHeader(title = "GreekGeek subscription", description = "Charged to each chapter through Stripe Billing.")
            session.admin.plans.forEachIndexed { index, plan ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = plan.name, fontSize = 14.sp, color = Palette.ink, modifier = Modifier.weight(1f))
                    Text(text = "${MoneyFormat.cents(plan.priceCents)} / ${plan.interval}", fontSize = 14.sp, color = Palette.ink2)
                    if (plan.active) {
                        Spacer(modifier = Modifier.width(8.dp))
                        GGBadge(text = "Active", tone = Tone.POSITIVE)
                    }
                }
                if (index < session.admin.plans.size - 1) ListRowDivider()
            }
        }

        GGCard {
            GGCardHeader(title = "Dues pricing rules")
            session.admin.pricingRules.forEachIndexed { index, rule ->
                Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(text = rule.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink, modifier = Modifier.weight(1f))
                        if (rule.isDefault) GGBadge(text = "Default", tone = Tone.ACCENT)
                        if (rule.status == "retired") GGBadge(text = "Retired", tone = Tone.NEUTRAL)
                    }
                    Text(text = "${rule.code} v${rule.version}", fontSize = 12.sp, color = Palette.ink3)
                    Text(text = "${rule.bps / 100.0}% + ${MoneyFormat.cents(rule.fixedCents)}", fontSize = 13.sp, color = Palette.ink2)
                    Text(text = "${if (rule.refundPolicy == "proportional") "Returned proportionally" else "Fee kept"} · ${rule.chapterCount} chapters", fontSize = 12.sp, color = Palette.ink3)
                }
                if (index < session.admin.pricingRules.size - 1) ListRowDivider()
            }
        }

        GGCard(padding = 16.dp) {
            Text(text = "Publish a new version", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Text(text = "This creates a new rule and a matching agreement. Existing chapters do not change until they accept.", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))

            GGField(label = "Rule code") { GGTextField(value = code, onValueChange = { code = it }, placeholder = "standard") }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Name") { GGTextField(value = name, onValueChange = { name = it }, placeholder = "Standard dues pricing") }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Platform fee (%)") { GGTextField(value = percent, onValueChange = { percent = it }, placeholder = "1.5") }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Fixed fee per payment ($)") { GGTextField(value = fixed, onValueChange = { fixed = it }, placeholder = "Optional, at most 5.00") }

            Spacer(modifier = Modifier.height(12.dp))
            Text(text = "Chapter agreement", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Version") { GGTextField(value = termsVersion, onValueChange = { termsVersion = it }, placeholder = "2026-11") }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Title") { GGTextField(value = termsTitle, onValueChange = { termsTitle = it }, placeholder = "Chapter payments agreement") }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Summary of changes") { GGTextArea(value = termsSummary, onValueChange = { termsSummary = it }, placeholder = "What changed in this version", minHeight = 72.dp) }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Full agreement") { GGTextArea(value = termsBody, onValueChange = { termsBody = it }, placeholder = "The full agreement text", minHeight = 120.dp) }

            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Checkbox(checked = makeDefault, onCheckedChange = { makeDefault = it }, colors = CheckboxDefaults.colors(checkedColor = Palette.accent))
                Text(text = "Make this the default for new chapters", fontSize = 13.sp, color = Palette.ink)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Checkbox(checked = confirm, onCheckedChange = { confirm = it }, colors = CheckboxDefaults.colors(checkedColor = Palette.accent))
                Text(text = "I understand published rules cannot be edited.", fontSize = 13.sp, color = Palette.ink)
            }

            Spacer(modifier = Modifier.height(12.dp))
            GGButton(
                title = "Publish pricing",
                fillWidth = true,
                busy = busy
            ) {
                if (!confirm) {
                    message = "Confirm before publishing."
                    return@GGButton
                }
                busy = true
                session.viewModelScope.launch {
                    val pct = percent.toDoubleOrNull() ?: 1.5
                    val bps = (pct * 100).toInt()
                    val fixedCents = MoneyFormat.dollarsToCents(fixed) ?: 0
                    val minCents = MoneyFormat.dollarsToCents(minFee)
                    val maxCents = MoneyFormat.dollarsToCents(maxFee)
                    val err = session.performAdmin { store ->
                        store.publishPricingRule(
                            code = code.trim().lowercase(),
                            name = name.trim(),
                            bps = bps,
                            fixedCents = fixedCents,
                            minCents = minCents,
                            maxCents = maxCents,
                            refundPolicy = refundPolicy,
                            makeDefault = makeDefault,
                            termsVersion = termsVersion.trim(),
                            termsTitle = termsTitle.trim(),
                            termsSummary = termsSummary.trim(),
                            termsBody = termsBody.trim()
                        )
                    }
                    busy = false
                    message = err ?: "Pricing published."
                }
            }
        }
    }
}

// ==========================================
// 6. OUTREACH & INTRO FORMS
// ==========================================

@Composable
fun AdminOutreachView(
    session: AppSession,
    onNavigate: (AdminRoute) -> Unit
) {
    val replies = session.admin.replies
    val forms = session.admin.forms

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Outreach", description = "Inbound contact replies and campus intro form submissions.")

        GGCard {
            GGCardHeader(title = "Unread replies (${replies.size})")
            if (replies.isEmpty()) {
                Text(text = "No replies yet.", fontSize = 14.sp, color = Palette.ink3, modifier = Modifier.padding(16.dp))
            } else {
                replies.forEachIndexed { index, reply ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(text = reply.from, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink, modifier = Modifier.weight(1f))
                            if (reply.unread) GGBadge(text = "Unread", tone = Tone.ACCENT)
                        }
                        Text(text = reply.subject, fontSize = 13.sp, color = Palette.ink2)
                        Text(text = reply.preview, fontSize = 12.sp, color = Palette.ink3, maxLines = 2)
                        if (reply.unread) {
                            Text(
                                text = "Mark read",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Palette.accent,
                                modifier = Modifier
                                    .clickable {
                                        session.viewModelScope.launch {
                                            session.performAdmin { it.markOutreachRead(reply.id) }
                                        }
                                    }
                                    .padding(top = 4.dp)
                            )
                        }
                    }
                    if (index < replies.size - 1) ListRowDivider()
                }
            }
        }

        GGCard {
            GGCardHeader(title = "Intro forms (${forms.size})")
            if (forms.isEmpty()) {
                Text(text = "No form submissions.", fontSize = 14.sp, color = Palette.ink3, modifier = Modifier.padding(16.dp))
            } else {
                forms.forEachIndexed { index, form ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onNavigate(AdminRoute.Form(form.id)) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(text = form.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink, modifier = Modifier.weight(1f))
                            if (form.unread) GGBadge(text = "Unread", tone = Tone.ACCENT)
                        }
                        Text(
                            text = listOf(form.organization, form.school, form.role).filter { it.isNotBlank() }.joinToString(" · "),
                            fontSize = 12.sp,
                            color = Palette.ink3
                        )
                    }
                    if (index < forms.size - 1) ListRowDivider()
                }
            }
        }
    }
}

@Composable
fun AdminFormView(
    formId: String,
    session: AppSession,
    onBack: () -> Unit,
    onDismiss: () -> Unit
) {
    val form = session.admin.forms.firstOrNull { it.id == formId }
    var status by remember { mutableStateOf(form?.status ?: "new") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Palette.ink)
            }
            Text(
                text = form?.name ?: "Intro form",
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Done",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.accent,
                modifier = Modifier
                    .clickable(onClick = onDismiss)
                    .padding(end = 12.dp)
            )
        }
        ListRowDivider()

        if (form == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                GGEmptyState(icon = Icons.Default.Email, title = "Form not found")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GGPageHeader(title = form.name, description = listOf(form.organization, form.school).filter { it.isNotBlank() }.joinToString(" · "))
                GGCard(padding = 16.dp) {
                    labeledRow("Role", form.role)
                    labeledRow("Email", form.email)
                    labeledRow("Interest", form.interest)
                    labeledRow("Status", form.status.replace("_", " "))
                }
                if (form.notes.isNotEmpty()) {
                    GGCard(padding = 16.dp) {
                        Text(text = form.notes, fontSize = 14.sp, color = Palette.ink2)
                    }
                }

                if (message != null) {
                    GGNotice(tone = Tone.POSITIVE, message = message ?: "")
                }

                GGCard(padding = 16.dp) {
                    listOf("new" to "New", "contacted" to "Contacted", "meeting" to "Meeting", "archived" to "Archived").forEach { (key, label) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { status = key }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            RadioButton(selected = status == key, onClick = { status = key }, colors = RadioButtonDefaults.colors(selectedColor = Palette.accent))
                            Text(text = label, fontSize = 14.sp, color = Palette.ink)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    GGButton(
                        title = "Save and mark read",
                        fillWidth = true,
                        busy = busy
                    ) {
                        busy = true
                        session.viewModelScope.launch {
                            val err = session.performAdmin { store ->
                                store.updateIntroForm(form.id, status, markRead = true)
                            }
                            busy = false
                            message = err ?: "Saved."
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 7. EMAIL STATS
// ==========================================

@Composable
fun AdminEmailStatsView(session: AppSession) {
    var rangeKey by remember { mutableStateOf("30") }
    val stats = session.admin.emailStats

    val period = when (rangeKey) {
        "7" -> "the last 7 days"
        "30" -> "the last 30 days"
        "90" -> "the last 90 days"
        else -> "all time"
    }

    LaunchedEffect(rangeKey) {
        val days = if (rangeKey == "all") null else rangeKey.toIntOrNull()
        session.loadEmailStats(days)
    }

    fun percent(part: Int, whole: Int): String {
        if (whole <= 0) return "0%"
        return "${Math.round((part.toDouble() / whole.toDouble()) * 100).toInt()}%"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Email stats", description = "Outreach metrics over the selected period.")

        // Range selector
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Palette.subtle)
                .padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            listOf("7" to "7 days", "30" to "30 days", "90" to "90 days", "all" to "All time").forEach { (key, label) ->
                val isSel = rangeKey == key
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSel) Palette.surface else Palette.subtle)
                        .clickable { rangeKey = key }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        fontSize = 12.sp,
                        fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSel) Palette.ink else Palette.ink3
                    )
                }
            }
        }

        if (session.isLoadingEmailStats && stats.sent == 0 && stats.forms == 0) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 40.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Palette.accent)
            }
        } else {
            // 8-Metric Grid
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AdminMetricBox("Emails sent", "${stats.sent}", if (stats.failed > 0) "${stats.failed} failed and not counted" else "Failed sends not counted", Modifier.weight(1f))
                AdminMetricBox("People emailed", "${stats.people}", "At ${stats.schools} school${if (stats.schools == 1) "" else "s"}", Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AdminMetricBox("Heard back", "${stats.heardBack}", "${percent(stats.emailedAndReplied, stats.people)} of people emailed · ${stats.replies} replies", Modifier.weight(1f))
                AdminMetricBox("Form submissions", "${stats.forms}", "${stats.demos} want a demo", Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AdminMetricBox("Delivered", "${stats.delivered}", "${percent(stats.delivered, stats.sent)} of emails sent", Modifier.weight(1f))
                AdminMetricBox("Opened", "${stats.opened}", "${percent(stats.opened, stats.sent)} · opens are not proof of reading", Modifier.weight(1f))
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AdminMetricBox("Clicked a link", "${stats.clicked}", "${percent(stats.clicked, stats.sent)} of emails sent", Modifier.weight(1f))
                AdminMetricBox("Bounced", "${stats.bounced}", "${percent(stats.bounced, stats.sent)} of emails sent · ${stats.blocked} do not contact", Modifier.weight(1f))
            }

            if (stats.people == 0 && stats.forms == 0) {
                GGEmptyState(
                    icon = Icons.AutoMirrored.Filled.TrendingUp,
                    title = "Nothing sent in $period",
                    message = "Once outreach emails go out, the numbers show up here."
                )
            } else {
                // Funnel Card
                GGCard {
                    GGCardHeader(title = "From email to form", description = "Of the ${stats.people} people emailed in $period.")
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        AdminFunnelRow("Emailed", stats.people, stats.people, "Got at least one email")
                        AdminFunnelRow("Delivered", stats.deliveredTo, stats.people, "Their mail server accepted it")
                        AdminFunnelRow("Opened", stats.openedBy, stats.people, "Opens are not proof of reading")
                        AdminFunnelRow("Replied", stats.emailedAndReplied, stats.people, "Wrote back at least once")
                        AdminFunnelRow("Filled out the form", stats.formFromEmailed, stats.people, "Submitted with the same email")
                    }
                }

                // Replies Card
                GGCard(padding = 16.dp) {
                    GGCardHeader(title = "Replies")
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AdminReplyRow("Typical time to first reply", stats.medianReplyMinutes?.let { DateFormat.compactDuration(it) } ?: "No replies yet")
                        AdminReplyRow("Fastest first reply", stats.fastestReplyMinutes?.let { DateFormat.compactDuration(it) } ?: "No replies yet")
                        AdminReplyRow("Replies received", "${stats.replies}")
                        AdminReplyRow("Unread replies", "${stats.unread}")
                        Text(
                            text = "Typical is the median: half of people replied faster than this.",
                            fontSize = 12.sp,
                            color = Palette.ink3,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }

                // Each Week Card
                GGCard {
                    GGCardHeader(title = "Each week", description = "The last 12 weeks, oldest on the left.")
                    val peak = maxOf(1, stats.weeks.maxOfOrNull { maxOf(it.sent, it.replies) } ?: 1)

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp)
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.Bottom
                    ) {
                        stats.weeks.forEach { week ->
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxHeight(),
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                verticalAlignment = Alignment.Bottom
                            ) {
                                val sentRatio = (week.sent.toFloat() / peak).coerceIn(0f, 1f)
                                val replyRatio = (week.replies.toFloat() / peak).coerceIn(0f, 1f)
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight(if (week.sent > 0) maxOf(0.06f, sentRatio) else 0.02f)
                                        .clip(RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp))
                                        .background(Palette.accent)
                                )
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight(if (week.replies > 0) maxOf(0.06f, replyRatio) else 0.02f)
                                        .clip(RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp))
                                        .background(Palette.positive)
                                )
                            }
                        }
                    }

                    // Date labels
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .padding(bottom = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        stats.weeks.forEachIndexed { index, week ->
                            Text(
                                text = if (index % 2 == 0) DateFormat.shortDay(week.start) else "",
                                fontSize = 10.sp,
                                color = Palette.ink3,
                                maxLines = 1,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    // Legend
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .padding(bottom = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(Palette.accent))
                            Text(text = "Sent", fontSize = 12.sp, color = Palette.ink2)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(Palette.positive))
                            Text(text = "Replies", fontSize = 12.sp, color = Palette.ink2)
                        }
                    }
                }

                // Top Schools Card
                if (stats.topSchools.isNotEmpty()) {
                    GGCard {
                        GGCardHeader(title = "Schools", description = "Schools emailed in $period, most replies first.")
                        stats.topSchools.forEachIndexed { index, school ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(text = school.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                                    Text(text = "${school.emailed} emailed · ${school.opened} opened", fontSize = 12.sp, color = Palette.ink3)
                                }
                                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(text = "${school.replied} replied", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                                    Text(text = "${school.forms} forms", fontSize = 12.sp, color = Palette.ink3)
                                }
                            }
                            if (index < stats.topSchools.size - 1) ListRowDivider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminFunnelRow(label: String, count: Int, total: Int, note: String = "") {
    val pct = if (total > 0) (count.toFloat() / total).coerceIn(0f, 1f) else 0f
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = label, fontSize = 13.sp, color = Palette.ink)
                if (note.isNotEmpty()) {
                    Text(text = note, fontSize = 11.sp, color = Palette.ink3)
                }
            }
            Text(text = "$count (${(pct * 100).toInt()}%)", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Palette.subtle)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(pct)
                    .fillMaxHeight()
                    .background(Palette.accent)
            )
        }
    }
}

@Composable
private fun AdminReplyRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, fontSize = 13.sp, color = Palette.ink2)
        Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
    }
}

// ==========================================
// 8. BUGS LIST & DETAIL
// ==========================================

@Composable
fun AdminBugList(
    session: AppSession,
    onNavigate: (AdminRoute) -> Unit
) {
    var viewTab by remember { mutableStateOf("open") }
    val allBugs = session.admin.bugs

    val filtered = allBugs.filter { bug ->
        when (viewTab) {
            "new" -> bug.status == "new"
            "closed" -> listOf("fixed", "wont_fix", "duplicate", "cant_reproduce").contains(bug.status)
            else -> listOf("new", "triaged", "in_progress").contains(bug.status)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Palette.subtle)
                .padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            listOf("open" to "Open", "new" to "New", "closed" to "Closed").forEach { (key, label) ->
                val isSel = viewTab == key
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSel) Palette.surface else Palette.subtle)
                        .clickable { viewTab = key }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        fontSize = 13.sp,
                        fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSel) Palette.ink else Palette.ink3
                    )
                }
            }
        }

        if (filtered.isEmpty()) {
            Text(text = "No reports in this view.", fontSize = 14.sp, color = Palette.ink3)
        } else {
            GGCard {
                filtered.forEachIndexed { index, bug ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onNavigate(AdminRoute.Bug(bug.id)) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(text = "#${bug.number} · ${bug.page}", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                        Text(text = bug.message, fontSize = 13.sp, color = Palette.ink2, maxLines = 2)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 2.dp)) {
                            GGBadge(text = bug.status.replace("_", " "), tone = if (bug.status == "fixed") Tone.POSITIVE else if (bug.status == "new") Tone.ACCENT else Tone.NEUTRAL)
                            GGBadge(text = bug.severity, tone = if (bug.severity == "critical") Tone.DANGER else Tone.WARNING)
                        }
                    }
                    if (index < filtered.size - 1) ListRowDivider()
                }
            }
        }
    }
}

@Composable
fun AdminBugView(
    bugId: String,
    session: AppSession,
    onBack: () -> Unit,
    onDismiss: () -> Unit
) {
    val bug = session.admin.bugs.firstOrNull { it.id == bugId }
    var status by remember { mutableStateOf(bug?.status ?: "triaged") }
    var severity by remember { mutableStateOf(bug?.severity ?: "medium") }
    var area by remember { mutableStateOf(bug?.area ?: "other") }
    var comment by remember { mutableStateOf("") }
    var fix by remember { mutableStateOf(bug?.fixSummary ?: "") }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Palette.ink)
            }
            Text(
                text = bug?.let { "Bug #${it.number}" } ?: "Bug",
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = "Done",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.accent,
                modifier = Modifier
                    .clickable(onClick = onDismiss)
                    .padding(end = 12.dp)
            )
        }
        ListRowDivider()

        if (bug == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                GGEmptyState(icon = Icons.Default.BugReport, title = "Report not found")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GGPageHeader(title = "Bug #${bug.number}", description = "${bug.page} · ${bug.reporter}")
                GGCard(padding = 16.dp) {
                    Text(text = bug.message, fontSize = 15.sp, color = Palette.ink)
                    if (bug.email.isNotEmpty()) {
                        Text(text = bug.email, fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.padding(top = 8.dp))
                    }
                    Text(text = DateFormat.medium(bug.createdAt), fontSize = 12.sp, color = Palette.ink3, modifier = Modifier.padding(top = 6.dp))
                }

                if (message != null) {
                    GGNotice(tone = Tone.POSITIVE, message = message ?: "")
                }

                GGCard(padding = 16.dp) {
                    Text(text = "Triage", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(text = "Status: $status", fontSize = 13.sp, color = Palette.ink2)
                    listOf("new" to "New", "triaged" to "Triaged", "in_progress" to "In progress", "wont_fix" to "Won't fix").forEach { (key, label) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { status = key }
                                .padding(vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            RadioButton(selected = status == key, onClick = { status = key }, colors = RadioButtonDefaults.colors(selectedColor = Palette.accent))
                            Text(text = label, fontSize = 14.sp, color = Palette.ink)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Text(text = "Severity", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Palette.ink2)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                        listOf("critical", "high", "medium", "low").forEach { s ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (severity == s) Palette.accentSoft else Palette.subtle)
                                    .border(1.dp, if (severity == s) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                                    .clickable { severity = s }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text(text = s.replaceFirstChar { it.uppercase() }, fontSize = 12.sp, color = if (severity == s) Palette.accent else Palette.ink2)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    GGButton(
                        title = "Save triage",
                        fillWidth = true,
                        busy = busy
                    ) {
                        busy = true
                        session.viewModelScope.launch {
                            val err = session.performAdmin { store ->
                                store.updateBug(bug.id, status, severity, area)
                            }
                            busy = false
                            message = err ?: "Saved."
                        }
                    }
                }

                GGCard(padding = 16.dp) {
                    GGField(label = "Internal note") {
                        GGTextArea(value = comment, onValueChange = { comment = it }, placeholder = "What you found", minHeight = 72.dp)
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    GGButton(title = "Add note", kind = GGButtonKind.SECONDARY, fillWidth = true, busy = busy) {
                        val text = comment.trim()
                        if (text.length < 2) {
                            message = "Write a note first."
                            return@GGButton
                        }
                        busy = true
                        session.viewModelScope.launch {
                            val err = session.performAdmin { store ->
                                store.commentOnBug(bug.id, text)
                            }
                            busy = false
                            if (err == null) comment = ""
                            message = err ?: "Note added."
                        }
                    }
                }

                GGCard(padding = 16.dp) {
                    GGField(label = "Fix summary") {
                        GGTextArea(value = fix, onValueChange = { fix = it }, placeholder = "What changed", minHeight = 72.dp)
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    GGButton(title = "Log a fix", fillWidth = true, busy = busy) {
                        val text = fix.trim()
                        if (text.length < 5) {
                            message = "Say what changed."
                            return@GGButton
                        }
                        busy = true
                        session.viewModelScope.launch {
                            val err = session.performAdmin { store ->
                                store.logBugFix(bug.id, text, null)
                            }
                            busy = false
                            message = err ?: "Fix logged. Report is closed."
                        }
                    }
                }
            }
        }
    }
}

// ==========================================
// 9. CLOSURES & AUDIT
// ==========================================

@Composable
fun AdminClosuresView(session: AppSession) {
    val closures = session.admin.closures
    var notes by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Closure requests", description = "A chapter stays open until an administrator accepts the request.")

        if (message != null) {
            GGNotice(tone = if (message!!.contains("closed")) Tone.POSITIVE else Tone.DANGER, message = message ?: "")
        }

        if (closures.isEmpty()) {
            GGEmptyState(icon = Icons.Default.Cancel, title = "No closure requests", message = "Presidents send these from chapter settings.")
        } else {
            closures.forEach { item ->
                GGCard(padding = 16.dp) {
                    Text(text = item.chapterName, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                    Text(
                        text = listOf(item.university, item.requester, DateFormat.medium(item.createdAt)).filter { it.isNotBlank() }.joinToString(" · "),
                        fontSize = 13.sp,
                        color = Palette.ink3,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                    Text(text = item.reason, fontSize = 14.sp, color = Palette.ink2, modifier = Modifier.padding(top = 8.dp))

                    Spacer(modifier = Modifier.height(10.dp))
                    val noteText = notes[item.id] ?: ""
                    GGField(label = "Note") {
                        GGTextField(
                            value = noteText,
                            onValueChange = { notes = notes + (item.id to it) },
                            placeholder = "Required to decline"
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        GGButton(title = "Accept", modifier = Modifier.weight(1f), busy = busy) {
                            busy = true
                            session.viewModelScope.launch {
                                val err = session.performAdmin { store ->
                                    store.reviewClosure(item.id, "accepted", noteText.trim().takeIf { it.isNotEmpty() })
                                }
                                busy = false
                                message = err ?: "Chapter closed."
                            }
                        }
                        GGButton(title = "Decline", kind = GGButtonKind.SECONDARY, modifier = Modifier.weight(1f), busy = busy) {
                            if (noteText.trim().length < 3) {
                                message = "Tell the chapter why this was declined."
                                return@GGButton
                            }
                            busy = true
                            session.viewModelScope.launch {
                                val err = session.performAdmin { store ->
                                    store.reviewClosure(item.id, "declined", noteText.trim())
                                }
                                busy = false
                                message = err ?: "Request declined."
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AdminAuditView(session: AppSession) {
    val audit = session.admin.audit

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(title = "Audit log", description = "Platform security, verification, and settings events.")

        if (audit.isEmpty()) {
            Text(text = "No audit events.", fontSize = 14.sp, color = Palette.ink3)
        } else {
            GGCard {
                audit.forEachIndexed { index, row ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Text(text = row.action, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                        Text(text = "${row.actor} · ${row.chapter}", fontSize = 13.sp, color = Palette.ink3)
                        if (row.detail.isNotEmpty()) {
                            Text(text = row.detail, fontSize = 12.sp, color = Palette.ink3)
                        }
                        Text(text = DateFormat.medium(row.date), fontSize = 12.sp, color = Palette.ink3)
                    }
                    if (index < audit.size - 1) ListRowDivider()
                }
            }
        }
    }
}

// ==========================================
// HELPERS
// ==========================================

@Composable
private fun labeledRow(title: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = title, fontSize = 14.sp, color = Palette.ink3)
        Spacer(modifier = Modifier.weight(1f))
        Text(text = value.ifEmpty { "—" }, fontSize = 14.sp, color = Palette.ink)
    }
}

@Composable
private fun AdminMetricBox(
    title: String,
    value: String,
    hint: String,
    modifier: Modifier = Modifier
) {
    GGCard(modifier = modifier, padding = 14.dp) {
        Text(text = title, fontSize = 12.sp, color = Palette.ink3)
        Text(
            text = value,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            color = Palette.ink,
            modifier = Modifier.padding(vertical = 2.dp)
        )
        Text(text = hint, fontSize = 12.sp, color = Palette.ink3)
    }
}
