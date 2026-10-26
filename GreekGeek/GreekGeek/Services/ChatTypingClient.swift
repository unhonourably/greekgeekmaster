import Foundation
import Observation

@MainActor
@Observable
final class ChatTypingClient {
    private(set) var typingUserIds: [String] = []

    private let baseURL: URL
    private let anonKey: String
    private let accessToken: String
    private let userId: String
    private let conversationId: String
    private var socket: URLSessionWebSocketTask?
    private var heartbeat: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var pruneTask: Task<Void, Never>?
    private var topic = ""
    private var ref = 0
    private var lastTypingSent: Date?
    private var expiry: [String: Date] = [:]

    init(baseURL: URL, anonKey: String, accessToken: String, userId: String, conversationId: String) {
        self.baseURL = baseURL
        self.anonKey = anonKey
        self.accessToken = accessToken
        self.userId = userId
        self.conversationId = conversationId
    }

    func connect() {
        disconnect()
        topic = "realtime:typing:\(conversationId)"
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
                    "private": true
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
        pruneTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                prune()
            }
        }
    }

    func setTyping(_ active: Bool) {
        let now = Date()
        if active, let lastTypingSent, now.timeIntervalSince(lastTypingSent) < 2.5 { return }
        if !active, lastTypingSent == nil { return }
        lastTypingSent = active ? now : nil
        sendJSON([
            "topic": topic,
            "event": "broadcast",
            "payload": [
                "type": "broadcast",
                "event": "typing",
                "payload": ["user_id": userId, "typing": active]
            ],
            "ref": nextRef()
        ])
    }

    func disconnect() {
        setTyping(false)
        receiveTask?.cancel()
        heartbeat?.cancel()
        pruneTask?.cancel()
        receiveTask = nil
        heartbeat = nil
        pruneTask = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        typingUserIds = []
        expiry = [:]
        lastTypingSent = nil
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
              let envelope = try? JSONDecoder().decode(Envelope.self, from: data)
        else { return }
        let user = envelope.payload.inner?.userId ?? envelope.payload.userId
        let typing = envelope.payload.inner?.typing ?? envelope.payload.typing
        guard let user, user != userId, let typing else { return }
        if envelope.event == "broadcast" || envelope.payload.event == "typing" || envelope.payload.inner?.event == "typing" {
            if typing {
                expiry[user] = Date().addingTimeInterval(6)
            } else {
                expiry.removeValue(forKey: user)
            }
            typingUserIds = Array(expiry.keys)
        }
    }

    private func prune() {
        let now = Date()
        expiry = expiry.filter { $0.value > now }
        let ids = Array(expiry.keys)
        if ids != typingUserIds {
            typingUserIds = ids
        }
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

private struct Envelope: Decodable {
    let event: String
    let payload: BroadcastPayload
}

private struct BroadcastPayload: Decodable {
    let event: String?
    let userId: String?
    let typing: Bool?
    let inner: TypingPayload?

    enum CodingKeys: String, CodingKey {
        case event
        case userId = "user_id"
        case typing
        case inner = "payload"
    }
}

private struct TypingPayload: Decodable {
    let event: String?
    let userId: String?
    let typing: Bool?

    enum CodingKeys: String, CodingKey {
        case event
        case userId = "user_id"
        case typing
    }
}
