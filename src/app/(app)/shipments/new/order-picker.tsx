"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Combobox, { type ComboOption } from "@/components/combobox";
import { Field } from "@/components/ui";

export default function OrderPicker({ orders, selected }: { orders: ComboOption[]; selected?: string }) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <Field label={t("ship.orderWithStock")} name="order">
      <Combobox name="order" options={orders} defaultValue={selected} onChange={(v) => router.push(`/shipments/new?order=${v}`)} />
    </Field>
  );
}
