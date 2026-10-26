import SwiftUI

enum Palette {
    static let canvas = Color(hex: 0x000000)
    static let surface = Color(hex: 0x0F0F0F)
    static let subtle = Color(hex: 0x1A1A1A)
    static let line = Color(hex: 0x262626)
    static let lineStrong = Color(hex: 0x383838)
    static let ink = Color(hex: 0xF4ECE0)
    static let ink2 = Color(hex: 0xBDB5A8)
    static let ink3 = Color(hex: 0x8A8378)
    static let accent = Color(hex: 0xE0A535)
    static let accentHover = Color(hex: 0xECB950)
    static let accentSoft = Color(hex: 0x2A1F0B)
    static let onAccent = Color(hex: 0x0A0A0A)
    static let gold = Color(hex: 0xE9C46A)
    static let goldSoft = Color(hex: 0x2B2312)
    static let positive = Color(hex: 0x63C08A)
    static let positiveSoft = Color(hex: 0x0F2418)
    static let warning = Color(hex: 0xEBA94A)
    static let warningSoft = Color(hex: 0x2B1E0C)
    static let danger = Color(hex: 0xF07167)
    static let dangerSoft = Color(hex: 0x2E1210)
    static let info = Color(hex: 0x7CB2E8)
    static let infoSoft = Color(hex: 0x0F1D2C)
}

enum Tone: String {
    case neutral
    case accent
    case positive
    case warning
    case danger
    case info
    case gold

    var foreground: Color {
        switch self {
        case .neutral: return Palette.ink2
        case .accent: return Palette.accent
        case .positive: return Palette.positive
        case .warning: return Palette.warning
        case .danger: return Palette.danger
        case .info: return Palette.info
        case .gold: return Palette.gold
        }
    }

    var soft: Color {
        switch self {
        case .neutral: return Palette.subtle
        case .accent: return Palette.accentSoft
        case .positive: return Palette.positiveSoft
        case .warning: return Palette.warningSoft
        case .danger: return Palette.dangerSoft
        case .info: return Palette.infoSoft
        case .gold: return Palette.goldSoft
        }
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}

enum MoneyFormat {
    static func cents(_ cents: Int, currency: String = "usd") -> String {
        let value = abs(Double(cents) / 100)
        let formatted = value.formatted(.currency(code: currency.uppercased()))
        if cents < 0 { return "−\(formatted)" }
        return formatted
    }

    static func dollarsToCents(_ raw: String) -> Int? {
        let cleaned = raw.replacingOccurrences(of: "[$,\\s]", with: "", options: .regularExpression)
        guard cleaned.range(of: #"^\d{1,7}(\.\d{0,2})?$"#, options: .regularExpression) != nil else { return nil }
        let parts = cleaned.split(separator: ".", omittingEmptySubsequences: false)
        let whole = Int(parts.first ?? "0") ?? 0
        let fraction = String((parts.count > 1 ? String(parts[1]) : "").padding(toLength: 2, withPad: "0", startingAt: 0).prefix(2))
        return whole * 100 + (Int(fraction) ?? 0)
    }
}

enum PlatformFees {
    static func platformFee(amountCents: Int, bps: Int, fixedCents: Int = 0, minCents: Int? = nil, maxCents: Int? = nil) -> Int {
        guard amountCents > 0 else { return 0 }
        var fee = (amountCents * bps + 5_000) / 10_000 + fixedCents
        if let minCents { fee = max(fee, minCents) }
        if let maxCents { fee = min(fee, maxCents) }
        return min(fee, amountCents)
    }

    static func processingFee(amountCents: Int, method: String) -> Int {
        guard amountCents > 0 else { return 0 }
        if method == "us_bank_account" {
            return min((amountCents * 80 + 5_000) / 10_000, 500)
        }
        return (amountCents * 290 + 5_000) / 10_000 + 30
    }

    static func percentLabel(_ bps: Int) -> String {
        let value = Double(bps) / 100
        if value == value.rounded() {
            return "\(Int(value))%"
        }
        let text = String(format: "%g", value)
        return "\(text)%"
    }
}

enum DateFormat {
    static func clock(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    static func medium(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }

    static func compactDuration(minutes: Int) -> String {
        if minutes < 60 { return "\(minutes)m" }
        let hours = Int((Double(minutes) / 60).rounded())
        if hours < 48 { return "\(hours)h" }
        return "\(Int((Double(hours) / 24).rounded()))d"
    }

    static func shortDay(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }

    static func chapter(_ date: Date, timeZone: String) -> String {
        date.formatted(in: timeZone, .dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute().timeZone())
    }

    static func relative(_ date: Date, now: Date = Date()) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 60 { return "just now" }
        if seconds < 3600 { return "\(seconds / 60)m ago" }
        if seconds < 86_400 { return "\(seconds / 3600)h ago" }
        if seconds < 604_800 { return "\(seconds / 86_400)d ago" }
        return medium(date)
    }

    static func month(_ date: Date, timeZone: String) -> String {
        date.formatted(in: timeZone, .dateTime.month(.abbreviated))
    }

    static func day(_ date: Date, timeZone: String) -> String {
        date.formatted(in: timeZone, .dateTime.day())
    }

    static func weekdayTime(_ date: Date, timeZone: String) -> String {
        date.formatted(in: timeZone, .dateTime.weekday(.abbreviated).hour().minute())
    }
}

enum ISODate {
    static func parse(_ raw: String) -> Date? {
        let text = normalizeTimestamp(raw)
        if let date = try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
            return date
        }
        if let date = try? Date(text, strategy: Date.ISO8601FormatStyle()) {
            return date
        }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        let basic = ISO8601DateFormatter()
        basic.formatOptions = [.withInternetDateTime]
        if let date = basic.date(from: text) { return date }
        let day = text.split(separator: "T").first.map(String.init) ?? text
        return try? Date(day, strategy: Date.ISO8601FormatStyle().year().month().day())
    }

    private static func normalizeTimestamp(_ raw: String) -> String {
        var text = raw.replacingOccurrences(of: " ", with: "T")
        if let dot = text.firstIndex(of: "."),
           let zone = text[dot...].firstIndex(where: { $0 == "Z" || $0 == "+" || $0 == "-" }) {
            let fraction = text.index(after: dot)
            if text.distance(from: fraction, to: zone) > 3 {
                let keep = text.index(fraction, offsetBy: 3)
                text = String(text[..<keep]) + String(text[zone...])
            }
        }
        return text
    }

    static func timestamp(_ date: Date = Date()) -> String {
        date.formatted(.iso8601)
    }

    static func day(_ date: Date = Date()) -> String {
        date.formatted(.iso8601.year().month().day())
    }
}

private extension Date {
    func formatted(in timeZone: String, _ format: Date.FormatStyle) -> String {
        var style = format
        style.timeZone = TimeZone(identifier: timeZone) ?? .current
        return formatted(style)
    }
}
