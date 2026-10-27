"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { createSupplierAction } from "@/app/actions/suppliers";

/** "New supplier": the code is given automatically (S-0001) unless one is typed. */
export default function NewSupplier() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", phone: "", address: "", code: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError(null);
    const r = await createSupplierAction({ name: v.name, phone: v.phone || undefined, address: v.address || undefined, code: v.code || undefined });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/suppliers/${r.data.id}?saved=1`);
  });
  if (!open) return <Button onClick={() => setOpen(true)}><UserPlus className="size-4" /> {t("supp.new")}</Button>;
  return (
    <Card className="w-full max-w-xl space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={t("supp.name")} aria-label={t("supp.name")} />
        <Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder={t("sd.phone")} aria-label={t("sd.phone")} dir="ltr" />
        <Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder={t("supp.address")} aria-label={t("supp.address")} />
        <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} placeholder={t("supp.codeAuto")} aria-label={t("supp.code")} dir="ltr" />
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending || v.name.trim().length < 2}><UserPlus className="size-4" /> {t("supp.add")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
      </div>
    </Card>
  );
}
