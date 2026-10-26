import Foundation
import Observation
import UIKit

enum AppFlow: Equatable {
    case marketing
    case signedIn
}

@MainActor
@Observable
final class AppSession {
    var flow: AppFlow = .marketing
    var user: SessionUser?
    var profile: Profile?
    var chapters: [MyChapter] = []
    var applications: [ChapterApplication] = []
    var notifications: [AppNotification] = []
    var upcomingEvents: [ChapterEvent] = []
    var selectedChapter: ChapterContext?
    var presentedChapterSlug: String?
    var viewingConversationId: String?
    var staffRole: StaffRole?
    var isRestoring = true
    var isLoadingChapter = false
    var lastError: String?
    var chatError: String?
    var actionMessage: String?
    var pendingResetPassword = false
    var pendingInviteToken: String?
    var admin = AdminDashboard()
    var isLoadingAdmin = false
    var isLoadingEmailStats = false
    var adminError: String?

    private var authSession: AuthSession?
    private let sessionAccount = "supabase.session"
    private var inboxClient: NotificationInboxClient?
    private var inboxPoll: Task<Void, Never>?
    private var knownNotificationIds: Set<String> = []

    var isSignedIn: Bool { user != nil }
    var currentUserId: String? {
        let profileId = profile?.id
        if let profileId, !profileId.isEmpty { return profileId }
        let sessionId = user?.id
        if let sessionId, !sessionId.isEmpty { return sessionId }
        return nil
    }
    var unreadCount: Int { notifications.filter { $0.readAt == nil }.count }
    var firstName: String { profile?.firstName ?? "" }

    func avatarPath(forUserId id: String?) -> String? {
        guard let id, !id.isEmpty else { return nil }
        if let mine = profile?.id, mine.compare(id, options: .caseInsensitive) == .orderedSame {
            return profile?.avatarPath
        }
        return selectedChapter?.members.first { $0.id.compare(id, options: .caseInsensitive) == .orderedSame }?.avatarPath
    }

    func bootstrap() async {
        if let stored = loadStoredSession() {
            authSession = stored
            do {
                try await refreshIfNeeded()
                try await hydrateFromNetwork()
                flow = .signedIn
                startDeviceInbox()
            } catch {
                clearSession()
                flow = .marketing
            }
        }
        isRestoring = false
    }

    func signIn(email: String, password: String) async throws {
        lastError = nil
        let client = try SupabaseClient()
        let session = try await client.signIn(email: email, password: password)
        persist(session)
        try? await hydrateFromNetwork()
        flow = .signedIn
        startDeviceInbox()
    }

    func signUp(fullName: String, email: String, password: String) async throws -> String? {
        lastError = nil
        let client = try SupabaseClient()
        if let session = try await client.signUp(email: email, password: password, fullName: fullName) {
            persist(session)
            try? await hydrateFromNetwork()
            flow = .signedIn
            startDeviceInbox()
            return nil
        }
        return "Check your email. It can take a minute to arrive. Check spam if you don't see it."
    }

    func requestPasswordReset(email: String) async throws {
        lastError = nil
        let client = try SupabaseClient()
        try await client.requestPasswordReset(email: email)
    }

    func updatePassword(_ password: String) async throws {
        guard let token = authSession?.accessToken else { throw APIError.unauthorized }
        let client = try SupabaseClient()
        try await client.updatePassword(accessToken: token, password: password)
        pendingResetPassword = false
    }

    func handleIncomingURL(_ url: URL) async {
        let path = url.path
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let tokenHash = items.first(where: { $0.name == "token_hash" })?.value
        let type = items.first(where: { $0.name == "type" })?.value
        if path.contains("/invite/") {
            pendingInviteToken = url.lastPathComponent
            return
        }
        guard let tokenHash, let type else { return }
        do {
            let client = try SupabaseClient()
            let session = try await client.verify(type: type, tokenHash: tokenHash)
            persist(session)
            try await hydrateFromNetwork()
            flow = .signedIn
            startDeviceInbox()
            pendingResetPassword = type == "recovery"
        } catch {
            lastError = error.localizedDescription
        }
    }

    func signOut() {
        if let token = authSession?.accessToken, let client = try? SupabaseClient() {
            Task { await client.signOut(accessToken: token) }
        }
        stopDeviceInbox()
        DeviceNotifications.clear()
        clearSession()
        flow = .marketing
    }

    func openChapter(_ chapter: MyChapter) {
        presentedChapterSlug = chapter.slug
        Task { await loadChapter(slug: chapter.slug) }
    }

    func loadChapter(slug: String) async {
        isLoadingChapter = true
        lastError = nil
        defer { isLoadingChapter = false }
        do {
            let store = try makeStore()
            selectedChapter = try await store.loadChapter(slug: slug)
            presentedChapterSlug = slug
            await prefetchConversationMessages()
        } catch {
            lastError = error.localizedDescription
            selectedChapter = nil
        }
    }

    func closeChapter() {
        selectedChapter = nil
        presentedChapterSlug = nil
        viewingConversationId = nil
    }

    func startDeviceInbox() {
        stopDeviceInbox()
        knownNotificationIds = Set(notifications.map(\.id))
        DeviceNotifications.setBadge(unreadCount)
        Task { await DeviceNotifications.requestPermission() }
        guard let authSession,
              let url = AppConfig.supabaseURL,
              let key = AppConfig.supabaseAnonKey
        else { return }
        let client = NotificationInboxClient(
            baseURL: url,
            anonKey: key,
            accessToken: authSession.accessToken,
            userId: authSession.userId
        )
        client.onInsert = { [weak self] item in
            Task { @MainActor in
                self?.ingestRemoteNotification(item)
            }
        }
        client.connect()
        inboxClient = client
        inboxPoll = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(40))
                await self?.refreshInbox()
            }
        }
    }

    func refreshInbox() async {
        guard let store = try? makeStore() else { return }
        let latest = (try? await store.loadNotifications()) ?? []
        for item in latest.reversed() {
            ingestRemoteNotification(item)
        }
        notifications = latest
        DeviceNotifications.setBadge(unreadCount)
    }

    private func ingestRemoteNotification(_ item: AppNotification) {
        let isNew = knownNotificationIds.insert(item.id).inserted
        if isNew {
            if !notifications.contains(where: { $0.id == item.id }) {
                notifications.insert(item, at: 0)
            }
            let viewingChat = viewingConversationId.map { item.link?.contains($0) == true } ?? false
            if item.readAt == nil && !viewingChat {
                DeviceNotifications.post(item, badge: unreadCount)
            }
        }
        DeviceNotifications.setBadge(unreadCount)
    }

    private func stopDeviceInbox() {
        inboxPoll?.cancel()
        inboxPoll = nil
        inboxClient?.disconnect()
        inboxClient = nil
    }

    func markNotificationsRead() {
        notifications = notifications.map { item in
            var copy = item
            if copy.readAt == nil { copy.readAt = Date() }
            return copy
        }
        Task { try? await makeStore().markNotificationsRead() }
        DeviceNotifications.setBadge(0)
    }

    func sendMessage(conversationId: String, body: String, replyTo: ChatMessage? = nil) {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        chatError = nil
        let localId = "local-\(UUID().uuidString)"
        let pending = ChatMessage(
            id: localId,
            conversationId: conversationId,
            senderId: currentUserId ?? "",
            from: profile?.personName ?? "You",
            body: text,
            createdAt: Date(),
            time: DateFormat.clock(Date()),
            reactions: [:],
            pinned: false,
            edited: false,
            pending: true,
            replyToId: replyTo?.id,
            replyFrom: replyTo.map { $0.isFrom(currentUserId) ? "You" : $0.from },
            replyBody: replyTo?.body
        )
        mutateConversation(conversationId) { conversation in
            conversation.messages.append(pending)
        }
        Task {
            do {
                var saved = try await makeStore().sendMessage(conversationId: conversationId, body: text, replyToId: replyTo?.id)
                if saved.from == "Member" {
                    saved.from = pending.from
                    saved.senderId = pending.senderId.isEmpty ? saved.senderId : pending.senderId
                }
                mutateConversation(conversationId) { conversation in
                    if let index = conversation.messages.firstIndex(where: { $0.id == localId }) {
                        conversation.messages[index] = saved
                    } else if !conversation.messages.contains(where: { $0.id == saved.id }) {
                        conversation.messages.append(saved)
                    }
                }
            } catch {
                await refreshConversation(conversationId)
                let confirmed = conversation(id: conversationId)?.messages.contains {
                    $0.body == text && $0.isFrom(currentUserId) && !$0.pending
                } == true
                mutateConversation(conversationId) { conversation in
                    conversation.messages.removeAll { $0.id == localId }
                }
                if !confirmed {
                    chatError = error.localizedDescription
                }
            }
        }
    }

    func toggleReaction(conversationId: String, messageId: String, key: String) {
        guard var chapter = selectedChapter,
              let conversationIndex = chapter.conversations.firstIndex(where: { $0.id == conversationId }),
              let messageIndex = chapter.conversations[conversationIndex].messages.firstIndex(where: { $0.id == messageId })
        else { return }
        let me = profile?.personName ?? "You"
        var people = chapter.conversations[conversationIndex].messages[messageIndex].reactions[key] ?? []
        let turningOn = !people.contains(me)
        if let existing = people.firstIndex(of: me) {
            people.remove(at: existing)
        } else {
            people.append(me)
        }
        if people.isEmpty {
            chapter.conversations[conversationIndex].messages[messageIndex].reactions.removeValue(forKey: key)
        } else {
            chapter.conversations[conversationIndex].messages[messageIndex].reactions[key] = people
        }
        selectedChapter = chapter
        Task {
            try? await makeStore().setReaction(
                messageId: messageId,
                conversationId: conversationId,
                emoji: key,
                on: turningOn
            )
        }
    }

    func acknowledge(announcementId: String) {
        guard var chapter = selectedChapter,
              let index = chapter.announcements.firstIndex(where: { $0.id == announcementId })
        else { return }
        chapter.announcements[index].requiresAck = false
        selectedChapter = chapter
        Task { try? await makeStore().acknowledgeAnnouncement(id: announcementId) }
    }

    func setRSVP(eventId: String, status: String) {
        guard var chapter = selectedChapter,
              let index = chapter.events.firstIndex(where: { $0.id == eventId })
        else { return }
        chapter.events[index].rsvp = status
        selectedChapter = chapter
        Task { try? await makeStore().rsvp(eventId: eventId, status: status) }
    }

    func acknowledgePolicy(_ id: String) {
        guard var chapter = selectedChapter,
              let index = chapter.policies.firstIndex(where: { $0.id == id })
        else { return }
        chapter.policies[index].acknowledged = true
        selectedChapter = chapter
    }

    func toggleChore(_ id: String) {
        guard var chapter = selectedChapter,
              let index = chapter.chores.firstIndex(where: { $0.id == id })
        else { return }
        chapter.chores[index].done.toggle()
        selectedChapter = chapter
    }

    func submitReimbursement(title: String, amountCents: Int) {
        guard var chapter = selectedChapter else { return }
        let item = Reimbursement(
            id: UUID().uuidString,
            title: title,
            amountCents: amountCents,
            status: "Submitted",
            submittedAt: Date(),
            requester: profile?.personName ?? "You"
        )
        chapter.reimbursements.insert(item, at: 0)
        selectedChapter = chapter
        Task { try? await makeStore().submitReimbursement(chapterId: chapter.chapter.id, title: title, amountCents: amountCents) }
    }

    func performChapter(_ work: @escaping (GreekGeekStore, ChapterContext) async throws -> Void) async -> String? {
        guard let chapter = selectedChapter else { return "No chapter is selected." }
        do {
            try await work(try makeStore(), chapter)
            await reloadSelectedChapterQuietly()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func loadAdmin() async {
        isLoadingAdmin = true
        adminError = nil
        defer { isLoadingAdmin = false }
        do {
            let store = try makeStore()
            admin = await store.loadAdminDashboard()
        } catch {
            adminError = error.localizedDescription
        }
    }

    func loadEmailStats(rangeDays: Int?) async {
        isLoadingEmailStats = true
        defer { isLoadingEmailStats = false }
        guard let store = try? makeStore() else { return }
        admin.emailStats = await store.loadEmailStats(rangeDays: rangeDays)
    }

    func saveNotificationSettings(_ settings: [NotificationKindSetting]) async -> String? {
        do {
            try await makeStore().saveNotificationSettings(settings)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func loadNotificationSettings() async -> [NotificationKindSetting] {
        guard let store = try? makeStore() else { return [] }
        return await store.loadNotificationSettings()
    }

    func performAdmin(_ work: @escaping (GreekGeekStore) async throws -> Void) async -> String? {
        do {
            try await work(try makeStore())
            if let store = try? makeStore() {
                admin = await store.loadAdminDashboard()
            }
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func submitBugReport(message: String, page: String) async -> String? {
        let size = "\(Int(UIScreen.main.bounds.width))x\(Int(UIScreen.main.bounds.height))"
        do {
            try await makeStore().submitBugReport(message: message, page: page, viewport: size)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func reloadSelectedChapterQuietly() async {
        guard let slug = presentedChapterSlug ?? selectedChapter?.chapter.slug else { return }
        do {
            let previous = selectedChapter?.conversations ?? []
            var next = try await makeStore().loadChapter(slug: slug)
            next.conversations = next.conversations.map { conversation in
                guard let old = previous.first(where: { $0.id == conversation.id }) else { return conversation }
                var copy = conversation
                copy.messages = old.messages
                copy.didLoadMessages = old.didLoadMessages
                if let last = old.messages.last, !last.body.isEmpty {
                    copy.subtitle = last.body
                }
                return copy
            }
            selectedChapter = next
        } catch {}
    }

    func updateProfile(fullName: String, displayName: String, graduationYear: Int?) {
        profile?.fullName = fullName
        profile?.displayName = displayName.isEmpty ? nil : displayName
        profile?.graduationYear = graduationYear
        Task { try? await makeStore().updateProfile(fullName: fullName, displayName: displayName, graduationYear: graduationYear) }
    }

    func refreshConversation(_ conversationId: String) async {
        guard let store = try? makeStore() else {
            mutateConversation(conversationId) { $0.didLoadMessages = true }
            return
        }
        let grouped = await store.loadMessages(conversationIds: [conversationId], names: memberNames)
        updateConversation(conversationId, messages: grouped[conversationId] ?? [], didLoad: true)
    }

    func prefetchConversationMessages() async {
        let ids = selectedChapter?.conversations.filter { !$0.didLoadMessages }.map(\.id) ?? []
        guard !ids.isEmpty, let store = try? makeStore() else { return }
        let grouped = await store.loadMessages(conversationIds: ids, names: memberNames)
        for (id, messages) in grouped {
            updateConversation(id, messages: messages, didLoad: true)
        }
    }

    private var memberNames: [String: String] {
        Dictionary(uniqueKeysWithValues: (selectedChapter?.members ?? []).map { ($0.id, $0.name) })
    }

    func conversation(id: String) -> Conversation? {
        selectedChapter?.conversations.first { $0.id == id }
    }

    func makeTypingClient(conversationId: String) -> ChatTypingClient? {
        guard let authSession, let url = AppConfig.supabaseURL, let key = AppConfig.supabaseAnonKey else { return nil }
        return ChatTypingClient(
            baseURL: url,
            anonKey: key,
            accessToken: authSession.accessToken,
            userId: authSession.userId,
            conversationId: conversationId
        )
    }

    private func updateConversation(_ conversationId: String, messages: [ChatMessage], didLoad: Bool) {
        mutateConversation(conversationId) { conversation in
            let pending = conversation.messages.filter(\.pending)
            var merged = messages
            for item in pending where !merged.contains(where: { $0.body == item.body && $0.senderId == item.senderId }) {
                merged.append(item)
            }
            conversation.messages = merged
            conversation.didLoadMessages = didLoad
            if let last = merged.last, !last.body.isEmpty {
                conversation.subtitle = last.body
            }
        }
    }

    private func mutateConversation(_ conversationId: String, _ body: (inout Conversation) -> Void) {
        guard var chapter = selectedChapter,
              let index = chapter.conversations.firstIndex(where: { $0.id == conversationId })
        else { return }
        body(&chapter.conversations[index])
        selectedChapter = chapter
    }

    private func hydrateFromNetwork() async throws {
        let payload = try await makeStore().loadHome()
        profile = payload.profile ?? Profile(id: user?.id ?? "", displayName: nil, fullName: nil, avatarPath: nil, graduationYear: nil)
        if let email = user?.email, profile?.id.isEmpty == false {
            user = SessionUser(id: profile?.id ?? user?.id ?? "", email: email)
        }
        chapters = payload.chapters
        applications = payload.applications
        notifications = payload.notifications
        knownNotificationIds.formUnion(payload.notifications.map(\.id))
        DeviceNotifications.setBadge(notifications.filter { $0.readAt == nil }.count)
        upcomingEvents = payload.events
        staffRole = payload.staffRole
    }

    private func makeStore() throws -> GreekGeekStore {
        guard let authSession else { throw APIError.unauthorized }
        return GreekGeekStore(
            client: try SupabaseClient(),
            accessToken: authSession.accessToken,
            userId: authSession.userId,
            email: authSession.email
        )
    }

    private func refreshIfNeeded() async throws {
        guard var authSession else { return }
        if authSession.isExpired {
            let client = try SupabaseClient()
            authSession = try await client.refresh(authSession)
            persist(authSession)
        }
    }

    private func persist(_ session: AuthSession) {
        authSession = session
        if let data = try? JSONEncoder().encode(session),
           let text = String(data: data, encoding: .utf8) {
            KeychainStore.set(text, account: sessionAccount)
        }
        user = SessionUser(id: session.userId, email: session.email)
    }

    private func loadStoredSession() -> AuthSession? {
        guard let text = KeychainStore.get(account: sessionAccount),
              let data = text.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    private func clearSession() {
        KeychainStore.remove(account: sessionAccount)
        authSession = nil
        user = nil
        profile = nil
        chapters = []
        applications = []
        notifications = []
        upcomingEvents = []
        selectedChapter = nil
        presentedChapterSlug = nil
        viewingConversationId = nil
        staffRole = nil
        admin = AdminDashboard()
        adminError = nil
        lastError = nil
        chatError = nil
        actionMessage = nil
        isLoadingChapter = false
    }
}
