package official.greekgeek.features.account

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone
import official.greekgeek.models.NotificationKindSetting
import official.greekgeek.models.NotificationSettingGroup
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountModal(
    session: AppSession,
    onDismiss: () -> Unit
) {
    var fullName by remember { mutableStateOf(session.profile?.fullName ?: "") }
    var displayName by remember { mutableStateOf(session.profile?.displayName ?: "") }
    var gradYearString by remember { mutableStateOf(session.profile?.graduationYear?.toString() ?: "") }
    var kinds by remember { mutableStateOf<List<NotificationKindSetting>>(emptyList()) }
    var notifySaved by remember { mutableStateOf(false) }
    var notifyError by remember { mutableStateOf<String?>(null) }
    var notifyBusy by remember { mutableStateOf(false) }
    var savedNotice by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        kinds = session.loadNotificationSettings()
    }

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
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PersonAvatar(
                    name = session.profile?.personName ?: "Member",
                    path = session.profile?.avatarPath,
                    size = 54.dp
                )
                Spacer(modifier = Modifier.width(14.dp))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = session.profile?.personName ?: "Member",
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

            if (savedNotice) {
                GGNotice(tone = Tone.POSITIVE, message = "Profile updated successfully.")
            }

            GGField(label = "Full legal name") {
                GGTextField(
                    value = fullName,
                    onValueChange = {
                        fullName = it
                        savedNotice = false
                    },
                    placeholder = "Jordan Lee"
                )
            }

            GGField(label = "Preferred display name", hint = "How your name appears to chapter members.") {
                GGTextField(
                    value = displayName,
                    onValueChange = {
                        displayName = it
                        savedNotice = false
                    },
                    placeholder = "Jordan"
                )
            }

            GGField(label = "Graduation year") {
                GGTextField(
                    value = gradYearString,
                    onValueChange = {
                        gradYearString = it
                        savedNotice = false
                    },
                    placeholder = "2027"
                )
            }

            GGButton(
                title = "Save profile changes",
                kind = GGButtonKind.SECONDARY,
                fillWidth = true
            ) {
                session.updateProfile(fullName, displayName, gradYearString.toIntOrNull())
                savedNotice = true
            }

            ListRowDivider()

            GGCard(padding = 16.dp) {
                Text(
                    text = "Notifications",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.ink
                )
                Text(
                    text = "In app is the bell and banners on this phone. Chat alerts show who wrote, not the message. Email is separate.",
                    fontSize = 13.sp,
                    color = Palette.ink2,
                    modifier = Modifier.padding(top = 6.dp)
                )

                if (kinds.isEmpty()) {
                    Text(
                        text = "Loading notification types…",
                        fontSize = 13.sp,
                        color = Palette.ink3,
                        modifier = Modifier.padding(top = 12.dp)
                    )
                } else {
                    NotificationSettingGroup.allCases().forEach { group ->
                        val groupKinds = kinds.filter { it.group == group.rawValue && (session.staffRole != null || !it.isStaffKind) }
                        if (groupKinds.isNotEmpty()) {
                            Text(
                                text = group.rawValue,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Palette.ink3,
                                modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
                            )
                            groupKinds.forEach { item ->
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = item.label,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Palette.ink
                                    )
                                    Text(
                                        text = item.description + if (item.required) " Always on in the app." else "",
                                        fontSize = 12.sp,
                                        color = Palette.ink3
                                    )
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text(text = "App", fontSize = 12.sp, color = Palette.ink2)
                                            Switch(
                                                checked = if (item.required) true else item.inApp,
                                                onCheckedChange = { checked ->
                                                    kinds = kinds.map { if (it.kind == item.kind) it.copy(inApp = checked) else it }
                                                    notifySaved = false
                                                },
                                                enabled = !item.required,
                                                colors = SwitchDefaults.colors(checkedThumbColor = Palette.accent, checkedTrackColor = Palette.accentSoft)
                                            )
                                        }
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text(text = "Email", fontSize = 12.sp, color = Palette.ink2)
                                            Switch(
                                                checked = item.email,
                                                onCheckedChange = { checked ->
                                                    kinds = kinds.map { if (it.kind == item.kind) it.copy(email = checked) else it }
                                                    notifySaved = false
                                                },
                                                colors = SwitchDefaults.colors(checkedThumbColor = Palette.accent, checkedTrackColor = Palette.accentSoft)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (notifyError != null) {
                    GGNotice(tone = Tone.DANGER, message = notifyError ?: "", modifier = Modifier.padding(top = 12.dp))
                } else if (notifySaved) {
                    GGNotice(tone = Tone.POSITIVE, message = "Notification settings saved.", modifier = Modifier.padding(top = 12.dp))
                }

                GGButton(
                    title = "Save notification settings",
                    size = GGButtonSize.SM,
                    busy = notifyBusy,
                    modifier = Modifier.padding(top = 12.dp)
                ) {
                    notifyBusy = true
                    notifySaved = false
                    session.viewModelScope.launch {
                        val err = session.saveNotificationSettings(kinds)
                        notifyError = err
                        notifySaved = err == null
                        notifyBusy = false
                    }
                }
            }

            ListRowDivider()

            // Sign Out
            GGButton(
                title = "Sign out",
                kind = GGButtonKind.DANGER,
                fillWidth = true
            ) {
                session.signOut()
                onDismiss()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsModal(
    session: AppSession,
    onDismiss: () -> Unit
) {
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Notifications",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Palette.ink
                    )
                }
                if (session.unreadCount > 0) {
                    Text(
                        text = "Mark all read",
                        fontSize = 13.sp,
                        color = Palette.accent,
                        modifier = Modifier.clickable { session.markNotificationsRead() }
                    )
                }
            }

            if (session.notifications.isEmpty()) {
                GGEmptyState(
                    icon = Icons.Default.Notifications,
                    title = "All caught up",
                    message = "You have no new notifications."
                )
            } else {
                GGCard {
                    session.notifications.forEachIndexed { index, notif ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 18.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (notif.readAt == null) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(Palette.accent)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                            }
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = notif.title,
                                    fontSize = 14.sp,
                                    fontWeight = if (notif.readAt == null) FontWeight.SemiBold else FontWeight.Normal,
                                    color = Palette.ink
                                )
                                if (notif.body.isNotBlank()) {
                                    Text(
                                        text = notif.body,
                                        fontSize = 12.sp,
                                        color = Palette.ink3
                                    )
                                }
                                Text(
                                    text = DateFormat.relative(notif.createdAt),
                                    fontSize = 11.sp,
                                    color = Palette.ink3
                                )
                            }
                        }
                        if (index < session.notifications.size - 1) ListRowDivider()
                    }
                }
            }

            GGButton(title = "Close", fillWidth = true) { onDismiss() }
        }
    }
}
