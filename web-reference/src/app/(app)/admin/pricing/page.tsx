import { Badge, Card, CardBody, CardHeader, Money, Notice, PageHeader, Table, Td, Th, Tr } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { formatBps } from "@/lib/fees";
import { publishPricing } from "../actions";
import { PricingForm } from "./pricing-form";

type Rule = {
  id: string;
  code: string;
  version: number;
  name: string;
  platform_fee_bps: number;
  platform_fee_fixed_cents: number;
  min_fee_cents: number | null;
  max_fee_cents: number | null;
  refund_policy: string;
  status: string;
  is_default: boolean;
  effective_at: string | null;
};

export default async function PricingAdmin({ searchParams }: PageProps<"/admin/pricing">) {
  await requireStaff([]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: ruleRows }, { data: plans }, { data: agreements }] = await Promise.all([
    supabase.from("pricing_rules").select("id, code, version, name, platform_fee_bps, platform_fee_fixed_cents, min_fee_cents, max_fee_cents, refund_policy, status, is_default, effective_at").order("effective_at", { ascending: false }),
    supabase.from("saas_plans").select("code, name, price_cents, billing_interval, active").order("price_cents"),
    supabase.from("chapter_agreements").select("pricing_rule_id").is("superseded_at", null),
  ]);
  const rules = (ruleRows ?? []) as Rule[];
  const chaptersOn = new Map<string, number>();
  for (const a of agreements ?? []) chaptersOn.set(a.pricing_rule_id as string, (chaptersOn.get(a.pricing_rule_id as string) ?? 0) + 1);
  const current = rules.find((r) => r.is_default && r.status === "active") ?? rules[0];

  return (
    <>
      <PageHeader title="Pricing" description="Published rules are immutable. Each chapter's payments use the rule attached to the agreement it accepted." />
      {sp.published ? <Notice tone="positive" className="mb-6">Pricing published. The public pricing page now shows the default rule.</Notice> : null}
      <div className="space-y-6">
        <Card>
          <CardHeader title="GreekGeek subscription" description="Charged to each chapter through Stripe Billing. Change the price in Stripe and in the saas_plans table together." />
          <CardBody>
            {(plans ?? []).length ? (
              <ul className="space-y-1 text-sm">
                {(plans as Array<{ code: string; name: string; price_cents: number; billing_interval: string; active: boolean }>).map((p) => (
                  <li key={p.code} className="flex items-center gap-3">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="tnum"><Money cents={p.price_cents} /> per {p.billing_interval}</span>
                    {p.active ? <Badge tone="positive">Active</Badge> : <Badge>Inactive</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No subscription plan in the database. The app falls back to the built-in $30 monthly plan.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Dues pricing rules" />
          <Table>
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Fee</Th>
                <Th>Refunds</Th>
                <Th align="right">Chapters</Th>
                <Th>Effective</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      {r.name}
                      {r.is_default ? <Badge tone="accent">Default</Badge> : null}
                      {r.status === "retired" ? <Badge>Retired</Badge> : null}
                    </span>
                    <span className="block font-mono text-[12px] text-ink-3">{r.code} v{r.version}</span>
                  </Td>
                  <Td className="text-[13px]">
                    {formatBps(r.platform_fee_bps)}
                    {r.platform_fee_fixed_cents ? <> + <Money cents={r.platform_fee_fixed_cents} /></> : null}
                    {r.min_fee_cents !== null ? <> · min <Money cents={r.min_fee_cents} /></> : null}
                    {r.max_fee_cents !== null ? <> · max <Money cents={r.max_fee_cents} /></> : null}
                  </Td>
                  <Td className="text-[13px]">{r.refund_policy === "proportional" ? "Returned proportionally" : "Kept"}</Td>
                  <Td align="right">{chaptersOn.get(r.id) ?? 0}</Td>
                  <Td className="text-[13px] text-ink-3">{r.effective_at ? formatDate(r.effective_at) : ""}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Publish a new version" description="This creates a new rule and a matching agreement. It does not change what existing chapters pay until they accept." />
          <CardBody className="py-5">
            <PricingForm action={publishPricing} initial={{ code: current?.code ?? "standard", name: current?.name ?? "Standard dues pricing", percent: current ? String(current.platform_fee_bps / 100) : "1.5" }} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
