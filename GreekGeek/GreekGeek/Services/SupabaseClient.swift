import Foundation

struct AuthSession: Codable, Hashable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userId: String
    var email: String

    var isExpired: Bool {
        Date() >= expiresAt.addingTimeInterval(-60)
    }
}

enum APIError: LocalizedError {
    case notConfigured
    case unauthorized
    case message(String)
    case transport

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to Config.plist."
        case .unauthorized:
            return "Your session expired. Sign in again."
        case .message(let text):
            return text
        case .transport:
            return "Something went wrong. Check your connection and try again."
        }
    }
}

struct SupabaseClient {
    private let url: URL
    private let anonKey: String
    private let session: URLSession

    init() throws {
        guard let url = AppConfig.supabaseURL, let key = AppConfig.supabaseAnonKey else {
            throw APIError.notConfigured
        }
        self.url = url
        self.anonKey = key
        self.session = .shared
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        struct Body: Encodable {
            let email: String
            let password: String
            let grant_type = "password"
        }
        let payload: TokenResponse = try await send(
            path: "/auth/v1/token?grant_type=password",
            method: "POST",
            body: Body(email: email, password: password),
            convertFromSnakeCase: false
        )
        return payload.session
    }

    func signUp(email: String, password: String, fullName: String) async throws -> AuthSession? {
        struct Body: Encodable {
            let email: String
            let password: String
            let data: [String: String]
        }
        let payload: SignUpResponse = try await send(
            path: "/auth/v1/signup",
            method: "POST",
            body: Body(email: email, password: password, data: ["full_name": fullName]),
            convertFromSnakeCase: false
        )
        if let access = payload.accessToken, let refresh = payload.refreshToken, let user = payload.user {
            return AuthSession(
                accessToken: access,
                refreshToken: refresh,
                expiresAt: Date().addingTimeInterval(TimeInterval(payload.expiresIn ?? 3600)),
                userId: user.id,
                email: user.email ?? email
            )
        }
        return nil
    }

    func requestPasswordReset(email: String) async throws {
        struct Body: Encodable { let email: String }
        let _: EmptyJSON = try await send(
            path: "/auth/v1/recover",
            method: "POST",
            body: Body(email: email)
        )
    }

    func refresh(_ current: AuthSession) async throws -> AuthSession {
        struct Body: Encodable { let refresh_token: String }
        let payload: TokenResponse = try await send(
            path: "/auth/v1/token?grant_type=refresh_token",
            method: "POST",
            body: Body(refresh_token: current.refreshToken),
            convertFromSnakeCase: false
        )
        return payload.session
    }

    func user(accessToken: String) async throws -> SessionUser {
        let payload: AuthUser = try await send(
            path: "/auth/v1/user",
            method: "GET",
            accessToken: accessToken,
            convertFromSnakeCase: false
        )
        return SessionUser(id: payload.id, email: payload.email ?? "")
    }

    func signOut(accessToken: String) async {
        struct Body: Encodable {}
        _ = try? await send(path: "/auth/v1/logout", method: "POST", body: Body(), accessToken: accessToken) as EmptyJSON
    }

    func verify(type: String, tokenHash: String) async throws -> AuthSession {
        struct Body: Encodable {
            let type: String
            let token_hash: String
        }
        let payload: TokenResponse = try await send(
            path: "/auth/v1/verify",
            method: "POST",
            body: Body(type: type, token_hash: tokenHash),
            convertFromSnakeCase: false
        )
        return payload.session
    }

    func updatePassword(accessToken: String, password: String) async throws {
        struct Body: Encodable { let password: String }
        let _: EmptyJSON = try await send(
            path: "/auth/v1/user",
            method: "PUT",
            body: Body(password: password),
            accessToken: accessToken
        )
    }

    func rpc<T: Decodable>(_ name: String, parameters: [String: AnyJSON] = [:], accessToken: String) async throws -> T {
        try await send(path: "/rest/v1/rpc/\(name)", method: "POST", body: parameters, accessToken: accessToken)
    }

    func rpcEncodable<T: Decodable>(_ name: String, parameters: some Encodable, accessToken: String) async throws -> T {
        try await send(path: "/rest/v1/rpc/\(name)", method: "POST", body: parameters, accessToken: accessToken)
    }

    func select<T: Decodable>(
        table: String,
        query: String,
        accessToken: String
    ) async throws -> T {
        try await send(path: restPath(table: table, query: query), method: "GET", accessToken: accessToken)
    }

    func selectPages<T: Decodable>(
        table: String,
        query: String,
        accessToken: String,
        pageSize: Int = 1000
    ) async -> [T] {
        var rows: [T] = []
        for from in stride(from: 0, to: 100 * pageSize, by: pageSize) {
            let to = from + pageSize - 1
            let chunk: [T]
            do {
                chunk = try await send(
                    path: restPath(table: table, query: query),
                    method: "GET",
                    accessToken: accessToken,
                    range: "\(from)-\(to)"
                )
            } catch {
                break
            }
            rows.append(contentsOf: chunk)
            if chunk.count < pageSize { break }
        }
        return rows
    }

    func count(table: String, query: String, accessToken: String) async -> Int {
        do {
            let path = restPath(table: table, query: query)
            let joined = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path
            guard let endpoint = URL(string: joined) else { return 0 }
            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue(anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("count=exact", forHTTPHeaderField: "Prefer")
            request.setValue("0-0", forHTTPHeaderField: "Range")
            let (_, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { return 0 }
            let header = http.value(forHTTPHeaderField: "Content-Range") ?? ""
            if let total = header.split(separator: "/").last, let value = Int(total) {
                return value
            }
            return 0
        } catch {
            return 0
        }
    }

    private func restPath(table: String, query: String) -> String {
        "/rest/v1/\(table)?\(query)"
    }

    func insert(table: String, body: some Encodable, accessToken: String) async throws {
        let _: EmptyJSON = try await send(path: "/rest/v1/\(table)", method: "POST", body: body, accessToken: accessToken, prefer: "return=minimal")
    }

    func upsert(table: String, onConflict: String, body: some Encodable, accessToken: String) async throws {
        let _: EmptyJSON = try await send(
            path: "/rest/v1/\(table)?on_conflict=\(onConflict)",
            method: "POST",
            body: body,
            accessToken: accessToken,
            prefer: "resolution=merge-duplicates,return=minimal"
        )
    }

    func insertReturning<T: Decodable>(table: String, body: some Encodable, accessToken: String) async throws -> T {
        try await send(path: "/rest/v1/\(table)", method: "POST", body: body, accessToken: accessToken, prefer: "return=representation")
    }

    func patch(table: String, query: String, body: some Encodable, accessToken: String) async throws {
        let _: EmptyJSON = try await send(path: "/rest/v1/\(table)?\(query)", method: "PATCH", body: body, accessToken: accessToken, prefer: "return=minimal")
    }

    func delete(table: String, query: String, accessToken: String) async throws {
        let _: EmptyJSON = try await send(path: "/rest/v1/\(table)?\(query)", method: "DELETE", accessToken: accessToken, prefer: "return=minimal")
    }

    private func send<Response: Decodable>(
        path: String,
        method: String,
        body: (some Encodable)? = Optional<EmptyJSON>.none,
        accessToken: String? = nil,
        prefer: String? = nil,
        convertFromSnakeCase: Bool = true,
        range: String? = nil
    ) async throws -> Response {
        let joined = url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + (path.hasPrefix("/") ? path : "/" + path)
        guard let endpoint = URL(string: joined) else { throw APIError.transport }
        var request = URLRequest(url: endpoint)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken ?? anonKey)", forHTTPHeaderField: "Authorization")
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }
        if let range {
            request.setValue(range, forHTTPHeaderField: "Range")
        }
        if method != "GET", method != "DELETE", let body {
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.transport }
        if (200..<300).contains(http.statusCode) {
            if data.isEmpty || Response.self == EmptyJSON.self {
                if let empty = EmptyJSON() as? Response { return empty }
            }
            do {
                return try makeDecoder(convertFromSnakeCase: convertFromSnakeCase).decode(Response.self, from: data)
            } catch {
                if let empty = EmptyJSON() as? Response { return empty }
                throw APIError.message("Could not read the response from GreekGeek.")
            }
        }
        if let error = try? JSONDecoder().decode(AuthErrorBody.self, from: data) {
            throw APIError.message(error.readable)
        }
        if http.statusCode == 401 {
            throw APIError.unauthorized
        }
        if let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !text.isEmpty,
           text.count < 400 {
            throw APIError.message(text)
        }
        throw APIError.transport
    }
}

struct EmptyJSON: Codable {}

enum OneOrMany<T: Decodable>: Decodable {
    case one(T)
    case many([T])

    var first: T? {
        switch self {
        case .one(let value): return value
        case .many(let values): return values.first
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(T.self) {
            self = .one(value)
            return
        }
        if let values = try? container.decode([T].self) {
            self = .many(values)
            return
        }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "expected object or array")
    }
}

enum AnyJSON: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case object([String: AnyJSON])
    case array([AnyJSON])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null; return }
        if let value = try? container.decode(Bool.self) { self = .bool(value); return }
        if let value = try? container.decode(Int.self) { self = .int(value); return }
        if let value = try? container.decode(Double.self) { self = .double(value); return }
        if let value = try? container.decode(String.self) { self = .string(value); return }
        if let value = try? container.decode([String: AnyJSON].self) { self = .object(value); return }
        if let value = try? container.decode([AnyJSON].self) { self = .array(value); return }
        self = .null
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

private struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int?
    let expiresAt: TimeInterval?
    let user: AuthUser

    var session: AuthSession {
        let expiry: Date
        if let expiresAt {
            expiry = Date(timeIntervalSince1970: expiresAt)
        } else {
            expiry = Date().addingTimeInterval(TimeInterval(expiresIn ?? 3600))
        }
        return AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiry,
            userId: user.id,
            email: user.email ?? ""
        )
    }

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case user
    }
}

private struct SignUpResponse: Decodable {
    let accessToken: String?
    let refreshToken: String?
    let expiresIn: Int?
    let user: AuthUser?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }
}

private struct AuthUser: Decodable {
    let id: String
    let email: String?
}

private struct AuthErrorBody: Decodable {
    let errorDescription: String?
    let msg: String?
    let message: String?
    let error: String?
    let hint: String?
    let details: String?

    var readable: String {
        errorDescription ?? msg ?? message ?? error ?? hint ?? details ?? "That did not work."
    }

    enum CodingKeys: String, CodingKey {
        case errorDescription = "error_description"
        case msg
        case message
        case error
        case hint
        case details
    }
}

private func makeDecoder(convertFromSnakeCase: Bool) -> JSONDecoder {
    let decoder = JSONDecoder()
    if convertFromSnakeCase {
        decoder.keyDecodingStrategy = .convertFromSnakeCase
    }
    decoder.dateDecodingStrategy = .custom { decoder in
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Double.self) {
            return Date(timeIntervalSince1970: value)
        }
        let raw = try container.decode(String.self)
        if let date = ISODate.parse(raw) { return date }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "bad date")
    }
    return decoder
}
