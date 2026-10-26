"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseDollarsToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage, zodState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { formField, optionalText, requireModule, todayIn } from "@/lib/modules";
import { zonedTimeToUtc } from "@/lib/timezone";
import type { ActionState } from "@/lib/action-state";
import { setupLockState, setupLocked } from "@/lib/setup-access";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function refresh(slug: string) {
  revalidatePath(`/c/${slug}/housing`, "layout");
}

function housingError(error: { message?: string; code?: string }): string {
  if (error.code === "23P01" && error.message && !/constraint/i.test(error.message)) {
    const m = error.message.trim();
    return `${m.charAt(0).toUpperCase()}${m.slice(1)}.`;
  }
  return dbErrorMessage(error);
}

const roomSchema = z.object({
  name: z.string().trim().min(1, "Name the room").max(60),
  floor: z.string().trim().max(40).nullable(),
  capacity: z.coerce.number({ message: "Enter how many people fit" }).int().min(1, "At least 1").max(12, "At most 12"),
  rent: z.string().nullable(),
  features: z.string().max(400).nullable(),
  notes: z.string().max(500).nullable(),
});

export async function saveRoom(slug: string, roomId: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = roomSchema.safeParse({
    name: formField(formData, "name"),
    floor: optionalText(formData, "floor"),
    capacity: formField(formData, "capacity") || 2,
    rent: optionalText(formData, "rent"),
    features: optionalText(formData, "features"),
    notes: optionalText(formData, "notes"),
  });
  if (!parsed.success) return zodState(parsed.error);
  let rent: number | null = null;
  if (parsed.data.rent) {
    rent = parseDollarsToCents(parsed.data.rent);
    if (rent === null || rent < 0) return { fieldErrors: { rent: "Enter rent like 850.00, or leave it blank" } };
  }
  const features = (parsed.data.features ?? "").split(",").map((f) => f.trim()).filter(Boolean).slice(0, 12);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_housing_room", {
    p_chapter: chapter.id,
    p_room: roomId,
    p_name: parsed.data.name,
    p_floor: parsed.data.floor,
    p_capacity: parsed.data.capacity,
    p_rent_cents: rent,
    p_features: features,
    p_notes: parsed.data.notes,
  });
  if (error) return { error: error.code === "23505" ? "Another room already has that name." : housingError(error) };
  refresh(slug);
  return { ok: true, message: roomId ? "Room saved." : "Room added." };
}

const bulkSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(60),
      floor: z.string().trim().max(40).nullable(),
      capacity: z.number().int().min(1).max(12),
      rent_cents: z.number().int().min(0).max(10_000_000).nullable(),
      features: z.array(z.string().trim().max(40)).max(12),
    }),
  )
  .min(1, "Add at least one room")
  .max(200, "Add up to 200 rooms at a time");

export async function createRooms(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  if (!rateLimit(`bulk-rooms:${user.id}`, 20, 60 * 60_000)) return { error: "Too many updates. Try again later." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rooms") ?? "[]"));
  } catch {
    return { error: "Something was off with the room list. Refresh and try again." };
  }
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the room list." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_create_housing_rooms", { p_chapter: chapter.id, p_rooms: parsed.data });
  if (error) return { error: housingError(error) };
  const result = data as { created: number; skipped: string[] };
  refresh(slug);
  redirect(`/c/${slug}/housing/rooms?added=${result.created}&skipped=${result.skipped.length}`);
}

export async function archiveRoom(slug: string, roomId: string, archived: boolean): Promise<void> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_housing_room_archived", { p_room: roomId, p_archived: archived });
  if (error) redirect(`/c/${slug}/housing/rooms?error=${encodeURIComponent(error.code === "23505" ? "Another room already uses that name. Rename it first." : housingError(error))}`);
  refresh(slug);
}

const assignSchema = z.object({
  membership_id: z.string().uuid("Pick a member"),
  starts_on: z.string().regex(DATE, "Pick a move-in date"),
  ends_on: z.string().regex(DATE).nullable().catch(null),
  bed: z.string().trim().max(20).nullable(),
});

export async function assignRoom(slug: string, roomId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = assignSchema.safeParse({
    membership_id: formField(formData, "membership_id"),
    starts_on: formField(formData, "starts_on"),
    ends_on: optionalText(formData, "ends_on"),
    bed: optionalText(formData, "bed"),
  });
  if (!parsed.success) return zodState(parsed.error);
  if (parsed.data.ends_on && parsed.data.ends_on < parsed.data.starts_on) return { fieldErrors: { ends_on: "Move-out must be after move-in" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_room", {
    p_room: roomId,
    p_membership: parsed.data.membership_id,
    p_starts_on: parsed.data.starts_on,
    p_ends_on: parsed.data.ends_on,
    p_bed: parsed.data.bed,
  });
  if (error) return { error: housingError(error) };
  refresh(slug);
  return { ok: true, message: "Assigned. They were notified." };
}

const endSchema = z.object({
  ends_on: z.string().regex(DATE, "Pick a move-out date"),
  reason: z.string().trim().max(200).nullable(),
});

export async function endAssignment(slug: string, assignmentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = endSchema.safeParse({ ends_on: formField(formData, "ends_on"), reason: optionalText(formData, "reason") });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_room_assignment", { p_assignment: assignmentId, p_ends_on: parsed.data.ends_on, p_reason: parsed.data.reason });
  if (error) return { error: housingError(error) };
  refresh(slug);
  return { ok: true, message: "Move-out saved." };
}

const requestSchema = z.object({
  term: z.string().trim().min(2, "Which term is this for?").max(40),
  rooms: z.array(z.string().uuid()).max(3),
  roommates: z.array(z.string().uuid()).max(3),
  single: z.boolean(),
  notes: z.string().max(1000).nullable(),
});

const picks = (formData: FormData, prefix: string) =>
  [...new Set([1, 2, 3].map((n) => String(formData.get(`${prefix}_${n}`) ?? "")).filter(Boolean))];

export async function submitHousingRequest(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "housing");
  if (!rateLimit(`housing-request:${user.id}`, 20, 60 * 60_000)) return { error: "Too many updates. Try again later." };
  const parsed = requestSchema.safeParse({
    term: formField(formData, "term"),
    rooms: picks(formData, "room"),
    roommates: picks(formData, "roommate"),
    single: formData.get("single") === "on",
    notes: optionalText(formData, "notes"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_housing_request", {
    p_chapter: chapter.id,
    p_term: parsed.data.term,
    p_rooms: parsed.data.rooms,
    p_roommates: parsed.data.roommates,
    p_single: parsed.data.single,
    p_notes: parsed.data.notes,
  });
  if (error) return { error: housingError(error) };
  refresh(slug);
  return { ok: true, message: "Request saved. Your house manager will see it." };
}

export async function withdrawHousingRequest(slug: string, requestId: string): Promise<void> {
  await requireModule(slug, "housing");
  const supabase = await createClient();
  await supabase.rpc("withdraw_housing_request", { p_request: requestId });
  refresh(slug);
}

export async function deleteHousingRequest(slug: string, requestId: string): Promise<void> {
  const { chapter, membership, can } = await requireModule(slug, "housing");
  const supabase = await createClient();
  const { data } = await supabase.from("housing_requests").select("membership_id").eq("id", requestId).eq("chapter_id", chapter.id).maybeSingle();
  if (can("housing.manage") && data && data.membership_id !== membership.id && (await setupLocked(chapter.id))) return;
  const { error } = await supabase.rpc("delete_housing_request", { p_request: requestId });
  if (error) redirect(`/c/${slug}/housing${can("housing.manage") ? "/rooms" : ""}?error=${encodeURIComponent(dbErrorMessage(error))}`);
  refresh(slug);
}

const respondSchema = z.object({
  status: z.enum(["waitlisted", "placed", "declined"]),
  response: z.string().max(500).nullable(),
});

export async function respondHousingRequest(slug: string, requestId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = respondSchema.safeParse({ status: formField(formData, "status"), response: optionalText(formData, "response") });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_housing_request", { p_request: requestId, p_status: parsed.data.status, p_response: parsed.data.response });
  if (error) return { error: housingError(error) };
  refresh(slug);
  return { ok: true, message: "Response sent." };
}

const rentSchema = z.object({
  title: z.string().trim().min(2, "Name the charge").max(120),
  due_date: z.string().regex(DATE, "Pick a due date"),
});

export async function billRent(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "finance.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = rentSchema.safeParse({ title: formField(formData, "title"), due_date: formField(formData, "due_date") });
  if (!parsed.success) return zodState(parsed.error);
  if (parsed.data.due_date < todayIn(chapter.timezone, Date.now())) return { fieldErrors: { due_date: "Due date cannot be in the past" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bill_room_rent", { p_chapter: chapter.id, p_title: parsed.data.title, p_due_date: parsed.data.due_date });
  if (error) return { error: housingError(error) };
  const result = data as { assessment_id: string; count: number };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: true, message: `Rent billed to ${result.count} resident${result.count === 1 ? "" : "s"}. Find it under Finances.` };
}

const maintenanceSchema = z.object({
  title: z.string().min(3, "Describe the issue briefly").max(140),
  description: z.string().max(2000).nullable(),
  location: z.string().max(120).nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).catch("normal"),
  facility_id: z.string().uuid().nullable().catch(null),
});

export async function submitMaintenance(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "housing");
  if (!rateLimit(`maint:${user.id}`, 15, 60 * 60_000)) return { error: "Too many requests. Try again later." };
  const parsed = maintenanceSchema.safeParse({
    title: formField(formData, "title"),
    description: optionalText(formData, "description"),
    location: optionalText(formData, "location"),
    priority: formField(formData, "priority"),
    facility_id: optionalText(formData, "facility_id"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_requests").insert({ chapter_id: chapter.id, submitted_by: user.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Request submitted. Housing officers will see it in their queue." };
}

const maintenanceUpdate = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  assigned_membership_id: z.string().uuid().nullable().catch(null),
  resolution_note: z.string().max(2000).nullable(),
});

export async function updateMaintenance(slug: string, id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = maintenanceUpdate.safeParse({
    status: formField(formData, "status"),
    assigned_membership_id: optionalText(formData, "assigned_membership_id"),
    resolution_note: optionalText(formData, "resolution_note"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const resolved = parsed.data.status === "resolved" || parsed.data.status === "closed";
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ ...parsed.data, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("chapter_id", chapter.id);
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Request updated." };
}

const reservationSchema = z.object({
  facility_id: z.string().uuid("Pick a space"),
  date: z.string().regex(DATE, "Pick a date"),
  start: z.string().regex(TIME, "Pick a start time"),
  end: z.string().regex(TIME, "Pick an end time"),
  purpose: z.string().max(200).nullable(),
});

export async function reserveFacility(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "housing");
  if (!rateLimit(`reserve:${user.id}`, 20, 60 * 60_000)) return { error: "Too many reservations. Try again later." };
  const parsed = reservationSchema.safeParse({
    facility_id: formField(formData, "facility_id"),
    date: formField(formData, "date"),
    start: formField(formData, "start"),
    end: formField(formData, "end"),
    purpose: optionalText(formData, "purpose"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const starts = zonedTimeToUtc(parsed.data.date, parsed.data.start, chapter.timezone);
  const ends = zonedTimeToUtc(parsed.data.date, parsed.data.end, chapter.timezone);
  if (!starts || !ends) return { error: "Check the date and times." };
  if (ends <= starts) return { fieldErrors: { end: "End time must be after the start" } };
  if (starts.getTime() < Date.now() - 5 * 60_000) return { fieldErrors: { date: "Reservations must be in the future" } };
  const supabase = await createClient();
  const { error } = await supabase.from("facility_reservations").insert({
    chapter_id: chapter.id,
    facility_id: parsed.data.facility_id,
    user_id: user.id,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    purpose: parsed.data.purpose,
  });
  if (error) {
    if (error.code === "23P01") return { error: "That time overlaps an existing reservation." };
    return { error: dbErrorMessage(error) };
  }
  refresh(slug);
  return { ok: true, message: "Reserved." };
}

export async function cancelReservation(slug: string, id: string): Promise<void> {
  const { chapter } = await requireModule(slug, "housing");
  const supabase = await createClient();
  await supabase.from("facility_reservations").update({ status: "cancelled" }).eq("id", id).eq("chapter_id", chapter.id).eq("status", "confirmed");
  refresh(slug);
}

export async function completeChore(slug: string, id: string, done: boolean): Promise<void> {
  const { chapter } = await requireModule(slug, "housing");
  const supabase = await createClient();
  await supabase.from("chores").update({ status: done ? "done" : "pending" }).eq("id", id).eq("chapter_id", chapter.id);
  refresh(slug);
}

const supplySchema = z.object({
  item_name: z.string().min(2, "What do you need?").max(120),
  quantity: z.coerce.number({ message: "Enter a quantity" }).int().min(1).max(1000),
  note: z.string().max(500).nullable(),
});

export async function requestSupply(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "housing");
  if (!rateLimit(`supply:${user.id}`, 20, 60 * 60_000)) return { error: "Too many requests. Try again later." };
  const parsed = supplySchema.safeParse({ item_name: formField(formData, "item_name"), quantity: formField(formData, "quantity") || 1, note: optionalText(formData, "note") });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("supply_requests").insert({ chapter_id: chapter.id, requested_by: user.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Request sent." };
}

export async function setSupplyStatus(slug: string, id: string, status: "approved" | "fulfilled" | "declined"): Promise<void> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  const allowedFrom = status === "fulfilled" ? ["requested", "approved"] : ["requested"];
  await supabase.from("supply_requests").update({ status }).eq("id", id).eq("chapter_id", chapter.id).in("status", allowedFrom);
  refresh(slug);
}

const facilitySchema = z.object({
  name: z.string().min(2, "Name the space").max(80),
  kind: z.enum(["house", "room", "common_area", "parking", "other"]).catch("common_area"),
  reservable: z.boolean(),
});

export async function addFacility(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = facilitySchema.safeParse({ name: formField(formData, "name"), kind: formField(formData, "kind"), reservable: formData.get("reservable") === "on" });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("facilities").insert({ chapter_id: chapter.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Space added." };
}

export async function setReservable(slug: string, id: string, reservable: boolean): Promise<void> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  await supabase.from("facilities").update({ reservable }).eq("id", id).eq("chapter_id", chapter.id);
  refresh(slug);
}

const choreSchema = z.object({
  title: z.string().min(2, "Name the chore").max(120),
  assigned_membership_id: z.string().uuid("Pick a member"),
  due_on: z.string().regex(DATE, "Pick a due date"),
});

export async function assignChore(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter, user } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const parsed = choreSchema.safeParse({ title: formField(formData, "title"), assigned_membership_id: formField(formData, "assigned_membership_id"), due_on: formField(formData, "due_on") });
  if (!parsed.success) return zodState(parsed.error);
  if (parsed.data.due_on < todayIn(chapter.timezone, Date.now())) return { fieldErrors: { due_on: "Due date cannot be in the past" } };
  const supabase = await createClient();
  const { error } = await supabase.from("chores").insert({ chapter_id: chapter.id, created_by: user.id, ...parsed.data });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Chore assigned. The member was notified." };
}

export async function markChoreMissed(slug: string, id: string): Promise<void> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  if (await setupLocked(chapter.id)) return;
  const supabase = await createClient();
  await supabase.from("chores").update({ status: "missed" }).eq("id", id).eq("chapter_id", chapter.id).eq("status", "pending");
  refresh(slug);
}

const inventorySchema = z.object({
  name: z.string().min(2, "Name the item").max(120),
  quantity: z.coerce.number({ message: "Enter a quantity" }).int().min(0).max(100000),
  unit: z.string().max(20).nullable(),
  reorder_level: z.coerce.number().int().min(0).max(100000).nullable(),
  location: z.string().max(120).nullable(),
});

export async function saveInventoryItem(slug: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const blocked = await setupLockState(chapter.id);
  if (blocked) return blocked;
  const reorder = formField(formData, "reorder_level");
  const parsed = inventorySchema.safeParse({
    name: formField(formData, "name"),
    quantity: formField(formData, "quantity") || 0,
    unit: optionalText(formData, "unit"),
    reorder_level: reorder ? reorder : null,
    location: optionalText(formData, "location"),
  });
  if (!parsed.success) return zodState(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_items")
    .upsert({ chapter_id: chapter.id, ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "chapter_id,name" });
  if (error) return { error: dbErrorMessage(error) };
  refresh(slug);
  return { ok: true, message: "Inventory saved." };
}

export async function adjustInventory(slug: string, id: string, delta: number): Promise<void> {
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  if (await setupLocked(chapter.id)) return;
  if (!Number.isInteger(delta) || Math.abs(delta) > 1000) return;
  const supabase = await createClient();
  const { data } = await supabase.from("inventory_items").select("quantity").eq("id", id).eq("chapter_id", chapter.id).maybeSingle();
  if (!data) return;
  await supabase
    .from("inventory_items")
    .update({ quantity: Math.max(0, data.quantity + delta), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("chapter_id", chapter.id)
    .eq("quantity", data.quantity);
  refresh(slug);
}
