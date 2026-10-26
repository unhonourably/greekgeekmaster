import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Notice } from "@/components/ui";
import { Wordmark } from "@/components/brand";
import { getMyProfile, getSessionUser, getStaffRole } from "@/lib/auth";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";
import { getUnreadNotificationCount } from "@/lib/notifications";

export const instant = false;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-full flex-1 flex-col items-center bg-canvas px-6 py-12">
        <Wordmark />
        <Notice tone="warning" title="Database not connected" className="mt-10 max-w-lg">
          Signed-in pages need Supabase. Copy the Supabase variables from .env.example into .env.local, apply the migrations in supabase/migrations, and restart the server.
        </Notice>
      </div>
    );
  }
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [profile, staffRole, unread] = await Promise.all([getMyProfile(), getStaffRole(), getUnreadNotificationCount()]);
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <AppHeader
        name={profile?.full_name || profile?.display_name || ""}
        email={user.email}
        userId={user.id}
        unread={unread}
        isStaff={Boolean(staffRole)}
        realtime={{ url: serverEnv.supabaseUrl(), key: serverEnv.supabasePublishableKey() }}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
