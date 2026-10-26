import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export type RpcCaller = <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<T>;

export function adminRpc(): RpcCaller {
  const admin = createAdminClient();
  return async <T,>(fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  };
}
