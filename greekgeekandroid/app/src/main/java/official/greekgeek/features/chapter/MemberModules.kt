package official.greekgeek.features.chapter

import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import official.greekgeek.design.*
import official.greekgeek.models.*
import official.greekgeek.services.AppConfig
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone
import java.util.Calendar
import java.util.Date

// ==========================================
// ANNOUNCEMENTS
// ==========================================
@Composable
fun AnnouncementsView(chapter: ChapterContext, session: AppSession) {
    var showComposer by remember { mutableStateOf(false) }

    GGScreenStack {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                GGPageHeader(
                    title = "Announcements",
                    description = "Official messages and chapter updates."
                )
            }
            if (chapter.can(Permission.ANNOUNCEMENTS_PUBLISH)) {
                GGButton(
                    title = "New post",
                    icon = Icons.Default.Add,
                    size = GGButtonSize.SM
                ) {
                    showComposer = true
                }
            }
        }

        if (chapter.announcements.isEmpty()) {
            GGEmptyState(
                icon = Icons.Default.Campaign,
                title = "No announcements",
                message = "When officers publish announcements, they'll appear here."
            )
        } else {
            chapter.announcements.forEach { ann ->
                GGCard(padding = 18.dp) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (ann.pinned) {
                            Icon(
                                imageVector = Icons.Default.PushPin,
                                contentDescription = "Pinned",
                                tint = Palette.accent,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Text(
                            text = ann.title,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Palette.ink,
                            modifier = Modifier.weight(1f)
                        )
                        GGBadge(text = ann.audience, tone = Tone.NEUTRAL)
                    }

                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "${ann.author} · ${DateFormat.relative(ann.publishedAt)}",
                        fontSize = 12.sp,
                        color = Palette.ink3
                    )

                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = ann.body,
                        fontSize = 14.sp,
                        color = Palette.ink2,
                        lineHeight = 20.sp
                    )

                    if (ann.requiresAck) {
                        Spacer(modifier = Modifier.height(14.dp))
                        if (ann.acknowledged) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Palette.positive,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Acknowledged",
                                    fontSize = 13.sp,
                                    color = Palette.positive,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        } else {
                            GGButton(
                                title = "Acknowledge post",
                                kind = GGButtonKind.SECONDARY,
                                size = GGButtonSize.SM
                            ) {
                                session.acknowledgeAnnouncement(ann.id)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showComposer) {
        AnnouncementComposerModal(
            onDismiss = { showComposer = false },
            onSubmit = { title, body, pinned, reqAck, audience ->
                session.addAnnouncement(title, body, pinned, reqAck, audience)
                showComposer = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnnouncementComposerModal(
    onDismiss: () -> Unit,
    onSubmit: (String, String, Boolean, Boolean, String) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var pinned by remember { mutableStateOf(false) }
    var requiresAck by remember { mutableStateOf(false) }
    var audience by remember { mutableStateOf("All members") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(
                title = "New announcement",
                description = "Broadcast important news to your chapter."
            )

            GGField(label = "Title") {
                GGTextField(
                    value = title,
                    onValueChange = { title = it },
                    placeholder = "e.g. Chapter meeting moved"
                )
            }

            GGField(label = "Audience") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("All members", "Actives only", "Officers only").forEach { aud ->
                        val isSelected = audience == aud
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (isSelected) Palette.accentSoft else Palette.subtle)
                                .border(1.dp, if (isSelected) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                                .clickable { audience = aud }
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = aud,
                                fontSize = 13.sp,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) Palette.accent else Palette.ink2
                            )
                        }
                    }
                }
            }

            GGField(label = "Message") {
                GGTextArea(
                    value = body,
                    onValueChange = { body = it },
                    placeholder = "Write details here...",
                    minHeight = 120.dp
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = pinned,
                    onCheckedChange = { pinned = it },
                    colors = CheckboxDefaults.colors(checkedColor = Palette.accent)
                )
                Text(text = "Pin to top of feed", fontSize = 14.sp, color = Palette.ink)
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = requiresAck,
                    onCheckedChange = { requiresAck = it },
                    colors = CheckboxDefaults.colors(checkedColor = Palette.accent)
                )
                Text(text = "Require member acknowledgment", fontSize = 14.sp, color = Palette.ink)
            }

            GGButton(
                title = "Publish announcement",
                fillWidth = true,
                enabled = title.isNotBlank() && body.isNotBlank()
            ) {
                onSubmit(title, body, pinned, requiresAck, audience)
            }
        }
    }
}

// ==========================================
// EVENTS & CHECK-IN
// ==========================================
@Composable
fun EventsView(
    chapter: ChapterContext,
    session: AppSession,
    onSelect: (ChapterEvent) -> Unit
) {
    var showComposer by remember { mutableStateOf(false) }
    var showCheckIn by remember { mutableStateOf(false) }

    GGScreenStack {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                GGPageHeader(
                    title = "Events",
                    description = "Calendar, required chapter attendance, and RSVPs."
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GGButton(
                    title = "Check in",
                    icon = Icons.Default.QrCodeScanner,
                    kind = GGButtonKind.SECONDARY,
                    size = GGButtonSize.SM
                ) {
                    showCheckIn = true
                }
                if (chapter.can(Permission.EVENTS_MANAGE)) {
                    GGButton(
                        title = "New event",
                        icon = Icons.Default.Add,
                        size = GGButtonSize.SM
                    ) {
                        showComposer = true
                    }
                }
            }
        }

        if (chapter.events.isEmpty()) {
            GGEmptyState(
                icon = Icons.Default.CalendarMonth,
                title = "No events scheduled",
                message = "Upcoming events and meetings will appear here."
            )
        } else {
            chapter.events.forEach { event ->
                GGCard(
                    padding = 16.dp,
                    modifier = Modifier.clickable { onSelect(event) }
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // Date badge
                        val shape = RoundedCornerShape(8.dp)
                        Column(
                            modifier = Modifier
                                .width(50.dp)
                                .clip(shape)
                                .border(1.dp, Palette.line, shape)
                                .padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = DateFormat.month(event.startsAt, event.timezone).uppercase(),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.accent
                            )
                            Text(
                                text = DateFormat.day(event.startsAt, event.timezone),
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Palette.ink
                            )
                        }

                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = event.title,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Palette.ink,
                                    modifier = Modifier.weight(1f)
                                )
                                if (event.attendanceRequired) {
                                    GGBadge(text = "Required", tone = Tone.GOLD)
                                }
                            }
                            val sub = listOfNotNull(DateFormat.weekdayTime(event.startsAt, event.timezone), event.location).joinToString(" · ")
                            Text(text = sub, fontSize = 13.sp, color = Palette.ink3)

                            if (event.details != null) {
                                Text(
                                    text = event.details,
                                    fontSize = 13.sp,
                                    color = Palette.ink2,
                                    maxLines = 2,
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                            }

                            // RSVP Options
                            Row(
                                modifier = Modifier.padding(top = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                listOf("going", "maybe", "can't go").forEach { rsvpOption ->
                                    val isSelected = event.rsvp == rsvpOption
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(if (isSelected) Palette.accentSoft else Palette.subtle)
                                            .border(1.dp, if (isSelected) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                                            .clickable { session.rsvpEvent(event.id, rsvpOption) }
                                            .padding(horizontal = 10.dp, vertical = 6.dp)
                                    ) {
                                        Text(
                                            text = rsvpOption.replaceFirstChar { it.uppercase() },
                                            fontSize = 12.sp,
                                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                            color = if (isSelected) Palette.accent else Palette.ink2
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

    if (showComposer) {
        EventComposerModal(
            onDismiss = { showComposer = false },
            onSubmit = { title, startsAt, endsAt, location, req, details ->
                session.addEvent(title, startsAt, endsAt, location, req, details)
                showComposer = false
            }
        )
    }

    if (showCheckIn) {
        CheckInModal(onDismiss = { showCheckIn = false })
    }
}

@Composable
fun EventDetailView(event: ChapterEvent, session: AppSession) {
    var showCheckIn by remember { mutableStateOf(false) }

    GGScreenStack {
        GGPageHeader(
            title = event.title,
            description = listOfNotNull(DateFormat.chapter(event.startsAt, event.timezone), event.location).joinToString(" · ")
        )

        GGCard(padding = 20.dp) {
            Text(text = "Attendance status", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("going", "maybe", "can't go").forEach { rsvpOption ->
                    val isSelected = event.rsvp == rsvpOption
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isSelected) Palette.accentSoft else Palette.subtle)
                            .border(1.dp, if (isSelected) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                            .clickable { session.rsvpEvent(event.id, rsvpOption) }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = rsvpOption.replaceFirstChar { it.uppercase() },
                            fontSize = 13.sp,
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (isSelected) Palette.accent else Palette.ink2
                        )
                    }
                }
            }
        }

        if (event.details != null) {
            GGCard(padding = 20.dp) {
                Text(text = "Details", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = event.details, fontSize = 14.sp, color = Palette.ink2, lineHeight = 20.sp)
            }
        }

        GGButton(
            title = "Open Check-In Code",
            icon = Icons.Default.QrCodeScanner,
            fillWidth = true
        ) {
            showCheckIn = true
        }
    }

    if (showCheckIn) {
        CheckInModal(onDismiss = { showCheckIn = false })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckInModal(onDismiss: () -> Unit) {
    var countdown by remember { mutableIntStateOf(30) }
    var codeSeed by remember { mutableStateOf("GG-CHK-8924") }

    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            if (countdown > 1) {
                countdown -= 1
            } else {
                countdown = 30
                codeSeed = "GG-CHK-${(1000..9999).random()}"
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Event Check-In",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
            Text(
                text = "Show this rotating code at the door or scan the officer's QR code.",
                fontSize = 13.sp,
                color = Palette.ink3,
                textAlign = TextAlign.Center
            )

            // Simulated Rotating QR Code Frame
            Box(
                modifier = Modifier
                    .size(200.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Palette.canvas)
                    .border(2.dp, Palette.accent, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.QrCode,
                        contentDescription = "QR Code",
                        tint = Palette.ink,
                        modifier = Modifier.size(110.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = codeSeed,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Palette.accent
                    )
                }
            }

            Text(
                text = "Refreshes in ${countdown}s (anti-screenshot)",
                fontSize = 12.sp,
                color = Palette.ink3
            )

            GGButton(title = "Done", fillWidth = true) { onDismiss() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventComposerModal(
    onDismiss: () -> Unit,
    onSubmit: (String, Date, Date, String, Boolean, String) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var required by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(title = "New event", description = "Schedule a meeting, philanthropy shift, or social event.")

            GGField(label = "Title") {
                GGTextField(value = title, onValueChange = { title = it }, placeholder = "e.g. Chapter meeting")
            }

            GGField(label = "Location") {
                GGTextField(value = location, onValueChange = { location = it }, placeholder = "e.g. Chapter Great Room")
            }

            GGField(label = "Details") {
                GGTextArea(value = details, onValueChange = { details = it }, placeholder = "Agenda, dress code, RSVP rules...")
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = required,
                    onCheckedChange = { required = it },
                    colors = CheckboxDefaults.colors(checkedColor = Palette.accent)
                )
                Text(text = "Attendance required for members", fontSize = 14.sp, color = Palette.ink)
            }

            val now = remember { Date() }
            val cal = Calendar.getInstance()
            cal.add(Calendar.DAY_OF_YEAR, 3)
            val startsAt = cal.time
            val endsAt = Date(startsAt.time + 7200 * 1000)

            GGButton(
                title = "Create event",
                fillWidth = true,
                enabled = title.isNotBlank()
            ) {
                onSubmit(title, startsAt, endsAt, location, required, details)
            }
        }
    }
}

// ==========================================
// DIRECTORY & MEMBER PROFILES
// ==========================================
@Composable
fun DirectoryView(chapter: ChapterContext, onSelect: (DirectoryMember) -> Unit) {
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("All") }

    val filtered = remember(chapter.members, query, filter) {
        chapter.members.filter { m ->
            val matchQuery = query.isBlank() || m.name.contains(query, ignoreCase = true) || m.roles.any { it.contains(query, ignoreCase = true) }
            val matchFilter = when (filter) {
                "Actives" -> m.memberClass == MemberClass.ACTIVE
                "Pledges" -> m.memberClass == MemberClass.NEW_MEMBER
                "In-house" -> m.house != null
                "Out-of-house" -> m.house == null
                else -> true
            }
            matchQuery && matchFilter
        }
    }

    GGScreenStack {
        GGPageHeader(
            title = "Directory",
            description = "${chapter.members.size} chapter members."
        )

        GGTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = "Search members or roles..."
        )

        // Filter Pills
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("All", "Actives", "Pledges", "In-house", "Out-of-house").forEach { pill ->
                val isSelected = filter == pill
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSelected) Palette.accentSoft else Palette.subtle)
                        .border(1.dp, if (isSelected) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                        .clickable { filter = pill }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = pill,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSelected) Palette.accent else Palette.ink2
                    )
                }
            }
        }

        GGCard {
            filtered.forEachIndexed { index, member ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(member) }
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    PersonAvatar(name = member.name, path = member.avatarPath, size = 40.dp)
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(text = member.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            if (member.memberClass == MemberClass.NEW_MEMBER) {
                                GGBadge(text = "Pledge", tone = Tone.INFO)
                            }
                        }
                        val roleText = if (member.roles.isNotEmpty()) member.roles.joinToString(", ") else member.memberClass.label
                        Text(text = roleText, fontSize = 13.sp, color = Palette.ink3)
                    }

                    if (member.house != null) {
                        GGBadge(text = "In-house", tone = Tone.POSITIVE)
                    }

                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint = Palette.ink3,
                        modifier = Modifier.size(16.dp)
                    )
                }
                if (index < filtered.size - 1) ListRowDivider()
            }
        }
    }
}

@Composable
fun MemberProfileView(member: DirectoryMember, onBack: () -> Unit) {
    GGScreenStack {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            PersonAvatar(name = member.name, path = member.avatarPath, size = 64.dp)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = member.name, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Text(text = member.email, fontSize = 13.sp, color = Palette.ink3)
                if (member.roles.isNotEmpty()) {
                    Text(text = member.roles.joinToString(" · "), fontSize = 13.sp, color = Palette.accent)
                }
            }
        }

        GGCard(padding = 18.dp) {
            Text(text = "Membership Details", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(12.dp))
            ProfileFieldRow("Status", member.status.label)
            ProfileFieldRow("Class", member.memberClass.label)
            ProfileFieldRow("Graduation Year", member.graduationYear?.toString() ?: "Not set")
            ProfileFieldRow("Housing", member.house ?: "Out-of-house")
        }

        GGButton(title = "Close profile", kind = GGButtonKind.SECONDARY, fillWidth = true) {
            onBack()
        }
    }
}

@Composable
private fun ProfileFieldRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Text(text = label, fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.weight(1f))
        Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
    }
}

// ==========================================
// DUES & REIMBURSEMENTS
// ==========================================
@Composable
fun DuesView(chapter: ChapterContext, session: AppSession) {
    val context = LocalContext.current
    val openCharges = chapter.charges.filter { it.outstandingCents > 0 }

    GGScreenStack {
        GGPageHeader(
            title = "My dues",
            description = "Your balance with ${chapter.chapter.organizationName}. You pay exactly what you owe; no fees are added."
        )

        GGDesktopHint()

        // Balance & Clearing metrics
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(modifier = Modifier.weight(1f)) {
                GGCard(padding = 12.dp) {
                    Text(text = "Balance", fontSize = 12.sp, color = Palette.ink3)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = MoneyFormat.cents(chapter.balance.balanceCents),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Palette.ink
                    )
                }
            }
            Box(modifier = Modifier.weight(1f)) {
                GGCard(padding = 12.dp) {
                    Text(text = "Clearing", fontSize = 12.sp, color = Palette.ink3)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = MoneyFormat.cents(chapter.balance.processingCents),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Palette.ink
                    )
                }
            }
        }

        // Next due card
        GGCard(padding = 16.dp) {
            Text(text = "Next due", fontSize = 12.sp, color = Palette.ink3)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = chapter.balance.nextDueDate?.let { DateFormat.medium(it) } ?: "Nothing due",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
        }

        // Warning if chapter cannot collect online yet
        if (!chapter.canCollect && openCharges.isNotEmpty()) {
            GGNotice(
                tone = Tone.INFO,
                message = "Your chapter is not accepting online payments yet. Pay your treasurer directly; they will record it here."
            )
        }

        // Open charges
        GGCard {
            GGCardHeader(title = "Open charges")
            if (openCharges.isEmpty()) {
                GGEmptyState(
                    icon = Icons.Default.CreditCard,
                    title = "You are all paid up",
                    message = "New charges from your treasurer will appear here."
                )
            } else {
                openCharges.forEachIndexed { index, charge ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = charge.title,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = MoneyFormat.cents(charge.outstandingCents),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Palette.ink
                            )
                        }

                        Text(
                            text = "${charge.category} · Due ${DateFormat.medium(charge.dueDate)}",
                            fontSize = 13.sp,
                            color = Palette.ink3
                        )

                        if (charge.allowInstallments) {
                            Text(
                                text = "Installments available, up to ${charge.maxInstallments}",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }

                        // Pay online button linking out to the website via Stripe checkout
                        Button(
                            onClick = {
                                val url = AppConfig.chapterWebURL(chapter.chapter.slug, "/dues")
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                context.startActivity(intent)
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Palette.accent,
                                contentColor = Palette.onAccent
                            ),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = "Pay online",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                    if (index < openCharges.size - 1) ListRowDivider()
                }
            }
        }

        // Payment History
        GGCard {
            GGCardHeader(title = "Payment history")
            if (chapter.payments.isEmpty()) {
                GGEmptyState(icon = Icons.Default.Receipt, title = "No payments yet")
            } else {
                chapter.payments.forEachIndexed { index, pay ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = pay.title,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink
                            )
                            Text(
                                text = "${pay.method} · ${DateFormat.medium(pay.createdAt)}",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = MoneyFormat.cents(pay.amountCents),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink
                            )
                            GGBadge(text = pay.status.label, tone = pay.status.tone)
                        }
                    }
                    if (index < chapter.payments.size - 1) ListRowDivider()
                }
            }
        }
    }
}

@Composable
fun ReimbursementsView(chapter: ChapterContext, session: AppSession) {
    var showRequestModal by remember { mutableStateOf(false) }

    GGScreenStack {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                GGPageHeader(
                    title = "Reimbursements",
                    description = "Request repayment for chapter expenses."
                )
            }
            GGButton(
                title = "Request",
                icon = Icons.Default.Add,
                size = GGButtonSize.SM
            ) {
                showRequestModal = true
            }
        }

        GGCard {
            GGCardHeader(title = "Submitted requests")
            if (chapter.reimbursements.isEmpty()) {
                GGEmptyState(icon = Icons.Default.ReceiptLong, title = "No reimbursement requests")
            } else {
                chapter.reimbursements.forEachIndexed { index, item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(text = item.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(
                                text = "Requested by ${item.requester} · ${DateFormat.medium(item.submittedAt)}",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = MoneyFormat.cents(item.amountCents),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Palette.ink
                            )
                            val tone = when (item.status) {
                                "Approved", "Paid" -> Tone.POSITIVE
                                "Rejected" -> Tone.DANGER
                                else -> Tone.WARNING
                            }
                            GGBadge(text = item.status, tone = tone)
                        }
                    }
                    if (index < chapter.reimbursements.size - 1) ListRowDivider()
                }
            }
        }
    }

    if (showRequestModal) {
        ReimbursementRequestModal(
            onDismiss = { showRequestModal = false },
            onSubmit = { title, amountCents ->
                session.submitReimbursement(title, amountCents)
                showRequestModal = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReimbursementRequestModal(
    onDismiss: () -> Unit,
    onSubmit: (String, Int) -> Unit
) {
    var title by remember { mutableStateOf("") }
    var amountString by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(title = "Request reimbursement", description = "Submit expense details for treasurer approval.")

            GGField(label = "What was purchased?") {
                GGTextField(value = title, onValueChange = { title = it }, placeholder = "e.g. Costco cups and napkins for BBQ")
            }

            GGField(label = "Amount ($)") {
                GGTextField(value = amountString, onValueChange = { amountString = it }, placeholder = "45.00")
            }

            val cents = MoneyFormat.dollarsToCents(amountString)

            GGButton(
                title = "Submit for approval",
                fillWidth = true,
                enabled = title.isNotBlank() && cents != null && cents > 0
            ) {
                if (cents != null) onSubmit(title, cents)
            }
        }
    }
}
