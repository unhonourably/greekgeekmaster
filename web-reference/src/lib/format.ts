export function requestTime(): number {
  return Date.now();
}

export function formatDate(value: string | Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(new Date(value));
}

export function formatDateTime(value: string | Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export function formatTime(value: string | Date, timeZone = "UTC", withZone = false): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone, ...(withZone ? { timeZoneName: "short" as const } : {}) }).format(new Date(value));
}

export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const diff = (new Date(value).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(value);
}
