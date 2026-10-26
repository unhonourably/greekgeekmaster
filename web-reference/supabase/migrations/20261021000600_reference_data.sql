insert into public.permissions (key, category, description, sensitive) values
  ('chapter.manage', 'Chapter', 'Edit chapter profile, modules, and settings', false),
  ('chapter.ownership', 'Chapter', 'Accept agreements, transfer ownership, and manage administrators', true),
  ('members.manage', 'Members', 'Invite, import, deactivate, and change member status', true),
  ('roles.manage', 'Members', 'Create roles and assign officer positions', true),
  ('committees.manage', 'Members', 'Create committees and manage committee membership', false),
  ('finance.view', 'Finance', 'View all member balances, payments, and financial reports', true),
  ('finance.manage', 'Finance', 'Create assessments, record offline payments, and issue credits', true),
  ('finance.refund', 'Finance', 'Issue refunds for online payments', true),
  ('payments.configure', 'Finance', 'Set up and maintain the chapter payment account', true),
  ('chat.manage', 'Communication', 'Create channels and manage channel membership', false),
  ('chat.moderate', 'Communication', 'Review reports and remove messages in chapter channels', true),
  ('announcements.publish', 'Communication', 'Publish chapter announcements', false),
  ('announcements.officers', 'Communication', 'Read and publish officer-only announcements', false),
  ('events.manage', 'Events', 'Create and edit events', false),
  ('attendance.view', 'Events', 'View attendance records for all members', true),
  ('attendance.manage', 'Events', 'Record and correct attendance', true),
  ('recruitment.view', 'Recruitment', 'View prospects and log recruitment activity', true),
  ('recruitment.manage', 'Recruitment', 'Manage pipeline stages, assignments, and restricted notes', true),
  ('philanthropy.manage', 'Philanthropy', 'Manage campaigns, donations, shifts, and approve service hours', false),
  ('housing.manage', 'Housing', 'Manage facilities, maintenance, chores, and inventory', false),
  ('standards.view', 'Standards', 'View policy acknowledgments and training completion', true),
  ('standards.manage', 'Standards', 'Publish policies and manage confidential incident reports', true),
  ('academics.manage', 'Academics', 'Manage mentorship pairs and view goals members chose to share', true),
  ('analytics.view', 'Reporting', 'View chapter engagement analytics', false),
  ('audit.view', 'Reporting', 'View the chapter audit log', true)
on conflict (key) do nothing;

insert into public.role_templates (key, name, description, is_officer, is_owner, badge_tone, sort_order, permission_keys) values
  ('chapter_admin', 'Chapter administrator', 'Holds legal and administrative authority for the chapter account', true, true, 'accent', 1,
    array['chapter.manage','chapter.ownership','members.manage','roles.manage','committees.manage','finance.view','finance.manage','finance.refund','payments.configure','chat.manage','chat.moderate','announcements.publish','announcements.officers','events.manage','attendance.view','attendance.manage','recruitment.view','recruitment.manage','philanthropy.manage','housing.manage','standards.view','standards.manage','academics.manage','analytics.view','audit.view']),
  ('president', 'President', 'Chief executive officer of the chapter', true, false, 'gold', 10,
    array['chapter.manage','members.manage','roles.manage','committees.manage','finance.view','chat.manage','chat.moderate','announcements.publish','announcements.officers','events.manage','attendance.view','recruitment.view','standards.view','analytics.view','audit.view']),
  ('vice_president', 'Vice president', 'Supports the president and leads internal operations', true, false, 'gold', 20,
    array['members.manage','committees.manage','chat.manage','announcements.publish','announcements.officers','events.manage','attendance.view','analytics.view']),
  ('treasurer', 'Treasurer', 'Manages dues, payments, and chapter finances', true, false, 'green', 30,
    array['finance.view','finance.manage','finance.refund','payments.configure','announcements.officers','analytics.view']),
  ('secretary', 'Secretary', 'Keeps records, minutes, and attendance', true, false, 'slate', 40,
    array['attendance.view','attendance.manage','announcements.publish','announcements.officers','events.manage']),
  ('recruitment_chair', 'Recruitment chair', 'Leads recruitment strategy and the prospect pipeline', true, false, 'accent', 50,
    array['recruitment.view','recruitment.manage','events.manage','announcements.officers']),
  ('social_chair', 'Social chair', 'Plans social programming', true, false, 'slate', 60,
    array['events.manage','announcements.officers']),
  ('philanthropy_chair', 'Philanthropy chair', 'Leads service and fundraising', true, false, 'rose', 70,
    array['philanthropy.manage','events.manage','announcements.officers']),
  ('risk_management_chair', 'Risk management chair', 'Oversees safety, policy, and incident response', true, false, 'rose', 80,
    array['standards.view','standards.manage','events.manage','announcements.officers']),
  ('scholarship_chair', 'Scholarship chair', 'Supports academic programming and mentorship', true, false, 'slate', 90,
    array['academics.manage','announcements.officers']),
  ('house_manager', 'House manager', 'Manages the chapter facility', true, false, 'slate', 100,
    array['housing.manage','announcements.officers']),
  ('standards_board', 'Standards board', 'Reviews standards and member conduct matters', true, false, 'slate', 110,
    array['standards.view','announcements.officers']),
  ('committee_chair', 'Committee chair', 'Leads a chapter committee', true, false, 'neutral', 120,
    array['announcements.officers']),
  ('financial_auditor', 'Financial auditor', 'Read-only access to financial records for review', false, false, 'neutral', 130,
    array['finance.view','audit.view']),
  ('recruitment_team', 'Recruitment team', 'Logs recruitment activity under the recruitment chair', false, false, 'neutral', 140,
    array['recruitment.view'])
on conflict (key) do nothing;

insert into public.notification_kinds (kind, label, description, default_in_app, default_email, required) values
  ('dues_assessed', 'New charges', 'A new dues assessment was added to your balance', true, true, false),
  ('dues_reminder', 'Payment reminders', 'Upcoming and past-due balance reminders', true, true, false),
  ('payment_receipt', 'Payment receipts', 'Confirmation when a payment is received', true, true, true),
  ('payment_failed', 'Failed payments', 'A payment you started did not go through', true, true, true),
  ('payment_refunded', 'Refunds', 'A refund was issued for one of your payments', true, true, true),
  ('announcement', 'Announcements', 'Chapter and officer announcements', true, true, false),
  ('chat_mention', 'Mentions', 'Someone mentioned you or your role in a conversation', true, false, false),
  ('chat_message', 'Messages', 'New messages in conversations set to notify for all activity', true, false, false),
  ('event_reminder', 'Event reminders', 'Reminders for events you are attending or required to attend', true, true, false),
  ('recruitment_followup', 'Recruitment follow-ups', 'Follow-ups assigned to you for prospects', true, false, false),
  ('verification_update', 'Verification updates', 'Changes to a chapter application you submitted', true, true, true),
  ('policy_update', 'Policy updates', 'New or revised chapter policies requiring acknowledgment', true, true, false),
  ('task_assigned', 'Assignments', 'Tasks and chores assigned to you', true, false, false)
on conflict (kind) do nothing;

insert into public.pricing_rules (id, code, version, name, platform_fee_bps, platform_fee_fixed_cents, refund_policy, status, is_default, effective_at)
values ('00000000-0000-4000-8000-000000000150', 'standard', 1, 'Standard dues pricing', 150, 0, 'proportional', 'active', true, now())
on conflict (code, version) do nothing;

insert into public.saas_plans (code, name, description, price_cents, billing_interval, features, active)
values (
  'chapter_monthly',
  'Chapter subscription',
  'Full access to every chapter tool for one chapter, billed monthly.',
  3000,
  'month',
  array['Unlimited members, officers, and alumni', 'Dues, installments, and offline payment tracking', 'Chat, events, recruitment, and standards tools', 'Auditable ledger and exports'],
  true
)
on conflict (code) do nothing;

insert into public.terms_documents (kind, version, title, summary, body, pricing_rule_id, published_at)
values (
  'chapter_agreement',
  '2026-10-21',
  'Chapter Services and Pricing Agreement',
  'Chapter costs $30 per month per chapter, plus a platform fee of 1.5% of each dues payment collected online. Stripe processing fees are separate and are paid by the chapter from its Stripe balance. There is no platform fee on offline payments, credits, or assessments that are never paid.',
  E'1. Parties and roles\nYour chapter is the seller of record for dues it collects. Payments are processed by Stripe into a Stripe account opened in your chapter''s name. Chapter provides software and is not a party to the payment between your chapter and its members.\n\n2. Subscription fee\nAccess to Chapter costs $30.00 per month for each chapter, billed in advance to the payment method your administrator provides. The subscription renews monthly until canceled. Canceling stops renewal at the end of the current billing period; no partial-month refunds are issued. An active subscription is required to collect dues online. If a subscription payment fails, Stripe retries it; if it remains unpaid, online dues collection is paused until the balance is paid. Your records remain available to administrators.\n\n3. Platform fee\nChapter charges a platform fee equal to 1.5% of the dues amount of each payment that a member successfully completes online through Chapter. The fee is calculated on the dues amount in cents and rounded to the nearest cent (half a cent rounds up). The fee is collected by Stripe at the time of the payment as an application fee and is deducted from the payment before funds reach your chapter''s Stripe balance.\n\n4. What is not charged\nNo platform fee applies to: assessments that are created but not paid; payments recorded as cash, check, or other offline methods; credits, waivers, and adjustments; donations recorded in the philanthropy tools; or payments that fail or are canceled.\n\n5. Processing fees\nStripe charges its own processing fees for each payment. These fees are set by Stripe, are not Chapter''s platform fee, and are debited from your chapter''s Stripe balance. Chapter does not add a surcharge to members.\n\n6. Partial payments and installments\nEach completed payment is charged the platform fee once, on its own amount. Paying in installments does not change the total platform fee beyond normal per-payment rounding.\n\n7. Refunds\nWhen your chapter refunds a payment through Chapter, Chapter returns the proportional share of its platform fee. Stripe does not return its processing fees on refunds. Refunds issued directly in the Stripe Dashboard are recorded when Stripe notifies Chapter; the platform fee is returned only if the refund was issued with the application fee refunded.\n\n8. Disputes\nIf a member disputes a payment with their bank, Stripe withdraws the disputed amount and any dispute fee from your chapter''s Stripe balance. Chapter''s platform fee is not returned for disputed payments.\n\n9. Payouts\nStripe pays out your chapter''s available balance to the bank account on file according to your Stripe payout schedule. A successful payment does not mean funds have reached your bank. Stripe may delay or hold payouts under its own terms.\n\n10. Changes to pricing\nChapter will not change the subscription price or platform fee that applies to your chapter without giving notice and obtaining acceptance of a new agreement version. The version you accept is recorded with your name, title, and the time of acceptance.\n\n11. Review\nThis agreement must be reviewed by qualified counsel before Chapter is offered commercially.',
  '00000000-0000-4000-8000-000000000150',
  now()
)
on conflict (kind, version) do nothing;

insert into public.terms_documents (kind, version, title, summary, body, published_at)
values
  ('terms_of_service', '2026-10-21', 'Terms of Service', 'The rules for using Chapter as a member or officer.',
   E'These terms govern use of Chapter by members and officers. Members are responsible for the accuracy of information they provide. Chapters are responsible for the dues they assess and for complying with their national organization and university policies. Chapter may suspend accounts used for fraud, harassment, or impersonation. This document must be completed and reviewed by qualified counsel before launch.', now()),
  ('privacy_policy', '2026-10-21', 'Privacy Policy', 'What Chapter collects, why, and who can see it.',
   E'Chapter stores account information, chapter membership, messages, and financial records needed to provide the service. Card and bank details are collected and stored by Stripe, not by Chapter. Private balances are visible only to the member and to officers with financial permissions. Direct messages are visible only to their participants. Verification documents are visible only to the applicant and platform reviewers and are deleted after the retention period. This document must be completed and reviewed by qualified counsel before launch.', now())
on conflict (kind, version) do nothing;
