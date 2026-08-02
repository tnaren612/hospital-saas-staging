"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Banknote,
  CreditCard,
  Download,
  Eye,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAdminSession } from "@/components/admin/admin-session-context";
import type { Medicine } from "@/lib/phase2/types";
import type {
  PharmacySettings,
  PharmacyBranch,
  ReceiptData,
  SaleForReceipt,
} from "@/lib/pharmacy/types";
import type { HospitalConfig } from "@/lib/hospital/types";
import { computeTotals, type CartLine } from "@/lib/pharmacy/cart";
import { formatMoney, getCurrency } from "@/lib/pharmacy/tax";
import { buildPaymentMethods, type PaymentCategory } from "@/lib/pharmacy/payments";
import { printEngine } from "@/lib/pharmacy/print-engine";
import { findMedicineBySku } from "@/lib/pharmacy/barcode/scan";

type DashboardPayload = {
  settings: PharmacySettings;
  branches: PharmacyBranch[];
  hospital: HospitalConfig;
};

const PAYMENT_ICONS: Record<PaymentCategory, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  upi: <QrCode className="h-4 w-4" />,
  card: <CreditCard className="h-4 w-4" />,
  insurance: <ShieldCheck className="h-4 w-4" />,
  credit: <Wallet className="h-4 w-4" />,
  wallet: <Wallet className="h-4 w-4" />,
  other: <Smartphone className="h-4 w-4" />,
};

function expiryValid(expiry?: string | null): boolean {
  if (!expiry) return true;
  return new Date(`${expiry}T23:59:59`) >= new Date();
}

export function PharmacyPos() {
  const session = useAdminSession();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<string>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [busy, setBusy] = useState(false);

  // Patient info
  const [patientName, setPatientName] = useState("Walk-in Customer");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [saleType, setSaleType] = useState<"walk_in" | "prescription">("walk_in");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/pharmacy/dashboard", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/phase2/pharmacy?kind=medicines", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([dash, med]) => {
        if (!active) return;
        if (dash.data) setPayload(dash.data as DashboardPayload);
        if (med.data) setMedicines((med.data as Medicine[]) || []);
      })
      .catch(() => active && toast.error("Failed to load POS data"));
    return () => {
      active = false;
    };
  }, []);

  const currency = getCurrency(payload?.hospital.localization.currency);

  const settings = payload?.settings;
  const hospital = payload?.hospital;

  const totals = useMemo(
    () =>
      computeTotals(cart, {
        discount: globalDiscount,
        inclusiveTax: settings?.inclusive_tax,
        taxType: "intra",
        currency,
      }),
    [cart, globalDiscount, settings?.inclusive_tax, currency]
  );

  const methods = useMemo(
    () => (settings ? buildPaymentMethods(settings) : []),
    [settings]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.sku || "").toLowerCase().includes(q) ||
        (m.generic_name || "").toLowerCase().includes(q)
    );
  }, [medicines, search]);

  const remainingStock = (med: Medicine) => {
    const inCart = cart
      .filter((c) => c.medicine_id === med.id)
      .reduce((s, c) => s + c.quantity, 0);
    return Math.max(0, Number(med.stock_qty) - inCart);
  };

  const addToCart = (med: Medicine, qty = 1) => {
    if (remainingStock(med) <= 0) {
      toast.error(`${med.name} is out of stock.`);
      return;
    }
    if (!expiryValid(med.expiry_date)) {
      toast.error(`${med.name} is expired and cannot be dispensed.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.medicine_id === med.id);
      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, Number(med.stock_qty));
        return prev.map((c) =>
          c.medicine_id === med.id ? { ...c, quantity: nextQty } : c
        );
      }
      return [
        ...prev,
        {
          medicine_id: med.id,
          name: med.name,
          generic_name: med.generic_name,
          manufacturer: med.manufacturer,
          batch_number: med.batch_number,
          expiry_date: med.expiry_date,
          mrp: Number(med.selling_price),
          selling_price: Number(med.selling_price),
          quantity: qty,
          gst_percent: settings?.default_gst_percent || 0,
        },
      ];
    });
    setSearch("");
  };

  const addByBarcode = (med: Medicine | null | undefined) => {
    if (!med) {
      toast.error("Barcode / SKU not found.");
      setBarcode("");
      return;
    }
    addToCart(med);
    setBarcode("");
  };

  // Single entry point for both the Enter key and the search button. An
  // empty / whitespace-only scan is blocked BEFORE any lookup — a blank
  // query must never match a medicine whose SKU is blank (that would add
  // a phantom line to the cart).
  const submitBarcode = () => {
    if (!barcode.trim()) {
      toast.error("Scan or enter a barcode / SKU.");
      barcodeRef.current?.focus();
      return;
    }
    addByBarcode(findMedicineBySku(medicines, barcode));
  };

  const changeQty = (medicineId: string | undefined, delta: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.medicine_id !== medicineId) return c;
        const stock = medicines.find((m) => m.id === c.medicine_id)?.stock_qty ?? 999;
        const nextQty = Math.max(1, Math.min(c.quantity + delta, Number(stock)));
        return { ...c, quantity: nextQty };
      })
    );
  };

  const removeLine = (medicineId: string | undefined) =>
    setCart((prev) => prev.filter((c) => c.medicine_id !== medicineId));

  const change = Math.max(0, Number(amountPaid || 0) - totals.grand_total);

  const isDeferred = selectedMethod === "credit" || selectedMethod === "insurance";

  const completeSale = async () => {
    if (!cart.length) {
      toast.error("Add at least one medicine.");
      return;
    }
    if (!isDeferred && Number(amountPaid || 0) < totals.grand_total) {
      toast.error("Amount paid is less than the grand total.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        patient_name: patientName,
        patient_phone: patientPhone || undefined,
        patient_age: patientAge ? Number(patientAge) : null,
        sale_type: saleType,
        cashier_name: session.name || undefined,
        doctor_name: doctorName || undefined,
        prescription_number: prescriptionNumber || undefined,
        items: cart.map((c) => ({
          medicine_id: c.medicine_id,
          name: c.name,
          qty: c.quantity,
          price: c.selling_price,
          gst_percent: c.gst_percent,
          batch_number: c.batch_number,
          expiry_date: c.expiry_date,
          discount: c.discount_amount || undefined,
        })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        cgst: totals.summary.cgst,
        sgst: totals.summary.sgst,
        igst: totals.summary.igst,
        tax_type: "intra",
        grand_total: totals.grand_total,
        payment_method: selectedMethod,
        payment_status: isDeferred ? "pending" : "paid",
        amount_paid: isDeferred ? totals.grand_total : Number(amountPaid || 0),
        amount_returned: isDeferred ? 0 : change,
        payment_reference: paymentRef || undefined,
      };
      const res = await fetch("/api/admin/pharmacy/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sale could not be completed");
      const sale = json.data;
      toast.success(`Sale ${sale.sale_number} · ${formatMoney(totals.grand_total, currency)}`);
      printReceipt(sale);
      // Reset cart
      setCart([]);
      setGlobalDiscount(0);
      setAmountPaid("");
      setPaymentRef("");
      setPatientPhone("");
      setPatientAge("");
      setPatientId("");
      setDoctorName("");
      setPrescriptionNumber("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sale could not be completed.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const printReceipt = (sale: SaleForReceipt) => {
    if (!settings || !hospital) return;
    const contact = hospital.contact;
    const address = [contact.address_line1, contact.city, contact.state, contact.pincode]
      .filter(Boolean)
      .join(", ");
    const data: ReceiptData = {
      sale,
      hospital: {
        name: hospital.branding.name,
        address,
        phone: contact.phones?.[0] || "",
        email: contact.email || "",
        gst: settings.gst_number || "",
        drug_license: settings.drug_license_number || "",
        logo_url: hospital.branding.logo_url || "",
      },
      cashier_name: session.name || settings.pharmacist_name || "",
      pharmacist_name: settings.pharmacist_name || "",
      settings,
      items: cart.map((c) => ({
        medicine_id: c.medicine_id || "",
        name: c.name,
        batch_number: c.batch_number,
        expiry_date: c.expiry_date,
        mrp: c.mrp ?? c.selling_price,
        selling_price: c.selling_price,
        quantity: c.quantity,
        discount_percent: c.discount_percent,
        gst_percent: c.gst_percent,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      grand_total: totals.grand_total,
      amount_paid: isDeferred ? totals.grand_total : Number(amountPaid || 0),
      amount_returned: isDeferred ? 0 : change,
      payment_method: selectedMethod,
      payment_reference: paymentRef || undefined,
      customer_name: patientName,
      customer_phone: patientPhone || undefined,
      doctor_name: doctorName || undefined,
      prescription_number: prescriptionNumber || undefined,
      cgst: totals.summary.cgst,
      sgst: totals.summary.sgst,
      igst: totals.summary.igst,
      tax_type: "intra",
      patient_id: patientId || null,
      patient_age: patientAge ? Number(patientAge) : null,
      transaction_id: sale.id,
      printed_by: session.name || undefined,
    };
    const html = printEngine.render(data);
    void printEngine.deliver(data, html, "print");
  };

  if (!settings || !hospital) {
    return <p className="text-sm text-muted-foreground">Loading POS…</p>;
  }

  const activeStock = (id: string | undefined) =>
    medicines.find((m) => m.id === id)?.stock_qty ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Left: patient + search + cart */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <Label>Sale type</Label>
                <div className="mt-1 flex gap-2">
                  {(["walk_in", "prescription"] as const).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={saleType === t ? "default" : "outline"}
                      onClick={() => setSaleType(t)}
                    >
                      {t === "walk_in" ? "Walk-in" : "Prescription"}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Patient name</Label>
                <Input className="mt-1" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="10-digit mobile" />
              </div>
              <div>
                <Label>Age</Label>
                <Input className="mt-1" type="number" min={0} value={patientAge} onChange={(e) => setPatientAge(e.target.value)} />
              </div>
              <div>
                <Label>Gender</Label>
                <select
                  className="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={patientGender}
                  onChange={(e) => setPatientGender(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {saleType === "prescription" ? (
                <>
                  <div>
                    <Label>Doctor</Label>
                    <Input className="mt-1" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Rx Number</Label>
                    <Input className="mt-1" value={prescriptionNumber} onChange={(e) => setPrescriptionNumber(e.target.value)} />
                  </div>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Label>Scan medicine (barcode / SKU)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                ref={barcodeRef}
                className="font-mono"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitBarcode();
                  }
                }}
                placeholder="Scan or type SKU, press Enter"
                autoComplete="off"
              />
              <Button type="button" variant="outline" onClick={submitBarcode}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <Label className="mt-4 block">Search medicine</Label>
            <Input
              className="mt-1 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type medicine name, generic, or SKU…"
            />
            {search && filtered.length > 0 ? (
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addToCart(m)}
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/40"
                  >
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.manufacturer} · Batch {m.batch_number}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatMoney(Number(m.selling_price), currency)}</div>
                      <Badge variant={Number(m.stock_qty) <= Number(m.reorder_level) ? "danger" : "outline"}>
                        {m.stock_qty} in stock
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : search ? (
              <p className="mt-2 text-sm text-muted-foreground">No matching medicines.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Cart */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="h-4 w-4" /> Cart ({cart.length})
              </h3>
              {cart.length ? (
                <Button size="sm" variant="ghost" onClick={() => setCart([])}>
                  Clear
                </Button>
              ) : null}
            </div>
            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Cart is empty. Search and add medicines above.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {cart.map((line) => (
                  <div key={line.medicine_id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{line.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.batch_number ? `Batch ${line.batch_number}` : "No batch"} ·{" "}
                          {line.expiry_date ? `Exp ${line.expiry_date}` : "No expiry"}
                        </div>
                        <div className="mt-1 text-xs">
                          {formatMoney(line.selling_price, currency)} × {line.quantity} ={" "}
                          <span className="font-semibold">
                            {formatMoney(line.selling_price * line.quantity, currency)}
                          </span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeLine(line.medicine_id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => changeQty(line.medicine_id, -1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-mono text-sm">{line.quantity}</span>
                      <Button size="icon" variant="outline" onClick={() => changeQty(line.medicine_id, 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {activeStock(line.medicine_id)} in stock
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: totals + payment */}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
            <div className="flex justify-between text-sm"><span>Discount</span><span className="text-rose-600">-{formatMoney(totals.discount, currency)}</span></div>
            {totals.summary.cgst > 0 ? (
              <div className="flex justify-between text-sm"><span>CGST</span><span>{formatMoney(totals.summary.cgst, currency)}</span></div>
            ) : null}
            {totals.summary.sgst > 0 ? (
              <div className="flex justify-between text-sm"><span>SGST</span><span>{formatMoney(totals.summary.sgst, currency)}</span></div>
            ) : null}
            {totals.summary.igst > 0 ? (
              <div className="flex justify-between text-sm"><span>IGST</span><span>{formatMoney(totals.summary.igst, currency)}</span></div>
            ) : null}
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Grand Total</span><span>{formatMoney(totals.grand_total, currency)}</span>
            </div>
            <div className="pt-1">
              <Label>Global discount (₹)</Label>
              <Input className="mt-1" type="number" min={0} value={globalDiscount || ""} onChange={(e) => setGlobalDiscount(Number(e.target.value) || 0)} placeholder="0" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-2 font-semibold">Payment</h3>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!m.enabled}
                  onClick={() => setSelectedMethod(m.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition ${
                    selectedMethod === m.id
                      ? "border-primary bg-primary/10 text-primary"
                      : m.enabled
                        ? "border-border hover:bg-muted/40"
                        : "cursor-not-allowed border-dashed opacity-40"
                  }`}
                >
                  {PAYMENT_ICONS[m.category]}
                  {m.name}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Amount received</Label>
                <Input className="mt-1 text-lg font-semibold" type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={isDeferred ? "Deferred" : "0.00"} disabled={isDeferred} />
              </div>
              <div className="flex justify-between text-sm">
                <span>Change / Balance</span>
                <span className={change > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground"}>
                  {isDeferred ? "Credit due" : formatMoney(change, currency)}
                </span>
              </div>
              <div>
                <Label>Transaction reference</Label>
                <Input className="mt-1" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="UPI / card txn id (optional)" />
              </div>
            </div>

            <Button className="mt-4 w-full" size="lg" disabled={busy || !cart.length} onClick={() => void completeSale()}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
              {busy ? "Processing…" : `Charge ${formatMoney(totals.grand_total, currency)}`}
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" /> {session.name || settings.pharmacist_name || "Cashier"}
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          <Download className="h-3.5 w-3.5" />
          Preview / PDF / HTML available after sale
        </div>
      </div>
    </div>
  );
}
