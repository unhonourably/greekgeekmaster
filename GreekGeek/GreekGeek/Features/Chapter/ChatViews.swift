import SwiftUI

struct ChatInboxView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    var onSelect: (Conversation) -> Void
    @State private var query = ""

    var body: some View {
        let conversations = session.selectedChapter?.conversations ?? chapter.conversations
        let filtered = conversations.filter {
            query.isEmpty || $0.title.localizedCaseInsensitiveContains(query)
        }
        let directs = filtered.filter(\.kind.isDirect)
        let channels = filtered.filter { !$0.kind.isDirect }
        Group {
            if conversations.isEmpty {
                GGEmptyState(
                    icon: "bubble.left.and.bubble.right",
                    title: "No conversations yet",
                    message: "Chapter channels and direct messages you belong to will show up here."
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if !directs.isEmpty {
                        Section("Direct") {
                            ForEach(directs) { conversation in
                                inboxRow(conversation)
                            }
                        }
                    }
                    if !channels.isEmpty {
                        Section("Channels") {
                            ForEach(channels) { conversation in
                                inboxRow(conversation)
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
                .searchable(text: $query, prompt: "Search conversations")
            }
        }
        .background(Palette.canvas)
        .task {
            await session.prefetchConversationMessages()
        }
    }

    private func inboxRow(_ conversation: Conversation) -> some View {
        Button {
            onSelect(conversation)
        } label: {
            conversationRow(conversation)
        }
        .buttonStyle(.plain)
        .listRowBackground(Palette.surface)
        .listRowSeparatorTint(Palette.line)
    }

    private func conversationRow(_ conversation: Conversation) -> some View {
        HStack(spacing: 12) {
            PersonAvatar(
                name: conversation.title,
                path: conversation.avatarPath ?? session.avatarPath(forUserId: conversation.otherUserId),
                size: 40
            )
            VStack(alignment: .leading, spacing: 3) {
                Text(conversation.title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                Text(conversation.messages.last?.body ?? conversation.subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink3)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if conversation.unread > 0 {
                Text(conversation.unread > 99 ? "99+" : "\(conversation.unread)")
                    .font(.system(size: 11, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Palette.onAccent)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Palette.accent)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 4)
    }
}

struct ChatRoomView: View {
    @Environment(AppSession.self) private var session
    let conversation: Conversation
    @State private var draft = ""
    @State private var replyTo: ChatMessage?
    @State private var typingClient: ChatTypingClient?
    private let reactions = ["+1", "heart", "check", "laugh"]

    var body: some View {
        let live = session.conversation(id: conversation.id) ?? conversation
        let mine = session.currentUserId
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        if !live.didLoadMessages && live.messages.isEmpty {
                            ProgressView()
                                .tint(Palette.accent)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 48)
                        } else if live.messages.isEmpty {
                            GGEmptyState(icon: "bubble.left", title: "No messages yet", message: "Say something to start the thread.")
                                .padding(.top, 48)
                        }
                        ForEach(live.messages) { message in
                            messageBubble(message, isMine: message.isFrom(mine), proxy: proxy)
                                .id(message.id)
                                .frame(maxWidth: .infinity, alignment: message.isFrom(mine) ? .trailing : .leading)
                                .transition(.asymmetric(
                                    insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.96, anchor: message.isFrom(mine) ? .bottomTrailing : .bottomLeading)),
                                    removal: .opacity
                                ))
                        }
                        if let typingClient, !typingClient.typingUserIds.isEmpty {
                            typingRow(
                                names: typerNames(from: typingClient.typingUserIds, in: live),
                                avatarPath: session.avatarPath(forUserId: typingClient.typingUserIds.first)
                            )
                                .id("typing-indicator")
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 18)
                    .animation(.spring(response: 0.36, dampingFraction: 0.86), value: live.messages.map(\.id))
                    .animation(.easeInOut(duration: 0.22), value: typingClient?.typingUserIds ?? [])
                }
                .onAppear {
                    scrollToLatest(live, proxy: proxy)
                }
                .onChange(of: live.messages.last?.id) { _, _ in
                    scrollToLatest(live, proxy: proxy)
                }
                .onChange(of: typingClient?.typingUserIds.count ?? 0) { _, count in
                    if count > 0 {
                        withAnimation(.easeOut(duration: 0.22)) {
                            proxy.scrollTo("typing-indicator", anchor: .bottom)
                        }
                    }
                }
            }
            composer
        }
        .background(Palette.canvas)
        .task(id: conversation.id) {
            session.chatError = nil
            if !live.didLoadMessages {
                await session.refreshConversation(conversation.id)
            }
            let client = session.makeTypingClient(conversationId: conversation.id)
            typingClient = client
            client?.connect()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(8))
                if Task.isCancelled { break }
                await session.refreshConversation(conversation.id)
            }
        }
        .onDisappear {
            typingClient?.disconnect()
            typingClient = nil
        }
        .onChange(of: draft) { _, value in
            typingClient?.setTyping(!value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private func scrollToLatest(_ live: Conversation, proxy: ScrollViewProxy) {
        if let last = live.messages.last {
            proxy.scrollTo(last.id, anchor: .bottom)
        }
    }

    private func typerNames(from ids: [String], in live: Conversation) -> [String] {
        let members = session.selectedChapter?.members ?? []
        return ids.map { id in
            members.first(where: { $0.id == id })?.name
                ?? live.messages.first(where: { $0.senderId == id })?.from
                ?? "Someone"
        }
    }

    private func messageBubble(_ message: ChatMessage, isMine: Bool, proxy: ScrollViewProxy) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMine { Spacer(minLength: 56) }
            if !isMine {
                PersonAvatar(name: message.from, path: session.avatarPath(forUserId: message.senderId), size: 28)
            }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if !isMine {
                    HStack(spacing: 6) {
                        Text(message.from)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Palette.ink2)
                        Text(message.time)
                            .font(.system(size: 11))
                            .foregroundStyle(Palette.ink3)
                        if message.edited {
                            Text("edited")
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.ink3)
                        }
                    }
                    .padding(.horizontal, 4)
                }
                if let replyFrom = message.replyFrom, let replyBody = message.replyBody {
                    Button {
                        if let id = message.replyToId {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(id, anchor: .center)
                            }
                        }
                    } label: {
                        VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                            Text("Replying to \(replyFrom)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Palette.ink2)
                            Text(replyBody)
                                .font(.system(size: 12))
                                .foregroundStyle(Palette.ink3)
                                .lineLimit(2)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: 260, alignment: isMine ? .trailing : .leading)
                        .background(Palette.surface)
                        .overlay(alignment: isMine ? .trailing : .leading) {
                            Palette.accent.frame(width: 2)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                Text(message.body)
                    .font(.system(size: 16))
                    .foregroundStyle(isMine ? Palette.onAccent : Palette.ink)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(isMine ? Palette.accent : Palette.goldSoft)
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(Palette.accent.opacity(isMine ? 0.15 : 0.55), lineWidth: 1)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .opacity(message.pending ? 0.7 : 1)
                if !message.reactions.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(message.reactions.keys.sorted(), id: \.self) { key in
                            let people = message.reactions[key] ?? []
                            Button {
                                session.toggleReaction(conversationId: conversation.id, messageId: message.id, key: key)
                            } label: {
                                Text("\(reactionLabel(key)) \(people.count)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Palette.ink2)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Palette.subtle)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
                HStack(spacing: 10) {
                    if isMine {
                        if message.pending {
                            Text("Sending")
                        } else {
                            Text(message.time)
                        }
                        if message.edited {
                            Text("edited")
                        }
                    }
                    Button("Reply") { replyTo = message }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Palette.ink3)
                }
                .font(.system(size: 11))
                .foregroundStyle(Palette.ink3)
                .padding(.horizontal, 4)
            }
            .frame(maxWidth: 280, alignment: isMine ? .trailing : .leading)
            .contextMenu {
                Button("Reply") { replyTo = message }
                ForEach(reactions, id: \.self) { key in
                    Button(reactionLabel(key)) {
                        session.toggleReaction(conversationId: conversation.id, messageId: message.id, key: key)
                    }
                }
            }
            .gesture(
                DragGesture(minimumDistance: 36)
                    .onEnded { value in
                        if abs(value.translation.width) > 48 {
                            replyTo = message
                        }
                    }
            )
            if !isMine { Spacer(minLength: 56) }
        }
        .frame(maxWidth: .infinity)
    }

    private func typingRow(names: [String], avatarPath: String?) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            PersonAvatar(name: names.first ?? "Someone", path: avatarPath, size: 28)
            HStack(spacing: 10) {
                TypingDots()
                Text(names.count == 1 ? "\(names[0]) is typing" : "People are typing")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.onAccent.opacity(0.72))
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Palette.accent.opacity(0.92))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            Spacer(minLength: 52)
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let chatError = session.chatError {
                Text(chatError)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.danger)
            }
            if let replyTo {
                HStack(alignment: .top, spacing: 10) {
                    Palette.accent.frame(width: 2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Replying to \(replyTo.isFrom(session.currentUserId) ? "yourself" : replyTo.from)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Palette.accent)
                        Text(replyTo.body)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.ink3)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    Button {
                        self.replyTo = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Palette.ink3)
                    }
                    .accessibilityLabel("Cancel reply")
                }
                .padding(10)
                .background(Palette.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            HStack(alignment: .bottom, spacing: 10) {
                TextField(replyTo == nil ? "Message" : "Reply", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Palette.subtle)
                    .clipShape(Capsule())
                    .overlay {
                        Capsule().stroke(Palette.lineStrong, lineWidth: 1)
                    }
                Button {
                    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return }
                    typingClient?.setTyping(false)
                    session.sendMessage(conversationId: conversation.id, body: text, replyTo: replyTo)
                    draft = ""
                    replyTo = nil
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Palette.ink3 : Palette.accent)
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send")
                .padding(.bottom, 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Palette.canvas)
        .overlay(alignment: .top) { Palette.line.frame(height: 1) }
    }

    private func reactionLabel(_ key: String) -> String {
        switch key {
        case "+1": return "👍"
        case "heart": return "❤️"
        case "check": return "✓"
        case "laugh": return "😄"
        case "eyes": return "👀"
        case "party": return "🎉"
        default: return key
        }
    }
}

private struct TypingDots: View {
    @State private var bounce = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Palette.onAccent)
                    .frame(width: 6, height: 6)
                    .offset(y: bounce ? -3 : 2)
                    .animation(
                        .easeInOut(duration: 0.38)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.12),
                        value: bounce
                    )
            }
        }
        .onAppear { bounce = true }
    }
}

#Preview {
    NavigationStack {
        ChatInboxView(chapter: SampleData.context(), onSelect: { _ in })
    }
    .environment(AppSession())
    .preferredColorScheme(.dark)
}
