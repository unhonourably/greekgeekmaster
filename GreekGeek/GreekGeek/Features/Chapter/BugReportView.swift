import SwiftUI

struct BugReportView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    var page: String
    @State private var message = ""
    @State private var expected = ""
    @State private var impact = "annoying"
    @State private var error: String?
    @State private var sent = false
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    GGPageHeader(title: "Report a bug", description: "Tell us what broke. This goes to GreekGeek support, not your chapter officers.")
                    if sent {
                        GGNotice(tone: .positive, title: "Sent", message: "Thanks. We logged it and will look at it.")
                        GGButton(title: "Close", kind: .secondary, fillWidth: true) { dismiss() }
                    } else {
                        GGField(label: "What happened") {
                            GGTextArea(placeholder: "What you tapped, what you expected, and what you saw instead.", text: $message, minHeight: 140)
                        }
                        GGField(label: "What should have happened") {
                            GGTextArea(placeholder: "Optional", text: $expected, minHeight: 80)
                        }
                        Picker("How bad is it", selection: $impact) {
                            Text("It stops me").tag("blocked")
                            Text("I can work around it").tag("annoying")
                            Text("Small or cosmetic").tag("minor")
                        }
                        .pickerStyle(.segmented)
                        if let error { GGNotice(tone: .danger, message: error) }
                        Text("Page: \(page)")
                            .font(.system(size: 12))
                            .foregroundStyle(Palette.ink3)
                        GGButton(title: "Send report", fillWidth: true, busy: busy) {
                            Task { await submit() }
                        }
                    }
                }
                .padding(20)
            }
            .greekGeekScreen()
            .navigationTitle("Bug report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundStyle(Palette.ink2)
                }
            }
        }
    }

    private func submit() async {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 10 else {
            error = "Add a little more detail, at least 10 characters."
            return
        }
        let impactLabel = [
            "blocked": "It stops me from doing something",
            "annoying": "I can work around it",
            "minor": "Small or cosmetic"
        ][impact] ?? impact
        let report = [
            trimmed,
            expected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "Expected: \(expected)",
            "Impact: \(impactLabel)"
        ].filter { !$0.isEmpty }.joined(separator: "\n\n")
        busy = true
        error = await session.submitBugReport(message: report, page: page)
        busy = false
        if error == nil { sent = true }
    }
}
