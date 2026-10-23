"use client";

import { Printer } from "lucide-react";

export default function PrintButton({ label }: { label: string }) {
  return (
    <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-[#294680] px-4 py-2 text-sm font-semibold text-white">
      <Printer className="size-4" /> {label}
    </button>
  );
}
