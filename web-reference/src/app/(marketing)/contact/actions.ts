"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { zodState } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { renderEmailHtml } from "@/lib/email-template";
import { serverEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-state";

const TEAM = {
  amare: { name: "Amare", email: "amare@greekgeek.org" },
  owen: { name: "Owen", email: "owen@greekgeek.org" },
} as const;

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.email("Enter a valid email address"),
  message: z.string().trim().min(10, "Write a little more so we know how to help").max(4000),
  recipient: z.enum(["amare", "owen", "both"]),
});

export async function sendContact(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
    recipient: formData.get("recipient"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`contact:${ip}:${parsed.data.email.toLowerCase()}`, 5, 60 * 60_000)) {
    return { error: "Too many messages from this address. Try again later." };
  }
  const people = parsed.data.recipient === "both" ? [TEAM.amare, TEAM.owen] : [TEAM[parsed.data.recipient]];
  const text = `${parsed.data.name} (${parsed.data.email}) wrote:\n\n${parsed.data.message}`;
  try {
    const results = await Promise.all(
      people.map((person) =>
        sendEmail({
          to: person.email,
          subject: `GreekGeek note from ${parsed.data.name}`,
          text,
          html: renderEmailHtml({
            appUrl: serverEnv.appUrl(),
            preheader: `${parsed.data.name} sent a note.`,
            heading: "New note",
            paragraphs: [`${parsed.data.name} (${parsed.data.email}) wrote:`, parsed.data.message],
            note: `Reply to ${parsed.data.email} if you want to respond.`,
          }),
        }),
      ),
    );
    if (results.some((result) => !result.delivered)) {
      return { ok: true, message: `Email delivery is not turned on here. Write ${people.map((person) => person.email).join(" or ")} directly.` };
    }
  } catch {
    return { error: "The message could not be sent. Try again, or write us at the addresses above." };
  }
  return { ok: true, message: `Sent to ${people.map((person) => person.name).join(" and ")}. We will reply by email.` };
}
