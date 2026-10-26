import SwiftUI

struct PhilanthropyView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    @State private var organization = ""
    @State private var hours = "1"
    @State private var servedOn = Date()
    @State private var note = ""
    @State private var campaignName = ""
    @State private var beneficiary = ""
    @State private var goal = ""
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Philanthropy", description: "Log service hours. Officers review them and can add fundraising campaigns.")
                GGNotice(tone: .info, message: "Donations recorded here are records only. GreekGeek does not move that money.")
                if let message { GGNotice(tone: message.contains("submitted") || message.contains("created") || message.contains("Approved") ? .positive : .danger, message: message) }
                GGCard(padding: 16) {
                    Text("Log hours")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                    GGField(label: "Organization") { GGTextField(placeholder: "Food bank", text: $organization) }
                        .padding(.top, 10)
                    GGField(label: "Hours") { GGTextField(placeholder: "2", text: $hours, keyboard: .decimalPad) }
                        .padding(.top, 8)
                    DatePicker("Date served", selection: $servedOn, in: ...Date(), displayedComponents: .date)
                        .tint(Palette.accent)
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 8)
                    GGField(label: "Notes") { GGTextArea(placeholder: "Optional", text: $note, minHeight: 72) }
                        .padding(.top, 8)
                    GGButton(title: "Submit for review", fillWidth: true, busy: busy) {
                        Task { await submitHours() }
                    }
                    .padding(.top, 12)
                }
                if chapter.can(.philanthropyManage) {
                    GGCard(padding: 16) {
                        Text("New campaign")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.ink)
                        GGField(label: "Name") { GGTextField(placeholder: "Spring service week", text: $campaignName) }
                            .padding(.top, 10)
                        GGField(label: "Beneficiary") { GGTextField(placeholder: "Local food bank", text: $beneficiary) }
                            .padding(.top, 8)
                        GGField(label: "Goal") { GGTextField(placeholder: "5000", text: $goal, keyboard: .decimalPad) }
                            .padding(.top, 8)
                        GGButton(title: "Create campaign", kind: .secondary, fillWidth: true, busy: busy) {
                            Task { await createCampaign() }
                        }
                        .padding(.top, 12)
                    }
                }
                ForEach(chapter.campaigns) { campaign in
                    GGCard(padding: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(campaign.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                                if let beneficiary = campaign.beneficiary {
                                    Text(beneficiary).font(.system(size: 13)).foregroundStyle(Palette.ink3)
                                }
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 4) {
                                if campaign.goalCents > 0 {
                                    Text(MoneyFormat.cents(campaign.goalCents)).font(.system(size: 14, weight: .semibold).monospacedDigit()).foregroundStyle(Palette.ink)
                                }
                                GGBadge(text: campaign.status.capitalized, tone: .info)
                            }
                        }
                    }
                }
                ForEach(chapter.serviceHours) { item in
                    GGCard(padding: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.event).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                                Text("\(item.member) · \(item.hours.formatted()) hours · \(DateFormat.medium(item.date))")
                                    .font(.system(size: 13)).foregroundStyle(Palette.ink2)
                            }
                            Spacer()
                            GGBadge(text: item.status, tone: item.status == "Approved" ? .positive : item.status == "Rejected" ? .danger : .info)
                        }
                        if chapter.can(.philanthropyManage), item.status.lowercased() == "submitted", item.userId != session.user?.id {
                            HStack {
                                GGButton(title: "Approve", size: .sm) { Task { await review(item.id, "approved") } }
                                GGButton(title: "Reject", kind: .secondary, size: .sm) { Task { await review(item.id, "rejected") } }
                            }
                            .padding(.top, 10)
                        }
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
    }

    private func submitHours() async {
        let value = Double(hours) ?? 0
        guard organization.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2, value >= 0.25, value <= 24 else {
            message = "Name the organization and log between 0.25 and 24 hours."
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.logServiceHours(
                chapterId: chapter.chapter.id,
                organization: organization.trimmingCharacters(in: .whitespacesAndNewlines),
                description: note.isEmpty ? nil : note,
                hours: value,
                servedOn: servedOn
            )
        }
        busy = false
        if message == nil {
            message = "Hours submitted for review."
            organization = ""
            note = ""
        }
    }

    private func createCampaign() async {
        guard campaignName.count >= 2, beneficiary.count >= 2 else {
            message = "Name the campaign and who it supports."
            return
        }
        let cents = goal.isEmpty ? nil : Int((Double(goal) ?? 0) * 100)
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.createCampaign(chapterId: chapter.chapter.id, name: campaignName, beneficiary: beneficiary, goalCents: cents)
        }
        busy = false
        if message == nil {
            message = "Campaign created."
            campaignName = ""
            beneficiary = ""
            goal = ""
        }
    }

    private func review(_ id: String, _ status: String) async {
        message = await session.performChapter { store, _ in
            try await store.reviewServiceHours(id: id, status: status)
        }
        if message == nil { message = status == "approved" ? "Approved." : "Rejected." }
    }
}

struct HousingView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    @State private var term = ""
    @State private var notes = ""
    @State private var wantsSingle = false
    @State private var selectedRooms: Set<String> = []
    @State private var issue = ""
    @State private var location = ""
    @State private var priority = "normal"
    @State private var roomName = ""
    @State private var roomFloor = ""
    @State private var roomCapacity = "2"
    @State private var roomRent = ""
    @State private var assignMember = ""
    @State private var assignRoom = ""
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        let live = session.selectedChapter ?? chapter
        let manager = live.can(.housingManage)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Housing", description: "Request a room, report maintenance, and keep chores current. House managers assign rooms and respond to requests.")
                if let message { GGNotice(tone: message.contains(".") && !message.lowercased().contains("error") && !message.lowercased().contains("could") ? .positive : .info, message: message) }
                occupancy(live)
                requestCard(live)
                if manager { manageRooms(live) }
                requests(live, manager: manager)
                maintenance(live, manager: manager)
                chores(live)
            }
            .padding(16)
        }
        .greekGeekScreen()
    }

    private func occupancy(_ live: ChapterContext) -> some View {
        let filled = live.rooms.reduce(0) { $0 + $1.occupied }
        let capacity = live.rooms.reduce(0) { $0 + $1.capacity }
        return VStack(alignment: .leading, spacing: 10) {
            GGCard(padding: 16) {
                Text("Occupancy").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
                Text(capacity == 0 ? "No rooms have been added yet." : "\(filled) of \(capacity) beds filled.")
                    .font(.system(size: 13)).foregroundStyle(Palette.ink2).padding(.top, 6)
            }
            ForEach(live.rooms) { room in
                Button {
                    if selectedRooms.contains(room.id) { selectedRooms.remove(room.id) }
                    else if selectedRooms.count < 3 { selectedRooms.insert(room.id) }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(room.name).foregroundStyle(Palette.ink)
                            Text([room.floor, "\(room.occupied)/\(room.capacity)"].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                        if selectedRooms.contains(room.id) {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.accent)
                        }
                        if let rent = room.rentCents {
                            Text(MoneyFormat.cents(rent)).font(.system(size: 13).monospacedDigit()).foregroundStyle(Palette.ink2)
                        }
                    }
                    .padding(14)
                    .background(Palette.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func requestCard(_ live: ChapterContext) -> some View {
        GGCard(padding: 16) {
            Text("Request housing").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
            Text("Pick up to three rooms. Your house manager will see this.")
                .font(.system(size: 13)).foregroundStyle(Palette.ink3).padding(.top, 4)
            GGField(label: "Term") { GGTextField(placeholder: "Fall 2026", text: $term) }
                .padding(.top, 10)
            Toggle("I want a single", isOn: $wantsSingle).tint(Palette.accent).foregroundStyle(Palette.ink).padding(.top, 6)
            GGField(label: "Notes") { GGTextArea(placeholder: "Roommates, accessibility, or other notes", text: $notes, minHeight: 72) }
                .padding(.top, 8)
            GGButton(title: "Submit request", fillWidth: true, busy: busy) { Task { await submitRequest(live) } }
                .padding(.top, 12)
        }
    }

    private func manageRooms(_ live: ChapterContext) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            GGCard(padding: 16) {
                Text("Add a room").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                GGField(label: "Name") { GGTextField(placeholder: "204", text: $roomName) }.padding(.top, 8)
                GGField(label: "Floor") { GGTextField(placeholder: "Second", text: $roomFloor) }.padding(.top, 8)
                GGField(label: "Capacity") { GGTextField(placeholder: "2", text: $roomCapacity, keyboard: .numberPad) }.padding(.top, 8)
                GGField(label: "Rent") { GGTextField(placeholder: "850", text: $roomRent, keyboard: .decimalPad) }.padding(.top, 8)
                GGButton(title: "Add room", kind: .secondary, fillWidth: true, busy: busy) { Task { await addRoom(live) } }
                    .padding(.top, 12)
            }
            GGCard(padding: 16) {
                Text("Assign a member").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                Picker("Member", selection: $assignMember) {
                    Text("Choose a member").tag("")
                    ForEach(live.members) { member in
                        Text(member.name).tag(member.membershipId)
                    }
                }
                .tint(Palette.accent)
                Picker("Room", selection: $assignRoom) {
                    Text("Choose a room").tag("")
                    ForEach(live.rooms) { room in
                        Text(room.name).tag(room.id)
                    }
                }
                .tint(Palette.accent)
                GGButton(title: "Assign today", kind: .secondary, fillWidth: true, busy: busy) { Task { await assign(live) } }
                    .padding(.top, 8)
            }
        }
    }

    private func requests(_ live: ChapterContext, manager: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Requests").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
            if live.housingRequests.isEmpty {
                Text("No housing requests yet.").font(.system(size: 13)).foregroundStyle(Palette.ink3)
            }
            ForEach(live.housingRequests) { request in
                GGCard(padding: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(request.memberName).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                            Text("\(request.term)\(request.wantsSingle ? " · single" : "")")
                                .font(.system(size: 13)).foregroundStyle(Palette.ink2)
                            if let notes = request.notes, !notes.isEmpty {
                                Text(notes).font(.system(size: 13)).foregroundStyle(Palette.ink3)
                            }
                        }
                        Spacer()
                        GGBadge(text: request.status.capitalized, tone: request.status == "placed" ? .positive : request.status == "declined" ? .danger : .info)
                    }
                    if manager, request.status == "submitted" || request.status == "waitlisted" {
                        HStack {
                            GGButton(title: "Place", size: .sm) { Task { await respond(request.id, "placed") } }
                            GGButton(title: "Waitlist", kind: .secondary, size: .sm) { Task { await respond(request.id, "waitlisted") } }
                            GGButton(title: "Decline", kind: .ghost, size: .sm) { Task { await respond(request.id, "declined") } }
                        }
                        .padding(.top, 10)
                    }
                }
            }
        }
    }

    private func maintenance(_ live: ChapterContext, manager: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            GGCard(padding: 16) {
                Text("Maintenance").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                GGField(label: "Issue") { GGTextField(placeholder: "Leaky faucet in 204", text: $issue) }.padding(.top, 8)
                GGField(label: "Location") { GGTextField(placeholder: "Second floor bathroom", text: $location) }.padding(.top, 8)
                Picker("Priority", selection: $priority) {
                    Text("Low").tag("low")
                    Text("Normal").tag("normal")
                    Text("High").tag("high")
                    Text("Urgent").tag("urgent")
                }
                .pickerStyle(.segmented)
                .padding(.top, 8)
                GGButton(title: "Submit request", fillWidth: true, busy: busy) { Task { await submitMaintenance(live) } }
                    .padding(.top, 12)
            }
            ForEach(live.maintenanceRequests) { item in
                GGCard(padding: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title).foregroundStyle(Palette.ink)
                            Text([item.location, item.priority].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                        GGBadge(text: item.status.replacingOccurrences(of: "_", with: " ").capitalized, tone: item.status == "resolved" ? .positive : .warning)
                    }
                    if manager, item.status == "open" || item.status == "in_progress" {
                        HStack {
                            GGButton(title: "In progress", kind: .secondary, size: .sm) { Task { await setMaintenance(item.id, "in_progress") } }
                            GGButton(title: "Resolved", size: .sm) { Task { await setMaintenance(item.id, "resolved") } }
                        }
                        .padding(.top, 10)
                    }
                }
            }
        }
    }

    private func chores(_ live: ChapterContext) -> some View {
        GGCard {
            GGCardHeader(title: "Chores")
            if live.chores.isEmpty {
                Text("No chores assigned to you.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.ink3)
                    .padding(14)
            }
            ForEach(live.chores) { chore in
                Button { session.toggleChore(chore.id) } label: {
                    HStack {
                        Image(systemName: chore.done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(chore.done ? Palette.accent : Palette.ink3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chore.title).foregroundStyle(Palette.ink).strikethrough(chore.done)
                            Text("\(chore.assignee) · \(chore.due)").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                    }
                    .padding(14)
                }
            }
        }
    }

    private func submitRequest(_ live: ChapterContext) async {
        guard term.trimmingCharacters(in: .whitespaces).count >= 2 else {
            message = "Which term is this for?"
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.submitHousingRequest(
                chapterId: chapter.chapter.id,
                term: term.trimmingCharacters(in: .whitespaces),
                roomIds: Array(selectedRooms),
                roommateIds: [],
                wantsSingle: wantsSingle,
                notes: notes.isEmpty ? nil : notes
            )
        }
        busy = false
        if message == nil { message = "Request saved. Your house manager will see it." }
    }

    private func addRoom(_ live: ChapterContext) async {
        guard roomName.trimmingCharacters(in: .whitespaces).isEmpty == false else { return }
        let rent = roomRent.isEmpty ? nil : Int((Double(roomRent) ?? 0) * 100)
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.saveHousingRoom(
                chapterId: chapter.chapter.id,
                name: roomName,
                floor: roomFloor.isEmpty ? nil : roomFloor,
                capacity: Int(roomCapacity) ?? 2,
                rentCents: rent
            )
        }
        busy = false
        if message == nil {
            message = "Room added."
            roomName = ""
        }
    }

    private func assign(_ live: ChapterContext) async {
        guard !assignMember.isEmpty, !assignRoom.isEmpty else { return }
        busy = true
        message = await session.performChapter { store, _ in
            try await store.assignRoom(roomId: assignRoom, membershipId: assignMember, startsOn: Date())
        }
        busy = false
        if message == nil { message = "Assigned." }
    }

    private func respond(_ id: String, _ status: String) async {
        message = await session.performChapter { store, _ in
            try await store.respondHousingRequest(id: id, status: status, response: nil)
        }
        if message == nil { message = "Response sent." }
    }

    private func submitMaintenance(_ live: ChapterContext) async {
        guard issue.trimmingCharacters(in: .whitespaces).count >= 3 else {
            message = "Describe the issue briefly."
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.submitMaintenance(
                chapterId: chapter.chapter.id,
                title: issue,
                location: location.isEmpty ? nil : location,
                description: nil,
                priority: priority
            )
        }
        busy = false
        if message == nil {
            message = "Request submitted."
            issue = ""
        }
    }

    private func setMaintenance(_ id: String, _ status: String) async {
        message = await session.performChapter { store, _ in
            try await store.updateMaintenance(id: id, status: status)
        }
        if message == nil { message = "Request updated." }
    }
}

struct StandardsView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    @State private var title = ""
    @State private var bodyText = ""
    @State private var category = "general"
    @State private var requiresAck = true
    @State private var incident = ""
    @State private var incidentCategory = "other"
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        let live = session.selectedChapter ?? chapter
        let manager = live.can(.standardsManage) || live.can(.chapterManage)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Standards", description: "Policies, acknowledgments, and confidential incident reports.")
                GGNotice(tone: .warning, title: "Emergencies and Title IX", message: "Use campus Title IX and national reporting channels. Call 911 in an emergency. GreekGeek is not a substitute for those obligations.")
                if let message { GGNotice(tone: .info, message: message) }
                if manager {
                    GGCard(padding: 16) {
                        Text("Publish a policy").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                        GGField(label: "Title") { GGTextField(placeholder: "Risk policy", text: $title) }.padding(.top, 8)
                        Picker("Category", selection: $category) {
                            Text("General").tag("general")
                            Text("Risk").tag("risk")
                            Text("Bylaws").tag("bylaws")
                            Text("Housing").tag("housing")
                            Text("Finance").tag("finance")
                            Text("Standards").tag("standards")
                        }
                        .tint(Palette.accent)
                        Toggle("Requires acknowledgment", isOn: $requiresAck).tint(Palette.accent).padding(.top, 6)
                        GGField(label: "Policy text") { GGTextArea(placeholder: "Write the policy", text: $bodyText, minHeight: 140) }
                            .padding(.top, 8)
                        GGButton(title: "Publish", fillWidth: true, busy: busy) { Task { await publish() } }
                            .padding(.top, 12)
                    }
                }
                ForEach(live.policies) { policy in
                    GGCard(padding: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(policy.title).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                                Text("Version \(policy.version) · \(policy.category.capitalized)")
                                    .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                            if policy.acknowledged {
                                GGBadge(text: "Acknowledged", tone: .positive)
                            } else {
                                GGButton(title: "Acknowledge", size: .sm) { session.acknowledgePolicy(policy.id) }
                            }
                        }
                    }
                }
                GGCard(padding: 16) {
                    Text("Confidential report").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                    Picker("Category", selection: $incidentCategory) {
                        Text("Safety").tag("safety")
                        Text("Hazing").tag("hazing")
                        Text("Harassment").tag("harassment")
                        Text("Other").tag("other")
                    }
                    .tint(Palette.accent)
                    GGField(label: "What happened") { GGTextArea(placeholder: "Only standards officers can see this.", text: $incident, minHeight: 120) }
                        .padding(.top, 8)
                    GGButton(title: "Submit report", kind: .secondary, fillWidth: true, busy: busy) { Task { await fileIncident() } }
                        .padding(.top, 12)
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
    }

    private func publish() async {
        guard title.count >= 2, !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            message = "Give the policy a title and write the text."
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.createPolicy(chapterId: chapter.chapter.id, title: title, category: category, body: bodyText, requiresAck: requiresAck)
        }
        busy = false
        if message == nil {
            message = "Policy published."
            title = ""
            bodyText = ""
        }
    }

    private func fileIncident() async {
        guard incident.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10 else {
            message = "Describe what happened in at least 10 characters."
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.fileIncident(chapterId: chapter.chapter.id, category: incidentCategory, description: incident, location: nil)
        }
        busy = false
        if message == nil {
            message = "Report submitted. Only standards officers can see it."
            incident = ""
        }
    }
}

struct AcademicsView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    @State private var groupName = ""
    @State private var course = ""
    @State private var meeting = ""
    @State private var goalTitle = ""
    @State private var goalDate = Date()
    @State private var hasDate = false
    @State private var share = false
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        let live = session.selectedChapter ?? chapter
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GGPageHeader(title: "Academics", description: "Study groups and private goals. GreekGeek does not collect grades or transcripts.")
                if let message { GGNotice(tone: .info, message: message) }
                GGCard(padding: 16) {
                    Text("Add a goal").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                    GGField(label: "Goal") { GGTextField(placeholder: "Finish problem set reviews before midterms", text: $goalTitle) }
                        .padding(.top, 8)
                    Toggle("Target date", isOn: $hasDate).tint(Palette.accent)
                    if hasDate {
                        DatePicker("Target", selection: $goalDate, displayedComponents: .date).tint(Palette.accent)
                    }
                    Toggle("Share with scholarship chair", isOn: $share).tint(Palette.accent)
                    GGButton(title: "Save goal", fillWidth: true, busy: busy) { Task { await addGoal() } }
                        .padding(.top, 10)
                }
                ForEach(live.academicGoals) { goal in
                    GGCard(padding: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(goal.title).foregroundStyle(Palette.ink)
                                if let date = goal.targetDate {
                                    Text(DateFormat.medium(date)).font(.system(size: 12)).foregroundStyle(Palette.ink3)
                                }
                            }
                            Spacer()
                            GGBadge(text: goal.status.capitalized, tone: goal.status == "achieved" ? .positive : .info)
                        }
                        if goal.status == "active" {
                            HStack {
                                GGButton(title: "Mark achieved", size: .sm) { Task { await setGoal(goal.id, "achieved") } }
                                GGButton(title: "Drop", kind: .ghost, size: .sm) { Task { await setGoal(goal.id, "dropped") } }
                            }
                            .padding(.top, 8)
                        }
                    }
                }
                GGCard(padding: 16) {
                    Text("New study group").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                    GGField(label: "Name") { GGTextField(placeholder: "Organic chemistry", text: $groupName) }.padding(.top, 8)
                    GGField(label: "Course") { GGTextField(placeholder: "CHEM 241", text: $course) }.padding(.top, 8)
                    GGField(label: "Meeting") { GGTextField(placeholder: "Sundays 7pm, library", text: $meeting) }.padding(.top, 8)
                    GGButton(title: "Create group", kind: .secondary, fillWidth: true, busy: busy) { Task { await createGroup() } }
                        .padding(.top, 12)
                }
                ForEach(live.studyGroups) { group in
                    GGCard(padding: 16) {
                        Text(group.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                        Text([group.course, group.nextMeeting, "\(group.members) members"].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.system(size: 13)).foregroundStyle(Palette.ink2).padding(.top, 4)
                        GGButton(title: group.joined ? "Leave" : "Join", kind: .secondary, size: .sm) {
                            Task { await toggle(group) }
                        }
                        .padding(.top, 10)
                    }
                }
            }
            .padding(16)
        }
        .greekGeekScreen()
    }

    private func addGoal() async {
        guard goalTitle.trimmingCharacters(in: .whitespaces).count >= 2 else {
            message = "Describe the goal."
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.addAcademicGoal(chapterId: chapter.chapter.id, title: goalTitle, targetDate: hasDate ? goalDate : nil, share: share)
        }
        busy = false
        if message == nil {
            message = "Goal added."
            goalTitle = ""
        }
    }

    private func setGoal(_ id: String, _ status: String) async {
        message = await session.performChapter { store, _ in
            try await store.updateAcademicGoal(id: id, status: status)
        }
    }

    private func createGroup() async {
        guard groupName.trimmingCharacters(in: .whitespaces).count >= 2 else {
            message = "Name the group."
            return
        }
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.createStudyGroup(
                chapterId: chapter.chapter.id,
                name: groupName,
                course: course.isEmpty ? nil : course,
                meeting: meeting.isEmpty ? nil : meeting
            )
        }
        busy = false
        if message == nil {
            message = "Study group created."
            groupName = ""
            course = ""
            meeting = ""
        }
    }

    private func toggle(_ group: StudyGroup) async {
        message = await session.performChapter { store, chapter in
            try await store.toggleStudyGroup(chapterId: chapter.chapter.id, groupId: group.id, join: !group.joined)
        }
    }
}

struct SettingsView: View {
    @Environment(AppSession.self) private var session
    let chapter: ChapterContext
    var onSelectMember: (DirectoryMember) -> Void = { _ in }
    @State private var letters = ""
    @State private var description = ""
    @State private var founded = ""
    @State private var timezone = "America/Chicago"
    @State private var modules: [ChapterModule: Bool] = [:]
    @State private var inviteEmail = ""
    @State private var inviteName = ""
    @State private var inviteClass = "active"
    @State private var message: String?
    @State private var busy = false

    private let zones = [
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico"
    ]

    var body: some View {
        let live = session.selectedChapter ?? chapter
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GGPageHeader(title: "Settings")
                if let message { GGNotice(tone: .info, message: message) }
                if live.can(.chapterManage) { profileEditor(live) }
                if live.can(.chapterManage) { modulesEditor }
                if live.can(.chapterManage) || live.can(.paymentsConfigure) || live.can(.financeView) { billing(live) }
                if live.can(.membersManage) { members(live) }
                if live.can(.rolesManage) { roles(live) }
                if live.can(.auditView) { audit(live) }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .greekGeekScreen()
        .onAppear {
            letters = live.chapter.greekLetters ?? ""
            description = live.profileDetails.description
            founded = live.profileDetails.foundedYear.map(String.init) ?? ""
            timezone = live.chapter.timezone
            modules = Dictionary(uniqueKeysWithValues: ChapterModule.allCases.map { ($0, live.chapter.isEnabled($0)) })
        }
    }

    private func profileEditor(_ live: ChapterContext) -> some View {
        GGCard(padding: 16) {
            Text("Chapter profile").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
            labeled("Organization", live.chapter.organizationName)
            labeled("Chapter", live.chapter.designation ?? "None")
            labeled("Handle", live.chapter.slug)
            labeled("University", live.chapter.universityName ?? "—")
            GGField(label: "Greek letters") { GGTextField(placeholder: "ΑΒ", text: $letters) }.padding(.top, 8)
            GGField(label: "Description") { GGTextArea(placeholder: "About the chapter", text: $description) }.padding(.top, 8)
            GGField(label: "Founded") { GGTextField(placeholder: "1921", text: $founded, keyboard: .numberPad) }.padding(.top, 8)
            Picker("Timezone", selection: $timezone) {
                ForEach(zones, id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ")).tag($0) }
            }
            .tint(Palette.accent)
            GGButton(title: "Save profile", fillWidth: true, busy: busy) { Task { await saveProfile() } }
                .padding(.top, 12)
        }
    }

    private var modulesEditor: some View {
        GGCard(padding: 16) {
            Text("Modules").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
            Text("Choose which programs your chapter uses.")
                .font(.system(size: 13)).foregroundStyle(Palette.ink3).padding(.bottom, 6)
            ForEach(ChapterModule.allCases) { module in
                Toggle(module.title, isOn: Binding(
                    get: { modules[module] ?? false },
                    set: { modules[module] = $0 }
                ))
                .tint(Palette.accent)
                .foregroundStyle(Palette.ink)
                .padding(.vertical, 4)
            }
            GGButton(title: "Save modules", kind: .secondary, fillWidth: true, busy: busy) { Task { await saveModules() } }
                .padding(.top, 12)
        }
    }

    private func billing(_ live: ChapterContext) -> some View {
        let bill = live.billing
        return GGCard(padding: 16) {
            Text("Stripe and billing").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
            Text("Card collection and payouts use Stripe’s hosted flow.")
                .font(.system(size: 14)).foregroundStyle(Palette.ink2).padding(.vertical, 8)
            labeled("Agreement", bill.termsAccepted ? (bill.signerName.map { "Accepted by \($0)" } ?? "Accepted") : "Not accepted")
            labeled("Subscription", "\(LedgerCopy.subscription(bill.subscription)) · \(MoneyFormat.cents(bill.amountCents)) / month")
            if let end = bill.periodEnd { labeled("Current period ends", DateFormat.medium(end)) }
            labeled("Card payments", bill.cardPayments.replacingOccurrences(of: "_", with: " ").capitalized)
            labeled("Payouts", bill.payouts.replacingOccurrences(of: "_", with: " ").capitalized)
            labeled("Online collection", bill.canCollect ? "On" : "Off")
            GGDesktopHint()
                .padding(.top, 8)
        }
    }

    private func members(_ live: ChapterContext) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            GGCard(padding: 16) {
                Text("Invite a member").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.ink)
                Text("If they already have a GreekGeek account, they join the roster immediately.")
                    .font(.system(size: 13)).foregroundStyle(Palette.ink3).padding(.top, 4)
                GGDesktopHint()
                    .padding(.top, 2)
                GGField(label: "Email") { GGTextField(placeholder: "jordan@school.edu", text: $inviteEmail, keyboard: .emailAddress, contentType: .emailAddress) }
                    .padding(.top, 8)
                GGField(label: "Full name") { GGTextField(placeholder: "Jordan Lee", text: $inviteName) }.padding(.top, 8)
                Picker("Class", selection: $inviteClass) {
                    Text("Active").tag("active")
                    Text("New member").tag("new_member")
                    Text("Associate").tag("associate")
                    Text("Alumni").tag("alumni")
                }
                .tint(Palette.accent)
                GGButton(title: "Add or invite", fillWidth: true, busy: busy) { Task { await invite() } }
                    .padding(.top, 10)
            }
            GGCard {
                GGCardHeader(title: "Members", description: "\(live.members.count) current members")
                ForEach(live.members) { member in
                    Button {
                        onSelectMember(member)
                    } label: {
                        HStack {
                            PersonAvatar(name: member.name, path: member.avatarPath, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name).foregroundStyle(Palette.ink)
                                Text(([member.status.label, member.memberClass.label] + member.roles).joined(separator: " · "))
                                    .font(.system(size: 12)).foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Palette.ink3)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                }
            }
            if !live.invitations.isEmpty {
                GGCard {
                    GGCardHeader(title: "Pending invitations")
                    ForEach(live.invitations) { invite in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(invite.fullName ?? invite.email).foregroundStyle(Palette.ink)
                                Text("\(invite.email) · \(invite.memberClass.label)").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                            }
                            Spacer()
                        }
                        .padding(14)
                    }
                }
            }
        }
    }

    private func roles(_ live: ChapterContext) -> some View {
        GGCard {
            GGCardHeader(title: "Roles", description: "Roles decide what officers can see and do.")
            ForEach(live.roles) { role in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(role.name).foregroundStyle(Palette.ink)
                        Text(role.kind == "system" ? "Standard" : "Custom").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("\(role.holders) holding").font(.system(size: 12)).foregroundStyle(Palette.ink2)
                        Text("\(role.permissionCount) permissions").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                    }
                }
                .padding(14)
            }
            GGDesktopHint()
                .padding(14)
        }
    }

    private func audit(_ live: ChapterContext) -> some View {
        GGCard {
            GGCardHeader(title: "Audit log", description: "Sensitive changes, newest first. Entries cannot be edited.")
            if live.auditLogs.isEmpty {
                GGEmptyState(icon: "scroll", title: "Nothing recorded yet")
            } else {
                ForEach(live.auditLogs) { row in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(row.action).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.ink)
                        Text("\(row.actor) · \(DateFormat.relative(row.when))").font(.system(size: 12)).foregroundStyle(Palette.ink3)
                        if !row.detail.isEmpty {
                            Text(row.detail).font(.system(size: 12)).foregroundStyle(Palette.ink2)
                        }
                    }
                    .padding(14)
                }
            }
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(Palette.ink3)
            Spacer(minLength: 12)
            Text(value).foregroundStyle(Palette.ink).multilineTextAlignment(.trailing)
        }
        .font(.system(size: 14))
        .padding(.vertical, 6)
    }

    private func saveProfile() async {
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.updateChapterProfile(
                chapterId: chapter.chapter.id,
                greekLetters: letters,
                description: description,
                foundedYear: Int(founded),
                timezone: timezone
            )
        }
        busy = false
        if message == nil { message = "Chapter profile saved." }
    }

    private func saveModules() async {
        busy = true
        message = await session.performChapter { store, chapter in
            try await store.updateChapterModules(chapterId: chapter.chapter.id, modules: modules)
        }
        busy = false
        if message == nil { message = "Modules updated." }
    }

    private func invite() async {
        let email = inviteEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.contains("@") else {
            message = "Enter a valid email address."
            return
        }
        busy = true
        var status = "no_account"
        let error = await session.performChapter { store, chapter in
            status = try await store.addExistingMember(chapterId: chapter.chapter.id, email: email, memberClass: inviteClass)
        }
        busy = false
        if let error {
            message = error
        } else if status == "added" {
            message = "\(inviteName.isEmpty ? email : inviteName) already had an account and is now on the roster."
            inviteEmail = ""
            inviteName = ""
        } else if status == "already_member" {
            message = "This person is already an active member."
        } else {
            message = "No account uses that email yet. There are more settings there to send a join link."
        }
    }
}
