import SwiftUI

struct OnboardingView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var step = 1
    @State private var kind: ApplicationKind = .newChapter
    @State private var organization = ""
    @State private var designation = ""
    @State private var university = ""
    @State private var role = "president"
    @State private var submitted = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: submitted ? "Application submitted" : "Register a chapter", description: submitted ? "We review every chapter before it can invite members or collect dues." : "Step \(step) of 5")
                if submitted {
                    GGNotice(tone: .positive, title: "Under review", message: "A reviewer will check for existing chapters and may ask for more information. You can follow every step from Home.")
                    GGButton(title: "Done", fillWidth: true) { dismiss() }
                } else {
                    ProgressView(value: Double(step), total: 5)
                        .tint(Palette.accent)
                    switch step {
                    case 1: kindStep
                    case 2: chapterStep
                    case 3: schoolStep
                    case 4: roleStep
                    default: reviewStep
                    }
                    HStack {
                        if step > 1 {
                            GGButton(title: "Back", kind: .secondary) { step -= 1 }
                        }
                        Spacer()
                        GGButton(title: step == 5 ? "Submit" : "Continue") {
                            if step < 5 {
                                step += 1
                            } else {
                                submit()
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationTitle("Onboarding")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { dismiss() }
                    .foregroundStyle(Palette.ink2)
            }
        }
    }

    private var kindStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What are you applying for?")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.ink)
            ForEach([ApplicationKind.newChapter, .claimExisting, .recovery], id: \.self) { item in
                Button {
                    kind = item
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.label)
                                .foregroundStyle(Palette.ink)
                            Text(kindBlurb(item))
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.ink2)
                        }
                        Spacer()
                        Image(systemName: kind == item ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(kind == item ? Palette.accent : Palette.ink3)
                    }
                    .padding(14)
                    .background(Palette.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(kind == item ? Palette.accent : Palette.line, lineWidth: 1)
                    }
                }
            }
        }
    }

    private var chapterStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            GGField(label: "Organization name") {
                GGTextField(placeholder: "Alpha Beta", text: $organization)
            }
            GGField(label: "Designation") {
                GGTextField(placeholder: "Alpha Chapter", text: $designation)
            }
        }
    }

    private var schoolStep: some View {
        GGField(label: "University", hint: "Matching U.S. schools are added from the public university-domains-list dataset.") {
            GGTextField(placeholder: "State University", text: $university)
        }
    }

    private var roleStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your officer role")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Palette.ink)
            ForEach(roles, id: \.0) { item in
                Button {
                    role = item.0
                } label: {
                    HStack {
                        Text(item.1)
                            .foregroundStyle(Palette.ink)
                        Spacer()
                        Image(systemName: role == item.0 ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(role == item.0 ? Palette.accent : Palette.ink3)
                    }
                    .padding(12)
                    .background(Palette.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Palette.line, lineWidth: 1)
                    }
                }
            }
        }
    }

    private var reviewStep: some View {
        GGCard(padding: 16) {
            row("Kind", kind.label)
            row("Organization", organization.ifEmpty("—"))
            row("Designation", designation.ifEmpty("—"))
            row("University", university.ifEmpty("—"))
            row("Your role", roles.first(where: { $0.0 == role })?.1 ?? role)
            Text("Reviewers cannot decide their own application. Use a second staff account to approve.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.ink3)
                .padding(.top, 8)
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Palette.ink3)
            Spacer()
            Text(value).foregroundStyle(Palette.ink)
        }
        .font(.system(size: 14))
        .padding(.vertical, 5)
    }

    private func kindBlurb(_ kind: ApplicationKind) -> String {
        switch kind {
        case .newChapter: return "Start a new verified chapter on GreekGeek."
        case .claimExisting: return "Claim a listed chapter you already belong to."
        case .recovery: return "Recover administrator access to an existing chapter."
        }
    }

    private func submit() {
        session.applications.insert(
            ChapterApplication(
                id: UUID().uuidString,
                kind: kind,
                status: .pendingVerification,
                organizationName: organization,
                designation: designation,
                universityName: university,
                updatedAt: Date()
            ),
            at: 0
        )
        submitted = true
    }

    private var roles: [(String, String)] {[
        ("president", "President"),
        ("vice_president", "Vice president"),
        ("treasurer", "Treasurer"),
        ("secretary", "Secretary"),
        ("recruitment_chair", "Recruitment chair"),
        ("risk_management_chair", "Risk management chair"),
        ("advisor", "Chapter advisor"),
        ("other_officer", "Other officer")
    ]}
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}
