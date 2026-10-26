"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, Save } from "lucide-react";
import { Alert, Button, Card, Input, Select, Textarea, cn } from "@/components/ui";
import { exchangeCashAction, saveCashAction, transferCashAction } from "@/app/actions/cash";
import { exchangeFrom, exchangeRate, exchangeTo, rateSides } from "@/lib/money";
import { CURS, fmtMoney, type CurCode } from "../types";
import SafeSelect, { fitSafe, type SafeOpt } from "../safe-select";

export type CashType = "IN" | "OUT" | "EXCHANGE" | "TRANSFER";
type Box = "from" | "to" | "rate";
const num = (s: string) => Number(s) || 0;
const show = (n: number) => (n > 0 ? String(n) : "");

/** Money in · money out (expense) · exchange between currencies · transfer between safes. */
export default function CashForm({ allowed, initialType, initialSafe, safes, categories }: {
  allowed: CashType[]; initialType: CashType; initialSafe: string; safes: SafeOpt[]; categories: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const byId = (id: string) => safes.find((s) => s.id === id);
  const start0 = byId(initialSafe) ?? safes[0];
  const [type, setType] = useState<CashType>(initialType);
  const [safeId, setSafeId] = useState(start0?.id ?? "");
  const [currency, setCurrency] = useState<CurCode>(start0?.currencies[0] ?? "IQD");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  // Exchange: FROM (safe, currency, amount) → TO (safe, currency, amount) and the rate; any two fill the third.
  const [toSafe, setToSafe] = useState(start0?.id ?? "");
  const [to, setTo] = useState<CurCode>("USD");
  const [boxes, setBoxes] = useState<Record<Box, string>>({ from: "", to: "", rate: "" });
  const [recent, setRecent] = useState<Box[]>(["from", "rate"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const safe = byId(safeId);
  const curs = (x?: SafeOpt) => (x ? CURS.filter((c) => x.currencies.includes(c)) : []);
  const have = (id: string, c: CurCode) => byId(id)?.balance?.[c] ?? 0;
  // What is really chosen: a pick that no longer fits (another safe, another currency) falls back to the first that does.
  const curList = type === "TRANSFER" ? curs(safe).filter((c) => safes.some((x) => x.id !== safeId && x.currencies.includes(c))) : curs(safe);
  const cur: CurCode = curList.includes(currency) ? currency : curList[0] ?? currency;
  const exSafes = safes.filter((x) => x.currencies.some((c) => c !== cur));
  const dstId = type === "TRANSFER" ? fitSafe(safes.filter((x) => x.id !== safeId), cur, toSafe) : exSafes.some((x) => x.id === toSafe) ? toSafe : exSafes[0]?.id ?? "";
  const toList = curs(byId(dstId)).filter((c) => c !== cur);
  const toCur: CurCode = toList.includes(to) ? to : toList[0] ?? to;

  // Exchange numbers: the box not typed most recently is calculated from the other two.
  const { fromStrong, strong, weak } = rateSides(cur, toCur);
  const calc = (["from", "to", "rate"] as Box[]).find((b) => !recent.includes(b))!;
  const fromAmt = calc === "from" ? exchangeFrom(num(boxes.to), num(boxes.rate), fromStrong) : num(boxes.from);
  const toAmt = calc === "to" ? exchangeTo(num(boxes.from), num(boxes.rate), fromStrong) : num(boxes.to);
  const rate = calc === "rate" ? exchangeRate(num(boxes.from), num(boxes.to), fromStrong) : num(boxes.rate);
  const typeBox = (b: Box, v: string) => {
    setBoxes((x) => ({ ...x, from: show(fromAmt), to: show(toAmt), rate: show(rate), [b]: v }));
    setRecent((r) => [...r.filter((x) => x !== b), b].slice(-2));
  };
  const boxValue = (b: Box) => (b === calc ? show(b === "from" ? fromAmt : b === "to" ? toAmt : rate) : boxes[b]);

  const n = type === "EXCHANGE" ? fromAmt : num(amount);
  const goesOut = type !== "IN";
  const over = goesOut && n > have(safeId, cur) + 1e-9;
  const ready = n > 0 && !!safeId && curList.length > 0 && !over
    && (type !== "EXCHANGE" || (toAmt > 0 && rate > 0 && !!dstId && toList.length > 0))
    && (type !== "TRANSFER" || (!!dstId && dstId !== safeId));

  const save = () => start(async () => {
    setError(null);
    const r = type === "EXCHANGE"
      ? await exchangeCashAction({ fromSafeId: safeId, from: cur, fromAmount: fromAmt, toSafeId: dstId, to: toCur, toAmount: toAmt, rate, note: note || undefined })
      : type === "TRANSFER"
        ? await transferCashAction({ fromSafeId: safeId, toSafeId: dstId, currency: cur, amount, note: note || undefined })
        : await saveCashAction({ type, safeId, currency: cur, amount, categoryId: type === "OUT" ? categoryId || undefined : undefined, party: party || undefined, note: note || undefined });
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error); return; }
    router.push(`/cash/${r.data.id}?saved=1`);
  });

  const curSelect = (value: CurCode, onChange: (c: CurCode) => void, list: CurCode[], label: string) => (
    <label className="text-sm font-medium">{label}
      <Select value={value} onChange={(e) => onChange(e.target.value as CurCode)} className="mt-1" aria-label={label}>
        {list.map((c) => <option key={c} value={c}>{c} — {t(`cash.cur.${c}`)}</option>)}
      </Select>
    </label>
  );
  const moneyBox = (b: Box, label: string, testid: string) => (
    <label className="text-sm font-medium">{label} *
      <Input type="number" inputMode="decimal" min={0} step="any" value={boxValue(b)} onChange={(e) => typeBox(b, e.target.value)} dir="ltr"
        className={cn("mt-1 text-end", b === calc && "bg-surface-2")} aria-label={label} data-testid={testid} />
      {b === calc && <span className="text-xs font-normal text-muted">{t("safe.calculated")}</span>}
    </label>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5" role="tablist">
        {allowed.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={type === d} onClick={() => { setType(d); setError(null); }}
            className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", type === d ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
            {t(`cash.new.${d}`)}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{t(`cash.help.${type}`)}</p>

      {type === "EXCHANGE" ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t("safe.exFrom")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <SafeSelect safes={safes} value={safeId} onChange={setSafeId} label={t("safe.fromSafe")} />
            {curSelect(cur, setCurrency, curList, t("cash.give"))}
            <div>
              {moneyBox("from", t("safe.exFromAmount"), "ex-from")}
              <span className="text-xs text-muted" dir="ltr">{t("cash.inSafe")}: {fmtMoney(have(safeId, cur))} {cur}</span>
              {over && <span className="block text-xs font-semibold text-red-600">{t("cash.notEnough")}</span>}
            </div>
          </div>
          <div className="my-3 flex items-center gap-3 border-y border-line py-3">
            <ArrowDown className="size-5 shrink-0 text-muted" />
            <div className="grow sm:max-w-xs">{moneyBox("rate", t("cash.rate", { from: strong, to: weak }), "ex-rate")}</div>
          </div>
          <h2 className="mb-2 font-semibold">{t("safe.exTo")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <SafeSelect safes={exSafes} value={dstId} onChange={setToSafe} label={t("safe.toSafe")} />
            {curSelect(toCur, setTo, toList, t("cash.receiveCur"))}
            {moneyBox("to", t("safe.exToAmount"), "ex-to")}
          </div>
          <label className="mt-3 block text-sm font-medium">{t("sd.note")}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" aria-label={t("sd.note")} />
          </label>
        </Card>
      ) : (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <SafeSelect safes={safes} value={safeId} onChange={setSafeId} label={type === "TRANSFER" ? t("safe.fromSafe") : t("safe.safe")} />
            {curSelect(cur, setCurrency, curList, t("cash.currency"))}
            {type === "TRANSFER" && <SafeSelect safes={safes} currency={cur} exclude={safeId} value={dstId} onChange={setToSafe} label={t("safe.toSafe")} />}
            <label className="text-sm font-medium">{t("cash.amount")} *
              <Input type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" className="mt-1 text-end" aria-label={t("cash.amount")} />
              {goesOut && <span className="text-xs font-normal text-muted" dir="ltr">{t("cash.inSafe")}: {fmtMoney(have(safeId, cur))} {cur}</span>}
              {over && <span className="block text-xs font-semibold text-red-600">{t("cash.notEnough")}</span>}
            </label>
            {type === "OUT" && (
              <label className="text-sm font-medium">{t("cash.category")} *
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1" aria-label={t("cash.category")}>
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </label>
            )}
            {(type === "IN" || type === "OUT") && (
              <label className="text-sm font-medium">{t(type === "IN" ? "cash.from" : "cash.paidTo")}
                <Input value={party} onChange={(e) => setParty(e.target.value)} className="mt-1" aria-label={t(type === "IN" ? "cash.from" : "cash.paidTo")} />
              </label>
            )}
            <label className="text-sm font-medium sm:col-span-2">{t("sd.note")}{type === "IN" && " *"}
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" aria-label={t("sd.note")} />
            </label>
          </div>
        </Card>
      )}
      {error && <Alert>{error}</Alert>}
      <Button onClick={save} disabled={pending || !ready}><Save className="size-4" /> {pending ? t("common.saving") : t(`cash.save.${type}`)}</Button>
    </div>
  );
}
