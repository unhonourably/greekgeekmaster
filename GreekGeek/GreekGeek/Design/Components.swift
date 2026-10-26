import SwiftUI

struct GGButton: View {
    enum Kind {
        case primary
        case secondary
        case ghost
        case danger
    }

    enum Size {
        case sm
        case md
    }

    let title: String
    var icon: String?
    var kind: Kind = .primary
    var size: Size = .md
    var fillWidth: Bool = false
    var busy: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy {
                    ProgressView()
                        .tint(foreground)
                } else if let icon {
                    Image(systemName: icon)
                }
                Text(title)
            }
            .font(size == .sm ? .system(size: 13, weight: .semibold) : .system(size: 15, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(maxWidth: fillWidth ? .infinity : nil)
            .padding(.horizontal, size == .sm ? 12 : 16)
            .frame(height: size == .sm ? 34 : 44)
            .background(background)
            .overlay {
                if kind == .secondary || kind == .ghost {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Palette.lineStrong, lineWidth: 1)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private var foreground: Color {
        switch kind {
        case .primary: return Palette.onAccent
        case .secondary, .ghost: return Palette.ink
        case .danger: return Palette.danger
        }
    }

    private var background: Color {
        switch kind {
        case .primary: return Palette.accent
        case .secondary: return Palette.surface
        case .ghost: return .clear
        case .danger: return Palette.dangerSoft
        }
    }
}

struct GGBadge: View {
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(tone.foreground)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(tone.soft)
            .overlay {
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .stroke(tone.foreground.opacity(0.2), lineWidth: 1)
            }
            .clipShape(Capsule())
    }
}

struct GGNotice: View {
    var tone: Tone = .info
    var title: String?
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let title {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.ink)
            }
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(tone.soft)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(tone.foreground.opacity(0.25), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct GGCard<Content: View>: View {
    var padding: CGFloat = 0
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Palette.line, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct GGCardHeader: View {
    let title: String
    var description: String?
    var action: String?
    var actionHandler: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                if let description {
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.ink3)
                }
            }
            Spacer(minLength: 12)
            if let action, let actionHandler {
                Button(action, action: actionHandler)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink3)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            Palette.line.frame(height: 1)
        }
    }
}

struct GGPageHeader: View {
    let title: String
    var description: String?
    var trailing: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                if let description {
                    Text(description)
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.system(size: 26, weight: .semibold, design: .serif))
                    .foregroundStyle(Palette.ink3)
            }
        }
        .padding(.bottom, 8)
    }
}

struct GGField<Content: View>: View {
    let label: String
    var hint: String?
    var error: String?
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Palette.ink)
            content()
            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.danger)
            } else if let hint {
                Text(hint)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.ink3)
            }
        }
    }
}

struct GGTextArea: View {
    var placeholder: String = ""
    @Binding var text: String
    var minHeight: CGFloat = 96

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(Palette.ink3)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
            }
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .foregroundStyle(Palette.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(minHeight: minHeight)
        }
        .background(Palette.surface)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Palette.lineStrong, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct GGTextField: View {
    var placeholder: String = ""
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var submitLabel: SubmitLabel = .next
    var invalid: Bool = false

    var body: some View {
        TextField(placeholder, text: $text)
            .textContentType(contentType)
            .keyboardType(keyboard)
            .textInputAutocapitalization(keyboard == .emailAddress ? .never : .words)
            .autocorrectionDisabled(keyboard == .emailAddress)
            .submitLabel(submitLabel)
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Palette.surface)
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(invalid ? Palette.danger : Palette.lineStrong, lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct GGSecureField: View {
    var placeholder: String = ""
    @Binding var text: String
    var contentType: UITextContentType = .password
    var invalid: Bool = false
    @State private var visible = false

    var body: some View {
        HStack(spacing: 0) {
            Group {
                if visible {
                    TextField(placeholder, text: $text)
                } else {
                    SecureField(placeholder, text: $text)
                }
            }
            .textContentType(contentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .foregroundStyle(Palette.ink)
            Button {
                visible.toggle()
            } label: {
                Image(systemName: visible ? "eye.slash" : "eye")
                    .foregroundStyle(Palette.ink3)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(visible ? "Hide password" : "Show password")
        }
        .padding(.leading, 14)
        .background(Palette.surface)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(invalid ? Palette.danger : Palette.lineStrong, lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct GGDesktopHint: View {
    var title: String = "Better on a computer"
    var message: String = "This screen is built for a phone. Ledger exports, CSV downloads, and the full officer tools stay on the website."

    var body: some View {
        Text("There are more settings on the website at greekgeek.org")
            .font(.system(size: 13))
            .foregroundStyle(Palette.ink3)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct GGScreenStack<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                content()
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 36)
        }
        .greekGeekScreen()
    }
}

struct GGEmptyState: View {
    let icon: String
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(Palette.ink3)
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.ink)
            if let message {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink3)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(28)
    }
}

struct PersonAvatar: View {
    let name: String
    var path: String? = nil
    var size: CGFloat = 36

    var body: some View {
        ZStack {
            Text(initials)
                .font(.system(size: size * 0.36, weight: .semibold))
                .foregroundStyle(Palette.accent)
                .frame(width: size, height: size)
                .background(Palette.accentSoft)
            if let url = AvatarURL.publicFile(path) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        Color.clear
                    }
                }
                .frame(width: size, height: size)
            }
        }
        .frame(width: size, height: size)
        .clipped()
        .clipShape(Circle())
        .accessibilityLabel(name)
    }

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }
}

enum AvatarURL {
    static func publicFile(_ path: String?) -> URL? {
        guard let path, !path.isEmpty, let base = AppConfig.supabaseURL else { return nil }
        let encoded = path.split(separator: "/").map {
            String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0)
        }.joined(separator: "/")
        let root = base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(root)/storage/v1/object/public/avatars/\(encoded)")
    }
}

struct WordmarkView: View {
    var height: CGFloat = 22

    var body: some View {
        if UIImage(named: "Wordmark") != nil {
            Image("Wordmark")
                .resizable()
                .scaledToFit()
                .frame(height: height)
                .blendMode(.lighten)
                .accessibilityLabel("GreekGeek")
        } else {
            Text("GreekGeek")
                .font(.system(size: 20, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
        }
    }
}

struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .medium))
            .tracking(0.6)
            .foregroundStyle(Palette.ink3)
    }
}

struct ListRowDivider: View {
    var body: some View {
        Palette.line.frame(height: 1)
    }
}

struct ScreenBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Palette.canvas.ignoresSafeArea())
    }
}

extension View {
    func greekGeekScreen() -> some View {
        modifier(ScreenBackground())
    }
}
