import { assertCents } from "./money";

export type ScheduledInstallment = { sequence: number; amountCents: number; dueDate: string };

export const MIN_INSTALLMENT_CENTS = 50;

function parseIsoDate(value: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("dates must be YYYY-MM-DD");
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonthsClamped(isoDate: string, months: number): string {
  const { y, m, d } = parseIsoDate(isoDate);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function splitIntoInstallments(totalCents: number, count: number, firstDueDate: string, intervalMonths = 1): ScheduledInstallment[] {
  assertCents(totalCents, "total");
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new RangeError("installment count must be between 2 and 12");
  if (totalCents < MIN_INSTALLMENT_CENTS * count) throw new RangeError("balance is too small to split into that many installments");
  parseIsoDate(firstDueDate);
  const base = Math.floor(totalCents / count);
  const schedule: ScheduledInstallment[] = [];
  for (let i = 0; i < count; i += 1) {
    schedule.push({
      sequence: i + 1,
      amountCents: i === count - 1 ? totalCents - base * (count - 1) : base,
      dueDate: addMonthsClamped(firstDueDate, i * intervalMonths),
    });
  }
  return schedule;
}

export function validateSchedule(schedule: ScheduledInstallment[], expectedTotalCents: number): string | null {
  if (schedule.length < 2) return "A plan needs at least two installments.";
  let total = 0;
  for (let i = 0; i < schedule.length; i += 1) {
    const item = schedule[i];
    if (!Number.isSafeInteger(item.amountCents) || item.amountCents < MIN_INSTALLMENT_CENTS) return "Each installment must be at least $0.50.";
    if (i > 0 && item.dueDate <= schedule[i - 1].dueDate) return "Installment dates must be in increasing order.";
    total += item.amountCents;
  }
  if (total !== expectedTotalCents) return "Installments must add up exactly to the balance.";
  return null;
}
