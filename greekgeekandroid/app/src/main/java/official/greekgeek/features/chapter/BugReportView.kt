package official.greekgeek.features.chapter

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone
import official.greekgeek.state.AppSession

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BugReportModal(
    page: String,
    onDismiss: () -> Unit,
    session: AppSession? = null,
    onSubmit: ((String) -> Unit)? = null
) {
    var message by remember { mutableStateOf("") }
    var expected by remember { mutableStateOf("") }
    var impact by remember { mutableStateOf("annoying") }
    var error by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(
                title = "Report a bug",
                description = "Tell us what broke. This goes to GreekGeek support, not your chapter officers."
            )

            if (sent) {
                GGNotice(
                    tone = Tone.POSITIVE,
                    title = "Sent",
                    message = "Thanks. We logged it and will look at it."
                )
                GGButton(title = "Close", kind = GGButtonKind.SECONDARY, fillWidth = true) {
                    onDismiss()
                }
            } else {
                GGField(label = "What happened") {
                    GGTextArea(
                        value = message,
                        onValueChange = {
                            message = it
                            if (error != null) error = null
                        },
                        placeholder = "What you tapped, what you expected, and what you saw instead.",
                        minHeight = 140.dp
                    )
                }

                GGField(label = "What should have happened") {
                    GGTextArea(
                        value = expected,
                        onValueChange = { expected = it },
                        placeholder = "Optional",
                        minHeight = 80.dp
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "HOW BAD IS IT",
                        fontSize = 11.sp,
                        color = Palette.ink3,
                        letterSpacing = 0.6.sp
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            "blocked" to "It stops me",
                            "annoying" to "I can work around it",
                            "minor" to "Small or cosmetic"
                        ).forEach { (tag, label) ->
                            val isSel = (impact == tag)
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isSel) Palette.accentSoft else Palette.subtle)
                                    .border(
                                        1.dp,
                                        if (isSel) Palette.accent else Palette.lineStrong,
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { impact = tag }
                                    .padding(vertical = 10.dp, horizontal = 6.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 12.sp,
                                    color = if (isSel) Palette.accent else Palette.ink,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }

                if (error != null) {
                    GGNotice(tone = Tone.DANGER, message = error!!)
                }

                Text(
                    text = "Page: $page",
                    fontSize = 12.sp,
                    color = Palette.ink3
                )

                GGButton(
                    title = "Send report",
                    fillWidth = true,
                    busy = busy
                ) {
                    val trimmed = message.trim()
                    if (trimmed.length < 10) {
                        error = "Add a little more detail, at least 10 characters."
                        return@GGButton
                    }
                    val impactLabel = when (impact) {
                        "blocked" -> "It stops me from doing something"
                        "annoying" -> "I can work around it"
                        "minor" -> "Small or cosmetic"
                        else -> impact
                    }
                    val report = listOfNotNull(
                        trimmed,
                        if (expected.isNotBlank()) "Expected: ${expected.trim()}" else null,
                        "Impact: $impactLabel"
                    ).joinToString("\n\n")

                    if (session != null) {
                        busy = true
                        session.submitBugReport(report, page) { err ->
                            busy = false
                            if (err != null) {
                                error = err
                            } else {
                                sent = true
                            }
                        }
                    } else if (onSubmit != null) {
                        onSubmit(report)
                        sent = true
                    } else {
                        sent = true
                    }
                }
            }
        }
    }
}
