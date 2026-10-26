export const ORGANIZATIONS = ["IFC", "Panhellenic", "MGC", "NPHC", "Fraternity and Sorority Life"] as const;

export const ROLES = ["President", "Vice President", "Advisor", "Director", "Coordinator"] as const;

export type OutreachContact = {
  full_name: string | null;
  university: string;
  organization: string;
};

export type OutreachDraft = { subject: string; body: string };

export const FEATURES_URL = "https://www.greekgeek.org/features";

export function firstName(fullName: string | null): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function outreachEmail(contact: OutreachContact, introUrl?: string | null): OutreachDraft {
  const name = firstName(contact.full_name);
  const subject = `GreekGeek for ${contact.organization} at ${contact.university}`;
  const body = [
    name ? `Hi ${name},` : "Hi there,",
    "My name is Amare Carey, and I co-founded GreekGeek with Owen Caldwell. We are current University of Missouri students graduating in 2030, and we're building an all-in-one management platform designed to make running fraternity and sorority chapters easier.",
    [
      "GreekGeek brings key chapter operations together in one place, including:",
      "• Dues collection and chapter finances",
      "• Member directories and officer management",
      "• Recruitment management and new-member tracking",
      "• Event planning and chapter calendars",
      "• Chapter announcements and member communication",
      "• Simplified administrative workflows for chapter leadership",
    ].join("\n"),
    "Our goal is to reduce the time officers spend juggling spreadsheets, payment tools, group chats, and separate platforms, so they can focus on their members and chapter experience.",
    "GreekGeek costs $30 per chapter per month and includes unlimited members and officers. Online dues payments also have a 1.5% GreekGeek platform fee plus standard Stripe processing fees. Each chapter connects its own Stripe account and receives dues directly; GreekGeek does not hold chapter funds.",
    `We'd love to introduce GreekGeek to ${contact.organization} leadership at ${contact.university} and see whether it could help. Would you be open to a brief demo or conversation?`,
    "Feel free to just reply to this email with any questions or a good time to talk. Replies come straight to my inbox, and I read every one.",
    "If you'd like to learn more, you can also text me at (636) 515-1794 to set up a meeting. Just send a day and time that works for you, and I'll make it happen, whether that's a quick call, a video meeting, or meeting in person.",
    [
      "Website: https://greekgeek.org",
      `Features: ${FEATURES_URL}`,
      "Product overview: https://docs.google.com/document/d/1Eg1HZ67C4GkPGBDOd_7RpBR6HFgUQrHfMgO8sVsvUPw/edit?usp=sharing",
      ...(introUrl ? [`Tell us about your chapter: ${introUrl}`] : []),
    ].join("\n"),
    "Thank you for your time.",
    [
      "Best,",
      "Amare Carey",
      "Co-Founder, GreekGeek",
      "Email: amare@greekgeek.org (any time, 7 days a week)",
      "Text: (636) 515-1794 (any time of day, 7 days a week)",
      "Call: (636) 515-1794 (10am to 10pm Central, 7 days a week)",
      "https://greekgeek.org",
    ].join("\n"),
  ].join("\n\n");
  return { subject, body };
}

const FORM_LINE = /^.*https?:\/\/\S+\/intro\/[A-Za-z0-9_-]+.*$/;
const GALLERY_LINE = /^Product screenshots:/i;

export function withFormLink(body: string, url: string | null): string {
  const lines = body.split("\n").filter((line) => !FORM_LINE.test(line.trim()) && !GALLERY_LINE.test(line.trim()));
  if (url) {
    const line = `Tell us about your chapter: ${url}`;
    const after = lines.findIndex((text) => /^Product overview:/i.test(text.trim()));
    const before = lines.findIndex((text) => /^(Thank you for your time|Best,|Thanks,)/i.test(text.trim()));
    if (after >= 0) lines.splice(after + 1, 0, line);
    else if (before >= 0) lines.splice(before, 0, line, "");
    else lines.push("", line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type ParsedContact = {
  university: string;
  organization: string;
  role: string;
  full_name: string | null;
  email: string;
  source_url: string | null;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === "\t") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseContacts(text: string): { contacts: ParsedContact[]; skipped: number[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contacts: ParsedContact[] = [];
  const skipped: number[] = [];
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const [university = "", organization = "", role = "", fullName = "", email = "", source = ""] = splitCsvLine(line);
    if (index === 0 && email.toLowerCase() === "email") return;
    const normalized = email.toLowerCase();
    if (university.length < 2 || !EMAIL.test(email) || seen.has(normalized)) {
      skipped.push(index + 1);
      return;
    }
    seen.add(normalized);
    contacts.push({
      university: university.slice(0, 160),
      organization: organization.length >= 2 ? organization.slice(0, 120) : "IFC",
      role: role.length >= 2 ? role.slice(0, 80) : "President",
      full_name: fullName.length >= 2 ? fullName.slice(0, 120) : null,
      email,
      source_url: /^https?:\/\//i.test(source) ? source : null,
    });
  });
  return { contacts, skipped };
}

export type ContactStatus = "not_contacted" | "sent" | "delivered" | "opened" | "replied" | "bounced" | "failed" | "do_not_contact";

export function contactStatus(row: {
  do_not_contact: boolean;
  emails_sent: number;
  replies: number;
  bounced_at: string | null;
  opened_at: string | null;
  delivered_at: string | null;
  last_status: string | null;
}): ContactStatus {
  if (row.replies > 0) return "replied";
  if (row.bounced_at) return "bounced";
  if (row.do_not_contact) return "do_not_contact";
  if (row.emails_sent === 0) return row.last_status === "failed" ? "failed" : "not_contacted";
  if (row.opened_at) return "opened";
  if (row.delivered_at) return "delivered";
  return "sent";
}

export const STATUS_LABEL: Record<ContactStatus, string> = {
  not_contacted: "Not contacted",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  replied: "Replied",
  bounced: "Bounced",
  failed: "Send failed",
  do_not_contact: "Do not contact",
};

export const STATUS_TONE: Record<ContactStatus, "gold" | "neutral" | "info" | "positive" | "danger" | "warning"> = {
  not_contacted: "gold",
  sent: "neutral",
  delivered: "neutral",
  opened: "info",
  replied: "positive",
  bounced: "danger",
  failed: "danger",
  do_not_contact: "warning",
};

export const FORM_STATUSES = ["new", "contacted", "meeting", "signed_up", "not_a_fit", "archived"] as const;

export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_STATUS_LABEL: Record<FormStatus, string> = {
  new: "New",
  contacted: "Contacted",
  meeting: "Meeting set",
  signed_up: "Signed up",
  not_a_fit: "Not a fit",
  archived: "Archived",
};

export const FORM_STATUS_TONE: Record<FormStatus, "gold" | "neutral" | "info" | "positive" | "danger" | "warning" | "accent"> = {
  new: "accent",
  contacted: "info",
  meeting: "warning",
  signed_up: "positive",
  not_a_fit: "neutral",
  archived: "neutral",
};

export const FORM_INTEREST_LABEL: Record<string, string> = { demo: "Wants a demo", learn_more: "Wants more information", later: "Not right now" };

export const FORM_HELP = [
  ["dues", "Dues and finances"],
  ["directory", "Member directory"],
  ["recruitment", "Recruitment"],
  ["events", "Events"],
  ["announcements", "Announcements"],
  ["housing", "Housing"],
] as const;

export const FORM_HELP_LABEL: Record<string, string> = Object.fromEntries(FORM_HELP);

export function formReplyEmail(response: { full_name: string; organization: string; interest: string; help: string[]; best_time: string | null; prefer_text: boolean; prefer_call: boolean }, university: string): OutreachDraft {
  const name = firstName(response.full_name);
  const areas = response.help.map((item) => FORM_HELP_LABEL[item]?.toLowerCase()).filter(Boolean);
  const list = areas.length > 1 ? `${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}` : areas[0];
  const interest =
    response.interest === "demo"
      ? `You said you'd like a demo, so let's set one up. What day and time works for you${response.best_time ? `? You mentioned ${response.best_time.toLowerCase()}, so send me a time in that window and I'll make it work.` : "? Send me a few options and I'll make one work."}`
      : response.interest === "later"
        ? "You mentioned now isn't the right time, and that's completely fine. I'll keep this short, and you can reply whenever the timing is better."
        : "You asked for more information first, so here's the short version. GreekGeek puts dues, the member directory, recruitment, events, announcements and housing in one place, and it costs $30 per chapter per month with unlimited members and officers.";
  const reach = response.prefer_text || response.prefer_call ? "If it's easier, you can also text or call me at (636) 515-1794." : "Replies to this email come straight to my inbox.";
  return {
    subject: `Re: GreekGeek for ${response.organization} at ${university}`,
    body: [
      `Hi ${name ?? "there"},`,
      `Thank you for telling us about ${response.organization}.`,
      interest,
      ...(list ? [`You said ${list} ${areas.length > 1 ? "are" : "is"} where you'd want the most help, so I'll focus there.`] : []),
      `You can see everything GreekGeek does here: ${FEATURES_URL}`,
      reach,
      ["Best,", "Amare Carey", "Co-Founder, GreekGeek", "https://greekgeek.org"].join("\n"),
    ].join("\n\n"),
  };
}

export const OUTREACH_ZONE = "America/Chicago";

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function zonedInputToIso(value: string, timeZone = OUTREACH_ZONE): string | null {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!matched) return null;
  const guess = Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), Number(matched[4]), Number(matched[5]));
  const first = guess - zoneOffsetMs(new Date(guess), timeZone);
  const second = guess - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second).toISOString();
}

export function isoToZonedInput(value: Date, timeZone = OUTREACH_ZONE): string {
  const shifted = new Date(value.getTime() + zoneOffsetMs(value, timeZone));
  return shifted.toISOString().slice(0, 16);
}

export function durationLabel(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
