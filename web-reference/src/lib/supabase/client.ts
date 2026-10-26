"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

let client: SupabaseClient | null = null;

export function createBrowserSupabase(url: string, key: string): SupabaseClient {
  if (!client) {
    client = createBrowserClient(url, key, {
      cookieOptions: sessionCookieOptions(),
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
