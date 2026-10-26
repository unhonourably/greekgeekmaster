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
import kotlin.math.abs

// ==========================================
// FINANCES & LEDGER (OFFICER)
// ==========================================
@Composable
fun FinancesView(chapter: ChapterContext, session: AppSession) {
    val summary = chapter.financeSummary
    val owing = chapter.memberBalances.filter { it.balanceCents > 0 }.sortedByDescending { it.balanceCents }

    GGScreenStack {
        GGPageHeader(
            title = "Finances",
            description = "Dues, payments, and balances from the chapter ledger."
        )

        GGDesktopHint()

        if (!chapter.canCollect) {
            GGNotice(
                tone = Tone.INFO,
                title = "Online dues collection is off",
                message = "You can still issue charges on the website. Card and bank payments turn on after Stripe setup."
            )
        }

        // Metrics 2x2 grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            FinanceMetricTile(
                label = "Outstanding",
                value = MoneyFormat.cents(summary.outstandingCents),
                hint = "${summary.membersWithBalance} members",
                modifier = Modifier.weight(1f)
            )
            FinanceMetricTile(
                label = "Collected",
                value = MoneyFormat.cents(summary.collectedCents),
                hint = "This period",
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            FinanceMetricTile(
                label = "Clearing",
                value = MoneyFormat.cents(summary.processingCents),
                hint = "In progress",
                modifier = Modifier.weight(1f)
            )
            FinanceMetricTile(
                label = "Net received",
                value = MoneyFormat.cents(summary.netCents),
                hint = "After fees",
                modifier = Modifier.weight(1f)
            )
        }

        // This Period Breakdown
        GGCard(padding = 16.dp) {
            Text(
                text = "This period",
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
            Spacer(modifier = Modifier.height(8.dp))
            ActivityLine("Dues assessed", MoneyFormat.cents(summary.assessedCents))
            ActivityLine("Refunds", MoneyFormat.cents(summary.refundsCents))
            ActivityLine("Platform fees", MoneyFormat.cents(abs(summary.platformFeesCents)))
            ActivityLine("Stripe fees", MoneyFormat.cents(abs(summary.processingFeesCents)))
        }

        // Who Owes Card
        GGCard {
            GGCardHeader(
                title = "Who owes",
                description = if (owing.isEmpty()) "Everyone is paid up." else "Highest balances first"
            )
            if (owing.isEmpty()) {
                GGEmptyState(
                    icon = Icons.Default.CheckCircle,
                    title = "No balances due"
                )
            } else {
                owing.take(8).forEachIndexed { index, row ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = row.name,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink
                            )
                            Text(
                                text = if (row.overdueCents > 0) "${MoneyFormat.cents(row.overdueCents)} overdue" else row.memberClass.label,
                                fontSize = 12.sp,
                                color = if (row.overdueCents > 0) Palette.warning else Palette.ink3
                            )
                        }
                        Text(
                            text = MoneyFormat.cents(row.balanceCents),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Palette.ink
                        )
                    }
                    if (index < minOf(owing.size, 8) - 1) ListRowDivider()
                }
            }
        }

        // Recent Payments Card
        GGCard {
            GGCardHeader(title = "Recent payments")
            val rows = chapter.chapterPayments.take(8)
            if (rows.isEmpty()) {
                GGEmptyState(
                    icon = Icons.Default.CreditCard,
                    title = "No payments yet"
                )
            } else {
                rows.forEachIndexed { index, payment ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = payment.title.replace("_", " ").replaceFirstChar { it.uppercase() },
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink
                            )
                            Text(
                                text = "${payment.method} · ${DateFormat.medium(payment.createdAt)}",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = MoneyFormat.cents(payment.amountCents),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink
                            )
                            GGBadge(text = payment.status.label, tone = payment.status.tone)
                        }
                    }
                    if (index < rows.size - 1) ListRowDivider()
                }
            }
        }

        // Assessments Card
        if (chapter.assessments.isNotEmpty()) {
            GGCard {
                GGCardHeader(title = "Assessments")
                val assessRows = chapter.assessments.take(6)
                assessRows.forEachIndexed { index, item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(
                                text = item.title,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                color = Palette.ink
                            )
                            Text(
                                text = "${item.category} · ${item.memberCount} members",
                                fontSize = 12.sp,
                                color = Palette.ink3
                            )
                        }
                        Text(
                            text = MoneyFormat.cents(item.outstandingCents),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Palette.ink
                        )
                    }
                    if (index < assessRows.size - 1) ListRowDivider()
                }
            }
        }

        GGDesktopHint()
    }
}

@Composable
private fun FinanceMetricTile(label: String, value: String, hint: String?, modifier: Modifier = Modifier) {
    GGCard(modifier = modifier, padding = 14.dp) {
        Text(text = label, fontSize = 12.sp, color = Palette.ink3)
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = value, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
        if (hint != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = hint, fontSize = 11.sp, color = Palette.ink3)
        }
    }
}

@Composable
private fun ActivityLine(title: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = title, fontSize = 13.sp, color = Palette.ink2, modifier = Modifier.weight(1f))
        Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Palette.ink)
    }
}

// ==========================================
// RECRUITMENT PIPELINE
// ==========================================
@Composable
fun RecruitmentView(chapter: ChapterContext, session: AppSession) {
    var query by remember { mutableStateOf("") }

    val dueCount = remember(chapter.prospects) {
        chapter.prospects.count { prospect ->
            val d = prospect.followUpAt
            d != null && d <= Date()
        }
    }
    val offered = remember(chapter.prospects) { chapter.prospects.count { it.outcome == "offered" } }
    val joined = remember(chapter.prospects) { chapter.prospects.count { it.outcome == "joined" } }

    GGScreenStack {
        GGPageHeader(
            title = "Recruitment",
            description = "Prospect records are visible only to members with recruitment access."
        )

        if (chapter.stages.isEmpty()) {
            GGEmptyState(
                icon = Icons.Default.PersonAdd,
                title = "The pipeline is not set up",
                message = "Start with the standard stages, then add prospects."
            )
            GGDesktopHint()
        } else {
            // Stats 2x2 grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                RecruitStatTile(label = "Active prospects", value = "${chapter.prospects.size}", modifier = Modifier.weight(1f))
                RecruitStatTile(label = "Follow-ups due", value = "$dueCount", modifier = Modifier.weight(1f))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                RecruitStatTile(label = "Offers out", value = "$offered", modifier = Modifier.weight(1f))
                RecruitStatTile(label = "Joined", value = "$joined", modifier = Modifier.weight(1f))
            }

            // Stages and Prospects
            chapter.stages.forEach { stage ->
                val rows = chapter.prospects.filter {
                    it.stageId == stage.id && (query.isEmpty() || it.name.contains(query, ignoreCase = true))
                }

                GGCard {
                    GGCardHeader(
                        title = stage.name,
                        description = "${rows.size} · ${stage.outcome.replace('_', ' ')}"
                    )

                    if (rows.isEmpty()) {
                        Text(
                            text = "Empty",
                            fontSize = 13.sp,
                            color = Palette.ink3,
                            modifier = Modifier.padding(16.dp)
                        )
                    } else {
                        rows.forEachIndexed { index, prospect ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                PersonAvatar(
                                    name = prospect.preferredName ?: prospect.name,
                                    size = 32.dp,
                                    modifier = Modifier.padding(top = 2.dp, end = 10.dp)
                                )
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(
                                        text = prospect.preferredName?.let { "$it (${prospect.name})" } ?: prospect.name,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Palette.ink
                                    )
                                    val details = listOfNotNull(
                                        prospect.classYear?.toString(),
                                        prospect.major,
                                        prospect.school.ifEmpty { null }
                                    ).filter { it.isNotEmpty() }.joinToString(" · ").ifEmpty { "No details yet" }
                                    Text(
                                        text = details,
                                        fontSize = 12.sp,
                                        color = Palette.ink3
                                    )
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = prospect.assignedTo ?: "Unassigned",
                                            fontSize = 12.sp,
                                            color = Palette.ink3
                                        )
                                        Spacer(modifier = Modifier.weight(1f))
                                        val follow = prospect.followUpAt
                                        if (follow != null) {
                                            val isOverdue = follow <= Date()
                                            Text(
                                                text = DateFormat.shortDay(follow),
                                                fontSize = 12.sp,
                                                color = if (isOverdue) Palette.warning else Palette.ink3
                                            )
                                        }
                                    }
                                }
                            }
                            if (index < rows.size - 1) ListRowDivider()
                        }
                    }
                }
            }

            GGDesktopHint()
        }
    }
}

@Composable
private fun RecruitStatTile(label: String, value: String, modifier: Modifier = Modifier) {
    GGCard(modifier = modifier, padding = 12.dp) {
        Text(text = label, fontSize = 12.sp, color = Palette.ink3)
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = value, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
    }
}

// ==========================================
// ANALYTICS
// ==========================================
@Composable
fun AnalyticsView(chapter: ChapterContext) {
    val s = chapter.engagement
    val funnelMax = maxOf(1, s.prospectsByStage.maxOfOrNull { it.count } ?: 1)

    GGScreenStack {
        GGPageHeader(
            title = "Analytics",
            description = "Chapter-wide engagement for the last 90 days. Counts are aggregate."
        )

        Text(
            text = "Membership and events",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Palette.ink
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AnalyticsTile("Active members", "${s.activeMembers}", null, Modifier.weight(1f))
            AnalyticsTile("Events held", "${s.eventsHeld}", "${s.requiredEvents} required", Modifier.weight(1f))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AnalyticsTile("Check-ins", "${s.attendanceRecords}", "Present or late", Modifier.weight(1f))
            val reqAtt = s.requiredAttendanceRate?.let { "${it.toInt()}%" } ?: "No data"
            AnalyticsTile("Required attendance", reqAtt, null, Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Participation",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Palette.ink
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AnalyticsTile("Messages sent", "${s.messagesSent}", null, Modifier.weight(1f))
            if (chapter.chapter.isEnabled(ChapterModule.PHILANTHROPY)) {
                AnalyticsTile("Approved hours", "${s.serviceHours.toInt()}", null, Modifier.weight(1f))
            } else {
                Spacer(modifier = Modifier.weight(1f))
            }
        }

        if (chapter.chapter.isEnabled(ChapterModule.PHILANTHROPY)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                AnalyticsTile("Members who served", "${s.serviceParticipants}", null, Modifier.weight(1f))
                Spacer(modifier = Modifier.weight(1f))
            }
        }

        if (chapter.chapter.isEnabled(ChapterModule.RECRUITMENT) && s.prospectsByStage.isNotEmpty()) {
            GGCard(padding = 16.dp) {
                Text(
                    text = "Recruitment pipeline",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.ink
                )
                Text(
                    text = "Active prospects in each stage right now.",
                    fontSize = 13.sp,
                    color = Palette.ink3,
                    modifier = Modifier.padding(top = 2.dp)
                )

                s.prospectsByStage.forEach { row ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = row.stage,
                            fontSize = 13.sp,
                            color = Palette.ink2,
                            modifier = Modifier.width(88.dp)
                        )
                        LinearProgressIndicator(
                            progress = { row.count.toFloat() / funnelMax.toFloat() },
                            modifier = Modifier
                                .weight(1f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp)),
                            color = if (row.outcome == "joined") Palette.positive else Palette.accent,
                            trackColor = Palette.subtle
                        )
                        Text(
                            text = "${row.count}",
                            fontSize = 13.sp,
                            color = Palette.ink,
                            modifier = Modifier.width(36.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.End
                        )
                    }
                }
            }
        }

        GGDesktopHint()
    }
}

@Composable
private fun AnalyticsTile(title: String, value: String, hint: String?, modifier: Modifier = Modifier) {
    GGCard(modifier = modifier, padding = 12.dp) {
        Text(text = title, fontSize = 12.sp, color = Palette.ink3)
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = value, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
        if (hint != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = hint, fontSize = 11.sp, color = Palette.ink3)
        }
    }
}
