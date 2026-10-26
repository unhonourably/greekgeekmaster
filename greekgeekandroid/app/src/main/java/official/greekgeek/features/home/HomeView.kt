package official.greekgeek.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.features.account.AccountModal
import official.greekgeek.features.account.NotificationsModal
import official.greekgeek.features.admin.AdminHomeModal
import official.greekgeek.features.chapter.BugReportModal
import official.greekgeek.features.chapter.ChapterShellView
import official.greekgeek.features.onboarding.OnboardingModal
import official.greekgeek.models.ChapterEvent
import official.greekgeek.models.ChapterStatus
import official.greekgeek.models.MyChapter
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone

@Composable
fun SignedInRootView(session: AppSession) {
    var showAccount by remember { mutableStateOf(false) }
    var showNotifications by remember { mutableStateOf(false) }
    var showOnboarding by remember { mutableStateOf(false) }
    var showAdmin by remember { mutableStateOf(false) }
    var showBugReport by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        if (session.presentedChapterSlug == null) {
            AppHeaderBar(
                session = session,
                onNotifications = { showNotifications = true },
                onAccount = { showAccount = true },
                onAdmin = if (session.staffRole != null) { { showAdmin = true } } else null,
                onBug = { showBugReport = true }
            )
        }

        if (session.presentedChapterSlug != null) {
            ChapterShellView(session = session)
        } else {
            HomeView(
                session = session,
                onOpenAccount = { showAccount = true },
                onOpenOnboarding = { showOnboarding = true }
            )
        }
    }

    if (showAccount) {
        AccountModal(session = session, onDismiss = { showAccount = false })
    }
    if (showNotifications) {
        NotificationsModal(session = session, onDismiss = { showNotifications = false })
    }
    if (showOnboarding) {
        OnboardingModal(session = session, onDismiss = { showOnboarding = false })
    }
    if (showAdmin) {
        AdminHomeModal(session = session, onDismiss = { showAdmin = false })
    }
    if (showBugReport) {
        BugReportModal(
            page = "/home",
            onDismiss = { showBugReport = false },
            onSubmit = { description -> session.reportBug("/home", description) }
        )
    }
}

@Composable
fun AppHeaderBar(
    session: AppSession,
    onNotifications: () -> Unit,
    onAccount: () -> Unit,
    onAdmin: (() -> Unit)? = null,
    onBug: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Palette.canvas.copy(alpha = 0.95f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        WordmarkView(height = 18.dp)
        Spacer(modifier = Modifier.weight(1f))

        if (onAdmin != null) {
            Text(
                text = "Platform admin",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.ink2,
                modifier = Modifier
                    .clickable(onClick = onAdmin)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
        }

        if (onBug != null) {
            IconButton(onClick = onBug, modifier = Modifier.size(36.dp)) {
                Icon(
                    imageVector = Icons.Default.BugReport,
                    contentDescription = "Report a bug",
                    tint = Palette.ink2,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        IconButton(onClick = onNotifications, modifier = Modifier.size(36.dp)) {
            Box(contentAlignment = Alignment.TopEnd) {
                Icon(
                    imageVector = Icons.Default.Notifications,
                    contentDescription = "Notifications",
                    tint = Palette.ink2,
                    modifier = Modifier.size(20.dp)
                )
                if (session.unreadCount > 0) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .offset(x = 2.dp, y = (-2).dp)
                            .clip(CircleShape)
                            .background(Palette.accent)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(4.dp))

        Box(modifier = Modifier.clickable(onClick = onAccount)) {
            PersonAvatar(
                name = session.profile?.personName ?: "Account",
                path = session.profile?.avatarPath,
                size = 28.dp
            )
        }
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(Palette.line)
    )
}

@Composable
fun HomeView(
    session: AppSession,
    onOpenAccount: () -> Unit,
    onOpenOnboarding: () -> Unit
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp)
            .padding(top = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp)
    ) {
        // Welcome Card
        WelcomeCard(session = session, onRegister = onOpenOnboarding)

        // Summary Stats Row
        if (session.chapters.isNotEmpty()) {
            StatsRow(session = session)
        }

        // Chapters List Card
        if (session.chapters.isEmpty()) {
            GetStartedCard(session = session, onRegister = onOpenOnboarding)
        } else {
            ChaptersCard(session = session)
        }

        // Applications Card
        if (session.applications.isNotEmpty()) {
            ApplicationsCard(session = session)
        }

        // Upcoming Events Card
        if (session.upcomingEvents.isNotEmpty()) {
            UpcomingEventsCard(session = session)
        }

        // Finish Profile Checklist
        ProfileChecklistCard(session = session, onOpenAccount = onOpenAccount)
    }
}

@Composable
private fun WelcomeCard(session: AppSession, onRegister: () -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Palette.surface)
            .border(1.dp, Palette.line, shape)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            PersonAvatar(
                name = session.profile?.personName ?: "Member",
                path = session.profile?.avatarPath,
                size = 44.dp
            )
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = if (session.firstName.isEmpty()) "Welcome" else "Welcome, ${session.firstName}",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.ink
                )
                Text(
                    text = session.user?.email ?: "",
                    fontSize = 13.sp,
                    color = Palette.ink3
                )
            }
        }

        GGButton(
            title = "Register a chapter",
            icon = Icons.Default.Domain,
            kind = GGButtonKind.SECONDARY,
            size = GGButtonSize.SM,
            action = onRegister
        )
    }
}

@Composable
private fun StatsRow(session: AppSession) {
    val totalDue = session.chapters.sumOf { it.balanceCents }
    val shape = RoundedCornerShape(8.dp)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Palette.surface)
            .border(1.dp, Palette.line, shape)
            .height(IntrinsicSize.Min),
        verticalAlignment = Alignment.CenterVertically
    ) {
        StatItem(
            label = "Chapters",
            value = "${session.chapters.size}",
            modifier = Modifier.weight(1f)
        )
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(Palette.line)
        )
        StatItem(
            label = "Dues balance",
            value = MoneyFormat.cents(totalDue),
            warning = totalDue > 0,
            modifier = Modifier.weight(1f)
        )
        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(Palette.line)
        )
        StatItem(
            label = "Upcoming events",
            value = "${session.upcomingEvents.size}",
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun StatItem(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    warning: Boolean = false
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = Palette.ink3
        )
        Text(
            text = value,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (warning) Palette.warning else Palette.ink
        )
    }
}

@Composable
private fun ChaptersCard(session: AppSession) {
    GGCard {
        GGCardHeader(title = "Your chapters")
        session.chapters.forEachIndexed { index, chapter ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { session.openChapter(chapter) }
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Palette.accentSoft),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Domain,
                        contentDescription = null,
                        tint = Palette.accent,
                        modifier = Modifier.size(20.dp)
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = chapter.organizationName,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.ink
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    val subtitleParts = listOfNotNull(chapter.designation, chapter.universityName, chapter.memberClass.label)
                    Text(
                        text = subtitleParts.joinToString(" · "),
                        fontSize = 13.sp,
                        color = Palette.ink3
                    )
                }

                if (chapter.status != ChapterStatus.VERIFIED) {
                    GGBadge(text = chapter.status.label, tone = Tone.DANGER)
                } else {
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = if (chapter.balanceCents > 0) "${MoneyFormat.cents(chapter.balanceCents)} due" else "Paid up",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = if (chapter.balanceCents > 0) Palette.warning else Palette.ink2
                        )
                        if (chapter.nextDueDate != null && chapter.balanceCents > 0) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Next due ${DateFormat.shortDay(chapter.nextDueDate)}",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }
                    }
                }

                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = Palette.ink3,
                    modifier = Modifier.size(16.dp)
                )
            }
            if (index < session.chapters.size - 1) {
                ListRowDivider()
            }
        }
    }
}

@Composable
private fun GetStartedCard(session: AppSession, onRegister: () -> Unit) {
    GGCard {
        GGCardHeader(
            title = "Get started",
            description = "Officers register their chapter. Members join by invitation."
        )
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Palette.accentSoft),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Domain,
                    contentDescription = null,
                    tint = Palette.accent,
                    modifier = Modifier.size(18.dp)
                )
            }
            Text(
                text = "Register your chapter",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
            Text(
                text = "For officers setting up their chapter. We verify every chapter before it can invite members or collect dues.",
                fontSize = 13.sp,
                color = Palette.ink2
            )
            GGButton(
                title = "Start an application",
                size = GGButtonSize.SM,
                action = onRegister
            )
        }
        ListRowDivider()
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Palette.subtle),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.MailOutline,
                    contentDescription = null,
                    tint = Palette.ink2,
                    modifier = Modifier.size(18.dp)
                )
            }
            Text(
                text = "Joining a chapter?",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
            Text(
                text = "Ask an officer to invite ${session.user?.email ?: "your email"}, then open the link in the email.",
                fontSize = 13.sp,
                color = Palette.ink2
            )
        }
    }
}

@Composable
private fun ApplicationsCard(session: AppSession) {
    GGCard {
        GGCardHeader(
            title = "Chapter applications",
            description = "Applications you started or submitted."
        )
        session.applications.forEachIndexed { index, application ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Description,
                    contentDescription = null,
                    tint = Palette.ink3,
                    modifier = Modifier.size(20.dp)
                )
                Column(modifier = Modifier.weight(1f)) {
                    val title = listOfNotNull(application.organizationName, application.designation).joinToString(", ")
                    Text(
                        text = if (title.isBlank()) "Untitled application" else title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.ink
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "${application.kind.label} · ${application.universityName ?: "University not set"}",
                        fontSize = 13.sp,
                        color = Palette.ink3
                    )
                }
                GGBadge(text = application.status.label, tone = application.status.tone)
            }
            if (index < session.applications.size - 1) ListRowDivider()
        }
    }
}

@Composable
private fun UpcomingEventsCard(session: AppSession) {
    GGCard {
        GGCardHeader(title = "Upcoming events")
        session.upcomingEvents.forEachIndexed { index, event ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Calendar Date Badge
                val shape = RoundedCornerShape(6.dp)
                Column(
                    modifier = Modifier
                        .width(44.dp)
                        .clip(shape)
                        .border(1.dp, Palette.line, shape)
                        .padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = DateFormat.month(event.startsAt, event.timezone).uppercase(),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.accent
                    )
                    Text(
                        text = DateFormat.day(event.startsAt, event.timezone),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Palette.ink
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = event.title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.ink
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    val subtitle = listOfNotNull(DateFormat.weekdayTime(event.startsAt, event.timezone), event.location).joinToString(" · ")
                    Text(
                        text = subtitle,
                        fontSize = 13.sp,
                        color = Palette.ink3
                    )
                }

                if (event.attendanceRequired) {
                    GGBadge(text = "Required", tone = Tone.GOLD)
                }
            }
            if (index < session.upcomingEvents.size - 1) ListRowDivider()
        }
    }
}

@Composable
private fun ProfileChecklistCard(session: AppSession, onOpenAccount: () -> Unit) {
    val items = listOf(
        Pair("Add your name", !session.profile?.fullName.isNullOrBlank()),
        Pair("Add a profile photo", session.profile?.avatarPath != null),
        Pair("Add your graduation year", session.profile?.graduationYear != null),
        Pair("Join or register a chapter", session.chapters.isNotEmpty())
    )
    val remaining = items.count { !it.second }
    if (remaining == 0) return

    val doneCount = items.size - remaining
    val progress = doneCount.toFloat() / items.size.toFloat()

    GGCard {
        GGCardHeader(
            title = "Finish your profile",
            description = "$doneCount of ${items.size} done"
        )
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = Palette.accent,
            trackColor = Palette.subtle
        )
        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items.forEach { (label, done) ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                        contentDescription = null,
                        tint = if (done) Palette.accent else Palette.lineStrong,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = label,
                        fontSize = 13.sp,
                        color = if (done) Palette.ink3 else Palette.ink2,
                        textDecoration = if (done) TextDecoration.LineThrough else TextDecoration.None
                    )
                }
            }
        }
        Text(
            text = "Open account settings",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Palette.accent,
            modifier = Modifier
                .clickable(onClick = onOpenAccount)
                .padding(horizontal = 20.dp, vertical = 14.dp)
        )
    }
}
