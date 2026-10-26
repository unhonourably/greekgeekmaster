import Foundation

enum AppConfig {
    static var supabaseURL: URL? {
        url(for: "SUPABASE_URL")
    }

    static var supabaseAnonKey: String? {
        let value = string(for: "SUPABASE_ANON_KEY")
        return value.isEmpty ? nil : value
    }

    static var appURL: URL {
        url(for: "APP_URL") ?? URL(string: "https://greekgeek.org")!
    }

    static var isSupabaseConfigured: Bool {
        supabaseURL != nil && supabaseAnonKey != nil
    }

    static var brandName: String { "GreekGeek" }
    static var legalName: String { "GreekGeek Software" }
    static var tagline: String { "Dues, members, and operations for Greek organizations." }
    static var supportEmail: String { "amare@greekgeek.org" }

    static let socials: [(name: String, url: URL)] = [
        ("X", URL(string: "https://x.com/GreekGeekApp")!),
        ("TikTok", URL(string: "https://www.tiktok.com/@greekgeekapp")!),
        ("Instagram", URL(string: "https://www.instagram.com/greekgeekapp/")!)
    ]

    static func chapterWebURL(slug: String, path: String = "") -> URL {
        appURL.appending(path: "c/\(slug)\(path)")
    }

    private static func string(for key: String) -> String {
        if let env = ProcessInfo.processInfo.environment[key], !env.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return env.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String {
            return value.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return plist?[key] ?? ""
    }

    private static func url(for key: String) -> URL? {
        let value = string(for: key)
        guard !value.isEmpty else { return nil }
        return URL(string: value)
    }

    private static let plist: [String: String]? = {
        guard let url = Bundle.main.url(forResource: "Config", withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let object = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: String]
        else { return nil }
        return object
    }()
}
