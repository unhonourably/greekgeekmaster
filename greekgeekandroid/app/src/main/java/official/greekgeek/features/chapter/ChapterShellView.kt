package official.greekgeek.features.chapter

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.models.*
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone

@Composable
fun ChapterShellView(session: AppSession) {
    var destination by remember { mutableStateOf(ChapterDestination.OVERVIEW) }
    val history = remember { mutableStateListOf<ChapterDestination>() }
    var showMenu by remember { mutableStateOf(false) }
    var showBugReport by remember { mutableStateOf(false) }

    var openedConversationId by remember { mutableStateOf<String?>(null) }
    var openedEvent by remember { mutableStateOf<ChapterEvent?>(null) }
    var openedMember by remember { mutableStateOf<DirectoryMember?>(null) }

    val chapter = session.selectedChapter

    // Back button behavior
    val handleBack: () -> Unit = {
        if (openedConversationId != null) {
            openedConversationId = null
        } else if (openedEvent != null) {
            openedEvent = null
        } else if (openedMember != null) {
            openedMember = null
        } else if (destination != ChapterDestination.OVERVIEW) {
            val prev = if (history.isNotEmpty()) history.removeAt(history.lastIndex) else ChapterDestination.OVERVIEW
            destination = prev
        } else {
            session.closeChapter()
        }
    }

    BackHandler {
        handleBack()
    }

    val chromeTitle: String = remember(destination, openedConversationId, openedEvent, openedMember, chapter) {
        if (openedConversationId != null) {
            val conv = chapter?.conversations?.firstOrNull { it.id == openedConversationId }
            conv?.title ?: "Chat"
        } else if (openedEvent != null) {
            openedEvent!!.title
        } else if (openedMember != null) {
            openedMember!!.name
        } else {
            destination.title
        }
    }

    val chromeBackTitle: String = remember(destination, openedConversationId, openedEvent, openedMember, history.size) {
        if (openedConversationId != null) "Messages"
        else if (openedEvent != null) "Events"
        else if (openedMember != null) if (destination == ChapterDestination.SETTINGS) "Settings" else "Directory"
        else if (destination == ChapterDestination.OVERVIEW) "Home"
        else history.lastOrNull()?.title ?: "Overview"
    }

    val pickDestination: (ChapterDestination) -> Unit = { next ->
        if (next != destination) {
            if (next == ChapterDestination.OVERVIEW) {
                history.clear()
            } else {
                history.add(destination)
            }
            destination = next
            openedConversationId = null
            openedEvent = null
            openedMember = null
        }
    }

    if (session.isLoadingChapter && chapter == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Palette.canvas),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = Palette.accent)
        }
    } else if (chapter != null) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Palette.canvas)
        ) {
            // Chrome Bar
            ChapterChromeBar(
                title = chromeTitle,
                backTitle = chromeBackTitle,
                onBack = handleBack,
                onMenu = { showMenu = true },
                onBug = { showBugReport = true }
            )

            // Dynamic Body
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                if (openedConversationId != null) {
                    val openedConv = chapter.conversations.firstOrNull { it.id == openedConversationId }
                    if (openedConv != null) {
                        ChatRoomView(
                            session = session,
                            conversation = openedConv
                        )
                    }
                } else if (openedEvent != null) {
                    EventDetailView(
                        event = openedEvent!!,
                        session = session
                    )
                } else if (openedMember != null) {
                    MemberProfileView(
                        member = openedMember!!,
                        onBack = { openedMember = null }
                    )
                } else {
                    when (destination) {
                        ChapterDestination.OVERVIEW -> OverviewView(chapter = chapter, onOpen = pickDestination)
                        ChapterDestination.SETUP -> SetupView(chapter = chapter, onOpen = pickDestination)
                        ChapterDestination.CHAT -> ChatInboxView(chapter = chapter, onSelect = { openedConversationId = it.id })
                        ChapterDestination.ANNOUNCEMENTS -> AnnouncementsView(chapter = chapter, session = session)
                        ChapterDestination.EVENTS -> EventsView(chapter = chapter, session = session, onSelect = { openedEvent = it })
                        ChapterDestination.DIRECTORY -> DirectoryView(chapter = chapter, onSelect = { openedMember = it })
                        ChapterDestination.DUES -> DuesView(chapter = chapter, session = session)
                        ChapterDestination.REIMBURSEMENTS -> ReimbursementsView(chapter = chapter, session = session)
                        ChapterDestination.FINANCES -> FinancesView(chapter = chapter, session = session)
                        ChapterDestination.RECRUITMENT -> RecruitmentView(chapter = chapter, session = session)
                        ChapterDestination.ANALYTICS -> AnalyticsView(chapter = chapter)
                        ChapterDestination.PHILANTHROPY -> PhilanthropyView(chapter = chapter, session = session)
                        ChapterDestination.HOUSING -> HousingView(chapter = chapter, session = session)
                        ChapterDestination.STANDARDS -> StandardsView(chapter = chapter, session = session)
                        ChapterDestination.ACADEMICS -> AcademicsView(chapter = chapter, session = session)
                        ChapterDestination.SETTINGS -> SettingsView(chapter = chapter, session = session, onSelectMember = { openedMember = it })
                    }
                }
            }
        }

        if (showMenu) {
            ChapterMenuModal(
                chapter = chapter,
                destination = destination,
                onDismiss = { showMenu = false },
                onPick = {
                    showMenu = false
                    pickDestination(it)
                },
                onExitChapter = {
                    showMenu = false
                    session.closeChapter()
                }
            )
        }

        if (showBugReport) {
            BugReportModal(
                page = "/c/${chapter.chapter.slug}/${destination.rawValue}",
                session = session,
                onDismiss = { showBugReport = false }
            )
        }
    } else {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Palette.canvas),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GGEmptyState(
                    icon = Icons.Default.Domain,
                    title = "No chapter selected",
                    message = session.lastError
                )
                GGButton(title = "Back to home", kind = GGButtonKind.SECONDARY) {
                    session.closeChapter()
                }
            }
        }
    }
}

@Composable
fun ChapterChromeBar(
    title: String,
    backTitle: String,
    onBack: () -> Unit,
    onMenu: () -> Unit,
    onBug: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(Palette.canvas)
            .padding(start = 12.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onBack,
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = Icons.Default.ChevronLeft,
                contentDescription = "Back",
                tint = Palette.ink,
                modifier = Modifier.size(24.dp)
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        Text(
            text = title,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = Palette.ink,
            maxLines = 1
        )

        Spacer(modifier = Modifier.weight(1f))

        if (onBug != null) {
            IconButton(onClick = onBug, modifier = Modifier.size(40.dp)) {
                Icon(
                    imageVector = Icons.Default.BugReport,
                    contentDescription = "Report a bug",
                    tint = Palette.ink2,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        IconButton(onClick = onMenu, modifier = Modifier.size(44.dp)) {
            Icon(
                imageVector = Icons.Default.Menu,
                contentDescription = "Chapter menu",
                tint = Palette.ink,
                modifier = Modifier.size(22.dp)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChapterMenuModal(
    chapter: ChapterContext,
    destination: ChapterDestination,
    onDismiss: () -> Unit,
    onPick: (ChapterDestination) -> Unit,
    onExitChapter: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = chapter.chapter.organizationName,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.ink
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = "Close",
                    fontSize = 14.sp,
                    color = Palette.ink2,
                    modifier = Modifier.clickable(onClick = onDismiss)
                )
            }

            // Return to Personal Home
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onExitChapter)
                    .padding(vertical = 12.dp, horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Home,
                    contentDescription = null,
                    tint = Palette.ink3,
                    modifier = Modifier.size(20.dp)
                )
                Text(text = "Personal Home", fontSize = 15.sp, color = Palette.ink2)
            }

            ListRowDivider()

            // Navigation Groups
            val groups = remember(chapter) { buildNavGroups(chapter) }

            groups.forEach { group ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (group.label != null) {
                        SectionLabel(
                            text = group.label,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }

                    group.items.forEach { item ->
                        val isSelected = destination == item.id
                        val bg = if (isSelected) Palette.subtle else Color.Transparent
                        val fg = if (isSelected) Palette.ink else Palette.ink2
                        val iconColor = if (isSelected) Palette.accent else Palette.ink3

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(bg)
                                .clickable { onPick(item.id) }
                                .padding(vertical = 10.dp, horizontal = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = iconForDestination(item.id),
                                contentDescription = null,
                                tint = iconColor,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = item.title,
                                fontSize = 15.sp,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = fg,
                                modifier = Modifier.weight(1f)
                            )
                            if (item.badge != null && item.badge > 0) {
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(Palette.accent)
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = if (item.badge > 99) "99+" else "${item.badge}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Palette.onAccent
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun buildNavGroups(chapter: ChapterContext): List<NavGroup> {
    val homeItems = mutableListOf(
        NavItem(id = ChapterDestination.OVERVIEW),
        NavItem(id = ChapterDestination.CHAT, badge = chapter.unreadMessages),
        NavItem(id = ChapterDestination.ANNOUNCEMENTS),
        NavItem(id = ChapterDestination.EVENTS),
        NavItem(id = ChapterDestination.DIRECTORY),
        NavItem(id = ChapterDestination.DUES),
        NavItem(id = ChapterDestination.REIMBURSEMENTS)
    )
    if (chapter.can(Permission.CHAPTER_MANAGE)) {
        homeItems.add(1, NavItem(id = ChapterDestination.SETUP))
    }

    val officer = mutableListOf<NavItem>()
    if (chapter.can(Permission.FINANCE_VIEW)) officer.add(NavItem(id = ChapterDestination.FINANCES))
    if (chapter.chapter.isEnabled(ChapterModule.RECRUITMENT) && (chapter.can(Permission.RECRUITMENT_VIEW) || chapter.can(Permission.RECRUITMENT_MANAGE))) {
        officer.add(NavItem(id = ChapterDestination.RECRUITMENT))
    }
    if (chapter.can(Permission.ANALYTICS_VIEW)) officer.add(NavItem(id = ChapterDestination.ANALYTICS))

    val programs = mutableListOf<NavItem>()
    if (chapter.chapter.isEnabled(ChapterModule.PHILANTHROPY)) programs.add(NavItem(id = ChapterDestination.PHILANTHROPY))
    if (chapter.chapter.isEnabled(ChapterModule.HOUSING) && chapter.membership.memberClass != MemberClass.NEW_MEMBER) {
        programs.add(NavItem(id = ChapterDestination.HOUSING))
    }
    if (chapter.chapter.isEnabled(ChapterModule.STANDARDS)) programs.add(NavItem(id = ChapterDestination.STANDARDS))
    if (chapter.chapter.isEnabled(ChapterModule.ACADEMICS)) programs.add(NavItem(id = ChapterDestination.ACADEMICS))

    val result = mutableListOf(NavGroup(id = "home", label = null, items = homeItems))
    if (officer.isNotEmpty()) result.add(NavGroup(id = "officers", label = "Officers", items = officer))
    if (programs.isNotEmpty()) result.add(NavGroup(id = "programs", label = "Programs", items = programs))
    if (chapter.can(Permission.CHAPTER_MANAGE) || chapter.can(Permission.MEMBERS_MANAGE) || chapter.can(Permission.ROLES_MANAGE)) {
        result.add(NavGroup(id = "settings", label = null, items = listOf(NavItem(id = ChapterDestination.SETTINGS))))
    }
    return result
}

fun iconForDestination(destination: ChapterDestination): ImageVector {
    return when (destination) {
        ChapterDestination.OVERVIEW -> Icons.Default.Dashboard
        ChapterDestination.SETUP -> Icons.Default.Checklist
        ChapterDestination.CHAT -> Icons.Default.ChatBubble
        ChapterDestination.ANNOUNCEMENTS -> Icons.Default.Campaign
        ChapterDestination.EVENTS -> Icons.Default.CalendarMonth
        ChapterDestination.DIRECTORY -> Icons.Default.People
        ChapterDestination.DUES -> Icons.Default.CreditCard
        ChapterDestination.REIMBURSEMENTS -> Icons.Default.ReceiptLong
        ChapterDestination.FINANCES -> Icons.Default.AccountBalance
        ChapterDestination.RECRUITMENT -> Icons.Default.GroupAdd
        ChapterDestination.ANALYTICS -> Icons.Default.BarChart
        ChapterDestination.PHILANTHROPY -> Icons.Default.VolunteerActivism
        ChapterDestination.HOUSING -> Icons.Default.House
        ChapterDestination.STANDARDS -> Icons.Default.Gavel
        ChapterDestination.ACADEMICS -> Icons.Default.School
        ChapterDestination.SETTINGS -> Icons.Default.Settings
    }
}

@Composable
fun OverviewView(chapter: ChapterContext, onOpen: (ChapterDestination) -> Unit) {
    GGScreenStack {
        GGPageHeader(
            title = chapter.chapter.organizationName,
            description = listOfNotNull(chapter.chapter.designation, chapter.chapter.universityName).joinToString(" · "),
            trailing = chapter.chapter.greekLetters
        )

        // 4 Standing Quick Tiles
        StandingTiles(chapter = chapter)

        // Setup Card (for officers)
        val nextStep = chapter.setupSteps.firstOrNull { !it.done }
        if (nextStep != null && chapter.can(Permission.CHAPTER_MANAGE)) {
            val doneCount = chapter.setupSteps.count { it.done }
            val total = maxOf(chapter.setupSteps.size, 1)
            GGCard(padding = 16.dp) {
                Text(text = "Chapter setup", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Palette.ink3)
                Text(text = "Next: ${nextStep.title}", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink, modifier = Modifier.padding(top = 4.dp))
                Text(text = nextStep.detail, fontSize = 13.sp, color = Palette.ink2, modifier = Modifier.padding(top = 4.dp))
                LinearProgressIndicator(
                    progress = { doneCount.toFloat() / total.toFloat() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = Palette.accent,
                    trackColor = Palette.subtle
                )
                GGButton(title = "Continue setup", modifier = Modifier.padding(top = 12.dp)) {
                    onOpen(nextStep.destination)
                }
                Text(
                    text = "See all steps",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = Palette.ink2,
                    modifier = Modifier
                        .clickable { onOpen(ChapterDestination.SETUP) }
                        .padding(top = 8.dp)
                )
            }
        }

        // Upcoming Events Card
        GGCard {
            GGCardHeader(title = "Upcoming events")
            if (chapter.events.isEmpty()) {
                GGEmptyState(icon = Icons.Default.CalendarMonth, title = "No upcoming events", message = "Events your chapter schedules will appear here.")
            } else {
                chapter.events.forEachIndexed { index, event ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(text = event.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            val sub = listOfNotNull(DateFormat.chapter(event.startsAt, event.timezone), event.location).joinToString(" · ")
                            Text(text = sub, fontSize = 13.sp, color = Palette.ink3)
                        }
                        if (event.attendanceRequired) {
                            GGBadge(text = "Required", tone = Tone.GOLD)
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        if (event.rsvp != null) {
                            GGBadge(text = event.rsvp!!.replaceFirstChar { it.uppercase() }, tone = Tone.INFO)
                        }
                    }
                    if (index < chapter.events.size - 1) ListRowDivider()
                }
            }
        }

        // Announcements Card
        GGCard {
            GGCardHeader(title = "Announcements")
            if (chapter.announcements.isEmpty()) {
                GGEmptyState(icon = Icons.Default.Campaign, title = "No announcements yet")
            } else {
                chapter.announcements.forEachIndexed { index, item ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (item.pinned) {
                                Icon(imageVector = Icons.Default.PushPin, contentDescription = "Pinned", tint = Palette.ink3, modifier = Modifier.size(14.dp))
                            }
                            Text(text = item.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            if (item.requiresAck && !item.acknowledged) {
                                GGBadge(text = "Acknowledge", tone = Tone.WARNING)
                            }
                        }
                        Text(text = item.body, fontSize = 13.sp, color = Palette.ink2, maxLines = 2)
                    }
                    if (index < chapter.announcements.size - 1) ListRowDivider()
                }
            }
        }

        // Dues Balance Card
        GGCard(padding = 20.dp) {
            Text(text = "My dues", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Text(text = "Current balance", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.padding(top = 10.dp))
            Text(text = MoneyFormat.cents(chapter.balance.balanceCents), fontSize = 28.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            if (chapter.balance.nextDueDate != null) {
                Text(text = "Next due ${DateFormat.medium(chapter.balance.nextDueDate)}", fontSize = 13.sp, color = Palette.ink2, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun StandingTiles(chapter: ChapterContext) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        val dueText = if (chapter.balance.balanceCents > 0) MoneyFormat.cents(chapter.balance.balanceCents) else "Paid up"
        val dueTone = if (chapter.balance.balanceCents > 0) Tone.WARNING else Tone.POSITIVE
        StandingTile(label = "Dues", value = dueText, tone = dueTone, modifier = Modifier.weight(1f))

        val goingCount = chapter.events.count { it.rsvp == "going" }
        StandingTile(label = "Events", value = "$goingCount going", tone = Tone.INFO, modifier = Modifier.weight(1f))
    }
    Spacer(modifier = Modifier.height(10.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        val policyDue = chapter.policies.count { !it.acknowledged }
        val polTone = if (policyDue > 0) Tone.DANGER else Tone.POSITIVE
        StandingTile(label = "Policies", value = "$policyDue due", tone = polTone, modifier = Modifier.weight(1f))

        val msgText = if (chapter.unreadMessages == 0) "Caught up" else "${chapter.unreadMessages} unread"
        StandingTile(label = "Messages", value = msgText, tone = Tone.ACCENT, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StandingTile(label: String, value: String, tone: Tone, modifier: Modifier = Modifier) {
    GGCard(modifier = modifier, padding = 12.dp) {
        Text(text = label, fontSize = 11.sp, color = Palette.ink3)
        Text(text = value, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = tone.foreground, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
fun SetupView(chapter: ChapterContext, onOpen: (ChapterDestination) -> Unit) {
    val steps = chapter.setupSteps
    val done = steps.count { it.done }
    val next = steps.firstOrNull { !it.done }
    val pct = if (steps.isEmpty()) 0f else done.toFloat() / steps.size.toFloat()

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        GGPageHeader(
            title = "Chapter setup",
            description = next?.let { "$done of ${steps.size} finished. ${it.title} is the next step." }
                ?: "Every setup step is finished. You can still open any of them."
        )

        GGCard(padding = 16.dp) {
            Row {
                Text(text = "Progress", fontSize = 13.sp, color = Palette.ink2)
                Spacer(modifier = Modifier.weight(1f))
                Text(text = "${(pct * 100).toInt()}%", fontSize = 13.sp, color = Palette.ink2)
            }
            LinearProgressIndicator(
                progress = { pct },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = Palette.accent,
                trackColor = Palette.subtle
            )
            if (next != null) {
                GGButton(title = next.actionTitle, fillWidth = true, modifier = Modifier.padding(top = 12.dp)) {
                    onOpen(next.destination)
                }
            }
        }

        steps.forEachIndexed { index, step ->
            val shape = RoundedCornerShape(8.dp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(Palette.surface)
                    .border(1.dp, Palette.line, shape)
                    .padding(16.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Circle Number / Checkmark
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(if (step.done) Palette.accent else Palette.subtle),
                    contentAlignment = Alignment.Center
                ) {
                    if (step.done) {
                        Icon(imageVector = Icons.Default.Check, contentDescription = "Done", tint = Palette.onAccent, modifier = Modifier.size(16.dp))
                    } else {
                        Text(text = "${index + 1}", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Palette.ink2)
                    }
                }

                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(text = step.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                        if (step.done && !step.skipped) GGBadge(text = "Done", tone = Tone.POSITIVE)
                        if (step.skipped) GGBadge(text = "Skipped", tone = Tone.NEUTRAL)
                        if (step.optional && !step.done) GGBadge(text = "Optional", tone = Tone.NEUTRAL)
                    }
                    Text(text = step.detail, fontSize = 13.sp, color = Palette.ink2)
                    GGButton(title = step.actionTitle, kind = GGButtonKind.SECONDARY, size = GGButtonSize.SM, modifier = Modifier.padding(top = 4.dp)) {
                        onOpen(step.destination)
                    }
                }
            }
        }
    }
}
