import SwiftUI

struct AuthChrome<Content: View>: View {
    let title: String
    var description: String?
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                WordmarkView(height: 20)
                    .padding(.bottom, 28)
                Text(title)
                    .font(.system(size: 28, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink)
                if let description {
                    Text(description)
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.ink2)
                        .padding(.top, 8)
                }
                content()
                    .padding(.top, 28)
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .greekGeekScreen()
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct LoginView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false
    @State private var showForgot = false
    @State private var showSignup = false

    var body: some View {
        AuthChrome(title: "Welcome back", description: "Sign in to your chapter.") {
            VStack(alignment: .leading, spacing: 18) {
                if let error {
                    GGNotice(tone: .danger, message: error)
                }
                GGField(label: "Email") {
                    GGTextField(placeholder: "you@school.edu", text: $email, keyboard: .emailAddress, contentType: .username, submitLabel: .next)
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Password")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Palette.ink)
                        Spacer()
                        Button("Forgot password?") { showForgot = true }
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink3)
                    }
                    GGSecureField(text: $password, contentType: .password)
                }
                GGButton(title: "Sign in", fillWidth: true, busy: busy, action: submit)
                HStack(spacing: 4) {
                    Text("New to GreekGeek?")
                        .foregroundStyle(Palette.ink3)
                    Button("Create an account") { showSignup = true }
                        .foregroundStyle(Palette.accent)
                }
                .font(.system(size: 14))
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                .overlay(alignment: .top) { Palette.line.frame(height: 1).padding(.bottom, 16) }
            }
        }
        .sheet(isPresented: $showForgot) {
            NavigationStack { ForgotPasswordView() }
        }
        .sheet(isPresented: $showSignup) {
            NavigationStack { SignUpView() }
        }
    }

    private func submit() {
        error = nil
        guard email.contains("@"), password.count >= 1 else {
            error = "Enter the email and password for your account."
            return
        }
        busy = true
        Task {
            do {
                try await session.signIn(email: email, password: password)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

struct SignUpView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var fullName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var agreed = false
    @State private var error: String?
    @State private var fieldErrors: [String: String] = [:]
    @State private var sentMessage: String?
    @State private var busy = false
    @State private var showLogin = false

    var body: some View {
        AuthChrome(title: "Create your account", description: "Officers register their chapter next. Members accept their invitation right after.") {
            if let sentMessage {
                AuthStatus(title: "Check your email", message: sentMessage)
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    if let error {
                        GGNotice(tone: .danger, message: error)
                    }
                    GGField(label: "Full name", error: fieldErrors["fullName"]) {
                        GGTextField(placeholder: "Jordan Smith", text: $fullName, contentType: .name, invalid: fieldErrors["fullName"] != nil)
                    }
                    GGField(label: "Email", hint: "Officers: use your school email to verify your chapter faster.", error: fieldErrors["email"]) {
                        GGTextField(placeholder: "you@school.edu", text: $email, keyboard: .emailAddress, contentType: .emailAddress, invalid: fieldErrors["email"] != nil)
                    }
                    GGField(label: "Password", hint: "10 or more characters, with a letter and a number.", error: fieldErrors["password"]) {
                        GGSecureField(text: $password, contentType: .newPassword, invalid: fieldErrors["password"] != nil)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Toggle(isOn: $agreed) {
                            Text("I agree to the Terms and Privacy Policy.")
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.ink2)
                        }
                        .tint(Palette.accent)
                        if let terms = fieldErrors["terms"] {
                            Text(terms)
                                .font(.system(size: 13))
                                .foregroundStyle(Palette.danger)
                        }
                    }
                    .padding(14)
                    .background(Palette.surface.opacity(0.6))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Palette.line, lineWidth: 1)
                    }
                    GGButton(title: "Create account", fillWidth: true, busy: busy, action: submit)
                    HStack(spacing: 4) {
                        Text("Already have an account?")
                            .foregroundStyle(Palette.ink3)
                        Button("Sign in") { showLogin = true }
                            .foregroundStyle(Palette.accent)
                    }
                    .font(.system(size: 14))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                }
            }
        }
        .sheet(isPresented: $showLogin) {
            NavigationStack { LoginView() }
        }
    }

    private func submit() {
        fieldErrors = [:]
        error = nil
        if fullName.trimmingCharacters(in: .whitespaces).isEmpty {
            fieldErrors["fullName"] = "Enter your full name."
        }
        if !email.contains("@") {
            fieldErrors["email"] = "Enter a valid email."
        }
        if password.count < 10 || password.rangeOfCharacter(from: .letters) == nil || password.rangeOfCharacter(from: .decimalDigits) == nil {
            fieldErrors["password"] = "Use 10 or more characters, with a letter and a number."
        }
        if !agreed {
            fieldErrors["terms"] = "Agree to the Terms and Privacy Policy to continue."
        }
        guard fieldErrors.isEmpty else { return }
        busy = true
        Task {
            do {
                if let message = try await session.signUp(fullName: fullName, email: email, password: password) {
                    sentMessage = message
                } else {
                    dismiss()
                }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

struct ForgotPasswordView: View {
    @Environment(AppSession.self) private var session
    @State private var email = ""
    @State private var sent = false
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        AuthChrome(title: "Reset your password", description: "Enter the email on your account and we'll send you a link to choose a new password.") {
            if sent {
                AuthStatus(title: "Check your email", message: "If an account exists for that address, we sent a reset link.")
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    if let error {
                        GGNotice(tone: .danger, message: error)
                    }
                    GGField(label: "Email") {
                        GGTextField(placeholder: "you@school.edu", text: $email, keyboard: .emailAddress, contentType: .emailAddress)
                    }
                    GGButton(title: "Send reset link", fillWidth: true, busy: busy) {
                        guard email.contains("@") else {
                            error = "Enter the email on your account."
                            return
                        }
                        busy = true
                        Task {
                            do {
                                try await session.requestPasswordReset(email: email)
                                sent = true
                            } catch {
                                self.error = error.localizedDescription
                            }
                            busy = false
                        }
                    }
                }
            }
        }
    }
}

struct ResetPasswordView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirm = ""
    @State private var error: String?
    @State private var fieldErrors: [String: String] = [:]
    @State private var busy = false

    var body: some View {
        AuthChrome(title: "Choose a new password", description: "10 or more characters, with a letter and a number.") {
            VStack(alignment: .leading, spacing: 18) {
                if let error {
                    GGNotice(tone: .danger, message: error)
                }
                GGField(label: "New password", error: fieldErrors["password"]) {
                    GGSecureField(text: $password, contentType: .newPassword, invalid: fieldErrors["password"] != nil)
                }
                GGField(label: "Confirm password", error: fieldErrors["confirm"]) {
                    GGSecureField(text: $confirm, contentType: .newPassword, invalid: fieldErrors["confirm"] != nil)
                }
                GGButton(title: "Save password", fillWidth: true, busy: busy) {
                    fieldErrors = [:]
                    if password.count < 10 || password.rangeOfCharacter(from: .letters) == nil || password.rangeOfCharacter(from: .decimalDigits) == nil {
                        fieldErrors["password"] = "Use 10 or more characters, with a letter and a number."
                    }
                    if confirm != password {
                        fieldErrors["confirm"] = "Passwords do not match."
                    }
                    guard fieldErrors.isEmpty else { return }
                    busy = true
                    Task {
                        do {
                            try await session.updatePassword(password)
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                        }
                        busy = false
                    }
                }
            }
        }
    }
}

struct InviteAcceptView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var recruiter = "Unsure"
    private let recruiters = ["Unsure", "Marcus Hill", "Devin Ortiz", "Sam Patel"]

    var body: some View {
        AuthChrome(title: "Accept your invitation", description: "Join Alpha Beta at State University. Who recruited you is optional.") {
            VStack(alignment: .leading, spacing: 16) {
                GGField(label: "Who recruited you?") {
                    Picker("Who recruited you?", selection: $recruiter) {
                        ForEach(recruiters, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .tint(Palette.accent)
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Palette.lineStrong, lineWidth: 1)
                    }
                }
                GGButton(title: "Accept invitation", fillWidth: true) {
                    if let chapter = session.chapters.first {
                        session.openChapter(chapter)
                    }
                    session.pendingInviteToken = nil
                    dismiss()
                }
                Button("Not now") {
                    session.pendingInviteToken = nil
                    dismiss()
                }
                .font(.system(size: 14))
                .foregroundStyle(Palette.ink3)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct AuthStatus: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "envelope.badge")
                .font(.system(size: 24))
                .foregroundStyle(Palette.accent)
                .frame(width: 56, height: 56)
                .background(Palette.accentSoft)
                .overlay { Circle().stroke(Palette.accent.opacity(0.3), lineWidth: 1) }
                .clipShape(Circle())
            Text(title)
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(Palette.ink2)
                .multilineTextAlignment(.center)
            Text("It can take a minute to arrive. Check spam if you don't see it.")
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink3)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }
}

#Preview {
    NavigationStack { LoginView() }
        .environment(AppSession())
        .preferredColorScheme(.dark)
}
