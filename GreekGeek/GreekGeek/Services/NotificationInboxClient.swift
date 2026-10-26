import Foundation

final class NotificationInboxClient {
    var onInsert: ((AppNotification) -> Void)?

    private let baseURL: URL
    private let anonKey: String
    private let accessToken: String
    private let userId: String
    private var socket: URLSessionWebSocketTask?
    private var heartbeat: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var topic = "realtime:notifications"
    private var ref = 0

    init(baseURL: URL, anonKey: String, accessToken: String, userId: String) {
        self.baseURL = baseURL
        self.anonKey = anonKey
        self.accessToken = accessToken
        self.userId = userId
    }

    func connect() {
        disconnect()
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return }
        components.scheme = (baseURL.scheme == "http") ? "ws" : "wss"
        components.path = "/realtime/v1/websocket"
        components.queryItems = [
            URLQueryItem(name: "apikey", value: anonKey),
            URLQueryItem(name: "vsn", value: "1.0.0")
        ]
        guard let endpoint = components.url else { return }
        var request = URLRequest(url: endpoint)
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let task = URLSession.shared.webSocketTask(with: request)
        socket = task
        task.resume()
        sendJSON([
            "topic": topic,
            "event": "phx_join",
            "payload": [
                "config": [
                    "broadcast": ["ack": false, "self": false],
                    "presence": ["key": ""],
                    "postgres_changes": [[
                        "event": "INSERT",
                        "schema": "public",
                        "table": "notifications",
                        "filter": "user_id=eq.\(userId)"
                    ]]
                ],
                "access_token": accessToken
            ],
            "ref": nextRef()
        ])
        receiveTask = Task { await listen() }
        heartbeat = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                sendJSON(["topic": "phoenix", "event": "heartbeat", "payload": [:], "ref": nextRef()])
            }
        }
    }

    func disconnect() {
        receiveTask?.cancel()
        heartbeat?.cancel()
        receiveTask = nil
        heartbeat = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }

    private func listen() async {
        while let socket, !Task.isCancelled {
            do {
                let message = try await socket.receive()
                switch message {
                case .string(let text):
                    handle(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) { handle(text) }
                @unknown default:
                    break
                }
            } catch {
                break
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        let event = json["event"] as? String ?? ""
        guard event == "postgres_changes" || event == "INSERT" else { return }
        let payload = json["payload"] as? [String: Any] ?? [:]
        let nested = payload["data"] as? [String: Any] ?? payload
        let record = (nested["record"] as? [String: Any]) ?? (nested["new"] as? [String: Any])
        guard let record, let item = AppNotification.fromRealtime(record) else { return }
        onInsert?(item)
    }

    private func nextRef() -> String {
        ref += 1
        return "\(ref)"
    }

    private func sendJSON(_ value: Any) {
        guard let socket, JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let text = String(data: data, encoding: .utf8)
        else { return }
        socket.send(.string(text)) { _ in }
    }
}

extension AppNotification {
    static func fromRealtime(_ record: [String: Any]) -> AppNotification? {
        guard let id = record["id"] as? String,
              let title = record["title"] as? String
        else { return nil }
        let created = (record["created_at"] as? String).flatMap(ISODate.parse) ?? Date()
        let readAt = (record["read_at"] as? String).flatMap(ISODate.parse)
        return AppNotification(
            id: id,
            title: title,
            body: record["body"] as? String ?? "",
            createdAt: created,
            readAt: readAt,
            link: record["link"] as? String,
            kind: record["kind"] as? String
        )
    }
}
