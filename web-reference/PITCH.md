# GreekGeek

**The operating system for a fraternity or sorority chapter.** Dues, messages, events, recruitment, and everything officers juggle, in one place that the next officer can pick up where the last one left off.

---

## The problem

Ask any chapter treasurer how dues work and you'll hear some version of the same story. Members pay through Venmo, Zelle, cash at chapter, and the occasional check. The treasurer keeps a spreadsheet and tries to match payments to names. Somebody sends "pd" with no note. At the end of the semester, nobody is quite sure who still owes what.

Then the treasurer graduates, and the next one starts from scratch.

Money is only part of it. Announcements get lost in a group chat with 200 unread messages. Attendance at required events is a sign-in sheet that ends up in someone's car. Recruitment notes live in a shared Google Doc that half the chapter can edit. Every officer position turns over every year, and very little survives the handoff.

Chapters aren't short on tools. They're short on one place where the work actually stays.

## What GreekGeek does

GreekGeek gives each chapter a private, verified workspace. Members join by invitation, officers get the tools their role needs, and the records stay with the chapter instead of with whoever held the job last year.

### Dues that reconcile themselves

This is the core of the product and where most of the engineering went.

- **Treasurers bill in a few clicks.** Create a charge like "Spring dues", choose who it applies to, set a due date, and send it. Members are notified right away.
- **Members pay by card or bank transfer** through Stripe Checkout. They pay exactly what they owe, with no surprise surcharges, and treasurers can split a balance into installment plans.
- **The money goes straight to the chapter.** Each chapter connects its own Stripe account and is the merchant of record for its dues. GreekGeek never holds chapter money.
- **Cash and Venmo still count.** Treasurers can record offline payments, credits, and adjustments, so the balance is right no matter how someone paid.
- **Late fees and late joiners are part of the charge.** A treasurer can add a late fee after a grace period, exempt someone, and bill members who join after the assessment went out.
- **Reimbursements and a budget live next to dues.** Members request repayment. The treasurer reviews it and records what was paid. Planned budget lines and expenses sit beside the ledger, so the semester's books are in one place.
- **Every dollar has a paper trail.** Payments, refunds, credits, and Stripe disputes are written to a double-entry ledger that can't be edited after the fact. Balances are calculated from that ledger, not typed in. Members get receipts. Treasurers can export payments, the ledger, and member balances to CSV for their national organization or school.

When the next treasurer takes over, the full history is already there.

### A chapter that actually communicates

- **Chat built for chapters.** Channels, direct messages, threads, replies, reactions, mentions of people and roles, file and image sharing, and unread counts that update live. Officers can moderate, and members can report messages. Channel access follows roles, so it updates when someone is added or removed.
- **Announcements people can't miss.** Officers write them like a document, with formatting and pictures. They can pin posts, limit them to officers, and require members to acknowledge them. The chapter can see who has read them and who hasn't. Members can comment. Officers can remove a comment, and the person who wrote the announcement can turn comments off.
- **Notifications that respect people's time.** Members choose what they hear about in the app and by email. Verification, invitations, and account changes are always emailed.

### Events and attendance

- RSVPs with capacity limits and deadlines.
- A written description and photos, so the details aren't stuck in a follow-up text.
- **QR check-in** with codes that rotate every 30 seconds, so a photo of the code doesn't work for long.
- Required events can be limited to certain member classes. Attendance corrections are logged, so excused absences don't turn into arguments.

### Recruitment

- A pipeline board for potential new members, with notes, activities, and follow-up reminders.
- Notes can be restricted to the recruitment team.
- **Recruiter credit.** When a new member accepts their invitation, they're asked who recruited them. Only officers can see the answer, and it feeds a "top recruiters" view on the president's dashboard.

### The roster

- A searchable directory with profiles, graduation year, officer roles, and badges. Members choose who can see each part of their profile.
- **In house or out of house is obvious for actives.** Anyone with a current room is marked in house. Actives without one are marked out of house. The directory can be filtered either way.
- **A built-in Pledge role.** Pledges can use chat, events, announcements, dues, and the directory. They cannot see housing, rooms, or who lives in the house, because they are not members yet. An officer who also holds the role still can.
- Officers invite people one at a time or import a CSV. Built-in roles cover president, treasurer, secretary, recruitment, housing, standards, and the rest of a typical exec board, and a chapter can add its own.
- Committees, badges officers award, and a record when someone is removed from the chapter. Removing a member takes away access. The reason stays on file.

### Dashboards for officers and members

- **Officers** see the chapter at a glance: membership by class, growth month to month, required-attendance rates, how many members are active in chat, announcement acknowledgment, finances for the month, and the recruitment pipeline.
- **Members** see where they stand: their balance, attendance, service hours, badges, and a to-do list of what's waiting on them (announcements to acknowledge, tasks, chores, policies, trainings).
- **Presidents get a setup checklist** on the overview, with a progress bar: profile, roster, officers, dues, then the programs the chapter actually uses. Steps that don't apply, such as a house the chapter doesn't have, can be skipped.

### Programs the chapter turns on when it needs them

Each of these can be switched on or off per chapter:

| Program | What it covers |
| --- | --- |
| Philanthropy | Service hours with officer approval, volunteer shifts, fundraising campaigns |
| Housing | Rooms and beds, named floors, a live view of who is in house, roommate requests, optional rent billed onto a resident's dues, chore rotations, maintenance requests, space reservations, supplies, inventory |
| Standards | Versioned bylaws and policies with sign-off, required trainings, confidential incident reports |
| Academics | Study groups, mentorship pairs, private academic goals |

## Built to be trusted

Greek life involves real money, parents who ask questions, universities, and national organizations. Trust has to be part of the product, not something added later.

- **Every chapter is verified by a person** before it can collect money. Officers apply, pick their university from a real school directory, confirm a school email or upload supporting documents, and a GreekGeek reviewer approves them. Reviewers can't approve their own applications. A platform administrator applying for their own chapter can be verified without that queue.
- **Closing a chapter is a request, not a button.** The president asks, and a platform administrator has to accept it. Until then the chapter stays open. After it is accepted, members lose access and the financial records stay.
- **Chapters are fully isolated from each other** at the database level, not just in the interface.
- **Private means private.** GreekGeek staff cannot read a chapter's chats, direct messages, recruitment notes, incident reports, or academic goals. That restriction is built into the database and covered by automated tests.
- **Card data never touches our servers.** Payments run through Stripe Checkout.
- **Payments are only marked paid when Stripe confirms them.** The system re-checks the amount, currency, and destination with Stripe before crediting anyone.
- **Accounts belong to the person.** Changing a password requires a code sent to the current email. Changing the email requires a code from the current address, then a second code from the new one. Members can download their personal data or delete the account. Deletion removes the profile, messages, and verification documents, and keeps payment records in anonymized form because the chapter and tax rules still need them.
- **Everything important is audited.** Every role change, payment setting, refund, policy change, verification decision, and chapter closure is logged.

## Business model

Two simple charges, shown separately everywhere an officer sees billing:

| | Price | Paid by |
| --- | --- | --- |
| Chapter subscription | $30 per month | The chapter |
| Dues processing | 1.5% of each online dues payment | Deducted from the payment before it reaches the chapter, alongside Stripe's standard processing fee |

The subscription covers every tool for unlimited members, officers, and alumni. There's no per-seat pricing to argue about at chapter meeting.

**An example.** Take a chapter of 60 members paying $450 a semester, mostly online:

- Dues collected online: about $27,000 a semester
- Platform fee at 1.5%: about $405
- Subscription: $180 a semester
- **Revenue to GreekGeek: about $585 per chapter per semester**, or roughly $1,170 a year

For the chapter, $30 a month costs less than one late fee chased down by hand, and 1.5% is a small price to stop reconciling Venmo screenshots. The public pricing page includes a calculator so officers can see exactly what they'll net before they sign up.

Pricing is managed in the admin panel. A new rate can be published at any time, and payments that already exist keep the rate they were created under.

## Why this wins

- **It starts with the money.** Most chapter tools treat payments as a feature. GreekGeek treats the ledger as the foundation, which is what treasurers, advisors, and national organizations actually care about.
- **It survives officer turnover.** Roles, records, and history belong to the chapter, so a new exec board inherits a working system instead of a password.
- **One subscription replaces several tools.** Group chat, payment apps, spreadsheets, sign-up forms, and shared docs collapse into a single place members already need to open to pay dues.
- **Dues drive adoption.** Every member has a reason to log in at least once a semester, and once they're in, chat, events, and announcements keep them there.

## Where it stands

The product is built and running end to end:

- Chapter sign-up against a university directory, verification, a president setup checklist, and invitations with recruiter credit and CSV import
- Stripe Connect onboarding, subscriptions, dues checkout, installments, late fees, refunds, receipts, reimbursements, a budget, and the double-entry ledger
- Live chat, announcements with pictures and comments, events with QR check-in, and recruitment
- A directory that shows which actives are in house, a Pledge role that cannot see housing, and officer tools to remove a member
- Philanthropy, housing with named floors and optional resident rent, standards, and academics
- Officer and member dashboards, branded email for verification, invitations, and account changes, and a platform admin console for verification, chapter closure, revenue, reconciliation, and pricing
- Account export, account deletion, and email or password changes that require a verification code

It's backed by 222 automated tests covering permissions, chapter isolation, the ledger, and payment processing against a simulated Stripe.

GreekGeek is a student project. Amare and Owen are students at the University of Missouri. Notes go to amare@greekgeek.org and owen@greekgeek.org, or through the contact page.

**Next steps before launch:** move Stripe to live mode, finish domain email setup on greekgeek.org, run a real payment and refund end to end, and have the terms and privacy policy reviewed by counsel.

## What we're looking for

- **Pilot chapters** willing to run a semester of dues, events, and the roster on GreekGeek and tell us what's missing.
- **Introductions to councils, advisors, and national organizations** who want better visibility into chapter finances.
- **Partners and early backers** who understand campus life and want to help put it in front of chapters.

---

*GreekGeek · greekgeek.org*
