# GreekGeek

GreekGeek is a management platform for fraternity and sorority chapters. It covers dues collection, treasurer tools, messaging, events with QR check-in, a recruitment CRM, announcements, philanthropy, housing, standards, academics, and analytics. Every chapter is verified by platform staff before it can collect money.

Built with Next.js 16 (App Router, Cache Components), Supabase (Postgres, Auth, Storage, Realtime), Stripe Connect and Stripe Billing, and Tailwind CSS 4.

## How money moves

There are two separate charges, and the product shows them separately everywhere a chapter officer sees billing.

| Charge | Who pays | Where it lands | How |
| --- | --- | --- | --- |
| Platform subscription, $30 per month per chapter | The chapter | The platform's Stripe account | Stripe Billing subscription, started from chapter settings |
| Member dues | Each member | The chapter's own Stripe connected account | Stripe Checkout direct charge, with a 1.5% platform application fee |

- Dues never pass through the platform's balance. The chapter is the merchant of record for its own dues.
- The 1.5% fee comes from the published pricing rule. Staff can publish a new rule version, and existing payments keep the rule they were created with.
- Members always see the exact total before paying. The public pricing page has a fee calculator.
- A dues payment is only marked paid after the server receives a Stripe webhook whose signature is valid. The server then re-fetches the object from Stripe and checks the amount, currency, connected account, and application fee against the stored payment. Redirects such as `?checkout=success` only display a notice.

## Architecture

```
src/
  app/
    (marketing)/          public home, pricing + fee calculator, legal pages
    (auth)/               sign up, log in, password reset
    (app)/home            chapter picker
    (app)/onboarding      chapter application wizard and status
    (app)/c/[slug]/       everything inside a chapter (see modules below)
    (app)/admin/          platform staff: verification, chapters, revenue, reconciliation, pricing, audit
    api/stripe/webhook    Stripe webhook (platform and Connect events)
    api/stripe/account-events  Stripe v2 account event destination
    api/connect/return, api/connect/refresh  Stripe Connect onboarding return/refresh links
    api/jobs/[job]        cron jobs protected by CRON_SECRET
    auth/confirm          email confirmation and magic link handler
  components/             design system (ui.tsx, forms.tsx, simple-form.tsx), navigation, people
  lib/                    domain logic: money, fees, installments, permissions, ledger, payment state, jobs
  lib/stripe/             Stripe client, checkout, Connect, subscription, webhook processor
  lib/supabase/           server client (user session), admin client (service role, server-only), public client
  proxy.ts                session refresh and route protection
supabase/migrations/      the full schema, RLS policies, and RPCs in order
tests/unit                pure domain logic
tests/db                  migrations, RLS, and RPCs on an in-process Postgres (PGlite)
tests/integration         webhook processing against a simulated Stripe
```

Security model:

- **Tenant isolation.** Every chapter-owned row has `chapter_id`, and row-level security restricts each table to members of that chapter. Cross-table references use composite foreign keys on `(chapter_id, id)`, so a row can never point at another chapter's data.
- **Permissions.** Roles are built from a fixed permission catalog. Writes that span tables, or need checks beyond RLS, go through `SECURITY DEFINER` functions with `search_path = ''`.
- **The service role key** is only used in server code (`src/lib/supabase/admin.ts` imports `server-only`). It is used for webhooks, cron jobs, and a few staff actions.
- **Platform staff** cannot read private chats, direct messages, recruitment notes, incident reports, or academic goals. The tests check this.
- **Money is append-only.** Payments, refunds, credits, and adjustments post balanced double-entry rows to `ledger_entries`. Each row has a unique idempotency key, and the table has an append-only trigger. Balances are derived from the ledger.
- **Webhooks are idempotent.** Each Stripe event id is claimed in `stripe_events` before processing. Duplicates are skipped, failures can be retried, and the "processing" status acts as a 2-minute lease.

## Chapter modules

| Area | Path | Highlights |
| --- | --- | --- |
| Overview | `/c/[slug]` | Balance, upcoming events, announcements |
| Messages | `/c/[slug]/chat` | Channels, direct messages, reactions, edits, attachments, unread counts, moderation, Realtime |
| Announcements | `/c/[slug]/announcements` | Pinning, officer-only posts, read acknowledgments |
| Events | `/c/[slug]/events` | RSVP, rotating signed QR check-in, attendance with a correction log |
| Directory | `/c/[slug]/directory` | Profiles, roles, badges |
| My dues | `/c/[slug]/dues` | Balance, installments, Checkout, receipts |
| Reimbursements | `/c/[slug]/reimbursements` | Members request repayment; the treasurer reviews it in Finances |
| Finances | `/c/[slug]/finances` | Assessments, member balances, payments and refunds, reimbursements, budget, ledger, reports, CSV export |
| Recruitment | `/c/[slug]/recruitment` | Pipeline board, notes (optionally restricted), activities, follow-ups, invite to join |
| Analytics | `/c/[slug]/analytics` | Aggregate engagement, attendance, service hours, recruitment funnel |
| Philanthropy | `/c/[slug]/philanthropy` | Service hours with officer review, volunteer shifts, campaigns, offline donation records |
| Housing | `/c/[slug]/housing` | Chores, maintenance requests, space reservations without overlaps, supplies, inventory |
| Standards | `/c/[slug]/standards` | Versioned policies with acknowledgments, training requirements, confidential incident reports |
| Academics | `/c/[slug]/academics` | Study groups, mentorship pairs, private goals |
| Settings | `/c/[slug]/settings` | Chapter profile, modules, members and CSV import, invitations, roles, payments setup, subscription, audit log |

Philanthropy, housing, standards, academics, and recruitment can each be turned on or off per chapter.

## Schema

Migrations in `supabase/migrations` are applied in filename order:

| File | Contents |
| --- | --- |
| `000100_foundation` | Profiles, universities, chapters, memberships, roles, permissions, audit log, helper functions |
| `000200_verification` | Chapter applications, evidence storage, review events, institutional email checks |
| `000250_notifications` | Notification kinds, preferences, the in-app and email outbox |
| `000300_finance` | Pricing rules, terms, assessments, installments, payments, refunds, credits, ledger, receipts, connected accounts, subscriptions, Stripe event log |
| `000400_social` | Badges, invitations, chat channels, messages, reactions, attachments, storage buckets, Realtime publication |
| `000500_operations` | Committees, events, RSVPs, attendance, recruitment, philanthropy, housing, standards, academics, budget, reimbursements, analytics summary |
| `000600_reference_data` | Permission catalog, role templates, notification kinds, default pricing, $30/month plan |
| `000700_reporting` | Account balances, monthly collections |
| `000800_roles` | Role management RPCs |
| `000900_chat_guards` | Message edit and delete rules |
| `001000_jobs` | Cron job functions: email outbox lease, reminders, follow-ups |
| `001100_admin` | Staff review notes, chapter overview |
| `001200_programs` | Chore edit guard; notifications for chores, maintenance, policies, and reimbursements |

## Environment variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

| Variable | Required | Exposed to browser | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | yes | Absolute URL used in emails, QR codes, and Stripe return URLs |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | Publishable (anon) key; `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works |
| `SUPABASE_SECRET_KEY` | yes | **no** | Secret (service role) key; `SUPABASE_SERVICE_ROLE_KEY` also works |
| `STRIPE_SECRET_KEY` | for payments | **no** | Platform secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | for payments | **no** | Signing secret of the webhook endpoint |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | optional | **no** | Signing secret of a separate Connect endpoint, if you create one |
| `STRIPE_ACCOUNT_EVENTS_SECRET` | optional | **no** | Signing secret of the v2 account event destination |
| `APP_SIGNING_SECRET` | yes | **no** | 32+ random characters; signs QR check-in tokens and hashes invitation tokens |
| `CRON_SECRET` | for jobs | **no** | Bearer token cron requests must send |
| `DEV_SKIP_EMAIL_CONFIRMATION` | no | no | `true` creates sign-ups as already confirmed and signs them in. Ignored when `NODE_ENV=production` |
| `RESEND_API_KEY` | for email | **no** | Without it, emails stay queued and are not sent |
| `EMAIL_FROM` | for email | no | Sender address, for example `Chapter <no-reply@yourdomain.com>` |
| `OUTREACH_FROM` | optional | no | Sender for outreach emails at `/admin/outreach`, for example `Amare Carey <amare@greekgeek.org>`. Falls back to `EMAIL_FROM` |
| `OUTREACH_REPLY_TO` | optional | no | Where outreach replies go. Defaults to `amare@greekgeek.org` |
| `OUTREACH_SITE_URL` | optional | no | Public site used for chapter form links in outreach emails, so they never point at localhost. Defaults to `https://greekgeek.org` |
| `RESEND_WEBHOOK_SECRET` | optional | **no** | Signing secret of the Resend webhook at `/api/resend/webhook`. Records delivery, opens, clicks, bounces, and inbound replies |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Local setup

1. `npm install`
2. `cp .env.example .env` and fill in the Supabase values.
3. Apply the migrations to your Supabase project, using either method:
   - Supabase CLI: `supabase link --project-ref <ref>`, then `supabase db push`.
   - Run each file in `supabase/migrations` in order in the SQL editor.
4. In Supabase, go to Authentication, then URL Configuration:
   - Set the Site URL to `http://localhost:3001`.
   - Add `http://localhost:3001/auth/confirm` to the redirect URLs.
5. In the email templates, point the confirmation, magic link, and recovery links at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<signup|magiclink|recovery>`.
6. `npm run dev` starts the development server on port 3001. Development mode compiles each page the first time you open it and adds extra checks, so it is noticeably slower than production. To judge real page speed, run `npm run preview`, which builds and serves the production app on the same port.
7. Sign up, then make yourself platform staff. In the SQL editor, run:
   ```sql
   insert into public.platform_staff (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
   Staff roles are `admin`, `reviewer`, `support`, and `finance`.
8. Submit a chapter application from `/onboarding`, then approve it at `/admin/verification` using a different staff account. Reviewers cannot decide their own application.

### Confirmation emails and invitations

Supabase's built-in mailer sends only a few emails per hour. When the limit is reached, sign-ups that need a confirmation email fail with a clear message. Add custom SMTP under Authentication, then Emails, before inviting real users.

People who sign up from an invitation link don't need a confirmation email. The invitation proves which address it was sent to, so their account is created confirmed.

To confirm someone by hand and accept every pending invitation for their email, run this in the SQL editor:

```sql
select private.manually_accept_invitations('member@example.com');
```

It returns the chapters joined and any invitations that could not be accepted, with the reason. The person must have signed up first. The function can only be run from the SQL editor, not through the API.

The university search on the chapter application reads the public [university-domains-list](https://github.com/Hipo/university-domains-list) dataset. When an applicant searches, matching U.S. schools are added to `universities` along with their email domains.

### Realtime and storage

The social migration adds `messages`, `message_reactions`, and `notifications` to the `supabase_realtime` publication when that publication exists. It also creates storage buckets: private `verification-evidence` and `chat-attachments`, which are served through short-lived signed URLs, and a public `avatars` bucket. Each bucket has upload policies. Nothing has to be done in the dashboard, but check under Database, then Publications, that the three tables are listed.

## Stripe

### Webhook endpoint

`POST /api/stripe/webhook`

- The endpoint verifies the `Stripe-Signature` header against the raw request body using `STRIPE_WEBHOOK_SECRET`. If that fails, it tries `STRIPE_CONNECT_WEBHOOK_SECRET`.
- An invalid or missing signature returns 400. A missing secret returns 503.
- Events that fail validation, such as a wrong account, amount, or currency, are recorded and acknowledged with 200 so Stripe stops retrying. They are flagged for reconciliation.
- Unexpected errors return 500 so Stripe retries.

Local forwarding needs both platform and connected-account events, because dues are charged on connected accounts:

```bash
stripe login
stripe listen --forward-to localhost:3001/api/stripe/webhook --forward-connect-to localhost:3001/api/stripe/webhook
```

Put the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the dev server.

In production, create two endpoints in the Stripe dashboard, both with the URL `https://<your-domain>/api/stripe/webhook`:

1. **Your account** events, for the subscription. Put its secret in `STRIPE_WEBHOOK_SECRET`. Events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`, `invoice.voided`
   - `application_fee.refunded`
2. **Connected accounts** events, for dues. Put its secret in `STRIPE_CONNECT_WEBHOOK_SECRET`. Events:
   - Checkout: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Payment intents: `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled`
   - Charges and refunds: `charge.succeeded`, `charge.updated`, `charge.refunded`, `charge.refund.updated`, `refund.created`, `refund.updated`, `refund.failed`
   - Disputes: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`
   - Payouts: `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`
   - Accounts: `account.updated`

Optionally, add an event destination for v2 `v2.core.account[...]` updates that points at `/api/stripe/account-events`, with its secret in `STRIPE_ACCOUNT_EVENTS_SECRET`.

### Connect

- Chapters onboard from `Settings`, then `Payments`. Stripe redirects back to:
  - Return URL: `/api/connect/return?chapter=<slug>`
  - Refresh URL: `/api/connect/refresh?chapter=<slug>`
- Both are built from `NEXT_PUBLIC_APP_URL`.
- Dues checkout is blocked until card payments and payouts are active, the chapter is verified, and an officer has accepted the payment terms.

### Subscription

The $30/month plan is seeded in `saas_plans` with the code `chapter_monthly`.

- Checkout creates the price inline. To use a dashboard price instead, set `stripe_price_id` on that row.
- Officers manage the subscription through the Stripe customer portal.
- Enable the portal under Settings, then Billing, then Customer portal.

## Background jobs

`vercel.json` schedules five jobs. Each one calls `/api/jobs/<name>` with `Authorization: Bearer $CRON_SECRET`. On Vercel, that header is sent automatically when `CRON_SECRET` is set.

| Job | Schedule (UTC) | What it does |
| --- | --- | --- |
| `notification-emails` | every 5 minutes | Sends queued notification emails through Resend, using a lease and retries |
| `late-fees` | daily 06:15 | Applies configured late fees through the ledger |
| `dues-reminders` | daily 14:00 | Sends a reminder 3 days before the due date, then weekly for up to 60 days past due |
| `event-reminders` | hourly | Reminds members who RSVP'd going, and members required to attend |
| `recruitment-followups` | daily 13:00 | Reminds recruiters of follow-ups due |

To run a job by hand: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/jobs/dues-reminders`

On the Vercel Hobby plan, crons run at most once a day. Use Pro, or an external scheduler, for the 5-minute and hourly jobs.

## Testing

```bash
npm run typecheck
npm run lint
npm test
```

Run `npx next typegen` before `typecheck` on a fresh clone, so the route types (`PageProps`, `LayoutProps`) exist.

- `tests/db` applies every migration to PGlite, an in-process Postgres, using a small Supabase shim for `auth.uid()`, roles, and storage. It then runs real queries as different users. These tests cover:
  - Tenant isolation, and platform staff being kept out of private data.
  - Permissions, the ledger, payment state, and refund limits.
  - Reminders, chat rules, events, recruitment, and the program modules.
- `tests/integration/webhook.test.ts` feeds signed and unsigned events through the webhook route and the processor, with a stubbed Stripe API. It covers:
  - Signature rejection and duplicate delivery.
  - Cross-account rejection and fee mismatch.
  - ACH processing and failure.
  - Refunds, subscriptions, and account sync.
- `tests/unit` covers money parsing, fee math, installments, CSV import, invitation tokens, event and QR helpers, and job authorization.

The tests don't need a Supabase project or Stripe keys.

## Deployment

1. Create a Vercel project from this repository.
2. Set every variable from the table above. Set `NEXT_PUBLIC_APP_URL` to the production URL.
3. Apply the migrations to the production Supabase project.
4. Update the Supabase Site URL, the redirect URLs, and the email templates to use the production domain.
5. Create the two Stripe webhook endpoints, and the optional account event destination.
6. Deploy. The crons in `vercel.json` register automatically.

## Launch checklist

- [ ] Migrations applied, and `select count(*) from public.permissions` returns rows
- [ ] At least two platform staff accounts (reviewers cannot approve their own application)
- [ ] Supabase Auth: email confirmation on, Site URL and redirect URLs set, custom SMTP configured
- [ ] `APP_SIGNING_SECRET` and `CRON_SECRET` are unique random values, not shared with any other environment
- [ ] Stripe Connect platform profile completed, and branding set
- [ ] Both webhook endpoints created in live mode, with secrets in production env
- [ ] Customer portal enabled for subscriptions
- [ ] A test chapter takes one real dues payment and one refund in live mode, and the ledger, receipt, and reconciliation page agree
- [ ] `RESEND_API_KEY` set, sender domain verified, and the `notification-emails` cron running
- [ ] Legal pages reviewed by counsel (`/legal/terms`, `/legal/privacy`, `/legal/chapter-agreement`). Their text is published from the database by platform staff
- [ ] Error monitoring and log retention configured on the host

## Known limitations

- **Rate limiting** is in memory, per server instance. On multi-instance hosting, put a shared limiter (for example Upstash Redis) or the host's firewall in front of sign up, login, and checkout.
- **QR check-in codes** rotate every 30 seconds and are accepted for about 2 minutes. A screenshot shared quickly could be reused within that window. For strict attendance, officers should also take attendance by hand.
- **Removed reactions** are not pushed live. They appear on the next refresh.
- **Donations, expenses, and reimbursements** are records only. GreekGeek does not move that money.
- **Email** uses Resend only, with no fallback provider.
- **Single currency.** Each chapter has one currency, and the subscription is billed in USD.
- **No native mobile apps.** The web app is responsive.
- **No self-serve account deletion.**

## Compliance notes

- **Card data** never touches this application. Payments use Stripe Checkout, which keeps the platform in PCI SAQ A scope. No card numbers, CVCs, or bank account numbers are stored.
- **Merchant of record.** Each chapter's connected account is the merchant of record for its dues. The chapter accepts the payment terms before it can collect. Stripe handles KYC for connected accounts.
- **FERPA and academics.** GreekGeek does not collect grades or transcripts. Academic goals are private by default and shared only by the member's choice.
- **Incident reports** are visible only to officers with `standards.manage`. Reporter names can be hidden, and reports are kept for seven years. Every list view is written to the audit log. Case notes are append-only. The reporting page tells members to use Title IX and campus channels, and to call 911 in emergencies.
- **Hazing.** GreekGeek is not a substitute for university or national reporting obligations. Officers remain responsible for them.
- **Audit trail.** Every role change, verification decision, payment configuration change, refund, policy publication, and reimbursement decision writes to `audit_logs`.
- **Data requests.** Members can edit their profile and notification preferences, download their personal data from Account settings, and delete their account there. Deletion erases profile details, messages, and verification documents, releases the email address, and keeps payment and ledger records in anonymized form. The published privacy policy describes this.
