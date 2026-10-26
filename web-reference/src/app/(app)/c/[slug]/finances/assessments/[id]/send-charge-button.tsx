"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui";

export function SendChargeButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.dispatchEvent(new Event("assessment:send"))}>
      <Send className="size-3.5" aria-hidden />
      Send charge
    </Button>
  );
}
