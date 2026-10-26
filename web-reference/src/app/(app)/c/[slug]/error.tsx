"use client";

import { useParams } from "next/navigation";
import { ErrorView } from "@/components/error-view";

export default function ChapterError({ error, retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ slug: string }>();
  return <ErrorView error={error} retry={retry} homeHref={params?.slug ? `/c/${params.slug}` : "/home"} />;
}
