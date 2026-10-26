"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "sm", "print:hidden")}>
      <Printer className="size-3.5" aria-hidden />
      Print
    </button>
  );
}
