import SwiftUI

enum MarketingPage: Hashable {
    case features
    case contact
    case pricing
    case legal(String)
}

struct MarketingHomeView: View {
    @State private var path = NavigationPath()
    @State private var showLogin = false
    @State private var showSignup = false

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    hero
                    tryBefore
                    officers
                    gettingStarted
                    closing
                    footer
                }
            }
            .greekGeekScreen()
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Palette.canvas, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    WordmarkView(height: 20)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign in") { showLogin = true }
                        .foregroundStyle(Palette.ink2)
                }
            }
            .navigationDestination(for: MarketingPage.self) { page in
                switch page {
                case .features: FeaturesView()
                case .contact: ContactView()
                case .pricing: PricingView()
                case .legal(let doc): LegalView(doc: doc)
                }
            }
        }
        .sheet(isPresented: $showLogin) {
            NavigationStack { LoginView() }
        }
        .sheet(isPresented: $showSignup) {
            NavigationStack { SignUpView() }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("The chapter office, handled.")
                .font(.system(size: 34, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Collect dues, keep books that reconcile, and run members, chat, events, and recruitment from one verified account.")
                .font(.system(size: 17))
                .foregroundStyle(Palette.ink2)
            VStack(spacing: 10) {
                GGButton(title: "Register your chapter", fillWidth: true) { showSignup = true }
                GGButton(title: "See the features", kind: .secondary, fillWidth: true) { path.append(MarketingPage.features) }
            }
            Text("Members joining an existing chapter should use the invitation from their officers.")
                .font(.system(size: 14))
                .foregroundStyle(Palette.ink3)
            HStack(spacing: 16) {
                Button("Features") { path.append(MarketingPage.features) }
                Button("Pricing") { path.append(MarketingPage.pricing) }
                Button("Contact") { path.append(MarketingPage.contact) }
            }
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Palette.ink2)
            .padding(.top, 8)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
        .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
    }

    private var tryBefore: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Already in a chapter?")
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
            Text("Sign in with the email your officers invited. Your dues, events, and messages load from your chapter.")
                .font(.system(size: 16))
                .foregroundStyle(Palette.ink2)
            GGButton(title: "Sign in", kind: .secondary) { showLogin = true }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
        .background(Palette.surface.opacity(0.45))
        .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
    }

    private var officers: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("What your officers get")
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
            ForEach(modules, id: \.0) { item in
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: item.1)
                        .foregroundStyle(Palette.accent)
                    Text(item.0)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    Text(item.2)
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.ink2)
                }
            }
            GGButton(title: "See every feature in action", kind: .secondary) {
                path.append(MarketingPage.features)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
    }

    private var gettingStarted: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Getting started")
                    .font(.system(size: 26, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 14) {
                        Text("\(index + 1)")
                            .font(.system(size: 13, weight: .medium).monospacedDigit())
                            .foregroundStyle(Palette.ink)
                            .frame(width: 28, height: 28)
                            .overlay {
                                Circle().stroke(Palette.lineStrong, lineWidth: 1)
                            }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.0)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.ink)
                            Text(step.1)
                                .font(.system(size: 14))
                                .foregroundStyle(Palette.ink2)
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 16) {
                Text("How your data is protected")
                    .font(.system(size: 26, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                ForEach(protections, id: \.0) { item in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: item.1)
                            .foregroundStyle(Palette.accent)
                            .padding(.top, 2)
                        Text(item.0)
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.ink2)
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
        .background(Palette.surface)
        .overlay(alignment: .top) { Palette.line.frame(height: 1) }
        .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
    }

    private var closing: some View {
        VStack(spacing: 14) {
            Text("Ready when your chapter is")
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            Text("Register, get verified, and invite your members. Questions first? We answer every message.")
                .font(.system(size: 15))
                .foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center)
            VStack(spacing: 10) {
                GGButton(title: "Register your chapter", fillWidth: true) { showSignup = true }
                GGButton(title: "Talk to us", kind: .secondary, fillWidth: true) { path.append(MarketingPage.contact) }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 36)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("\(AppConfig.legalName). Payments are processed by Stripe. \(AppConfig.brandName) never stores card or bank numbers.")
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink3)
            HStack(spacing: 14) {
                Button("Features") { path.append(MarketingPage.features) }
                Button("Contact") { path.append(MarketingPage.contact) }
                Button("Pricing") { path.append(MarketingPage.pricing) }
            }
            .font(.system(size: 13))
            .foregroundStyle(Palette.ink3)
            HStack(spacing: 14) {
                Button("GreekGeek agreement") { path.append(MarketingPage.legal("chapter-agreement")) }
                Button("Terms") { path.append(MarketingPage.legal("terms")) }
                Button("Privacy") { path.append(MarketingPage.legal("privacy")) }
            }
            .font(.system(size: 13))
            .foregroundStyle(Palette.ink3)
            HStack(spacing: 12) {
                ForEach(AppConfig.socials, id: \.name) { social in
                    Link(social.name, destination: social.url)
                }
            }
            .font(.system(size: 13))
            .foregroundStyle(Palette.ink3)
        }
        .padding(24)
        .overlay(alignment: .top) { Palette.line.frame(height: 1) }
    }

    private var modules: [(String, String, String)] {[
        ("Dues and payments", "dollarsign.circle", "Assess dues, offer installment plans, record cash and checks, issue credits, and accept card or bank payments through Stripe."),
        ("An auditable ledger", "doc.text", "Every charge, payment, fee, refund, and dispute is a balanced ledger entry. Treasurers can reconcile against Stripe and hand off clean books."),
        ("Member records", "person.2", "Profiles, member classes, officer history, and a searchable directory with privacy controls each member sets for themselves."),
        ("Chapter chat", "bubble.left.and.bubble.right", "Channels, direct messages, threads, mentions, and moderation tools. Channels can fill themselves from membership, officer roles, or alumni status."),
        ("Events and attendance", "calendar.badge.checkmark", "RSVPs, capacity limits, QR check-in, required-attendance tracking, and corrections with a reason on record."),
        ("Recruitment", "person.badge.plus", "A pipeline for prospects with stages, assignments, follow-ups, and notes that can be restricted to recruitment leadership."),
        ("Standards and operations", "list.clipboard", "Policy acknowledgments, training, confidential incident reports, philanthropy hours, and budgets."),
        ("Chapter housing", "bed.double", "Rooms and beds, move-ins and move-outs, roommate requests, a live occupancy view, and rent billed straight to residents."),
        ("Verified chapters", "checkmark.seal", "Every chapter is reviewed before it can collect money or invite members, so the account you join is the real one.")
    ]}

    private var steps: [(String, String)] {[
        ("Apply", "An officer creates an account and submits the chapter's details and a way to confirm them."),
        ("Verification", "We review the application, check for existing chapters, and may ask for more information. You can follow every step."),
        ("Agreement, subscription, and payouts", "An administrator accepts the pricing agreement, starts the monthly subscription, and connects the chapter's bank account through Stripe."),
        ("Invite members", "Send invitations or import a roster. Members only see what their role allows.")
    ]}

    private var protections: [(String, String)] {[
        ("Every table is isolated per chapter with database-enforced row-level security, so one chapter can never read another's records.", "checkmark.shield"),
        ("Card and bank details are entered on Stripe's hosted checkout. Funds go to the chapter's own Stripe account.", "building.columns"),
        ("Payment status only changes from verified Stripe events. Financial records are append-only and every officer action is logged.", "doc.text"),
        ("Direct messages and restricted recruitment notes are not visible to platform staff.", "bubble.left.and.bubble.right")
    ]}
}

struct FeaturesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Features")
                    .font(.system(size: 34, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                Text("These tools load from your chapter after you sign in.")
                    .font(.system(size: 16))
                    .foregroundStyle(Palette.ink2)
                ForEach(items, id: \.0) { item in
                    GGCard(padding: 20) {
                        Image(systemName: item.1)
                            .foregroundStyle(Palette.accent)
                        Text(item.0)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                            .padding(.top, 8)
                        Text(item.2)
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.ink2)
                            .padding(.top, 4)
                            .multilineTextAlignment(.leading)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 28)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
    }

    private var items: [(String, String, String)] {[
        ("Dues and installment plans", "creditcard", "Assess dues, split them into installments, and take card or bank payments through Stripe."),
        ("The ledger", "doc.text", "Every charge, payment, fee, refund, and dispute posts a balanced ledger entry."),
        ("Chapter chat", "bubble.left.and.bubble.right", "Channels, direct messages, reactions, pins, and moderation."),
        ("Events and check-in", "qrcode.viewfinder", "RSVPs, required attendance, and rotating QR check-in."),
        ("Recruitment pipeline", "person.badge.plus", "Stages, assignments, follow-ups, and notes that can stay with recruitment leadership."),
        ("Roles and permissions", "lock.shield", "A fixed permission catalog. Members only see what their role allows.")
    ]}
}

struct PricingView: View {
    @State private var pricing = PublishedPricing.builtIn
    @State private var members = "60"
    @State private var dues = "450"
    @State private var method = "card"
    @State private var parts = 1
    @State private var months = 4
    @State private var showSignup = false

    var body: some View {
        let pct = PlatformFees.percentLabel(pricing.feeBps)
        let monthly = MoneyFormat.cents(pricing.monthlyCents)
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Pricing")
                    .font(.system(size: 34, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                Text("\(monthly) per month for each chapter, plus \(pct) of each dues payment a member completes online. No setup fee and no per-member charge.")
                    .font(.system(size: 16))
                    .foregroundStyle(Palette.ink2)
                GGCard {
                    HStack(spacing: 0) {
                        priceCell("Subscription", value: monthly, caption: "per chapter, per \(pricing.interval)")
                        Palette.line.frame(width: 1)
                        priceCell("Platform fee", value: pct, caption: "of online dues payments")
                    }
                    .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(pricing.features, id: \.self) { feature in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(Palette.positive)
                                Text(feature)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Palette.ink)
                            }
                        }
                    }
                    .padding(20)
                    GGButton(title: "Register your chapter", fillWidth: true) { showSignup = true }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                    Text("Billing starts when your administrator activates the subscription after verification. Cancel any time; access continues to the end of the paid month.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink3)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                }
                GGCard(padding: 20) {
                    Text("What the \(pct) platform fee applies to")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    Text("Platform fee applies")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.ink3)
                        .padding(.top, 12)
                    ForEach(["Dues paid online by card", "Dues paid online by bank transfer", "Each installment, on its own amount"], id: \.self) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "checkmark").foregroundStyle(Palette.ink2)
                            Text(item).font(.system(size: 14)).foregroundStyle(Palette.ink)
                        }
                        .padding(.top, 6)
                    }
                    Text("No platform fee")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.ink3)
                        .padding(.top, 14)
                    ForEach([
                        "Cash, check, or other offline payments you record",
                        "Credits, waivers, and adjustments",
                        "Assessments that are never paid",
                        "Failed or canceled payments",
                        "Donations recorded in philanthropy tools"
                    ], id: \.self) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "minus").foregroundStyle(Palette.ink3)
                            Text(item).font(.system(size: 14)).foregroundStyle(Palette.ink)
                        }
                        .padding(.top, 6)
                    }
                    VStack(spacing: 8) {
                        HStack {
                            Text("Dues payment").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                            Spacer()
                            Text("Platform fee").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        }
                        ForEach(feeExamples, id: \.self) { amount in
                            HStack {
                                Text(MoneyFormat.cents(amount)).foregroundStyle(Palette.ink)
                                Spacer()
                                Text(MoneyFormat.cents(platformFee(amount))).foregroundStyle(Palette.ink)
                            }
                            .font(.system(size: 14).monospacedDigit())
                        }
                    }
                    .padding(.top, 16)
                }
                GGCard(padding: 20) {
                    Text("Estimate your chapter's cost")
                        .font(.system(size: 20, weight: .semibold, design: .serif))
                        .foregroundStyle(Palette.ink)
                    Text("Adjust the numbers to match your chapter.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink2)
                        .padding(.bottom, 8)
                    GGField(label: "Dues per member") { GGTextField(placeholder: "450", text: $dues, keyboard: .decimalPad) }
                    GGField(label: "Members paying online") { GGTextField(placeholder: "60", text: $members, keyboard: .numberPad) }
                        .padding(.top, 8)
                    Picker("Payment method", selection: $method) {
                        Text("Card").tag("card")
                        Text("US bank account (ACH)").tag("us_bank_account")
                    }
                    .tint(Palette.accent)
                    .padding(.top, 4)
                    Text("Bank payments (ACH) cost less to process but take several business days to clear.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink3)
                    Picker("Paid in", selection: $parts) {
                        Text("One payment").tag(1)
                        Text("2 installments").tag(2)
                        Text("3 installments").tag(3)
                        Text("4 installments").tag(4)
                    }
                    .tint(Palette.accent)
                    Text("Each installment is charged the platform fee on its own amount.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink3)
                    Picker("Months in the term", selection: $months) {
                        Text("1 month").tag(1)
                        Text("4 months (semester)").tag(4)
                        Text("5 months").tag(5)
                        Text("9 months (academic year)").tag(9)
                        Text("12 months").tag(12)
                    }
                    .tint(Palette.accent)
                    if let result = estimate {
                        VStack(alignment: .leading, spacing: 8) {
                            estimateRow("Collected from members", MoneyFormat.cents(result.gross), emphasize: true)
                            estimateRow("Platform fee", "−\(MoneyFormat.cents(result.platform))", hint: "About \(MoneyFormat.cents(result.perMember)) per member")
                            estimateRow("Stripe processing (estimate)", "−\(MoneyFormat.cents(result.processing))", hint: method == "card" ? "Based on 2.9% + 30¢ per card payment" : "Based on 0.8% per payment, capped at $5")
                            estimateRow("Subscription", "−\(MoneyFormat.cents(result.subscription))", hint: "\(monthly) × \(months) \(months == 1 ? "month" : "months"), billed separately")
                            estimateRow("Estimated net to the chapter", MoneyFormat.cents(result.net), emphasize: true)
                        }
                        .padding(.top, 12)
                    } else {
                        Text("Enter dues and member count to see an estimate.")
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.ink3)
                            .padding(.top, 12)
                    }
                    Text("Processing estimates use Stripe’s published standard US pricing and may differ for your account. Your actual Stripe fees appear on each payment in your ledger.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink3)
                        .padding(.top, 10)
                }
                ForEach(faqs, id: \.0) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.0)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        Text(item.1)
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.ink2)
                    }
                }
                NavigationLink {
                    LegalView(doc: "chapter-agreement")
                } label: {
                    Text("Read the full chapter services and pricing agreement")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink2)
                }
            }
            .padding(24)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
        .task { pricing = await PublishedPricingClient.load() }
        .sheet(isPresented: $showSignup) {
            NavigationStack { SignUpView() }
        }
    }

    private var feeExamples: [Int] {
        var amounts = [10_000, 25_000, 45_000, 80_000]
        if let duesCents, !amounts.contains(duesCents) {
            amounts.append(duesCents)
            amounts.sort()
        }
        return amounts
    }

    private var duesCents: Int? {
        MoneyFormat.dollarsToCents(dues)
    }

    private var memberCount: Int? {
        let cleaned = members.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        guard let value = Int(cleaned), value > 0, value <= 10_000 else { return nil }
        return value
    }

    private var estimate: (gross: Int, platform: Int, processing: Int, subscription: Int, net: Int, perMember: Int)? {
        guard let duesCents, let memberCount, duesCents >= 50, duesCents <= 10_000_000 else { return nil }
        let base = duesCents / parts
        let last = duesCents - base * (parts - 1)
        let regularCount = memberCount * (parts - 1)
        let regularPlatform = platformFee(base) * regularCount
        let regularProcessing = PlatformFees.processingFee(amountCents: base, method: method) * regularCount
        let finalPlatform = platformFee(last) * memberCount
        let finalProcessing = PlatformFees.processingFee(amountCents: last, method: method) * memberCount
        let gross = duesCents * memberCount
        let platform = regularPlatform + finalPlatform
        let processing = regularProcessing + finalProcessing
        let subscription = pricing.monthlyCents * months
        return (
            gross,
            platform,
            processing,
            subscription,
            gross - platform - processing - subscription,
            Int((Double(platform) / Double(max(memberCount, 1))).rounded())
        )
    }

    private func platformFee(_ amount: Int) -> Int {
        PlatformFees.platformFee(amountCents: amount, bps: pricing.feeBps, fixedCents: pricing.fixedCents, minCents: pricing.minCents, maxCents: pricing.maxCents)
    }

    private func priceCell(_ label: String, value: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Palette.ink3)
            Text(value)
                .font(.system(size: 28, weight: .semibold, design: .serif).monospacedDigit())
                .foregroundStyle(Palette.ink)
            Text(caption)
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func estimateRow(_ label: String, _ value: String, emphasize: Bool = false, hint: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .foregroundStyle(emphasize ? Palette.ink : Palette.ink2)
                if let hint {
                    Text(hint)
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.ink3)
                }
            }
            Spacer()
            Text(value)
                .font(.body.monospacedDigit())
                .foregroundStyle(Palette.ink)
        }
        .font(emphasize ? .system(size: 15, weight: .semibold) : .system(size: 14))
    }

    private var faqs: [(String, String)] {
        let monthly = MoneyFormat.cents(pricing.monthlyCents)
        let refund = pricing.refundPolicy == "proportional"
            ? "We return the matching share of our platform fee automatically. Stripe does not return its processing fee on refunds. Subscription fees are not affected."
            : "The platform fee is not returned on refunds. Stripe does not return its processing fee either."
        return [
            ("How is the subscription billed?", "\(monthly) is charged to the card your administrator adds, once a month in advance. It is billed to the chapter, never to individual members, and is separate from dues."),
            ("Is the subscription required?", "Yes. Officers can look through setup before subscribing, but those steps cannot be changed until the chapter subscription is active. Online dues collection also stays off until Stripe is connected. If a later subscription payment fails, online collection pauses until it is paid, and your records stay available."),
            ("Who pays Stripe's processing fees?", "The chapter. Stripe deducts its processing fee from each dues payment before funds reach your Stripe balance. Members pay exactly the amount they owe; we do not add surcharges."),
            ("What happens when we refund a member?", refund),
            ("What about disputes?", "If a member disputes a payment with their bank, Stripe withdraws the amount and a dispute fee from your Stripe balance. The platform fee is not returned. You can respond to disputes in your Stripe Dashboard."),
            ("Can pricing change?", "Not without notice. Your administrator accepts a specific, versioned agreement, and any change to the subscription price or platform fee requires accepting a new version.")
        ]
    }
}

struct ContactView: View {
    @State private var name = ""
    @State private var email = ""
    @State private var message = ""
    @State private var sent = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Contact")
                    .font(.system(size: 34, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                Text("GreekGeek is a student project. Amare and Owen are students at the University of Missouri, and we read every note.")
                    .font(.system(size: 16))
                    .foregroundStyle(Palette.ink2)
                ForEach(people, id: \.0) { person in
                    GGCard(padding: 18) {
                        Text(person.0)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Palette.ink)
                        ForEach(person.1, id: \.1) { row in
                            HStack {
                                Text(row.0)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink3)
                                Spacer()
                                Link(row.1, destination: URL(string: "mailto:\(row.1)")!)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Palette.ink)
                            }
                            .padding(.top, 8)
                        }
                    }
                }
                GGCard(padding: 20) {
                    Text("Send a note")
                        .font(.system(size: 22, weight: .semibold, design: .serif))
                        .foregroundStyle(Palette.ink)
                    Text("It goes to the inboxes you pick. We reply from those addresses.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink2)
                        .padding(.bottom, 8)
                    if sent {
                        GGNotice(tone: .positive, title: "Sent", message: "We read every note and will reply from those addresses.")
                    } else {
                        GGField(label: "Name") { GGTextField(placeholder: "Your name", text: $name) }
                            .padding(.bottom, 10)
                        GGField(label: "Email") { GGTextField(placeholder: "you@school.edu", text: $email, keyboard: .emailAddress, contentType: .emailAddress) }
                            .padding(.bottom, 10)
                        GGField(label: "Message") {
                            TextEditor(text: $message)
                                .scrollContentBackground(.hidden)
                                .foregroundStyle(Palette.ink)
                                .frame(minHeight: 120)
                                .padding(10)
                                .background(Palette.surface)
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .stroke(Palette.lineStrong, lineWidth: 1)
                                }
                        }
                        .padding(.bottom, 14)
                        GGButton(title: "Send", fillWidth: true) {
                            sent = true
                            if let url = URL(string: "mailto:amare@greekgeek.org?subject=GreekGeek&body=\(message.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") {
                                UIApplication.shared.open(url)
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
    }

    private var people: [(String, [(String, String)])] {[
        ("Amare", [("GreekGeek", "amare@greekgeek.org"), ("Student", "ac5vh@umsystem.edu")]),
        ("Owen", [("GreekGeek", "owen@greekgeek.org"), ("Student", "ochng@umsystem.edu")])
    ]}
}

struct LegalView: View {
    let doc: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(title)
                    .font(.system(size: 30, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                Text("Published by platform staff from the live GreekGeek database. This app shows the current public summary. The binding copy lives at greekgeek.org/legal/\(doc).")
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.ink2)
                ForEach(paragraphs, id: \.self) { paragraph in
                    Text(paragraph)
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.ink2)
                }
                Link("Read the full document on the web", destination: AppConfig.appURL.appending(path: "legal/\(doc)"))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.accent)
            }
            .padding(24)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
    }

    private var title: String {
        switch doc {
        case "privacy": return "Privacy Policy"
        case "chapter-agreement": return "Chapter services and pricing agreement"
        default: return "Terms of Service"
        }
    }

    private var paragraphs: [String] {
        switch doc {
        case "privacy":
            return [
                "GreekGeek stores the account, chapter, and activity data needed to run your chapter. Members can edit their profile, download their personal data, and delete their account from Account settings.",
                "Card and bank numbers are entered on Stripe Checkout and are never stored by GreekGeek. Direct messages and restricted recruitment notes are not visible to platform staff.",
                "Deletion erases profile details, messages, and verification documents, releases the email address, and keeps payment and ledger records in anonymized form."
            ]
        case "chapter-agreement":
            return [
                "Each chapter pays a $30 monthly subscription and a 1.5% platform fee on online dues payments. The chapter is the merchant of record for its own dues through Stripe Connect.",
                "An administrator must accept this agreement, start the subscription, and connect payouts before the chapter can collect money.",
                "Pricing is versioned. A change to the subscription or platform fee requires accepting a new agreement."
            ]
        default:
            return [
                "GreekGeek is a management platform for fraternity and sorority chapters. By creating an account you agree to use the service lawfully and to keep login credentials private.",
                "Chapters are verified by platform staff before they can collect money or invite members. Officers remain responsible for university and national reporting obligations, including hazing and Title IX.",
                "GreekGeek is not a substitute for campus emergency, Title IX, or national organization channels."
            ]
        }
    }
}

#Preview("Marketing") {
    MarketingHomeView()
        .environment(AppSession())
        .preferredColorScheme(.dark)
}
