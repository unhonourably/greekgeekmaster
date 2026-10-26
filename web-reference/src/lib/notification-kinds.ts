import { BedDouble, Bell, CalendarDays, ClipboardList, CreditCard, FileCheck2, Megaphone, MessageSquare, UserPlus, type LucideIcon } from "lucide-react";

export const NOTIFICATION_ICON: Record<string, LucideIcon> = {
  dues_assessed: CreditCard,
  dues_reminder: CreditCard,
  payment_receipt: CreditCard,
  payment_failed: CreditCard,
  payment_refunded: CreditCard,
  announcement: Megaphone,
  chat_mention: MessageSquare,
  chat_message: MessageSquare,
  event_posted: CalendarDays,
  event_reminder: CalendarDays,
  housing_request: BedDouble,
  philanthropy_update: ClipboardList,
  academic_update: ClipboardList,
  recruitment_followup: UserPlus,
  verification_update: FileCheck2,
  policy_update: FileCheck2,
  task_assigned: ClipboardList,
  housing_update: BedDouble,
};

export function notificationIcon(kind: string): LucideIcon {
  return NOTIFICATION_ICON[kind] ?? Bell;
}

export function safeNotificationLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}
