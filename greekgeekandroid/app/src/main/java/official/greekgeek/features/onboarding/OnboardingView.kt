package official.greekgeek.features.onboarding

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingModal(
    session: AppSession,
    onDismiss: () -> Unit
) {
    var step by remember { mutableIntStateOf(1) }
    var orgName by remember { mutableStateOf("") }
    var designation by remember { mutableStateOf("") }
    var greekLetters by remember { mutableStateOf("") }
    var university by remember { mutableStateOf("State University") }
    var officerRole by remember { mutableStateOf("President") }
    var submitted by remember { mutableStateOf(false) }

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
            if (submitted) {
                GGPageHeader(
                    title = "Application submitted",
                    description = "We will review your chapter details and verify your status within 24-48 hours."
                )
                GGNotice(
                    tone = Tone.POSITIVE,
                    message = "Your application for $orgName ($designation) at $university was received. We review documents against university registries to keep all chapters verified."
                )
                GGButton(title = "Done", fillWidth = true) { onDismiss() }
            } else {
                GGPageHeader(
                    title = "Register chapter",
                    description = "Step $step of 3: ${
                        when (step) {
                            1 -> "Organization details"
                            2 -> "Campus & university"
                            else -> "Officer verification"
                        }
                    }"
                )

                // Step Progress Bar
                LinearProgressIndicator(
                    progress = { step.toFloat() / 3f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = Palette.accent,
                    trackColor = Palette.subtle
                )

                when (step) {
                    1 -> {
                        GGField(label = "National organization name") {
                            GGTextField(
                                value = orgName,
                                onValueChange = { orgName = it },
                                placeholder = "e.g. Alpha Beta or Sigma Chi"
                            )
                        }

                        GGField(label = "Chapter designation") {
                            GGTextField(
                                value = designation,
                                onValueChange = { designation = it },
                                placeholder = "e.g. Alpha Chapter or Beta Epsilon"
                            )
                        }

                        GGField(label = "Greek letters") {
                            GGTextField(
                                value = greekLetters,
                                onValueChange = { greekLetters = it },
                                placeholder = "e.g. ΑΒ or ΣΧ"
                            )
                        }

                        GGButton(
                            title = "Continue to campus",
                            fillWidth = true,
                            enabled = orgName.isNotBlank() && designation.isNotBlank()
                        ) {
                            step = 2
                        }
                    }

                    2 -> {
                        GGField(label = "University or college") {
                            GGTextField(
                                value = university,
                                onValueChange = { university = it },
                                placeholder = "e.g. State University"
                            )
                        }

                        // Popular suggestions
                        Text(text = "Common selections:", fontSize = 12.sp, color = Palette.ink3)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("State University", "University of Michigan", "University of Texas").forEach { school ->
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(if (university == school) Palette.accentSoft else Palette.subtle)
                                        .border(1.dp, if (university == school) Palette.accent else Palette.lineStrong, RoundedCornerShape(6.dp))
                                        .clickable { university = school }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        text = school,
                                        fontSize = 12.sp,
                                        color = if (university == school) Palette.accent else Palette.ink2
                                    )
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            GGButton(
                                title = "Back",
                                kind = GGButtonKind.SECONDARY,
                                modifier = Modifier.weight(1f)
                            ) {
                                step = 1
                            }
                            GGButton(
                                title = "Next",
                                modifier = Modifier.weight(1f),
                                enabled = university.isNotBlank()
                            ) {
                                step = 3
                            }
                        }
                    }

                    3 -> {
                        GGField(label = "Your officer position") {
                            GGTextField(
                                value = officerRole,
                                onValueChange = { officerRole = it },
                                placeholder = "e.g. President or Treasurer"
                            )
                        }

                        GGNotice(
                            tone = Tone.INFO,
                            title = "Human verification required",
                            message = "Every chapter is verified by a GreekGeek staff reviewer before collecting dues or sending invites."
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            GGButton(
                                title = "Back",
                                kind = GGButtonKind.SECONDARY,
                                modifier = Modifier.weight(1f)
                            ) {
                                step = 2
                            }
                            GGButton(
                                title = "Submit application",
                                modifier = Modifier.weight(1f),
                                enabled = officerRole.isNotBlank()
                            ) {
                                session.submitChapterApplication(orgName, designation, greekLetters, university)
                                submitted = true
                            }
                        }
                    }
                }
            }
        }
    }
}
