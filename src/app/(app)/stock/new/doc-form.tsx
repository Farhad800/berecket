"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, Plus, Save, Trash2 } from "lucide-react";
import Combobox from "@/components/combobox";
import { Alert, Button, Card, Input, Select, Textarea, cn } from "@/components/ui";
import { saveStockDocAction } from "@/app/actions/stock";
import { fmtMoney, fmtQty, type DocType } from "../types";
import { docTotal, lineTotal } from "@/lib/money";

type Item = { id: string; code: string; name: string; name2: string | null; unit: string; kind: string; stock: number };
type Order = { id: string; number: string; lines: { productId: string; quantity: number }[] };
type Line = { key: number; itemId: string; qty: string; price: string };
const REASONS = ["RETURN", "TRANSFER", "COUNT", "DAMAGE", "SAMPLE", "OTHER"] as const;

/** One Input / Output / Buy / Sell document with any number of lines. */
export default function DocForm({ allowed, initialType, initialOrder, items, orders, parties = [] }: {
  allowed: DocType[]; initialType: DocType; initialOrder: string; items: Item[]; orders: Order[];
  parties?: { type: "BUY" | "SELL"; name: string; phone: string | null }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [type, setType] = useState<DocType>(initialType);
  const [reason, setReason] = useState("");
  const [party, setParty] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState<"IQD" | "USD" | "EUR">("IQD");
  // "Paid now" follows the total until the user types their own amount.
  const [paidText, setPaidText] = useState<string | null>(null);
  const [orderId, setOrderId] = useState(initialOrder);
  const [note, setNote] = useState("");
  // Keys start at 0 on every render tree, so server and browser HTML match (hydration).
  const seq = useRef(0);
  const blank = (): Line => ({ key: ++seq.current, itemId: "", qty: "", price: "" });
  const [lines, setLines] = useState<Line[]>(() => [{ key: 0, itemId: "", qty: "", price: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const money = type === "BUY" || type === "SELL";
  const goesOut = type === "OUTPUT" || type === "SELL";

  const options = useMemo(() => items.map((i) => ({ value: i.id, label: i.name, hint: `${i.code} · ${t(`md.kind.${i.kind}`)}${i.name2 ? ` · ${i.name2}` : ""}` })), [items, t]);
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = docTotal(lines.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0 })));
  const filled = lines.filter((l) => l.itemId);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const paidNow = paidText === null ? round2(total) : Number(paidText) || 0;
  const owed = round2(total - paidNow);

  const fillFromOrder = () => {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    setLines(o.lines.map((l) => ({ key: ++seq.current, itemId: l.productId, qty: String(l.quantity), price: "" })));
  };

  const save = () => start(async () => {
    setError(null);
    const r = await saveStockDocAction({
      type, reason: money ? undefined : reason || undefined, party: party || undefined, phone: money ? phone || undefined : undefined, invoiceNo: invoiceNo || undefined,
      currency: money ? currency : undefined, paid: money ? paidNow : undefined, orderId: type === "SELL" && orderId ? orderId : undefined, note: note || undefined,
      lines: filled.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: money ? (l.price === "" ? undefined : l.price) : undefined })),
    });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/stock/${r.data.id}?saved=1`);
  });

  return (
    <div className="space-y-4 pb-24">
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {allowed.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={type === d} onClick={() => setType(d)}
            className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", type === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
            {t(`sd.type.${d}`)}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{t(`sd.help.${type}`)}</p>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!money && (
            <label className="text-sm font-medium">{t("sd.reasonLabel")} *
              <Select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" aria-label={t("sd.reasonLabel")}>
                <option value="">—</option>
                {REASONS.map((r) => <option key={r} value={r}>{t(`sd.reason.${r}`)}</option>)}
              </Select>
            </label>
          )}
          {money && (
            <>
              <label className="text-sm font-medium">{t(type === "BUY" ? "sd.supplier" : "sd.customer")} *
                <Input value={party} list="party-list" autoComplete="off" onChange={(e) => {
                  const v = e.target.value; setParty(v);
                  const known = parties.find((p) => p.type === type && p.name.toLowerCase() === v.trim().toLowerCase());
                  if (known?.phone && !phone) setPhone(known.phone);
                }} className="mt-1" aria-label={t(type === "BUY" ? "sd.supplier" : "sd.customer")} />
                <datalist id="party-list">{parties.filter((p) => p.type === type).map((p) => <option key={p.name} value={p.name} />)}</datalist>
              </label>
              <label className="text-sm font-medium">{t("sd.phone")}
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" dir="ltr" aria-label={t("sd.phone")} />
              </label>
              <label className="text-sm font-medium">{t("sd.invoice")}
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="mt-1" dir="ltr" aria-label={t("sd.invoice")} />
              </label>
              <label className="text-sm font-medium">{t("sd.currency")} *
                <Select value={currency} onChange={(e) => setCurrency(e.target.value as "IQD" | "USD" | "EUR")} className="mt-1" aria-label={t("sd.currency")}>
                  <option value="IQD">IQD — {t("sd.iqd")}</option>
                  <option value="USD">USD — {t("sd.usd")}</option>
                  <option value="EUR">EUR — {t("sd.eur")}</option>
                </Select>
              </label>
            </>
          )}
          {type === "SELL" && (
            <div className="text-sm font-medium">{t("sd.order")}
              <div className="mt-1 flex gap-2">
                <Select value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label={t("sd.order")}>
                  <option value="">{t("sd.noOrder")}</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
                </Select>
                {orderId && <Button type="button" size="sm" variant="secondary" onClick={fillFromOrder} title={t("sd.fillFromOrder")}><ClipboardList className="size-4" /></Button>}
              </div>
              {orderId && <span className="text-xs font-normal text-muted">{t("sd.fillHint")}</span>}
            </div>
          )}
          <label className="text-sm font-medium sm:col-span-2 lg:col-span-4">{t("sd.note")}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" aria-label={t("sd.note")} />
          </label>
        </div>
      </Card>

      <Card className="p-0 sm:p-0">
        <div className={cn("hidden gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted md:grid", money ? "md:grid-cols-[1fr_8rem_9rem_9rem_2.5rem]" : "md:grid-cols-[1fr_8rem_2.5rem]")}>
          <span>{t("wh.item")}</span><span className="text-end">{t("order.quantity")}</span>
          {money && <><span className="text-end">{t("sd.unitPrice")}</span><span className="text-end">{t("sd.lineTotal")}</span></>}<span />
        </div>
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const it = byId.get(l.itemId);
            const after = it ? it.stock + (goesOut ? -1 : 1) * (Number(l.qty) || 0) : 0;
            return (
              <li key={l.key} className={cn("grid gap-2 px-4 py-3 md:items-start md:gap-3", money ? "md:grid-cols-[1fr_8rem_9rem_9rem_2.5rem]" : "md:grid-cols-[1fr_8rem_2.5rem]")}>
                <div>
                  <Combobox name={`item_${l.key}`} options={options} defaultValue={l.itemId} onChange={(v) => set(l.key, { itemId: v })} placeholder={t("rc.chooseItem")} />
                  {it && (
                    <p className={cn("mt-1 text-xs", after < 0 ? "font-semibold text-amber-600" : "text-muted")} dir="ltr">
                      {it.code} · {t("order.inStock")}: {fmtQty(it.stock)} {it.unit}{Number(l.qty) > 0 && ` → ${fmtQty(after)} ${it.unit}`}{after < 0 && ` · ${t("sd.willGoMinus")}`}
                    </p>
                  )}
                </div>
                <label className="text-xs text-muted md:text-transparent">
                  <span className="md:sr-only">{t("order.quantity")}</span>
                  <Input type="number" inputMode="decimal" min={0} step={it?.unit.toLowerCase() === "kg" ? "0.001" : 1} value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} dir="ltr" className="text-end" aria-label={`${it?.code ?? ""} ${t("order.quantity")}`} />
                  {it && <span className="mt-0.5 block text-end text-muted">{it.unit}</span>}
                </label>
                {money && (
                  <>
                    <label className="text-xs text-muted md:text-transparent">
                      <span className="md:sr-only">{t("sd.unitPrice")}</span>
                      <Input type="number" inputMode="decimal" min={0} step="any" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} dir="ltr" className="text-end" aria-label={`${it?.code ?? ""} ${t("sd.unitPrice")}`} />
                    </label>
                    <p className="self-center text-end text-sm font-semibold tabular-nums" dir="ltr">{fmtMoney(lineTotal(Number(l.qty) || 0, Number(l.price) || 0))} {currency}</p>
                  </>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} aria-label={t("order.removeLine")}><Trash2 className="size-4" /></Button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-3"><Button type="button" size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, blank()])}><Plus className="size-4" /> {t("sd.addLine")}</Button></div>
      </Card>

      {money && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <label className="text-sm font-medium">{t(type === "SELL" ? "cash.receivedNow" : "cash.paidNow")}
              <Input type="number" inputMode="decimal" min={0} step="any" value={paidText ?? String(round2(total))} onChange={(e) => setPaidText(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t(type === "SELL" ? "cash.receivedNow" : "cash.paidNow")} />
              <span className="text-xs font-normal text-muted">{t(type === "SELL" ? "cash.receivedHint" : "cash.paidHint")}</span>
            </label>
            <p className="text-sm">{t("sd.total")}: <b dir="ltr">{fmtMoney(total)} {currency}</b></p>
            <p className={cn("text-sm", owed > 0 ? "font-semibold text-amber-600" : "text-muted")}>{t("cash.stillOwed")}: <b dir="ltr">{fmtMoney(Math.max(owed, 0))} {currency}</b></p>
          </div>
          {paidText !== null && <button type="button" onClick={() => setPaidText(null)} className="mt-2 text-xs font-semibold text-brand-600 hover:underline">{t("cash.payAll")}</button>}
        </Card>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:start-64" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm">{t("sd.linesN", { n: filled.length })}{money && <> · <b dir="ltr">{fmtMoney(total)} {currency}</b></>}</p>
          <Button onClick={save} disabled={pending || filled.length === 0}><Save className="size-4" /> {pending ? t("common.saving") : t(`sd.save.${type}`)}</Button>
        </div>
      </div>
    </div>
  );
}
