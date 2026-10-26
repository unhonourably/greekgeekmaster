import { beforeAll, describe, expect, it } from "vitest";
import { utcToZonedParts, zonedTimeToUtc } from "@/lib/timezone";

describe("chapter time zones", () => {
  it("converts wall-clock times in the chapter's zone to UTC across DST", () => {
    expect(zonedTimeToUtc("2026-07-04", "19:30", "America/New_York")?.toISOString()).toBe("2026-07-04T23:30:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "19:30", "America/New_York")?.toISOString()).toBe("2026-12-02T00:30:00.000Z");
    expect(zonedTimeToUtc("2026-03-08", "12:00", "America/Chicago")?.toISOString()).toBe("2026-03-08T17:00:00.000Z");
    expect(zonedTimeToUtc("2026-06-01", "08:00", "America/Phoenix")?.toISOString()).toBe("2026-06-01T15:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(zonedTimeToUtc("2026-13-01", "10:00", "America/New_York")).toBeNull();
    expect(zonedTimeToUtc("2026-01-01", "25:00", "America/New_York")).toBeNull();
    expect(zonedTimeToUtc("tomorrow", "10:00", "America/New_York")).toBeNull();
  });

  it("round-trips back to local parts", () => {
    const at = zonedTimeToUtc("2026-11-14", "21:15", "America/Los_Angeles")!;
    expect(utcToZonedParts(at, "America/Los_Angeles")).toEqual({ date: "2026-11-14", time: "21:15" });
  });
});

describe("QR check-in tokens", () => {
  let checkInToken: (eventId: string, at?: number) => string;
  let verifyCheckInToken: (token: string, eventId: string, at?: number) => boolean;

  beforeAll(async () => {
    process.env.APP_SIGNING_SECRET = "test-signing-secret-that-is-long-enough-123";
    ({ checkInToken, verifyCheckInToken } = await import("@/lib/checkin"));
  });

  const event = "7c0f7d0e-0000-4000-8000-000000000001";
  const t0 = Date.UTC(2026, 9, 21, 19, 0, 0);

  it("accepts a fresh code for the same event", () => {
    expect(verifyCheckInToken(checkInToken(event, t0), event, t0 + 5_000)).toBe(true);
  });

  it("expires after about two minutes and rejects future codes", () => {
    const token = checkInToken(event, t0);
    expect(verifyCheckInToken(token, event, t0 + 110_000)).toBe(true);
    expect(verifyCheckInToken(token, event, t0 + 160_000)).toBe(false);
    expect(verifyCheckInToken(checkInToken(event, t0 + 120_000), event, t0)).toBe(false);
  });

  it("rejects codes for another event or with a forged signature", () => {
    const token = checkInToken(event, t0);
    expect(verifyCheckInToken(token, "7c0f7d0e-0000-4000-8000-000000000002", t0)).toBe(false);
    const [body] = token.split(".");
    expect(verifyCheckInToken(`${body}.forged`, event, t0)).toBe(false);
  });
});
