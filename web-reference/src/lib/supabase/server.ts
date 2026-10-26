import "server-only";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

export async function createClient() {
  await connection();
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    cookieStore = null;
  }
  const fallback = cookieStore
    ? null
    : parseCookieHeader((await headers()).get("cookie") ?? "").map(({ name, value }) => ({ name, value: value ?? "" }));
  return createServerClient(serverEnv.supabaseUrl(), serverEnv.supabasePublishableKey(), {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore ? cookieStore.getAll() : (fallback ?? []);
      },
      setAll(cookiesToSet) {
        if (!cookieStore) return;
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {}
      },
    },
  });
}

export async function createSessionClient() {
  return createClient();
}
