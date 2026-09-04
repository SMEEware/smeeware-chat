export const SESSION_COOKIE = "smeeware_session";

export const SESSION_HEADER = "X-Session-Id";

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 12 * 60 * 60,
} as const;
