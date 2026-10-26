import { Boxes, ClipboardCheck, Wrench } from "lucide-react";
import { personName } from "@/components/people";
import { SimpleForm } from "@/components/simple-form";
import { SubmitButton } from "@/components/forms";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th, TextLink, Tr } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate, requestTime } from "@/lib/format";
import { activeMembers, requireModule, todayIn } from "@/lib/modules";
import { FACILITY_KIND, MAINTENANCE_STATUS, PRIORITY, SUPPLY_STATUS } from "../labels";
import { addFacility, adjustInventory, assignChore, completeChore, markChoreMissed, saveInventoryItem, setReservable, setSupplyStatus, updateMaintenance } from "../actions";

type Maintenance = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  priority: keyof typeof PRIORITY;
  status: keyof typeof MAINTENANCE_STATUS;
  created_at: string;
  assigned_membership_id: string | null;
  resolution_note: string | null;
  submitter: { display_name: string | null; full_name: string | null } | null;
};
type Supply = { id: string; item_name: string; quantity: number; note: string | null; status: keyof typeof SUPPLY_STATUS; created_at: string; requester: { display_name: string | null; full_name: string | null } | null };
type Item = { id: string; name: string; quantity: number; unit: string | null; reorder_level: number | null; location: string | null };

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

export default async function HousingManagePage({ params }: PageProps<"/c/[slug]/housing/manage">) {
  const { slug } = await params;
  const { chapter } = await requireModule(slug, "housing", "housing.manage");
  const supabase = await createClient();
  const today = todayIn(chapter.timezone, requestTime());

  const [maintenanceRes, choresRes, facilitiesRes, suppliesRes, inventoryRes, members] = await Promise.all([
    supabase
      .from("maintenance_requests")
      .select("id, title, description, location, priority, status, created_at, assigned_membership_id, resolution_note, submitter:profiles!maintenance_requests_submitted_by_fkey(display_name, full_name)")
      .eq("chapter_id", chapter.id)
      .in("status", ["open", "in_progress"])
      .order("created_at")
      .limit(100),
    supabase.from("chores").select("id, title, due_on, status, assigned_membership_id").eq("chapter_id", chapter.id).eq("status", "pending").order("due_on").limit(200),
    supabase.from("facilities").select("id, name, kind, reservable").eq("chapter_id", chapter.id).order("name"),
    supabase
      .from("supply_requests")
      .select("id, item_name, quantity, note, status, created_at, requester:profiles!supply_requests_requested_by_fkey(display_name, full_name)")
      .eq("chapter_id", chapter.id)
      .in("status", ["requested", "approved"])
      .order("created_at")
      .limit(100),
    supabase.from("inventory_items").select("id, name, quantity, unit, reorder_level, location").eq("chapter_id", chapter.id).order("name").limit(500),
    activeMembers(chapter.id),
  ]);
  const maintenance = ((maintenanceRes.data ?? []) as unknown as Maintenance[]).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.created_at.localeCompare(b.created_at));
  const chores = (choresRes.data ?? []) as Array<{ id: string; title: string; due_on: string; status: string; assigned_membership_id: string }>;
  const facilities = (facilitiesRes.data ?? []) as Array<{ id: string; name: string; kind: string; reservable: boolean }>;
  const supplies = (suppliesRes.data ?? []) as unknown as Supply[];
  const inventory = (inventoryRes.data ?? []) as Item[];
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href={`/c/${slug}/housing`}>Housing</TextLink>}
        title="Manage housing"
        description="Maintenance queue, chore assignments, spaces, supplies, and inventory."
        actions={<ButtonLink href={`/c/${slug}/housing/rooms`} variant="secondary">Rooms and residents</ButtonLink>}
      />

      <div className="space-y-8">
        <Card>
          <CardHeader title="Maintenance queue" description={`${maintenance.length} open`} />
          {maintenance.length === 0 ? (
            <EmptyState icon={Wrench} title="Queue is clear">New requests from members will appear here.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {maintenance.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{m.title}</p>
                        <p className="text-[12px] text-ink-3">
                          {[m.submitter ? personName(m.submitter) : "Member", m.location, formatDate(m.created_at, chapter.timezone), m.assigned_membership_id ? `Assigned to ${memberName.get(m.assigned_membership_id) ?? "member"}` : "Unassigned"]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge tone={PRIORITY[m.priority].tone}>{PRIORITY[m.priority].label}</Badge>
                        <Badge tone={MAINTENANCE_STATUS[m.status].tone}>{MAINTENANCE_STATUS[m.status].label}</Badge>
                      </div>
                    </summary>
                    <div className="mt-4 space-y-4 border-t border-line pt-4">
                      {m.description ? <p className="whitespace-pre-wrap text-[13px] text-ink-2">{m.description}</p> : null}
                      <SimpleForm
                        action={updateMaintenance.bind(null, slug, m.id)}
                        submitLabel="Update request"
                        resetOnSuccess={false}
                        fields={[
                          { name: "status", label: "Status", type: "select", defaultValue: m.status, options: Object.entries(MAINTENANCE_STATUS).map(([value, s]) => ({ value, label: s.label })), span: "half" },
                          { name: "assigned_membership_id", label: "Assigned to", type: "select", defaultValue: m.assigned_membership_id ?? "", options: [{ value: "", label: "Unassigned" }, ...memberOptions], span: "half" },
                          { name: "resolution_note", label: "Note to the member", type: "textarea", defaultValue: m.resolution_note ?? "", maxLength: 2000 },
                        ]}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <Card>
            <CardHeader title="Pending chores" />
            {chores.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No pending chores">Assign chores with the form beside this list.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {chores.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{c.title}</p>
                      <p className={c.due_on < today ? "text-[12px] text-danger" : "text-[12px] text-ink-3"}>
                        {memberName.get(c.assigned_membership_id) ?? "Former member"} · due {formatDate(c.due_on, "UTC")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <form action={markChoreMissed.bind(null, slug, c.id)}>
                        <SubmitButton size="sm" variant="ghost">Mark missed</SubmitButton>
                      </form>
                      <form action={completeChore.bind(null, slug, c.id, true)}>
                        <SubmitButton size="sm" variant="secondary">Mark done</SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Assign a chore" />
            <CardBody>
              {memberOptions.length ? (
                <SimpleForm
                  action={assignChore.bind(null, slug)}
                  submitLabel="Assign"
                  fields={[
                    { name: "title", label: "Chore", placeholder: "Kitchen cleanup", maxLength: 120 },
                    { name: "assigned_membership_id", label: "Member", type: "select", options: memberOptions },
                    { name: "due_on", label: "Due", type: "date", min: today, defaultValue: today },
                  ]}
                />
              ) : (
                <p className="text-[13px] text-ink-3">Add members to the chapter first.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Supply requests" />
          {supplies.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-3">No open supply requests.</p>
          ) : (
            <ul className="divide-y divide-line">
              {supplies.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm text-ink">
                      {s.item_name} <span className="text-ink-3 tnum">× {s.quantity}</span>
                    </p>
                    <p className="text-[12px] text-ink-3">
                      {s.requester ? personName(s.requester) : "Member"} · {formatDate(s.created_at, chapter.timezone)}
                      {s.note ? ` · ${s.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={SUPPLY_STATUS[s.status].tone}>{SUPPLY_STATUS[s.status].label}</Badge>
                    {s.status === "requested" ? (
                      <>
                        <form action={setSupplyStatus.bind(null, slug, s.id, "declined")}>
                          <SubmitButton size="sm" variant="ghost">Decline</SubmitButton>
                        </form>
                        <form action={setSupplyStatus.bind(null, slug, s.id, "approved")}>
                          <SubmitButton size="sm" variant="secondary">Approve</SubmitButton>
                        </form>
                      </>
                    ) : null}
                    <form action={setSupplyStatus.bind(null, slug, s.id, "fulfilled")}>
                      <SubmitButton size="sm" variant="secondary">Fulfilled</SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <Card>
            <CardHeader title="Inventory" />
            {inventory.length === 0 ? (
              <EmptyState icon={Boxes} title="No inventory tracked">Add items to track stock and reorder levels.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th>Location</Th>
                      <Th align="right">On hand</Th>
                      <Th align="right">Adjust</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((i) => {
                      const low = i.reorder_level !== null && i.quantity <= i.reorder_level;
                      return (
                        <Tr key={i.id}>
                          <Td>
                            <span className="text-ink">{i.name}</span> {low ? <Badge tone="warning">Reorder</Badge> : null}
                          </Td>
                          <Td>{i.location ?? ""}</Td>
                          <Td align="right" className="tnum">
                            {i.quantity} {i.unit ?? ""}
                          </Td>
                          <Td align="right">
                            <div className="flex justify-end gap-1">
                              <form action={adjustInventory.bind(null, slug, i.id, -1)}>
                                <Button type="submit" size="sm" variant="ghost" aria-label={`Remove one ${i.name}`} disabled={i.quantity === 0}>
                                  −1
                                </Button>
                              </form>
                              <form action={adjustInventory.bind(null, slug, i.id, 1)}>
                                <Button type="submit" size="sm" variant="ghost" aria-label={`Add one ${i.name}`}>
                                  +1
                                </Button>
                              </form>
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Add or update an item" description="Saving an existing name updates it." />
            <CardBody>
              <SimpleForm
                action={saveInventoryItem.bind(null, slug)}
                submitLabel="Save item"
                fields={[
                  { name: "name", label: "Item", maxLength: 120 },
                  { name: "quantity", label: "Quantity", type: "number", min: "0", defaultValue: "0", span: "half" },
                  { name: "unit", label: "Unit", placeholder: "rolls", maxLength: 20, span: "half" },
                  { name: "reorder_level", label: "Reorder at", type: "number", min: "0", span: "half" },
                  { name: "location", label: "Location", maxLength: 120, span: "half" },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <Card>
            <CardHeader title="Spaces" description="Members can reserve spaces marked reservable." />
            {facilities.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-ink-3">No spaces added yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {facilities.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{f.name}</p>
                      <p className="text-[12px] text-ink-3">{FACILITY_KIND[f.kind] ?? f.kind}</p>
                    </div>
                    <form action={setReservable.bind(null, slug, f.id, !f.reservable)} className="flex items-center gap-3">
                      {f.reservable ? <Badge tone="positive">Reservable</Badge> : null}
                      <Button type="submit" size="sm" variant="ghost">{f.reservable ? "Stop reservations" : "Allow reservations"}</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Add a space" />
            <CardBody>
              <SimpleForm
                action={addFacility.bind(null, slug)}
                submitLabel="Add space"
                fields={[
                  { name: "name", label: "Name", placeholder: "Chapter room", maxLength: 80 },
                  { name: "kind", label: "Type", type: "select", defaultValue: "common_area", options: Object.entries(FACILITY_KIND).map(([value, label]) => ({ value, label })) },
                  { name: "reservable", label: "Members can reserve it", type: "checkbox" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
