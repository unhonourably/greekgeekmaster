package official.greekgeek.features.chapter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.models.*
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone
import java.util.Date

// ==========================================
// PHILANTHROPY
// ==========================================
@Composable
fun PhilanthropyView(chapter: ChapterContext, session: AppSession) {
    var showLogModal by remember { mutableStateOf(false) }

    val totalHours = remember(chapter.serviceHours) {
        chapter.serviceHours.filter { it.status == "Approved" }.sumOf { it.hours }
    }

    GGScreenStack {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                GGPageHeader(
                    title = "Philanthropy",
                    description = "Service hours, community service shifts, and charity drives."
                )
            }
            GGButton(
                title = "Log hours",
                icon = Icons.Default.Add,
                size = GGButtonSize.SM
            ) {
                showLogModal = true
            }
        }

        GGCard(padding = 20.dp) {
            Text(text = "Total approved hours", fontSize = 13.sp, color = Palette.ink3)
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = "$totalHours hrs", fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Palette.gold)
            Text(text = "Chapter goal: 500 hours this academic year", fontSize = 13.sp, color = Palette.ink2, modifier = Modifier.padding(top = 4.dp))
        }

        GGCard {
            GGCardHeader(title = "Service hours log")
            if (chapter.serviceHours.isEmpty()) {
                GGEmptyState(icon = Icons.Default.VolunteerActivism, title = "No service hours logged")
            } else {
                chapter.serviceHours.forEachIndexed { index, hour ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(text = "${hour.hours} hours · ${hour.event}", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = "${hour.member} · ${DateFormat.medium(hour.date)}", fontSize = 12.sp, color = Palette.ink3)
                        }
                        GGBadge(text = hour.status, tone = if (hour.status == "Approved") Tone.POSITIVE else Tone.WARNING)
                    }
                    if (index < chapter.serviceHours.size - 1) ListRowDivider()
                }
            }
        }
    }

    if (showLogModal) {
        LogServiceHoursModal(
            onDismiss = { showLogModal = false },
            onSubmit = { hours, event ->
                session.logServiceHours(hours, event)
                showLogModal = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogServiceHoursModal(
    onDismiss: () -> Unit,
    onSubmit: (Int, String) -> Unit
) {
    var event by remember { mutableStateOf("") }
    var hoursString by remember { mutableStateOf("") }

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
            GGPageHeader(title = "Log service hours", description = "Submit volunteer hours for philanthropy chair verification.")

            GGField(label = "Event or organization") {
                GGTextField(value = event, onValueChange = { event = it }, placeholder = "e.g. Community Food Bank")
            }

            GGField(label = "Number of hours") {
                GGTextField(value = hoursString, onValueChange = { hoursString = it }, placeholder = "3")
            }

            val hours = hoursString.toIntOrNull()

            GGButton(
                title = "Submit for approval",
                fillWidth = true,
                enabled = event.isNotBlank() && hours != null && hours > 0
            ) {
                if (hours != null) onSubmit(hours, event)
            }
        }
    }
}

// ==========================================
// HOUSING
// ==========================================
@Composable
fun HousingView(chapter: ChapterContext, session: AppSession) {
    val live = session.selectedChapter ?: chapter
    val manager = live.can(Permission.HOUSING_MANAGE)

    var term by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var wantsSingle by remember { mutableStateOf(false) }
    val selectedRooms = remember { mutableStateListOf<String>() }

    var issue by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf("normal") }

    var roomName by remember { mutableStateOf("") }
    var roomFloor by remember { mutableStateOf("") }
    var roomCapacity by remember { mutableStateOf("2") }
    var roomRent by remember { mutableStateOf("") }

    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val filled = remember(live.rooms) { live.rooms.sumOf { it.occupied } }
    val capacity = remember(live.rooms) { live.rooms.sumOf { it.capacity } }

    GGScreenStack {
        GGPageHeader(
            title = "Housing",
            description = "Request a room, report maintenance, and keep chores current. House managers assign rooms and respond to requests."
        )

        if (message != null) {
            GGNotice(tone = Tone.POSITIVE, message = message!!)
        }

        // Occupancy Card
        GGCard(padding = 16.dp) {
            Text(text = "Occupancy", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Text(
                text = if (capacity == 0) "No rooms have been added yet." else "$filled of $capacity beds filled.",
                fontSize = 13.sp,
                color = Palette.ink2,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        // Room Selection List
        if (live.rooms.isNotEmpty()) {
            GGCard {
                GGCardHeader(title = "Rooms", description = "Tap up to 3 preferences for room requests.")
                live.rooms.forEachIndexed { index, room ->
                    val isSelected = selectedRooms.contains(room.id)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                if (isSelected) selectedRooms.remove(room.id)
                                else if (selectedRooms.size < 3) selectedRooms.add(room.id)
                            }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = room.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            val details = listOfNotNull(room.floor, "${room.occupied}/${room.capacity} beds", room.rentCents?.let { MoneyFormat.cents(it) }).joinToString(" · ")
                            Text(text = details, fontSize = 12.sp, color = Palette.ink3)
                        }
                        if (isSelected) {
                            Icon(imageVector = Icons.Default.CheckCircle, contentDescription = "Selected", tint = Palette.accent, modifier = Modifier.size(20.dp))
                        }
                    }
                    if (index < live.rooms.size - 1) ListRowDivider()
                }
            }
        }

        // Request a Room Card
        GGCard(padding = 16.dp) {
            Text(text = "Request a room", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            GGField(label = "Academic term") {
                GGTextField(value = term, onValueChange = { term = it }, placeholder = "Fall 2026")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "Request single occupancy", fontSize = 14.sp, color = Palette.ink, modifier = Modifier.weight(1f))
                Switch(
                    checked = wantsSingle,
                    onCheckedChange = { wantsSingle = it },
                    colors = SwitchDefaults.colors(checkedThumbColor = Palette.accent, checkedTrackColor = Palette.accentSoft)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Notes / Roommate preferences") {
                GGTextArea(value = notes, onValueChange = { notes = it }, placeholder = "Preferred roommates or quiet floor...", minHeight = 70.dp)
            }
            Spacer(modifier = Modifier.height(10.dp))
            GGButton(
                title = "Submit housing request",
                fillWidth = true,
                busy = busy,
                enabled = term.isNotBlank()
            ) {
                busy = true
                session.submitHousingRequest(term, selectedRooms.toList(), wantsSingle, notes.ifEmpty { null }) { err ->
                    busy = false
                    if (err == null) {
                        message = "Housing request submitted."
                        term = ""
                        notes = ""
                        selectedRooms.clear()
                    }
                }
            }
        }

        // Manage Rooms Card (House Manager only)
        if (manager) {
            GGCard(padding = 16.dp) {
                Text(text = "Add a room", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Room name or number") {
                    GGTextField(value = roomName, onValueChange = { roomName = it }, placeholder = "Room 204")
                }
                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Floor") {
                    GGTextField(value = roomFloor, onValueChange = { roomFloor = it }, placeholder = "Second floor")
                }
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(modifier = Modifier.weight(1f)) {
                        GGField(label = "Capacity") {
                            GGTextField(value = roomCapacity, onValueChange = { roomCapacity = it }, placeholder = "2")
                        }
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        GGField(label = "Rent ($)") {
                            GGTextField(value = roomRent, onValueChange = { roomRent = it }, placeholder = "750.00")
                        }
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
                GGButton(
                    title = "Save room",
                    fillWidth = true,
                    busy = busy,
                    enabled = roomName.isNotBlank()
                ) {
                    busy = true
                    val cap = roomCapacity.toIntOrNull() ?: 1
                    val rent = MoneyFormat.dollarsToCents(roomRent)
                    session.saveHousingRoom(roomName, roomFloor.ifEmpty { null }, cap, rent) { err ->
                        busy = false
                        if (err == null) {
                            message = "Room saved."
                            roomName = ""
                            roomFloor = ""
                            roomRent = ""
                        }
                    }
                }
            }
        }

        // Housing Requests List
        if (live.housingRequests.isNotEmpty()) {
            GGCard {
                GGCardHeader(title = "Housing requests")
                live.housingRequests.forEachIndexed { index, req ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(text = "${req.memberName} · ${req.term}", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = if (req.wantsSingle) "Single room requested" else "Standard occupancy", fontSize = 12.sp, color = Palette.ink3)
                        }
                        GGBadge(text = req.status.replaceFirstChar { it.uppercase() }, tone = if (req.status == "approved") Tone.POSITIVE else Tone.NEUTRAL)
                    }
                    if (index < live.housingRequests.size - 1) ListRowDivider()
                }
            }
        }

        // Maintenance Card
        GGCard(padding = 16.dp) {
            Text(text = "Report maintenance", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Issue") {
                GGTextField(value = issue, onValueChange = { issue = it }, placeholder = "Leaking shower head")
            }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Location") {
                GGTextField(value = location, onValueChange = { location = it }, placeholder = "2nd floor bathroom")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "PRIORITY", fontSize = 11.sp, color = Palette.ink3, letterSpacing = 0.6.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                listOf("low" to "Low", "normal" to "Normal", "urgent" to "Urgent").forEach { (tag, label) ->
                    val isSel = priority == tag
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSel) Palette.accentSoft else Palette.subtle)
                            .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(8.dp))
                            .clickable { priority = tag }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = label, fontSize = 12.sp, color = if (isSel) Palette.accent else Palette.ink2)
                    }
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            GGButton(
                title = "Submit maintenance ticket",
                fillWidth = true,
                busy = busy,
                enabled = issue.isNotBlank()
            ) {
                busy = true
                session.submitMaintenance(issue, location.ifEmpty { null }, null, priority) { err ->
                    busy = false
                    if (err == null) {
                        message = "Maintenance ticket reported."
                        issue = ""
                        location = ""
                    }
                }
            }
        }

        // Maintenance Tickets List
        if (live.maintenanceRequests.isNotEmpty()) {
            GGCard {
                GGCardHeader(title = "Open maintenance")
                live.maintenanceRequests.forEachIndexed { index, mReq ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(text = mReq.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = mReq.location ?: "House", fontSize = 12.sp, color = Palette.ink3)
                        }
                        GGBadge(text = mReq.status.replaceFirstChar { it.uppercase() }, tone = if (mReq.status == "completed") Tone.POSITIVE else Tone.WARNING)
                    }
                    if (index < live.maintenanceRequests.size - 1) ListRowDivider()
                }
            }
        }

        // Chores Checklist Card
        GGCard {
            GGCardHeader(title = "Chore rotations")
            if (live.chores.isEmpty()) {
                GGEmptyState(icon = Icons.Default.CleaningServices, title = "No chores assigned")
            } else {
                live.chores.forEachIndexed { index, chore ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { session.toggleChore(chore.id) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = chore.done,
                            onCheckedChange = { session.toggleChore(chore.id) },
                            colors = CheckboxDefaults.colors(checkedColor = Palette.accent)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = chore.title,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (chore.done) Palette.ink3 else Palette.ink
                            )
                            Text(
                                text = "${chore.assignee} · Due ${chore.due}",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }
                        if (chore.done) {
                            GGBadge(text = "Done", tone = Tone.POSITIVE)
                        }
                    }
                    if (index < live.chores.size - 1) ListRowDivider()
                }
            }
        }
    }
}

// ==========================================
// STANDARDS
// ==========================================
@Composable
fun StandardsView(chapter: ChapterContext, session: AppSession) {
    val live = session.selectedChapter ?: chapter
    val manager = live.can(Permission.STANDARDS_MANAGE) || live.can(Permission.CHAPTER_MANAGE)

    var title by remember { mutableStateOf("") }
    var bodyText by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("general") }
    var requiresAck by remember { mutableStateOf(true) }

    var incidentCategory by remember { mutableStateOf("other") }
    var incidentText by remember { mutableStateOf("") }

    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    GGScreenStack {
        GGPageHeader(
            title = "Standards",
            description = "Policies, acknowledgments, and confidential incident reports."
        )

        GGNotice(
            tone = Tone.WARNING,
            title = "Emergencies and Title IX",
            message = "Use campus Title IX and national reporting channels. Call 911 in an emergency. GreekGeek is not a substitute for those obligations."
        )

        if (message != null) {
            GGNotice(tone = Tone.POSITIVE, message = message!!)
        }

        // Publish a Policy (Officers / President)
        if (manager) {
            GGCard(padding = 16.dp) {
                Text(text = "Publish a policy", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Title") {
                    GGTextField(value = title, onValueChange = { title = it }, placeholder = "Risk Management Policy")
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "CATEGORY", fontSize = 11.sp, color = Palette.ink3, letterSpacing = 0.6.sp)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    listOf("general", "risk", "bylaws", "housing", "finance", "standards").chunked(3).forEach { chunk ->
                        // Layout in 2 rows
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                    listOf("general" to "General", "risk" to "Risk", "bylaws" to "Bylaws").forEach { (tag, label) ->
                        val isSel = category == tag
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSel) Palette.accentSoft else Palette.subtle)
                                .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(8.dp))
                            .clickable { category = tag }
                            .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = label, fontSize = 12.sp, color = if (isSel) Palette.accent else Palette.ink2)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                    listOf("housing" to "Housing", "finance" to "Finance", "standards" to "Standards").forEach { (tag, label) ->
                        val isSel = category == tag
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSel) Palette.accentSoft else Palette.subtle)
                                .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(8.dp))
                            .clickable { category = tag }
                            .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = label, fontSize = 12.sp, color = if (isSel) Palette.accent else Palette.ink2)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Requires acknowledgment", fontSize = 14.sp, color = Palette.ink, modifier = Modifier.weight(1f))
                    Switch(
                        checked = requiresAck,
                        onCheckedChange = { requiresAck = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = Palette.accent, checkedTrackColor = Palette.accentSoft)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Policy text") {
                    GGTextArea(value = bodyText, onValueChange = { bodyText = it }, placeholder = "Write policy bylaws and rules...", minHeight = 120.dp)
                }

                Spacer(modifier = Modifier.height(12.dp))
                GGButton(
                    title = "Publish policy",
                    fillWidth = true,
                    busy = busy,
                    enabled = title.isNotBlank() && bodyText.isNotBlank()
                ) {
                    busy = true
                    session.createPolicy(title, category, bodyText, requiresAck) { err ->
                        busy = false
                        if (err == null) {
                            message = "Policy published."
                            title = ""
                            bodyText = ""
                        }
                    }
                }
            }
        }

        // Policies List
        GGCard {
            GGCardHeader(title = "Chapter policies and bylaws")
            if (live.policies.isEmpty()) {
                GGEmptyState(icon = Icons.Default.Gavel, title = "No policies published")
            } else {
                live.policies.forEachIndexed { index, policy ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(text = policy.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = "Version ${policy.version} · ${policy.category.replaceFirstChar { it.uppercase() }}", fontSize = 12.sp, color = Palette.ink3)
                        }

                        if (policy.acknowledged) {
                            GGBadge(text = "Acknowledged", tone = Tone.POSITIVE)
                        } else {
                            GGButton(
                                title = "Acknowledge",
                                kind = GGButtonKind.SECONDARY,
                                size = GGButtonSize.SM
                            ) {
                                session.acknowledgePolicy(policy.id)
                            }
                        }
                    }
                    if (index < live.policies.size - 1) ListRowDivider()
                }
            }
        }

        // Confidential Report Card
        GGCard(padding = 16.dp) {
            Text(text = "Confidential report", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("safety" to "Safety", "hazing" to "Hazing", "harassment" to "Harassment", "other" to "Other").forEach { (tag, label) ->
                    val isSel = incidentCategory == tag
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSel) Palette.accentSoft else Palette.subtle)
                            .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(8.dp))
                            .clickable { incidentCategory = tag }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = label, fontSize = 11.sp, color = if (isSel) Palette.accent else Palette.ink2)
                    }
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            GGField(label = "What happened") {
                GGTextArea(value = incidentText, onValueChange = { incidentText = it }, placeholder = "Only standards officers can see this.", minHeight = 110.dp)
            }
            Spacer(modifier = Modifier.height(10.dp))
            GGButton(
                title = "Submit confidential report",
                kind = GGButtonKind.DANGER,
                fillWidth = true,
                enabled = incidentText.isNotBlank()
            ) {
                message = "Confidential report submitted to standards officers."
                incidentText = ""
            }
        }
    }
}

// ==========================================
// ACADEMICS
// ==========================================
@Composable
fun AcademicsView(chapter: ChapterContext, session: AppSession) {
    val live = session.selectedChapter ?: chapter

    var goalTitle by remember { mutableStateOf("") }
    var shareGoal by remember { mutableStateOf(false) }

    var groupName by remember { mutableStateOf("") }
    var groupCourse by remember { mutableStateOf("") }
    var groupMeeting by remember { mutableStateOf("") }

    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    GGScreenStack {
        GGPageHeader(
            title = "Academics",
            description = "Study groups and private goals. GreekGeek does not collect grades or transcripts."
        )

        if (message != null) {
            GGNotice(tone = Tone.POSITIVE, message = message!!)
        }

        // Add a Goal Card
        GGCard(padding = 16.dp) {
            Text(text = "Add a goal", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Goal") {
                GGTextField(value = goalTitle, onValueChange = { goalTitle = it }, placeholder = "Finish problem set reviews before midterms")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "Share with scholarship chair", fontSize = 14.sp, color = Palette.ink, modifier = Modifier.weight(1f))
                Switch(
                    checked = shareGoal,
                    onCheckedChange = { shareGoal = it },
                    colors = SwitchDefaults.colors(checkedThumbColor = Palette.accent, checkedTrackColor = Palette.accentSoft)
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            GGButton(
                title = "Save goal",
                fillWidth = true,
                busy = busy,
                enabled = goalTitle.isNotBlank()
            ) {
                busy = true
                session.addAcademicGoal(goalTitle, null, shareGoal) { err ->
                    busy = false
                    if (err == null) {
                        message = "Academic goal saved."
                        goalTitle = ""
                    }
                }
            }
        }

        // Academic Goals List
        if (live.academicGoals.isNotEmpty()) {
            GGCard {
                GGCardHeader(title = "Your academic goals")
                live.academicGoals.forEachIndexed { index, goal ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(text = goal.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink, modifier = Modifier.weight(1f))
                            GGBadge(text = goal.status.replaceFirstChar { it.uppercase() }, tone = if (goal.status == "achieved") Tone.POSITIVE else Tone.NEUTRAL)
                        }
                        if (goal.status == "active") {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                GGButton(title = "Mark achieved", size = GGButtonSize.SM) {
                                    session.setAcademicGoalStatus(goal.id, "achieved")
                                }
                                GGButton(title = "Drop", kind = GGButtonKind.SECONDARY, size = GGButtonSize.SM) {
                                    session.setAcademicGoalStatus(goal.id, "dropped")
                                }
                            }
                        }
                    }
                    if (index < live.academicGoals.size - 1) ListRowDivider()
                }
            }
        }

        // New Study Group Card
        GGCard(padding = 16.dp) {
            Text(text = "New study group", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Name") {
                GGTextField(value = groupName, onValueChange = { groupName = it }, placeholder = "Organic chemistry")
            }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Course") {
                GGTextField(value = groupCourse, onValueChange = { groupCourse = it }, placeholder = "CHEM 241")
            }
            Spacer(modifier = Modifier.height(8.dp))
            GGField(label = "Meeting") {
                GGTextField(value = groupMeeting, onValueChange = { groupMeeting = it }, placeholder = "Sundays 7pm, library")
            }
            Spacer(modifier = Modifier.height(10.dp))
            GGButton(
                title = "Create group",
                kind = GGButtonKind.SECONDARY,
                fillWidth = true,
                busy = busy,
                enabled = groupName.isNotBlank()
            ) {
                busy = true
                session.createStudyGroup(groupName, groupCourse.ifEmpty { null }, groupMeeting.ifEmpty { null }) { err ->
                    busy = false
                    if (err == null) {
                        message = "Study group created."
                        groupName = ""
                        groupCourse = ""
                        groupMeeting = ""
                    }
                }
            }
        }

        // Active Study Groups
        GGCard {
            GGCardHeader(title = "Study groups")
            if (live.studyGroups.isEmpty()) {
                GGEmptyState(icon = Icons.Default.School, title = "No study groups")
            } else {
                live.studyGroups.forEachIndexed { index, sg ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(text = "${sg.title} (${sg.course})", fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = sg.nextMeeting, fontSize = 12.sp, color = Palette.ink3)
                        }
                    }
                    if (index < live.studyGroups.size - 1) ListRowDivider()
                }
            }
        }
    }
}

// ==========================================
// SETTINGS
// ==========================================
@Composable
fun SettingsView(
    chapter: ChapterContext,
    session: AppSession,
    onSelectMember: (DirectoryMember) -> Unit
) {
    val live = session.selectedChapter ?: chapter

    var letters by remember { mutableStateOf(live.chapter.greekLetters ?: "") }
    var description by remember { mutableStateOf(live.profileDetails.description) }
    var founded by remember { mutableStateOf(live.profileDetails.foundedYear?.toString() ?: "") }
    var timezone by remember { mutableStateOf(live.chapter.timezone) }

    val modulesState = remember {
        mutableStateMapOf<ChapterModule, Boolean>().apply {
            ChapterModule.entries.forEach { mod ->
                put(mod, live.chapter.isEnabled(mod))
            }
        }
    }

    var inviteEmail by remember { mutableStateOf("") }
    var inviteName by remember { mutableStateOf("") }
    var inviteClass by remember { mutableStateOf("active") }

    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val zones = listOf(
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico"
    )

    GGScreenStack {
        GGPageHeader(title = "Settings")

        if (message != null) {
            GGNotice(tone = Tone.POSITIVE, message = message!!)
        }

        // Chapter Profile Editor
        if (live.can(Permission.CHAPTER_MANAGE)) {
            GGCard(padding = 16.dp) {
                Text(text = "Chapter profile", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Spacer(modifier = Modifier.height(10.dp))
                SettingsInfoRow("Organization", live.chapter.organizationName)
                SettingsInfoRow("Chapter", live.chapter.designation ?: "None")
                SettingsInfoRow("Handle", live.chapter.slug)
                SettingsInfoRow("University", live.chapter.universityName ?: "—")

                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Greek letters") {
                    GGTextField(value = letters, onValueChange = { letters = it }, placeholder = "ΑΒ")
                }
                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Description") {
                    GGTextArea(value = description, onValueChange = { description = it }, placeholder = "About the chapter", minHeight = 80.dp)
                }
                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Founded year") {
                    GGTextField(value = founded, onValueChange = { founded = it }, placeholder = "1921")
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "TIMEZONE", fontSize = 11.sp, color = Palette.ink3, letterSpacing = 0.6.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                    listOf("America/New_York" to "Eastern", "America/Chicago" to "Central", "America/Denver" to "Mountain", "America/Los_Angeles" to "Pacific").forEach { (tz, label) ->
                        val isSel = timezone == tz
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSel) Palette.accentSoft else Palette.subtle)
                                .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(8.dp))
                                .clickable { timezone = tz }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = label, fontSize = 11.sp, color = if (isSel) Palette.accent else Palette.ink2)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                GGButton(
                    title = "Save profile",
                    fillWidth = true,
                    busy = busy
                ) {
                    busy = true
                    session.updateChapterProfile(letters, description, founded.toIntOrNull(), timezone) { err ->
                        busy = false
                        message = if (err == null) "Chapter profile saved." else err
                    }
                }
            }

            // Modules Editor
            GGCard(padding = 16.dp) {
                Text(text = "Modules", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Text(text = "Choose which programs your chapter uses.", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))

                ChapterModule.entries.forEach { mod ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = mod.title, fontSize = 14.sp, color = Palette.ink, modifier = Modifier.weight(1f))
                        Switch(
                            checked = modulesState[mod] ?: false,
                            onCheckedChange = { modulesState[mod] = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = Palette.accent, checkedTrackColor = Palette.accentSoft)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))
                GGButton(
                    title = "Save modules",
                    kind = GGButtonKind.SECONDARY,
                    fillWidth = true,
                    busy = busy
                ) {
                    busy = true
                    session.updateChapterModules(modulesState.toMap()) { err ->
                        busy = false
                        message = if (err == null) "Modules updated." else err
                    }
                }
            }
        }

        // Stripe and Billing Card
        if (live.can(Permission.CHAPTER_MANAGE) || live.can(Permission.PAYMENTS_CONFIGURE) || live.can(Permission.FINANCE_VIEW)) {
            val bill = live.billing
            GGCard(padding = 16.dp) {
                Text(text = "Stripe and billing", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Text(text = "Card collection and payouts use Stripe's hosted flow.", fontSize = 13.sp, color = Palette.ink2, modifier = Modifier.padding(top = 2.dp, bottom = 10.dp))

                SettingsInfoRow("Agreement", if (bill.termsAccepted) (bill.signerName?.let { "Accepted by $it" } ?: "Accepted") else "Not accepted")
                SettingsInfoRow("Subscription", "${bill.subscription.replaceFirstChar { it.uppercase() }} · ${MoneyFormat.cents(bill.amountCents)} / month")
                if (bill.periodEnd != null) {
                    SettingsInfoRow("Current period ends", DateFormat.medium(bill.periodEnd))
                }
                SettingsInfoRow("Card payments", bill.cardPayments.replace('_', ' ').replaceFirstChar { it.uppercase() })
                SettingsInfoRow("Payouts", bill.payouts.replace('_', ' ').replaceFirstChar { it.uppercase() })
                SettingsInfoRow("Online collection", if (bill.canCollect) "On" else "Off")

                Spacer(modifier = Modifier.height(8.dp))
                GGDesktopHint()
            }
        }

        // Members Roster & Invites
        if (live.can(Permission.MEMBERS_MANAGE)) {
            GGCard(padding = 16.dp) {
                Text(text = "Invite a member", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Text(text = "If they already have a GreekGeek account, they join the roster immediately.", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.padding(top = 2.dp))

                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Email") {
                    GGTextField(value = inviteEmail, onValueChange = { inviteEmail = it }, placeholder = "jordan@school.edu")
                }
                Spacer(modifier = Modifier.height(8.dp))
                GGField(label = "Full name") {
                    GGTextField(value = inviteName, onValueChange = { inviteName = it }, placeholder = "Jordan Lee")
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "CLASS", fontSize = 11.sp, color = Palette.ink3, letterSpacing = 0.6.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                    listOf("active" to "Active", "new_member" to "New member", "associate" to "Associate", "alumni" to "Alumni").forEach { (tag, label) ->
                        val isSel = inviteClass == tag
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSel) Palette.accentSoft else Palette.subtle)
                                .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(8.dp))
                                .clickable { inviteClass = tag }
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(text = label, fontSize = 11.sp, color = if (isSel) Palette.accent else Palette.ink2)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
                GGButton(
                    title = "Add or invite",
                    fillWidth = true,
                    busy = busy,
                    enabled = inviteEmail.contains("@")
                ) {
                    busy = true
                    session.addExistingMember(inviteEmail, inviteClass) { status, err ->
                        busy = false
                        if (err != null) {
                            message = err
                        } else if (status == "added") {
                            message = "${inviteName.ifEmpty { inviteEmail }} already had an account and is now on the roster."
                            inviteEmail = ""
                            inviteName = ""
                        } else if (status == "already_member") {
                            message = "This person is already an active member."
                        } else {
                            message = "Invitation sent. They can sign up or accept on the web."
                        }
                    }
                }
            }

            // Members Roster
            GGCard {
                GGCardHeader(title = "Members", description = "${live.members.size} current members")
                live.members.forEachIndexed { index, member ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelectMember(member) }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PersonAvatar(name = member.name, path = member.avatarPath, size = 32.dp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(text = member.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            val meta = (listOf(member.status.label, member.memberClass.label) + member.roles).joinToString(" · ")
                            Text(text = meta, fontSize = 12.sp, color = Palette.ink3)
                        }
                        Icon(imageVector = Icons.Default.ChevronRight, contentDescription = null, tint = Palette.ink3, modifier = Modifier.size(16.dp))
                    }
                    if (index < live.members.size - 1) ListRowDivider()
                }
            }

            // Pending Invitations
            if (live.invitations.isNotEmpty()) {
                GGCard {
                    GGCardHeader(title = "Pending invitations")
                    live.invitations.forEachIndexed { index, inv ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(text = inv.fullName ?: inv.email, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                                Text(text = "${inv.email} · ${inv.memberClass.label}", fontSize = 12.sp, color = Palette.ink3)
                            }
                        }
                        if (index < live.invitations.size - 1) ListRowDivider()
                    }
                }
            }
        }

        // Roles
        if (live.can(Permission.ROLES_MANAGE)) {
            GGCard {
                GGCardHeader(title = "Roles", description = "Roles decide what officers can see and do.")
                live.roles.forEachIndexed { index, role ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(text = role.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = if (role.kind == "system") "Standard" else "Custom", fontSize = 12.sp, color = Palette.ink3)
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(text = "${role.holders} holding", fontSize = 12.sp, color = Palette.ink2)
                            Text(text = "${role.permissionCount} permissions", fontSize = 12.sp, color = Palette.ink3)
                        }
                    }
                    if (index < live.roles.size - 1) ListRowDivider()
                }
                GGDesktopHint()
            }
        }

        // Audit Log
        if (live.can(Permission.AUDIT_VIEW)) {
            GGCard {
                GGCardHeader(title = "Audit log", description = "Sensitive changes, newest first. Entries cannot be edited.")
                if (live.auditLogs.isEmpty()) {
                    GGEmptyState(icon = Icons.Default.MenuBook, title = "Nothing recorded yet")
                } else {
                    live.auditLogs.forEachIndexed { index, row ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Text(text = row.action, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
                            Text(text = "${row.actor} · ${DateFormat.relative(row.whenDate)}", fontSize = 12.sp, color = Palette.ink3)
                            if (row.detail.isNotBlank()) {
                                Text(text = row.detail, fontSize = 12.sp, color = Palette.ink2)
                            }
                        }
                        if (index < live.auditLogs.size - 1) ListRowDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsInfoRow(title: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = title, fontSize = 14.sp, color = Palette.ink3)
        Spacer(modifier = Modifier.weight(1f))
        Text(text = value, fontSize = 14.sp, color = Palette.ink)
    }
}
