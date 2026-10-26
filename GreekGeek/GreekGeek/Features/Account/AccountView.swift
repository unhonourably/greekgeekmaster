import SwiftUI

struct AccountView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var fullName = ""
    @State private var displayName = ""
    @State private var year = ""
    @State private var kinds: [NotificationKindSetting] = []
    @State private var saved = false
    @State private var notifySaved = false
    @State private var notifyError: String?
    @State private var notifyBusy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Account settings", description: session.user?.email)
                HStack {
                    PersonAvatar(name: session.profile?.personName ?? "Member", path: session.profile?.avatarPath, size: 56)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.profile?.personName ?? "Member")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        Text("Profile photo uploads use the public avatars bucket.")
                            .font(.system(size: 12))
                            .foregroundStyle(Palette.ink3)
                    }
                }
                GGCard(padding: 16) {
                    GGField(label: "Full name") {
                        GGTextField(placeholder: "Jordan Lee", text: $fullName, contentType: .name)
                    }
                    GGField(label: "Display name") {
                        GGTextField(placeholder: "Jordan", text: $displayName)
                    }
                    .padding(.top, 10)
                    GGField(label: "Graduation year") {
                        GGTextField(placeholder: "2027", text: $year, keyboard: .numberPad)
                    }
                    .padding(.top, 10)
                    if saved {
                        GGNotice(tone: .positive, message: "Saved.")
                            .padding(.top, 10)
                    }
                    GGButton(title: "Save", size: .sm) {
                        session.updateProfile(fullName: fullName, displayName: displayName, graduationYear: Int(year))
                        saved = true
                    }
                    .padding(.top, 12)
                }
                GGCard(padding: 16) {
                    Text("Notifications")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    Text("In app is the bell and banners on this phone. Chat alerts show who wrote, not the message. Email is separate.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink2)
                        .padding(.top, 6)
                    if kinds.isEmpty {
                        Text("Loading notification types…")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink3)
                            .padding(.top, 12)
                    } else {
                        ForEach(NotificationSettingGroup.allCases, id: \.rawValue) { group in
                            let indexes = kinds.indices.filter { kinds[$0].group == group.rawValue && (session.staffRole != nil || !kinds[$0].isStaffKind) }
                            if !indexes.isEmpty {
                                Text(group.rawValue)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Palette.ink3)
                                    .padding(.top, 16)
                                ForEach(indexes, id: \.self) { index in
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(kinds[index].label)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundStyle(Palette.ink)
                                        Text(kinds[index].description + (kinds[index].required ? " Always on in the app." : ""))
                                            .font(.system(size: 12))
                                            .foregroundStyle(Palette.ink3)
                                        HStack(spacing: 16) {
                                            channelToggle("App", $kinds[index].inApp, enabled: !kinds[index].required)
                                            channelToggle("Email", $kinds[index].email, enabled: true)
                                        }
                                    }
                                    .padding(.top, 12)
                                }
                            }
                        }
                    }
                    if let notifyError {
                        GGNotice(tone: .danger, message: notifyError)
                            .padding(.top, 12)
                    } else if notifySaved {
                        GGNotice(tone: .positive, message: "Notification settings saved.")
                            .padding(.top, 12)
                    }
                    GGButton(title: "Save notification settings", size: .sm, busy: notifyBusy) {
                        Task { await saveNotifications() }
                    }
                    .padding(.top, 12)
                }
                GGButton(title: "Sign out", kind: .secondary, fillWidth: true) {
                    session.signOut()
                    dismiss()
                }
                Text("Account deletion is available on the website under Account settings. Deletion erases profile details and messages and keeps payment records in anonymized form.")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.ink3)
            }
            .padding(16)
        }
        .greekGeekScreen()
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
                    .foregroundStyle(Palette.ink2)
            }
        }
        .onAppear {
            fullName = session.profile?.fullName ?? ""
            displayName = session.profile?.displayName ?? ""
            if let yearValue = session.profile?.graduationYear {
                year = String(yearValue)
            }
        }
        .task {
            kinds = await session.loadNotificationSettings()
        }
    }

    private func channelToggle(_ title: String, _ isOn: Binding<Bool>, enabled: Bool) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.ink3)
            MiniSwitch(isOn: isOn, enabled: enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(enabled ? 1 : 0.45)
    }

    private func saveNotifications() async {
        notifyBusy = true
        notifySaved = false
        let error = await session.saveNotificationSettings(kinds)
        notifyError = error
        notifySaved = error == nil
        notifyBusy = false
    }
}

private struct MiniSwitch: View {
    @Binding var isOn: Bool
    var enabled: Bool = true

    var body: some View {
        Button {
            guard enabled else { return }
            isOn.toggle()
        } label: {
            Capsule()
                .fill(isOn ? Palette.accent : Palette.lineStrong)
                .frame(width: 36, height: 20)
                .overlay(alignment: isOn ? .trailing : .leading) {
                    Circle()
                        .fill(isOn ? Palette.onAccent : Palette.ink)
                        .frame(width: 16, height: 16)
                        .padding(2)
                }
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(isOn ? "On" : "Off")
        .accessibilityAddTraits(.isButton)
        .animation(.easeInOut(duration: 0.15), value: isOn)
    }
}

struct NotificationsView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if session.notifications.isEmpty {
                Text("You are all caught up.")
                    .foregroundStyle(Palette.ink3)
                    .listRowBackground(Palette.surface)
            } else {
                ForEach(session.notifications) { item in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(item.readAt == nil ? Palette.accent : Palette.lineStrong)
                            .frame(width: 6, height: 6)
                            .padding(.top, 6)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.displayTitle)
                                .font(.system(size: 14, weight: item.readAt == nil ? .semibold : .regular))
                                .foregroundStyle(Palette.ink)
                            if !item.displayBody.isEmpty {
                                Text(item.displayBody)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.ink2)
                            }
                            Text(DateFormat.relative(item.createdAt))
                                .font(.system(size: 12))
                                .foregroundStyle(Palette.ink3)
                        }
                    }
                    .listRowBackground(Palette.surface)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
                    .foregroundStyle(Palette.ink2)
            }
        }
        .onAppear { session.markNotificationsRead() }
    }
}
