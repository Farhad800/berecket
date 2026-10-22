"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import Combobox, { type ComboOption } from "@/components/combobox";
import { useFormAction } from "@/components/use-form-action";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { createOrderAction, updateOrderAction } from "@/app/actions/orders";

type Line = { key: string; lineId?: string; productId: string; quantity: string; specifications: string; locked?: boolean };
type Initial = {
  id: string;
  status: string;
  customerId: string;
  customerReference: string;
  priority: string;
  requestedDeliveryDate: string;
  plannedStart: string;
  plannedEnd: string;
  instructions: string;
  packaging: string;
  notes: string;
  lines: Omit<Line, "key">[];
};

let seq = 0;
const newLine = (): Line => ({ key: `n${++seq}`, productId: "", quantity: "", specifications: "" });

export default function OrderForm({
  customers,
  products,
  initial,
  canConfirm,
}: {
  customers: ComboOption[];
  products: (ComboOption & { specs?: string })[];
  initial?: Initial;
  canConfirm: boolean;
}) {
  const t = useTranslations();
  const editing = !!initial;
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.map((l, i) => ({ ...l, key: `e${i}` })) ?? [newLine()],
  );
  const { onSubmit, pending, error, fieldErrors: fe } = useFormAction(editing ? updateOrderAction : createOrderAction);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const needsReason = editing && initial.status !== "DRAFT";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {editing && <input type="hidden" name="id" value={initial.id} />}
      {error && <Alert>{error}</Alert>}

      <Card>
        <h2 className="mb-3 font-semibold">{t("order.customerSection")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label={`${t("order.customer")} *`} name="customerId" error={fe.customerId}>
              <Combobox name="customerId" options={customers} defaultValue={initial?.customerId} required invalid={!!fe.customerId} />
            </Field>
          </div>
          <Field label={t("order.customerReference")} name="customerReference" hint={t("order.customerReferenceHint")}>
            <Input name="customerReference" defaultValue={initial?.customerReference} dir="ltr" />
          </Field>
          <Field label={`${t("order.requestedDelivery")} *`} name="requestedDeliveryDate" error={fe.requestedDeliveryDate}>
            <Input name="requestedDeliveryDate" type="date" required defaultValue={initial?.requestedDeliveryDate} />
          </Field>
          <Field label={t("order.priority")} name="priority">
            <Select name="priority" defaultValue={initial?.priority ?? "NORMAL"}>
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{t(`status.priority.${p}`)}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("order.plannedStart")} name="plannedStart">
              <Input name="plannedStart" type="date" defaultValue={initial?.plannedStart} />
            </Field>
            <Field label={t("order.plannedEnd")} name="plannedEnd">
              <Input name="plannedEnd" type="date" defaultValue={initial?.plannedEnd} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t("order.products")}</h2>
          <span className="text-xs text-muted">{lines.length}</span>
        </div>
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={l.key} className="rounded-xl border border-line p-3">
              <input type="hidden" name="lineId[]" value={l.lineId ?? ""} />
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">{t("order.line")} {i + 1}</span>
                {!l.locked && lines.length > 1 && (
                  <button
                    type="button"
                    aria-label={t("order.removeLine")}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <Field label={`${t("order.product")} *`} name={`productId-${l.key}`}>
                  {l.locked ? (
                    <>
                      <input type="hidden" name="productId[]" value={l.productId} />
                      <div className="flex min-h-11 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm">
                        {products.find((p) => p.value === l.productId)?.label}
                      </div>
                    </>
                  ) : (
                    <Combobox
                      name="productId[]"
                      options={products}
                      defaultValue={l.productId}
                      required
                      onChange={(v) => {
                        const p = products.find((x) => x.value === v);
                        update(l.key, { productId: v, ...(l.specifications ? {} : { specifications: p?.specs ?? "" }) });
                      }}
                    />
                  )}
                </Field>
                <Field label={`${t("order.quantity")} (${t("md.pcs")}) *`} name={`qty-${l.key}`}>
                  <Input
                    name="quantity[]"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    required
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    dir="ltr"
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label={t("order.lineSpecs")} name={`specs-${l.key}`}>
                  <Textarea
                    name="specifications[]"
                    rows={2}
                    value={l.specifications}
                    onChange={(e) => update(l.key, { specifications: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setLines((ls) => [...ls, newLine()])}>
          <Plus className="size-4" /> {t("order.addLine")}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">{t("order.instructionsSection")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("order.instructions")} name="instructions">
            <Textarea name="instructions" defaultValue={initial?.instructions} />
          </Field>
          <Field label={t("order.packaging")} name="packaging">
            <Textarea name="packaging" defaultValue={initial?.packaging} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("md.notes")} name="notes">
              <Textarea name="notes" defaultValue={initial?.notes} />
            </Field>
          </div>
        </div>
      </Card>

      {needsReason && (
        <Card>
          <Field label={t("order.changeReason")} name="reason" hint={t("order.changeReasonHint")}>
            <Input name="reason" />
          </Field>
        </Card>
      )}

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap gap-2 border-t border-line bg-surface-2/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {editing ? (
          <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
        ) : (
          <>
            <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
              {t("order.saveDraft")}
            </Button>
            {canConfirm && (
              <Button type="submit" name="intent" value="confirm" disabled={pending}>
                {pending ? t("common.saving") : t("order.saveConfirm")}
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
