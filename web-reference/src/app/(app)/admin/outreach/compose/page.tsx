import Link from "next/link";
import { Card, CardBody, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { ComposeForm } from "./compose-form";

export default async function ComposePage() {
  await requireStaff([]);
  const canSend = Boolean(serverEnv.resendApiKey());
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/admin/outreach" className="hover:text-ink">Universities</Link>}
        title="Compose email"
        description="Starts from the GreekGeek outreach letter. Fill in who it is for and the letter updates until you edit it yourself. Send it now, or add it to the bulk list and send a batch of different emails together."
        actions={
          <div className="flex items-center gap-4">
            <Link href="/admin/outreach/bulk" className="text-sm text-ink-2 hover:text-ink">Bulk list</Link>
            <Link href="/admin/outreach/sent" className="text-sm text-ink-2 hover:text-ink">Sent</Link>
          </div>
        }
      />
      {!canSend ? <Notice tone="warning">Sending is off because RESEND_API_KEY is not set.</Notice> : null}
      <Card>
        <CardBody>
          <ComposeForm from={serverEnv.outreachFrom() ?? serverEnv.emailFrom()} replyTo={serverEnv.outreachReplyTo()} canSend={canSend} />
        </CardBody>
      </Card>
    </div>
  );
}
