import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const { parseMemberCsv } = await import("@/lib/invitations");

describe("member CSV import", () => {
  it("reads headered files with columns in any order", () => {
    const { rows, errors } = parseMemberCsv("\uFEFFName,Email,Class\r\n\"Lee, Jordan\",Jordan@State.edu,new member\r\nSam Park,sam@state.edu,alumni\r\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, email: "jordan@state.edu", fullName: "Lee, Jordan", memberClass: "new_member" },
      { line: 3, email: "sam@state.edu", fullName: "Sam Park", memberClass: "alumni" },
    ]);
  });

  it("assumes email, name, class without a header and defaults the class", () => {
    const { rows } = parseMemberCsv("a@x.edu,Ana\nb@x.edu");
    expect(rows.map((r) => [r.email, r.fullName, r.memberClass])).toEqual([
      ["a@x.edu", "Ana", "active"],
      ["b@x.edu", null, "active"],
    ]);
  });

  it("reports invalid, duplicate, and unknown rows without dropping good ones", () => {
    const { rows, errors } = parseMemberCsv("email,name,class\nnot-an-email,X,active\na@x.edu,A,active\nA@x.edu,A2,active\nc@x.edu,C,pledge");
    expect(rows.map((r) => r.email)).toEqual(["a@x.edu"]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/Line 2/);
    expect(errors[1]).toMatch(/more than once/);
    expect(errors[2]).toMatch(/unknown member class/);
  });

  it("caps the batch size", () => {
    const text = Array.from({ length: 12 }, (_, i) => `p${i}@x.edu`).join("\n");
    const { rows, errors } = parseMemberCsv(text, 10);
    expect(rows).toHaveLength(10);
    expect(errors.at(-1)).toMatch(/up to 10/);
  });
});
