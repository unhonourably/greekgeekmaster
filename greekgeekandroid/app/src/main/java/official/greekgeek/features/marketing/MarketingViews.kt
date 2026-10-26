package official.greekgeek.features.marketing

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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.features.auth.ForgotPasswordModal
import official.greekgeek.features.auth.LoginModal
import official.greekgeek.features.auth.SignUpModal
import official.greekgeek.services.AppConfig
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone

@Composable
fun MarketingHomeView(session: AppSession) {
    var showLogin by remember { mutableStateOf(false) }
    var showSignUp by remember { mutableStateOf(false) }
    var showForgotPassword by remember { mutableStateOf(false) }
    var showFeatures by remember { mutableStateOf(false) }
    var showPricing by remember { mutableStateOf(false) }
    var showContact by remember { mutableStateOf(false) }
    var showLegal by remember { mutableStateOf<String?>(null) }

    val scrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        // iOS Navigation Bar: Wordmark in center, "Sign in" button in top-bar trailing
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Palette.canvas)
                .padding(horizontal = 24.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            WordmarkView(height = 20.dp)
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "Sign in",
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                color = Palette.ink2,
                modifier = Modifier
                    .clickable { showLogin = true }
                    .padding(vertical = 4.dp, horizontal = 8.dp)
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Palette.line)
        )

        // Main Scrollable Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
        ) {
            // 1. HERO SECTION
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "The chapter office, handled.",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Serif,
                    color = Palette.ink,
                    lineHeight = 40.sp
                )
                Text(
                    text = "Collect dues, keep books that reconcile, and run members, chat, events, and recruitment from one verified account.",
                    fontSize = 17.sp,
                    color = Palette.ink2,
                    lineHeight = 24.sp
                )
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    GGButton(
                        title = "Register your chapter",
                        fillWidth = true
                    ) {
                        showSignUp = true
                    }
                    GGButton(
                        title = "See the features",
                        kind = GGButtonKind.SECONDARY,
                        fillWidth = true
                    ) {
                        showFeatures = true
                    }
                }
                Text(
                    text = "Members joining an existing chapter should use the invitation from their officers.",
                    fontSize = 14.sp,
                    color = Palette.ink3
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Text(
                        text = "Features",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.ink2,
                        modifier = Modifier.clickable { showFeatures = true }
                    )
                    Text(
                        text = "Pricing",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.ink2,
                        modifier = Modifier.clickable { showPricing = true }
                    )
                    Text(
                        text = "Contact",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        color = Palette.ink2,
                        modifier = Modifier.clickable { showContact = true }
                    )
                }
            }

            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Palette.line))

            // 2. TRY BEFORE / ALREADY IN A CHAPTER
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Palette.surface.copy(alpha = 0.45f))
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Already in a chapter?",
                    fontSize = 26.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Serif,
                    color = Palette.ink
                )
                Text(
                    text = "Sign in with the email your officers invited. Your dues, events, and messages load from your chapter.",
                    fontSize = 16.sp,
                    color = Palette.ink2,
                    lineHeight = 22.sp
                )
                Spacer(modifier = Modifier.height(4.dp))
                GGButton(
                    title = "Sign in",
                    kind = GGButtonKind.SECONDARY
                ) {
                    showLogin = true
                }
            }

            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Palette.line))

            // 3. WHAT YOUR OFFICERS GET
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp)
            ) {
                Text(
                    text = "What your officers get",
                    fontSize = 26.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Serif,
                    color = Palette.ink
                )

                val modules = listOf(
                    Triple("Dues and payments", Icons.Default.Paid, "Assess dues, offer installment plans, record cash and checks, issue credits, and accept card or bank payments through Stripe."),
                    Triple("An auditable ledger", Icons.Default.Description, "Every charge, payment, fee, refund, and dispute is a balanced ledger entry. Treasurers can reconcile against Stripe and hand off clean books."),
                    Triple("Member records", Icons.Default.Group, "Profiles, member classes, officer history, and a searchable directory with privacy controls each member sets for themselves."),
                    Triple("Chapter chat", Icons.Default.Forum, "Channels, direct messages, threads, mentions, and moderation tools. Channels can fill themselves from membership, officer roles, or alumni status."),
                    Triple("Events and attendance", Icons.Default.EventAvailable, "RSVPs, capacity limits, QR check-in, required-attendance tracking, and corrections with a reason on record."),
                    Triple("Recruitment", Icons.Default.PersonAdd, "A pipeline for prospects with stages, assignments, follow-ups, and notes that can be restricted to recruitment leadership."),
                    Triple("Standards and operations", Icons.Default.Assignment, "Policy acknowledgments, training, confidential incident reports, philanthropy hours, and budgets."),
                    Triple("Chapter housing", Icons.Default.Bed, "Rooms and beds, move-ins and move-outs, roommate requests, a live occupancy view, and rent billed straight to residents."),
                    Triple("Verified chapters", Icons.Default.Verified, "Every chapter is reviewed before it can collect money or invite members, so the account you join is the real one.")
                )

                modules.forEach { (title, icon, desc) ->
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = Palette.accent,
                            modifier = Modifier.size(24.dp)
                        )
                        Text(
                            text = title,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Palette.ink
                        )
                        Text(
                            text = desc,
                            fontSize = 14.sp,
                            color = Palette.ink2,
                            lineHeight = 20.sp
                        )
                    }
                }

                GGButton(
                    title = "See every feature in action",
                    kind = GGButtonKind.SECONDARY
                ) {
                    showFeatures = true
                }
            }

            // 4. GETTING STARTED & DATA PROTECTION
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Palette.surface)
                    .border(1.dp, Palette.line)
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        text = "Getting started",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Serif,
                        color = Palette.ink
                    )

                    val steps = listOf(
                        "Apply" to "An officer creates an account and submits the chapter's details and a way to confirm them.",
                        "Verification" to "We review the application, check for existing chapters, and may ask for more information. You can follow every step.",
                        "Agreement, subscription, and payouts" to "An administrator accepts the pricing agreement, starts the monthly subscription, and connects the chapter's bank account through Stripe.",
                        "Invite members" to "Send invitations or import a roster. Members only see what their role allows."
                    )

                    steps.forEachIndexed { index, (stepTitle, stepDesc) ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .border(1.dp, Palette.lineStrong, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "${index + 1}",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Palette.ink
                                )
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(
                                    text = stepTitle,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Palette.ink
                                )
                                Text(
                                    text = stepDesc,
                                    fontSize = 14.sp,
                                    color = Palette.ink2,
                                    lineHeight = 20.sp
                                )
                            }
                        }
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        text = "How your data is protected",
                        fontSize = 26.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Serif,
                        color = Palette.ink
                    )

                    val protections = listOf(
                        "Every table is isolated per chapter with database-enforced row-level security, so one chapter can never read another's records." to Icons.Default.Security,
                        "Card and bank details are entered on Stripe's hosted checkout. Funds go to the chapter's own Stripe account." to Icons.Default.AccountBalance,
                        "Payment status only changes from verified Stripe events. Financial records are append-only and every officer action is logged." to Icons.Default.Description,
                        "Direct messages and restricted recruitment notes are not visible to platform staff." to Icons.Default.Forum
                    )

                    protections.forEach { (text, icon) ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = Palette.accent,
                                modifier = Modifier.size(20.dp).padding(top = 2.dp)
                            )
                            Text(
                                text = text,
                                fontSize = 14.sp,
                                color = Palette.ink2,
                                lineHeight = 20.sp
                            )
                        }
                    }
                }
            }

            // 5. CLOSING SECTION
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 36.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Ready when your chapter is",
                    fontSize = 26.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Serif,
                    color = Palette.ink,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = "Register, get verified, and invite your members. Questions first? We answer every message.",
                    fontSize = 15.sp,
                    color = Palette.ink2,
                    textAlign = TextAlign.Center,
                    lineHeight = 22.sp
                )
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    GGButton(
                        title = "Register your chapter",
                        fillWidth = true
                    ) {
                        showSignUp = true
                    }
                    GGButton(
                        title = "Talk to us",
                        kind = GGButtonKind.SECONDARY,
                        fillWidth = true
                    ) {
                        showContact = true
                    }
                }
            }

            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Palette.line))

            // 6. FOOTER
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "${AppConfig.LEGAL_NAME}. Payments are processed by Stripe. ${AppConfig.BRAND_NAME} never stores card or bank numbers.",
                    fontSize = 13.sp,
                    color = Palette.ink3,
                    lineHeight = 18.sp
                )
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(text = "Features", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.clickable { showFeatures = true })
                    Text(text = "Contact", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.clickable { showContact = true })
                    Text(text = "Pricing", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.clickable { showPricing = true })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(text = "GreekGeek agreement", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.clickable { showLegal = "chapter-agreement" })
                    Text(text = "Terms", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.clickable { showLegal = "terms" })
                    Text(text = "Privacy", fontSize = 13.sp, color = Palette.ink3, modifier = Modifier.clickable { showLegal = "privacy" })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(text = "Twitter", fontSize = 13.sp, color = Palette.ink3)
                    Text(text = "LinkedIn", fontSize = 13.sp, color = Palette.ink3)
                    Text(text = "GitHub", fontSize = 13.sp, color = Palette.ink3)
                    Text(text = "Instagram", fontSize = 13.sp, color = Palette.ink3)
                }
            }
        }
    }

    // Sheets / Modals
    if (showLogin) {
        LoginModal(
            session = session,
            onDismiss = { showLogin = false },
            onSwitchToSignUp = {
                showLogin = false
                showSignUp = true
            },
            onForgotPassword = {
                showLogin = false
                showForgotPassword = true
            }
        )
    }

    if (showSignUp) {
        SignUpModal(
            session = session,
            onDismiss = { showSignUp = false },
            onSwitchToLogin = {
                showSignUp = false
                showLogin = true
            }
        )
    }

    if (showForgotPassword) {
        ForgotPasswordModal(
            session = session,
            onDismiss = { showForgotPassword = false }
        )
    }

    if (showFeatures) {
        FeaturesSheet(onDismiss = { showFeatures = false })
    }

    if (showPricing) {
        PricingSheet(onDismiss = { showPricing = false })
    }

    if (showContact) {
        ContactSheet(onDismiss = { showContact = false })
    }

    if (showLegal != null) {
        LegalSheet(doc = showLegal!!, onDismiss = { showLegal = null })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeaturesSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Features",
                fontSize = 30.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
                color = Palette.ink
            )
            Text(
                text = "These tools load from your chapter after you sign in.",
                fontSize = 15.sp,
                color = Palette.ink2
            )

            val items = listOf(
                Triple("Dues and installment plans", Icons.Default.CreditCard, "Assess dues, split them into installments, and take card or bank payments through Stripe."),
                Triple("The ledger", Icons.Default.Description, "Every charge, payment, fee, refund, and dispute posts a balanced ledger entry."),
                Triple("Chapter chat", Icons.Default.Forum, "Channels, direct messages, reactions, pins, and moderation."),
                Triple("Events and check-in", Icons.Default.QrCodeScanner, "RSVPs, required attendance, and rotating QR check-in."),
                Triple("Recruitment pipeline", Icons.Default.PersonAdd, "Stages, assignments, follow-ups, and notes that can stay with recruitment leadership."),
                Triple("Roles and permissions", Icons.Default.Security, "A fixed permission catalog. Members only see what their role allows.")
            )

            items.forEach { (title, icon, desc) ->
                GGCard(padding = 18.dp) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = Palette.accent,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = title,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Palette.ink
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = desc,
                        fontSize = 14.sp,
                        color = Palette.ink2,
                        lineHeight = 20.sp
                    )
                }
            }

            GGButton(title = "Close", fillWidth = true) { onDismiss() }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PricingSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Pricing",
                fontSize = 30.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
                color = Palette.ink
            )
            Text(
                text = "\$30.00 per month for each chapter, plus 1.5% of each dues payment a member completes online. No setup fee and no per-member charge.",
                fontSize = 15.sp,
                color = Palette.ink2,
                lineHeight = 22.sp
            )
            GGCard(padding = 18.dp) {
                Text(text = "Chapter Subscription", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "\$30.00 / month", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Palette.accent)
                Spacer(modifier = Modifier.height(6.dp))
                Text(text = "Paid by the chapter. Covers unlimited members, chat, calendar, programs, and verification.", fontSize = 13.sp, color = Palette.ink2)
            }
            GGCard(padding = 18.dp) {
                Text(text = "Online Dues Processing", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.ink)
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "1.5% platform fee", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Palette.gold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(text = "Deducted automatically when members pay dues online. GreekGeek never touches your funds — money deposits directly to your chapter bank account.", fontSize = 13.sp, color = Palette.ink2)
            }
            GGNotice(tone = Tone.INFO, message = "Offline cash and checks recorded by officers have 0% fee.")
            GGButton(title = "Close", fillWidth = true) { onDismiss() }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Contact",
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
                color = Palette.ink
            )
            Text(
                text = "Questions first? We answer every message.",
                fontSize = 15.sp,
                color = Palette.ink2
            )
            GGCard(padding = 18.dp) {
                Text(text = "Support Email", fontSize = 13.sp, color = Palette.ink3)
                Text(text = AppConfig.SUPPORT_EMAIL, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.accent)
                Spacer(modifier = Modifier.height(12.dp))
                Text(text = "Response Time", fontSize = 13.sp, color = Palette.ink3)
                Text(text = "Typically within 24 hours on business days.", fontSize = 14.sp, color = Palette.ink)
            }
            GGButton(title = "Close", fillWidth = true) { onDismiss() }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegalSheet(doc: String, onDismiss: () -> Unit) {
    val title = when (doc) {
        "chapter-agreement" -> "GreekGeek Agreement"
        "terms" -> "Terms of Service"
        else -> "Privacy Policy"
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = title,
                fontSize = 24.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
                color = Palette.ink
            )
            Text(
                text = "1. Chapter Isolation\nEvery table is isolated per chapter with database-enforced row-level security. One chapter can never read or access another's records.\n\n2. Merchant of Record\nCard and bank details are entered directly on Stripe's hosted checkout. Funds go directly to the chapter's own Stripe account. GreekGeek never stores card or bank numbers.\n\n3. Append-Only Financials\nPayment status only changes from verified Stripe webhook events. Financial records are append-only and every officer action is logged.\n\n4. Private Communications\nDirect messages and restricted recruitment notes are not visible to platform staff.",
                fontSize = 14.sp,
                color = Palette.ink2,
                lineHeight = 22.sp
            )
            GGButton(title = "Close", fillWidth = true) { onDismiss() }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
