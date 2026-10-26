import { Award, BookOpen, Crown, Flag, GraduationCap, HeartHandshake, Medal, Shield, Star, Trophy, type LucideIcon } from "lucide-react";

export const BADGE_ICONS: Record<string, LucideIcon> = {
  award: Award,
  star: Star,
  trophy: Trophy,
  medal: Medal,
  "heart-handshake": HeartHandshake,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  crown: Crown,
  flag: Flag,
  shield: Shield,
};

export const BADGE_CATEGORY_LABEL: Record<string, string> = {
  achievement: "Achievement",
  service: "Service",
  academic: "Academic",
  leadership: "Leadership",
};

export function BadgeIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = BADGE_ICONS[icon] ?? Award;
  return <Icon className={className} aria-hidden />;
}
