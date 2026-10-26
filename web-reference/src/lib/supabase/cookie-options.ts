export const SESSION_MAX_AGE = 400 * 24 * 60 * 60;

export function sessionCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  };
}
