import { describe, expect, it } from "vitest";
import { contactStatus, durationLabel, formReplyEmail, isoToZonedInput, outreachEmail, parseContacts, withFormLink, zonedInputToIso } from "@/lib/outreach";

describe("outreach email", () => {
  it("fills in the first name, council, and university", () => {
    const { subject, body } = outreachEmail({ full_name: "Margarita Lopez", organization: "MGC", university: "Texas Christian University" }, "https://greekgeek.org/intro/tcu");
    expect(subject).toBe("GreekGeek for MGC at Texas Christian University");
    expect(body.startsWith("Hi Margarita,\n\nMy name is Amare Carey")).toBe(true);
    expect(body).toContain("We'd love to introduce GreekGeek to MGC leadership at Texas Christian University and see whether it could help.");
    expect(body).toContain("• Dues collection and chapter finances\n• Member directories and officer management");
    expect(body).toContain("Website: https://greekgeek.org\nFeatures: https://www.greekgeek.org/features\n");
    expect(body).toContain("Tell us about your chapter: https://greekgeek.org/intro/tcu");
    expect(body).toContain("you can also text me at (636) 515-1794 to set up a meeting");
    expect(body).toContain("Feel free to just reply to this email");
    expect(body.endsWith("Best,\nAmare Carey\nCo-Founder, GreekGeek\nEmail: amare@greekgeek.org (any time, 7 days a week)\nText: (636) 515-1794 (any time of day, 7 days a week)\nCall: (636) 515-1794 (10am to 10pm Central, 7 days a week)\nhttps://greekgeek.org")).toBe(true);
  });

  it("greets an office without a name", () => {
    expect(outreachEmail({ full_name: null, organization: "Fraternity and Sorority Life", university: "University of Kansas" }).body.startsWith("Hi there,")).toBe(true);
  });
});

describe("school form link", () => {
  const contact = { full_name: null, organization: "IFC", university: "University of Kansas" };

  it("removes the form line when it is turned off", () => {
    const body = withFormLink(outreachEmail(contact, "https://greekgeek.org/intro/ku").body, null);
    expect(body).not.toContain("/intro/");
    expect(body).toBe(outreachEmail(contact).body);
  });

  it("adds it back under the product links", () => {
    const body = withFormLink(outreachEmail(contact).body, "https://greekgeek.org/intro/ku");
    expect(body).toBe(outreachEmail(contact, "https://greekgeek.org/intro/ku").body);
  });

  it("replaces an old link instead of adding a second one", () => {
    const body = withFormLink(outreachEmail(contact, "https://greekgeek.org/intro/old").body, "https://greekgeek.org/intro/new");
    expect(body.match(/\/intro\//g)).toHaveLength(1);
    expect(body).toContain("Tell us about your chapter: https://greekgeek.org/intro/new");
  });

  it("leaves out the screenshot gallery, even from an older saved draft", () => {
    expect(outreachEmail(contact).body).not.toContain("drive.google.com/drive/folders");
    const saved = "Hi Sam,\n\nWebsite: https://greekgeek.org\nProduct overview: https://docs.example\nProduct screenshots: https://drive.google.com/drive/folders/abc\n\nBest,\nAmare";
    expect(withFormLink(saved, "https://greekgeek.org/intro/ku")).toBe("Hi Sam,\n\nWebsite: https://greekgeek.org\nProduct overview: https://docs.example\nTell us about your chapter: https://greekgeek.org/intro/ku\n\nBest,\nAmare");
  });

  it("puts it before the sign-off in a hand-written email", () => {
    const body = withFormLink("Hi Sam,\n\nQuick note about GreekGeek.\n\nBest,\nAmare", "https://greekgeek.org/intro/ku");
    expect(body).toBe("Hi Sam,\n\nQuick note about GreekGeek.\n\nTell us about your chapter: https://greekgeek.org/intro/ku\n\nBest,\nAmare");
  });
});

describe("contact import", () => {
  it("reads commas, tabs, quotes, and a header row", () => {
    const { contacts, skipped } = parseContacts(
      [
        "university,council,role,name,email,link",
        '"University of Missouri, Columbia",IFC,President,Jordan Lee,jlee@missouri.edu,https://greek.missouri.edu',
        "University of Kansas\tPanhellenic\t\t\tpanhel@ku.edu",
        "Bad Row,IFC,President,No Email,not-an-email",
        "Duplicate,IFC,President,Jordan,JLEE@missouri.edu",
      ].join("\n"),
    );
    expect(contacts).toEqual([
      { university: "University of Missouri, Columbia", organization: "IFC", role: "President", full_name: "Jordan Lee", email: "jlee@missouri.edu", source_url: "https://greek.missouri.edu" },
      { university: "University of Kansas", organization: "Panhellenic", role: "President", full_name: null, email: "panhel@ku.edu", source_url: null },
    ]);
    expect(skipped).toEqual([4, 5]);
  });
});

describe("status and time", () => {
  const base = { do_not_contact: false, emails_sent: 0, replies: 0, bounced_at: null, opened_at: null, delivered_at: null, last_status: null };

  it("ranks a reply above everything else", () => {
    expect(contactStatus(base)).toBe("not_contacted");
    expect(contactStatus({ ...base, last_status: "failed" })).toBe("failed");
    expect(contactStatus({ ...base, emails_sent: 1, delivered_at: "x" })).toBe("delivered");
    expect(contactStatus({ ...base, emails_sent: 1, opened_at: "x" })).toBe("opened");
    expect(contactStatus({ ...base, emails_sent: 1, bounced_at: "x", do_not_contact: true })).toBe("bounced");
    expect(contactStatus({ ...base, emails_sent: 1, replies: 1, do_not_contact: true })).toBe("replied");
  });

  it("converts Central wall time across daylight saving", () => {
    expect(zonedInputToIso("2026-07-01T09:30")).toBe("2026-07-01T14:30:00.000Z");
    expect(zonedInputToIso("2026-12-01T09:30")).toBe("2026-12-01T15:30:00.000Z");
    expect(zonedInputToIso("bad")).toBeNull();
    expect(isoToZonedInput(new Date("2026-12-01T15:30:00Z"))).toBe("2026-12-01T09:30");
  });

  it("labels reply time", () => {
    expect(durationLabel("2026-10-20T15:00:00Z", "2026-10-20T15:40:00Z")).toBe("40m");
    expect(durationLabel("2026-10-20T15:00:00Z", "2026-10-20T20:00:00Z")).toBe("5h");
    expect(durationLabel("2026-10-20T15:00:00Z", "2026-10-23T15:00:00Z")).toBe("3d");
  });
});

describe("form reply", () => {
  it("answers a demo request with their best time and the areas they picked", () => {
    const { subject, body } = formReplyEmail({ full_name: "Jordan Lee", organization: "Sigma Chi", interest: "demo", help: ["dues", "recruitment", "events"], best_time: "Weeknights", prefer_text: true, prefer_call: false }, "Stanford University");
    expect(subject).toBe("Re: GreekGeek for Sigma Chi at Stanford University");
    expect(body.startsWith("Hi Jordan,\n\nThank you for telling us about Sigma Chi.")).toBe(true);
    expect(body).toContain("You mentioned weeknights");
    expect(body).toContain("You said dues and finances, recruitment and events are where you'd want the most help");
    expect(body).toContain("text or call me at (636) 515-1794");
    expect(body).toContain("You can see everything GreekGeek does here: https://www.greekgeek.org/features");
  });

  it("keeps it short when they are not ready", () => {
    const { body } = formReplyEmail({ full_name: "Sam", organization: "IFC", interest: "later", help: [], best_time: null, prefer_text: false, prefer_call: false }, "Duke University");
    expect(body).toContain("now isn't the right time");
    expect(body).not.toContain("most help");
    expect(body).toContain("Replies to this email come straight to my inbox.");
  });
});
