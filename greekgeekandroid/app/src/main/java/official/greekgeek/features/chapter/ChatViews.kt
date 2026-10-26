package official.greekgeek.features.chapter

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import official.greekgeek.design.*
import official.greekgeek.models.ChatMessage
import official.greekgeek.models.ChapterContext
import official.greekgeek.models.Conversation
import official.greekgeek.models.ConversationKind
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone

// ==========================================
// CHAT INBOX
// ==========================================
@Composable
fun ChatInboxView(
    chapter: ChapterContext,
    onSelect: (Conversation) -> Unit
) {
    var filterTab by remember { mutableStateOf("All") }

    val filteredConvs = remember(chapter.conversations, filterTab) {
        when (filterTab) {
            "Channels" -> chapter.conversations.filter { it.kind != ConversationKind.DIRECT }
            "DMs" -> chapter.conversations.filter { it.kind == ConversationKind.DIRECT }
            else -> chapter.conversations
        }
    }

    GGScreenStack {
        GGPageHeader(
            title = "Messages",
            description = "Channels, direct messages, and officer threads."
        )

        // Filter Tabs
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("All", "Channels", "DMs").forEach { tab ->
                val isSel = filterTab == tab
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSel) Palette.accentSoft else Palette.subtle)
                        .border(1.dp, if (isSel) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                        .clickable { filterTab = tab }
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = tab,
                        fontSize = 13.sp,
                        fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isSel) Palette.accent else Palette.ink2
                    )
                }
            }
        }

        GGCard {
            if (filteredConvs.isEmpty()) {
                GGEmptyState(icon = Icons.Default.ChatBubble, title = "No conversations")
            } else {
                filteredConvs.forEachIndexed { index, conv ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(conv) }
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // Icon or Avatar
                        if (conv.kind == ConversationKind.DIRECT) {
                            PersonAvatar(name = conv.title, size = 40.dp)
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Palette.subtle),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (conv.kind == ConversationKind.RESTRICTED) "🔒" else "#",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Palette.ink2
                                )
                            }
                        }

                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = conv.title,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Palette.ink
                            )
                            Text(
                                text = conv.subtitle ?: "No messages yet",
                                fontSize = 13.sp,
                                color = Palette.ink3,
                                maxLines = 1
                            )
                        }

                        if (conv.unread > 0) {
                            Box(
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(Palette.accent)
                                    .padding(horizontal = 7.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "${conv.unread}",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Palette.onAccent
                                )
                            }
                        }
                    }
                    if (index < filteredConvs.size - 1) ListRowDivider()
                }
            }
        }
    }
}

// ==========================================
// CHAT ROOM
// ==========================================
@Composable
fun ChatRoomView(
    session: AppSession,
    conversation: Conversation
) {
    var messageText by remember { mutableStateOf("") }
    var replyingTo by remember { mutableStateOf<ChatMessage?>(null) }
    val listState = rememberLazyListState()

    val currentUserName = session.profile?.personName ?: "Member"

    // Live Polling every 4 seconds so messages are received automatically
    LaunchedEffect(conversation.id) {
        session.refreshConversation(conversation.id)
        while (isActive) {
            delay(4000)
            session.refreshConversation(conversation.id)
        }
    }

    LaunchedEffect(conversation.messages.size) {
        if (conversation.messages.isNotEmpty()) {
            listState.animateScrollToItem(conversation.messages.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        // Pinned Message Banner
        val pinned = conversation.messages.firstOrNull { it.pinned }
        if (pinned != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Palette.surface)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PushPin,
                    contentDescription = "Pinned",
                    tint = Palette.accent,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = "${pinned.from}: ${pinned.body}",
                    fontSize = 12.sp,
                    color = Palette.ink2,
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )
            }
            ListRowDivider()
        }

        // Messages Bubble List
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(conversation.messages, key = { it.id }) { msg ->
                val isMine = msg.from == "You" || msg.from == currentUserName || msg.senderId == session.user?.id

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
                    verticalAlignment = Alignment.Bottom
                ) {
                    if (!isMine) {
                        PersonAvatar(
                            name = msg.from,
                            path = session.avatarPath(msg.senderId),
                            size = 28.dp,
                            modifier = Modifier.padding(bottom = 2.dp, end = 8.dp)
                        )
                    }

                    Column(
                        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
                        modifier = Modifier.widthIn(max = 280.dp)
                    ) {
                        // Sender info
                        if (!isMine) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)
                            ) {
                                Text(
                                    text = msg.from,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Palette.ink2
                                )
                                Text(
                                    text = msg.time,
                                    fontSize = 11.sp,
                                    color = Palette.ink3
                                )
                                if (msg.edited) {
                                    Text(
                                        text = "edited",
                                        fontSize = 11.sp,
                                        color = Palette.ink3
                                    )
                                }
                            }
                        }

                        // Quoted reply banner
                        if (msg.replyFrom != null && msg.replyBody != null) {
                            Surface(
                                color = Palette.surface,
                                shape = RoundedCornerShape(8.dp),
                                border = BorderStroke(1.dp, Palette.line),
                                modifier = Modifier
                                    .padding(bottom = 4.dp)
                                    .fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .width(3.dp)
                                            .height(28.dp)
                                            .background(Palette.accent, RoundedCornerShape(2.dp))
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Column {
                                        Text(
                                            text = "Replying to ${msg.replyFrom}",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Palette.ink2
                                        )
                                        Text(
                                            text = msg.replyBody,
                                            fontSize = 12.sp,
                                            color = Palette.ink3,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }

                        // Bubble Box
                        val shape = if (isMine) {
                            RoundedCornerShape(14.dp, 14.dp, 3.dp, 14.dp)
                        } else {
                            RoundedCornerShape(14.dp, 14.dp, 14.dp, 3.dp)
                        }
                        val bg = if (isMine) Palette.accent else Palette.surface
                        val textColor = if (isMine) Palette.onAccent else Palette.ink

                        Box(
                            modifier = Modifier
                                .clip(shape)
                                .background(bg)
                                .clickable { replyingTo = msg }
                                .padding(horizontal = 14.dp, vertical = 10.dp)
                        ) {
                            Text(
                                text = msg.body,
                                fontSize = 15.sp,
                                color = textColor,
                                lineHeight = 21.sp
                            )
                        }

                    // Reactions row
                    if (msg.reactions.isNotEmpty()) {
                        Row(
                            modifier = Modifier.padding(top = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            msg.reactions.forEach { (emoji, users) ->
                                val reactedByMe = users.contains(currentUserName)
                                val reactionEmoji = when (emoji) {
                                    "+1", "thumbsup" -> "👍"
                                    "heart" -> "❤️"
                                    "check" -> "✅"
                                    else -> emoji
                                }
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(if (reactedByMe) Palette.accentSoft else Palette.subtle)
                                        .border(1.dp, if (reactedByMe) Palette.accent else Palette.lineStrong, RoundedCornerShape(999.dp))
                                        .clickable { session.toggleReaction(conversation.id, msg.id, emoji) }
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "$reactionEmoji ${users.size}",
                                        fontSize = 11.sp,
                                        color = if (reactedByMe) Palette.accent else Palette.ink2
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Replying Preview Header
        if (replyingTo != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Palette.surface)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val replyTargetName = if (replyingTo!!.isFrom(session.user?.id)) "yourself" else replyingTo!!.from
                Text(
                    text = "Replying to $replyTargetName: ${replyingTo!!.body}",
                    fontSize = 12.sp,
                    color = Palette.ink3,
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = { replyingTo = null }, modifier = Modifier.size(24.dp)) {
                    Icon(imageVector = Icons.Default.Close, contentDescription = "Cancel reply", tint = Palette.ink3, modifier = Modifier.size(16.dp))
                }
            }
        }

        // Message Input Bottom Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.surface)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            GGTextField(
                value = messageText,
                onValueChange = { messageText = it },
                placeholder = "Message ${conversation.title}...",
                modifier = Modifier.weight(1f)
            )

            IconButton(
                onClick = {
                    if (messageText.isNotBlank()) {
                        session.sendMessage(conversation.id, messageText, replyingTo)
                        messageText = ""
                        replyingTo = null
                    }
                },
                enabled = messageText.isNotBlank(),
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (messageText.isNotBlank()) Palette.accent else Palette.subtle)
            ) {
                Icon(
                    imageVector = Icons.Default.Send,
                    contentDescription = "Send",
                    tint = if (messageText.isNotBlank()) Palette.onAccent else Palette.ink3,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
