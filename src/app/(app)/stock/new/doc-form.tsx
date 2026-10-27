"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, Plus, Save, Trash2, UserPlus } from "lucide-react";
import Combobox from "@/components/combobox";
import { Alert, Button, Card, Input, Select, Textarea, cn } from "@/components/ui";
import { saveStockDocAction } from "@/app/actions/stock";
import { createCustomerAction } from "@/app/actions/customers";
import { fmtMoney, fmtQty, type DocType } from "../types";
import { docTotal, lineTotal, saleTotals, type Discount } from "@/lib/money";
import SafeSelect, { fitSafe, type SafeOpt } from "../../cash/safe-select";

type Item = { id: string; code: string; name: string; name2: string | null; unit: string; kind: string; stock: number };
type Order = { id: string; number: string; lines: { productId: string; quantity: number }[] };
type Line = { key: number; itemId: string; qty: string; price: string; discKind: "PERCENT" | "AMOUNT"; disc: string };
type Cur = "IQD" | "USD" | "EUR";
/** A saved receipt opened for editing (same number). */
export type EditDoc = {
  id: string; number: string; type: DocType; reason: string; customerId: string; phone: string; supplierRef: string; delivery: string;
  currency: Cur; rate: string; orderId: string; note: string; invKind: "PERCENT" | "AMOUNT"; invDisc: string; paid: number;
  lines: { itemId: string; qty: string; price: string; discKind: "PERCENT" | "AMOUNT"; disc: string }[];
};
export type CustomerOpt = { id: string; code: string; name: string; phone: string | null; address: string | null; balance: Record<Cur, number> };
const disc = (kind: "PERCENT" | "AMOUNT", v: string): Discount => (Number(v) > 0 ? { kind, value: Number(v) } : null);
const REASONS = ["RETURN", "TRANSFER", "COUNT", "DAMAGE", "SAMPLE", "OTHER"] as const;

/** One Input / Output / Buy / Sell document with any number of lines. */
export default function DocForm({ allowed, initialType, initialOrder, items, orders, customers = [], initialCustomer = "", safes = [], canCost = false, edit }: {
  allowed: DocType[]; initialType: DocType; initialOrder: string; items: Item[]; orders: Order[];
  customers?: CustomerOpt[];
  initialCustomer?: string;
  safes?: SafeOpt[];
  /** Money roles: an Input can carry a cost per line (that batch's cost). */
  canCost?: boolean;
  edit?: EditDoc;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [type, setType] = useState<DocType>(edit?.type ?? initialType);
  const [reason, setReason] = useState(edit?.reason ?? "");
  const [invoiceNo, setInvoiceNo] = useState(edit?.supplierRef ?? "");
  const [phone, setPhone] = useState(() => edit?.phone ?? customers.find((c) => c.id === initialCustomer)?.phone ?? "");
  const [currency, setCurrency] = useState<"IQD" | "USD" | "EUR">(edit?.currency ?? "IQD");
  const [editReason, setEditReason] = useState("");
  // "Paid now" starts at 0 on every purchase and sale; the accountant types what was really paid (or "Paid in full").
  const [paidText, setPaidText] = useState("0");
  const [rate, setRate] = useState(edit?.rate ?? "");
  const [orderId, setOrderId] = useState(edit?.orderId ?? initialOrder);
  const [safeChoice, setSafeChoice] = useState("");
  const [note, setNote] = useState(edit?.note ?? "");
  // Buy / Sell: customer account — bought from or sold to (or a new one made right here); Sell: delivery place; discounts.
  const [custList, setCustList] = useState(customers);
  const [customerId, setCustomerId] = useState(edit?.customerId ?? initialCustomer);
  const [adding, setAdding] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", phone: "", address: "" });
  const [delivery, setDelivery] = useState(edit?.delivery ?? "");
  const [invKind, setInvKind] = useState<"PERCENT" | "AMOUNT">(edit?.invKind ?? "PERCENT");
  const [invDisc, setInvDisc] = useState(edit?.invDisc ?? "");
  // Keys start at 0 on every render tree, so server and browser HTML match (hydration).
  const seq = useRef(edit ? edit.lines.length : 0);
  const blank = (): Line => ({ key: ++seq.current, itemId: "", qty: "", price: "", discKind: "PERCENT", disc: "" });
  const [lines, setLines] = useState<Line[]>(() => edit?.lines.length ? edit.lines.map((l, i) => ({ key: i, ...l })) : [{ key: 0, itemId: "", qty: "", price: "", discKind: "PERCENT", disc: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const money = type === "BUY" || type === "SELL";
  const goesOut = type === "OUTPUT" || type === "SELL";
  const costIn = type === "INPUT" && canCost; // optional cost per line on an Input
  const priced = money || costIn;

  // Section of the warehouse to pick from (Products · Labels · Raw materials · Packaging); a chosen line keeps its item.
  const [section, setSection] = useState<"ALL" | "PRODUCT" | "STICKER" | "MATERIAL" | "PACKAGING">("ALL");
  const options = useMemo(() => items.map((i) => ({ value: i.id, label: i.name, kind: i.kind, hint: `${i.code} · ${t(`md.kind.${i.kind}`)}${i.name2 ? ` · ${i.name2}` : ""}` })), [items, t]);
  const optionsFor = (itemId: string) => options.filter((o) => section === "ALL" || o.kind === section || o.value === itemId);
  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const sell = type === "SELL";
  // Buy and Sell both have line + invoice discounts (on a purchase they only lower what is owed to the supplier).
  const sale = saleTotals(lines.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0, discount: money ? disc(l.discKind, l.disc) : null })), money ? disc(invKind, invDisc) : null);
  const total = money ? sale.total : docTotal(lines.map((l) => ({ qty: Number(l.qty) || 0, price: Number(l.price) || 0 })));
  // The customer account the document is booked to (the same list for buying and selling).
  const accList = custList;
  const accId = customerId;
  const setAccId = setCustomerId;
  const cust = money ? accList.find((c) => c.id === accId) : undefined;
  const ns = "cust";
  const filled = lines.filter((l) => l.itemId);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const paidNow = Number(paidText) || 0;
  const iqdValue = type === "BUY" && currency !== "IQD" && Number(rate) > 0 ? round2(total * Number(rate)) : null;
  const owed = round2(total - paidNow);
  const safeId = fitSafe(safes, currency, safeChoice); // the safe the paid-now money goes into / out of

  const fillFromOrder = () => {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    setLines(o.lines.map((l) => ({ key: ++seq.current, itemId: l.productId, qty: String(l.quantity), price: "", discKind: "PERCENT" as const, disc: "" })));
  };

  const addCustomer = () => start(async () => {
    setError(null);
    const r = await createCustomerAction({ name: newCust.name, phone: newCust.phone || undefined, address: newCust.address || undefined });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    setCustList((l) => [...l, { ...r.data, address: newCust.address || null, balance: { IQD: 0, USD: 0, EUR: 0 } }]);
    setAccId(r.data.id); setPhone(r.data.phone ?? ""); setAdding(false); setNewCust({ name: "", phone: "", address: "" });
  });

  const save = () => start(async () => {
    setError(null);
    const r = await saveStockDocAction({
      type, reason: money ? undefined : reason || undefined, phone: money ? phone || undefined : undefined,
      supplierRef: type === "BUY" && invoiceNo ? invoiceNo : undefined, customerId: money ? customerId || undefined : undefined, delivery: sell ? delivery || undefined : undefined,
      rate: (type === "BUY" || costIn) && currency !== "IQD" && rate ? rate : undefined,
      discount: money ? disc(invKind, invDisc) ?? undefined : undefined,
      currency: priced ? currency : undefined, paid: money ? paidNow : undefined, safeId: money && paidNow > 0 && safeId ? safeId : undefined, orderId: sell && orderId ? orderId : undefined, note: note || undefined,
      ...(edit ? { editId: edit.id, editReason } : {}),
      lines: filled.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: priced ? (l.price === "" ? undefined : l.price) : undefined, discount: money ? disc(l.discKind, l.disc) ?? undefined : undefined })),
    });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/stock/${r.data.id}?saved=1`);
    router.refresh();
  });

  return (
    <div className="space-y-4 pb-24">
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {(edit ? [edit.type] : allowed).map((d) => (
          <button key={d} type="button" role="tab" aria-selected={type === d} onClick={() => setType(d)}
            className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", type === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
            {t(`sd.type.${d}`)}
          </button>
        ))}
      </div>
      {edit ? <Alert tone="amber">{t("sd.editing", { number: edit.number })}</Alert> : <p className="text-sm text-muted">{t(`sd.help.${type}`)}</p>}

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
              <div className="text-sm font-medium sm:col-span-2">{t("sd.customer")} *
                <div className="mt-1 flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Combobox key={`${type}-${accId || "none"}`} name="customerId" options={accList.map((c) => ({ value: c.id, label: c.name, hint: [c.code, c.phone].filter(Boolean).join(" · ") }))}
                      defaultValue={accId} placeholder={t(`${ns}.choose`)} onChange={(v) => { setAccId(v); const c = accList.find((x) => x.id === v); setPhone(c?.phone ?? ""); }} />
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setAdding((a) => !a)} title={t(`${ns}.new`)}><UserPlus className="size-4" /> <span className="hidden sm:inline">{t(`${ns}.new`)}</span></Button>
                </div>
                {cust && <span className="mt-1 block text-xs font-normal text-muted" dir="ltr">{cust.code}{cust.address ? ` · ${cust.address}` : ""} · {t("cust.balanceNow")}: <b className={cust.balance[currency] < 0 ? "text-red-600" : ""}>{fmtMoney(cust.balance[currency])} {currency}</b></span>}
                {adding && (
                  <div className="mt-2 grid gap-2 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-3">
                    <Input value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} placeholder={t(`${ns}.name`)} aria-label={t(`${ns}.name`)} />
                    <Input type="tel" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} placeholder={t("sd.phone")} aria-label={t(`${ns}.newPhone`)} dir="ltr" />
                    <Input value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} placeholder={t("cust.address")} aria-label={t("cust.address")} />
                    <div className="sm:col-span-3"><Button type="button" size="sm" onClick={addCustomer} disabled={pending || newCust.name.trim().length < 2}><UserPlus className="size-4" /> {t(`${ns}.add`)}</Button></div>
                  </div>
                )}
              </div>
              <label className="text-sm font-medium">{t("sd.phone")}
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" dir="ltr" aria-label={t("sd.phone")} />
              </label>
              {sell ? (
                <label className="text-sm font-medium">{t("sd.delivery")}
                  <Input value={delivery} onChange={(e) => setDelivery(e.target.value)} className="mt-1" aria-label={t("sd.delivery")} />
                  <span className="text-xs font-normal text-muted">{t("sd.invoiceAuto")}</span>
                </label>
              ) : (
                <label className="text-sm font-medium">{t("sd.supplierRef")}
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="mt-1" dir="ltr" aria-label={t("sd.supplierRef")} />
                  <span className="text-xs font-normal text-muted">{t("sd.purchaseAuto")}</span>
                </label>
              )}
              <label className="text-sm font-medium">{t("sd.currency")} *
                <Select value={currency} onChange={(e) => setCurrency(e.target.value as "IQD" | "USD" | "EUR")} className="mt-1" aria-label={t("sd.currency")}>
                  <option value="IQD">IQD — {t("sd.iqd")}</option>
                  <option value="USD">USD — {t("sd.usd")}</option>
                  <option value="EUR">EUR — {t("sd.eur")}</option>
                </Select>
              </label>
              {type === "BUY" && currency !== "IQD" && (
                <label className="text-sm font-medium">{t("cost.rate", { cur: currency })} *
                  <Input type="number" inputMode="decimal" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 text-end" dir="ltr" aria-label={t("sd.buyRate")} />
                  <span className="text-xs font-normal text-muted">{t("sd.buyRateHint", { cur: currency })}</span>
                </label>
              )}
            </>
          )}
          {costIn && (
            <>
              <label className="text-sm font-medium">{t("lot.inputCurrency")}
                <Select value={currency} onChange={(e) => setCurrency(e.target.value as "IQD" | "USD" | "EUR")} className="mt-1" aria-label={t("lot.inputCurrency")}>
                  <option value="IQD">IQD — {t("sd.iqd")}</option>
                  <option value="USD">USD — {t("sd.usd")}</option>
                  <option value="EUR">EUR — {t("sd.eur")}</option>
                </Select>
                <span className="text-xs font-normal text-muted">{t("lot.inputHint")}</span>
              </label>
              {currency !== "IQD" && (
                <label className="text-sm font-medium">{t("cost.rate", { cur: currency })}
                  <Input type="number" inputMode="decimal" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 text-end" dir="ltr" aria-label={t("sd.buyRate")} />
                </label>
              )}
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
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="radiogroup" aria-label={t("item.section")}>
          <span className="text-sm font-medium">{t("item.section")}:</span>
          {(["ALL", "PRODUCT", "STICKER", "MATERIAL", "PACKAGING"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={section === k} onClick={() => setSection(k)}
              className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold", section === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-muted hover:text-ink")}>
              {k === "ALL" ? t("item.allSections") : t(`md.kindPlural.${k}`)} <span className="text-xs opacity-75">{k === "ALL" ? items.length : items.filter((i) => i.kind === k).length}</span>
            </button>
          ))}
        </div>
        <div className={cn("hidden gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted md:grid", money ? "md:grid-cols-[1fr_7rem_8rem_10rem_8rem_2.5rem]" : costIn ? "md:grid-cols-[1fr_8rem_8rem_2.5rem]" : "md:grid-cols-[1fr_8rem_2.5rem]")}>
          <span>{t("wh.item")}</span><span className="text-end">{t("order.quantity")}</span>
          {costIn && <span className="text-end">{t("lot.costPerUnit")}</span>}
          {money && <><span className="text-end">{t("sd.unitPrice")}</span><span className="text-end">{t("sd.discount")}</span><span className="text-end">{t("sd.lineTotal")}</span></>}<span />
        </div>
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const it = byId.get(l.itemId);
            const after = it ? it.stock + (goesOut ? -1 : 1) * (Number(l.qty) || 0) : 0;
            return (
              <li key={l.key} className={cn("grid gap-2 px-4 py-3 md:items-start md:gap-3", money ? "md:grid-cols-[1fr_7rem_8rem_10rem_8rem_2.5rem]" : costIn ? "md:grid-cols-[1fr_8rem_8rem_2.5rem]" : "md:grid-cols-[1fr_8rem_2.5rem]")}>
                <div>
                  <Combobox key={section} name={`item_${l.key}`} options={optionsFor(l.itemId)} defaultValue={l.itemId} onChange={(v) => set(l.key, { itemId: v })} placeholder={t("rc.chooseItem")} />
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
                {costIn && (
                  <label className="text-xs text-muted md:text-transparent">
                    <span className="md:sr-only">{t("lot.costPerUnit")}</span>
                    <Input type="number" inputMode="decimal" min={0} step="any" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} dir="ltr" className="text-end" placeholder={t("lot.startingPh")} aria-label={`${it?.code ?? ""} ${t("lot.costPerUnit")}`} />
                  </label>
                )}
                {money && (
                  <>
                    <label className="text-xs text-muted md:text-transparent">
                      <span className="md:sr-only">{t("sd.unitPrice")}</span>
                      <Input type="number" inputMode="decimal" min={0} step="any" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} dir="ltr" className="text-end" aria-label={`${it?.code ?? ""} ${t("sd.unitPrice")}`} />
                    </label>
                    {money && (
                      <div className="flex gap-1 text-xs text-muted md:text-transparent">
                        <span className="self-center md:sr-only">{t("sd.discount")}</span>
                        <Input type="number" inputMode="decimal" min={0} step="any" value={l.disc} onChange={(e) => set(l.key, { disc: e.target.value })} dir="ltr" className="min-w-0 text-end" aria-label={`${it?.code ?? ""} ${t("sd.discount")}`} />
                        <Select value={l.discKind} onChange={(e) => set(l.key, { discKind: e.target.value as "PERCENT" | "AMOUNT" })} className="w-20 shrink-0" aria-label={`${it?.code ?? ""} ${t("sd.discountKind")}`}>
                          <option value="PERCENT">%</option><option value="AMOUNT">{currency}</option>
                        </Select>
                      </div>
                    )}
                    <p className="self-center text-end text-sm font-semibold tabular-nums" dir="ltr">
                      {money ? fmtMoney(sale.lines[lines.indexOf(l)].net) : fmtMoney(lineTotal(Number(l.qty) || 0, Number(l.price) || 0))} {currency}
                      {money && sale.lines[lines.indexOf(l)].discount > 0 && <span className="block text-xs font-normal text-muted line-through">{fmtMoney(sale.lines[lines.indexOf(l)].gross)}</span>}
                    </p>
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
            <p className="text-sm">{t("sd.subtotal")}: <b dir="ltr">{fmtMoney(sale.subtotal)} {currency}</b></p>
            <div className="text-sm font-medium">{t("sd.invoiceDiscount")}
              <div className="mt-1 flex gap-1">
                <Input type="number" inputMode="decimal" min={0} step="any" value={invDisc} onChange={(e) => setInvDisc(e.target.value)} dir="ltr" className="min-w-0 text-end" aria-label={t("sd.invoiceDiscount")} />
                <Select value={invKind} onChange={(e) => setInvKind(e.target.value as "PERCENT" | "AMOUNT")} className="w-24 shrink-0" aria-label={t("sd.invoiceDiscountKind")}>
                  <option value="PERCENT">%</option><option value="AMOUNT">{currency}</option>
                </Select>
              </div>
            </div>
            <p className="text-sm">{t("sd.discount")}: <b dir="ltr">−{fmtMoney(sale.discount)} {currency}</b></p>
          </div>
        </Card>
      )}

      {money && edit && (
        <Card>
          <p className="text-sm">{t("sd.total")}: <b dir="ltr" data-testid="edit-total">{fmtMoney(total)} {currency}</b> · {t(sell ? "cash.received" : "cash.paid")}: <b dir="ltr">{fmtMoney(edit.paid)} {currency}</b></p>
          <p className="text-xs text-muted">{t("sd.editPaidHint")}</p>
          {iqdValue !== null && <p className="mt-2 text-sm" data-testid="buy-iqd">{t("sd.iqdValue")}: <b dir="ltr">{fmtMoney(iqdValue)} IQD</b></p>}
        </Card>
      )}
      {edit && (
        <Card>
          <label className="text-sm font-medium">{t("sd.editReason")} *
            <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} className="mt-1" aria-label={t("sd.editReason")} maxLength={500} />
          </label>
        </Card>
      )}
      {money && !edit && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <label className="text-sm font-medium">{t(type === "SELL" ? "cash.receivedNow" : "cash.paidNow")}
              <Input type="number" inputMode="decimal" min={0} step="any" value={paidText} onChange={(e) => setPaidText(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t(type === "SELL" ? "cash.receivedNow" : "cash.paidNow")} />
              <span className="text-xs font-normal text-muted">{t(type === "SELL" ? "cash.receivedHint" : "cash.paidHint")}</span>
            </label>
            <p className="text-sm">{t("sd.total")}: <b dir="ltr">{fmtMoney(total)} {currency}</b></p>
            {cust ? (
              <p className="text-sm" data-testid="new-balance">{t("cust.prevBalance")}: <b dir="ltr">{fmtMoney(cust.balance[currency])}</b> · {t("cust.newBalance")}: <b dir="ltr" className={round2(cust.balance[currency] - total + paidNow) < 0 ? "text-red-600" : ""}>{fmtMoney(round2(cust.balance[currency] - total + paidNow))} {currency}</b></p>
            ) : (
              <p className={cn("text-sm", owed > 0 ? "font-semibold text-amber-600" : "text-muted")}>{t("cash.stillOwed")}: <b dir="ltr">{fmtMoney(Math.max(owed, 0))} {currency}</b></p>
            )}
          </div>
          {total > 0 && paidNow !== round2(total) && <button type="button" onClick={() => setPaidText(String(round2(total)))} className="mt-2 text-xs font-semibold text-brand-600 hover:underline">{t("cash.payAll")}</button>}
          {iqdValue !== null && <p className="mt-2 text-sm" data-testid="buy-iqd">{t("sd.iqdValue")}: <b dir="ltr">{fmtMoney(iqdValue)} IQD</b></p>}
          {paidNow > 0 && safes.length > 0 && (
            <div className="mt-3 sm:max-w-sm">
              <SafeSelect safes={safes} currency={currency} value={safeId} onChange={setSafeChoice} label={t(type === "SELL" ? "safe.intoSafe" : "safe.outOfSafe")} />
            </div>
          )}
        </Card>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 py-3 backdrop-blur lg:start-64" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm">{t("sd.linesN", { n: filled.length })}{money && <> · <b dir="ltr">{fmtMoney(total)} {currency}</b></>}</p>
          <Button onClick={save} disabled={pending || filled.length === 0 || (!!edit && editReason.trim().length < 3)}><Save className="size-4" /> {pending ? t("common.saving") : edit ? t("sd.saveChanges") : t(`sd.save.${type}`)}</Button>
        </div>
      </div>
    </div>
  );
}
