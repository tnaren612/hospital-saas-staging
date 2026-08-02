"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  Banknote,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wallet,
  History,
  Pause,
  Play,
  ScanSearch,
  CloudOff,
  Cloud,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAdminSession } from "@/components/admin/admin-session-context";
import { BarcodeScanner } from "@/components/admin/pharmacy/barcode-scanner";
import { ReceiptPreview } from "@/components/admin/pharmacy/receipt-preview";
import { computeTotals, type CartLine } from "@/lib/pharmacy/cart";
import { formatMoney, getCurrency } from "@/lib/pharmacy/tax";
import { buildPaymentMethods } from "@/lib/pharmacy/payments";
import {
  enqueueMutation,
  useOfflineEntities,
  useOfflineStore,
  useOfflineSync,
} from "@/lib/pharmacy/offline";
import { createUuid } from "@/lib/pharmacy/offline/storage";
import type { Medicine } from "@/lib/phase2/types";
import type { PharmacySettings, ReceiptData } from "@/lib/pharmacy/types";
import type { HospitalConfig } from "@/lib/hospital/types";
import {
  buildPosPayload,
  buildReceiptData,
  heldBillPayload,
  heldItemsToCart,
  localSaleNumber,
  methodLabel,
  outstandingBalances,
  receiptDataFromSale,
  toPosLineItems,
  type PosPaymentLine,
} from "@/lib/pharmacy/pos-offline";
import {
  type IndexedMedicine,
  buildMedicineIndex,
  detectBarcodeFormat,
  searchMedicines,
} from "@/lib/pharmacy/barcode/scan";
import { useVirtualList } from "@/lib/pharmacy/virtual-list";

function fallbackSettings(): PharmacySettings {
  return {
    hospital_id: "local",
    receipt_header: "",
    receipt_footer: "Thank you for your purchase!",
    receipt_paper_size: "80mm",
    show_logo: true,
    show_hospital_address: true,
    show_phone: true,
    show_gst: true,
    show_drug_license: true,
    show_doctor_name: true,
    show_patient_address: false,
    show_batch_details: true,
    show_expiry: true,
    show_mrp: true,
    show_savings: true,
    show_barcode: true,
    show_qr_code: true,
    show_return_policy: true,
    return_policy_text: "Medicines may be returned within 7 days with the bill.",
    default_gst_percent: 12,
    inclusive_tax: false,
    max_discount_percent: 20,
    require_discount_approval: false,
    low_stock_threshold: 10,
    expiry_alert_days: 90,
    critical_expiry_days: 30,
    enable_barcode_scanner: true,
    enable_keyboard_shortcuts: true,
    enable_sound_effects: true,
    auto_print_receipt: true,
    require_patient_for_sale: false,
    allow_credit_sales: true,
    enable_cash: true,
    enable_upi: true,
    enable_card: true,
    enable_insurance: true,
    enable_credit: true,
    enable_wallet: false,
    drug_license_number: "",
    gst_number: "",
    pharmacist_name: "",
    pharmacist_registration: "",
    standalone_mode: false,
  };
}

function expiryValid(expiry?: string | null): boolean {
  if (!expiry) return true;
  return new Date(`${expiry}T23:59:59`) >= new Date();
}

export function PosView() {
  const session = useAdminSession();
  const storage = useOfflineStore();
  const offline = useOfflineSync({
    autoSync: true,
    pullEntities: ["sale", "return", "held_bill", "branch", "shift", "settings"],
  });
  const cachedMeds = useOfflineEntities<Record<string, unknown>>("medicine");
  const cachedSales = useOfflineEntities<Record<string, unknown>>("sale");
  const cachedHeld = useOfflineEntities<Record<string, unknown>>("held_bill");
  const cachedSettings = useOfflineEntities<Record<string, unknown>>("settings");

  const [settings, setSettings] = useState<PharmacySettings | null>(null);
  const [hospital, setHospital] = useState<HospitalConfig | null>(null);
  const [serverMeds, setServerMeds] = useState<Medicine[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [tenders, setTenders] = useState<PosPaymentLine[]>([
    { methodId: "cash", amount: 0 },
  ]);
  const [quickAmount, setQuickAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewData, setPreviewData] = useState<ReceiptData | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [unknownForm, setUnknownForm] = useState({ name: "", price: "", stock: "" });
  const [showHeld, setShowHeld] = useState(false);
  const [showBills, setShowBills] = useState(false);

  // Patient info
  const [patientName, setPatientName] = useState("Walk-in Customer");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [saleType, setSaleType] = useState<"walk_in" | "prescription">("walk_in");
  const [doctorName, setDoctorName] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/pharmacy/dashboard", { cache: "no-store" });
        const json = (await res.json()) as { data?: { settings: PharmacySettings; hospital: HospitalConfig } };
        if (active && json.data) {
          setSettings(json.data.settings);
          setHospital(json.data.hospital);
          await storage.putEntity("settings", "server", json.data.settings as Record<string, unknown>, "local");
        }
      } catch {
        /* offline — fall back to cached settings below */
      }
      try {
        const res = await fetch("/api/phase2/pharmacy?kind=medicines", { cache: "no-store" });
        const json = (await res.json()) as { data?: Medicine[] };
        if (active && Array.isArray(json.data)) setServerMeds(json.data);
      } catch {
        /* offline — cached medicines only */
      }
    })();
    return () => {
      active = false;
    };
  }, [storage]);

  useEffect(() => {
    if (settings || !cachedSettings.length) return;
    const cached = cachedSettings.find((s) => s.id === "server");
    if (cached?.data) {
      setSettings({ ...fallbackSettings(), ...(cached.data as Record<string, unknown>) } as PharmacySettings);
    }
  }, [cachedSettings, settings]);

  const resolvedSettings = settings || fallbackSettings();
  const resolvedHospital = hospital || {
    id: "local",
    slug: "sri-srinivasa-hospital",
    name: "Sri Srinivasa Hospital",
    branding: { name: "Sri Srinivasa Hospital", logo_url: "" },
    contact: { address_line1: "", city: "", state: "", pincode: "", phones: [], email: "" },
    localization: { currency: "INR" },
  } as unknown as HospitalConfig;

  const currency = getCurrency(resolvedHospital.localization.currency);
  const cashierName = session.name || resolvedSettings.pharmacist_name || "Cashier";

  // ---- medicine index (merged server + offline cache) ----
  const medicines: IndexedMedicine[] = useMemo(() => {
    const map = new Map<string, IndexedMedicine>();
    for (const m of serverMeds) {
      map.set(m.id, {
        id: m.id,
        name: m.name,
        sku: m.sku || null,
        generic_name: m.generic_name || null,
        manufacturer: m.manufacturer || null,
      });
    }
    for (const rec of cachedMeds) {
      const d = rec.data as Record<string, unknown>;
      map.set(rec.id, {
        id: rec.id,
        name: String(d.name ?? ""),
        sku: d.sku ? String(d.sku) : null,
        barcode: d.barcode ? String(d.barcode) : null,
        generic_name: d.generic_name ? String(d.generic_name) : null,
        manufacturer: d.manufacturer ? String(d.manufacturer) : null,
      });
    }
    return [...map.values()];
  }, [serverMeds, cachedMeds]);

  const index = useMemo(() => buildMedicineIndex(medicines), [medicines]);

  const medRecord = (id: string | undefined) => {
    if (!id) return null;
    return serverMeds.find((m) => m.id === id) || null;
  };

  // ---- search (bucketed index → sub-ms for 100k+ rows) ----
  const results = useMemo(
    () => (search.trim() ? searchMedicines(index, search, { limit: 200 }) : []),
    [index, search]
  );
  const resultsRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualList(results, resultsRef, { rowHeight: 64, overscan: 8 });

  const totals = useMemo(
    () =>
      computeTotals(cart, {
        discount: globalDiscount,
        inclusiveTax: resolvedSettings.inclusive_tax,
        taxType: "intra",
        currency,
      }),
    [cart, globalDiscount, resolvedSettings.inclusive_tax, currency]
  );

  const methods = useMemo(() => buildPaymentMethods(resolvedSettings), [resolvedSettings]);

  const tendersTotal = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const due = Math.max(0, totals.grand_total - tendersTotal);
  const over = Math.max(0, tendersTotal - totals.grand_total);
  const deferredSelected = tenders.some(
    (t) => Number(t.amount) > 0 && (t.methodId === "credit" || t.methodId === "insurance")
  );

  const outstanding = useMemo(() => outstandingBalances(cachedSales.map((r) => r.data)), [cachedSales]);
  const outstandingTotal = outstanding.reduce((s, o) => s + o.balance, 0);

  const addToCart = (med: { id: string; name: string } & Record<string, unknown>, qty = 1) => {
    const server = medRecord(med.id);
    const stockQty = Number(med.stock_qty ?? server?.stock_qty ?? 0);
    const price = Number(med.selling_price ?? server?.selling_price ?? 0);
    const inCart = cart
      .filter((c) => c.medicine_id === med.id)
      .reduce((s, c) => s + c.quantity, 0);
    if (inCart + qty > stockQty && stockQty > 0) {
      toast.error(`${med.name} — only ${stockQty} in stock.`);
      return;
    }
    if (!expiryValid((med.expiry_date as string) || server?.expiry_date)) {
      toast.error(`${med.name} is expired and cannot be dispensed.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.medicine_id === med.id);
      if (existing) {
        return prev.map((c) =>
          c.medicine_id === med.id ? { ...c, quantity: c.quantity + qty } : c
        );
      }
      return [
        ...prev,
        {
          medicine_id: med.id,
          name: String(med.name ?? ""),
          generic_name: (med.generic_name as string) || undefined,
          manufacturer: (med.manufacturer as string) || undefined,
          batch_number: ((med.batch_number as string) || server?.batch_number) || undefined,
          expiry_date: ((med.expiry_date as string) || server?.expiry_date) || null,
          mrp: price,
          selling_price: price,
          quantity: qty,
          gst_percent: resolvedSettings.default_gst_percent || 0,
        },
      ];
    });
    setSearch("");
  };

  const onScan = (raw: string, medicine: IndexedMedicine | null) => {
    if (!medicine) {
      setUnknownCode(raw);
      setUnknownForm({ name: "", price: "", stock: "" });
      return;
    }
    const found = medRecord(medicine.id) || medicines.find((m) => m.id === medicine.id);
    if (!found) {
      toast.error("Medicine record incomplete — add it in Inventory.");
      return;
    }
    addToCart(found as unknown as Medicine);
  };

  const addUnknownMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unknownCode || !unknownForm.name.trim()) {
      toast.error("Medicine name is required.");
      return;
    }
    const id = createUuid();
    const payload: Record<string, unknown> = {
      _clientId: id,
      name: unknownForm.name.trim(),
      sku: unknownCode,
      barcode: unknownCode,
      generic_name: "",
      manufacturer: "Unknown",
      selling_price: Number(unknownForm.price) || 0,
      stock_qty: Number(unknownForm.stock) || 0,
      reorder_level: 0,
      unit: "tab",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await enqueueMutation(storage, {
      id,
      hospitalId: "local",
      entity: "medicine",
      action: "create",
      payload,
      targetKey: `medicine::${id}`,
    });
    toast.success(`${payload.name} added — you can scan it again now.`);
    setUnknownCode(null);
  };

  const changeQty = (medicineId: string | undefined, delta: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.medicine_id !== medicineId) return c;
        const stock = medRecord(medicineId)?.stock_qty ?? 999;
        return { ...c, quantity: Math.max(1, Math.min(c.quantity + delta, Number(stock))) };
      })
    );
  };

  const removeLine = (medicineId: string | undefined) =>
    setCart((prev) => prev.filter((c) => c.medicine_id !== medicineId));

  const resetCart = () => {
    setCart([]);
    setGlobalDiscount(0);
    setTenders([{ methodId: "cash", amount: 0 }]);
    setQuickAmount("");
  };

  const charge = async () => {
    if (!cart.length) {
      toast.error("Add at least one medicine.");
      return;
    }
    const active = tenders.filter((t) => Number(t.amount) > 0);
    if (!active.length) {
      toast.error("Enter at least one payment.");
      return;
    }
    if (due > 0.005 && !deferredSelected) {
      toast.error("Payment is short — add another tender or mark as credit.");
      return;
    }
    setBusy(true);
    try {
      const saleNumber = localSaleNumber();
      const result = buildPosPayload({
        customer: {
          patientName,
          patientPhone: patientPhone || undefined,
          patientAge: patientAge ? Number(patientAge) : null,
          saleType,
          doctorName: doctorName || null,
          prescriptionNumber: prescriptionNumber || null,
        },
        cashierName,
        items: toPosLineItems(cart),
        cartLines: cart,
        totals,
        tenders,
        saleNumber,
      });
      const id = createUuid();
      const payload = {
        ...result.payload,
        _clientId: id,
        sale_number: saleNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>;

      await enqueueMutation(storage, {
        id,
        hospitalId: "local",
        entity: "sale",
        action: "create",
        payload,
        targetKey: `sale::${id}`,
      });

      const receipt = buildReceiptData({
        sale: { id, sale_number: saleNumber, created_at: new Date().toISOString() },
        hospital: {
          name: resolvedHospital.branding.name || "Sri Srinivasa Hospital",
          address: [
            resolvedHospital.contact.address_line1,
            resolvedHospital.contact.city,
            resolvedHospital.contact.state,
            resolvedHospital.contact.pincode,
          ]
            .filter(Boolean)
            .join(", "),
          phone: resolvedHospital.contact.phones?.[0] || "",
          email: resolvedHospital.contact.email || "",
          gst: resolvedSettings.gst_number || "",
          drug_license: resolvedSettings.drug_license_number || "",
          logo_url: resolvedHospital.branding.logo_url || "",
        },
        settings: resolvedSettings,
        cartLines: cart,
        totals,
        amountPaid: result.payload.amount_paid,
        amountReturned: result.payload.amount_returned,
        paymentMethod: result.payload.payment_method,
        paymentReference: result.payload.payment_reference || undefined,
        cashierName,
        pharmacistName: resolvedSettings.pharmacist_name || "",
        customer: {
          patientName,
          patientPhone: patientPhone || undefined,
          patientAge: patientAge ? Number(patientAge) : null,
          saleType,
          doctorName: doctorName || null,
          prescriptionNumber: prescriptionNumber || null,
        },
        printedBy: cashierName,
        transactionId: id,
      });

      toast.success(
        `${saleNumber} · ${formatMoney(totals.grand_total, currency)} saved offline${
          offline.online ? "" : " (will sync automatically)"
        }`
      );
      resetCart();
      setPatientPhone("");
      setPatientAge("");
      setDoctorName("");
      setPrescriptionNumber("");

      if (resolvedSettings.auto_print_receipt) {
        setPreviewData(receipt);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sale could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const holdBill = async () => {
    if (!cart.length) return;
    const reference = `HLD-${Date.now().toString().slice(-8)}`;
    const id = createUuid();
    const payload = {
      _clientId: id,
      ...heldBillPayload(
        {
          reference,
          customerName: patientName !== "Walk-in Customer" ? patientName : undefined,
          customerPhone: patientPhone || undefined,
          items: cart,
          discount: globalDiscount,
          heldByName: cashierName,
        },
        "local"
      ),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>;
    await enqueueMutation(storage, {
      id,
      hospitalId: "local",
      entity: "held_bill",
      action: "create",
      payload,
      targetKey: `held_bill::${id}`,
    });
    toast.success(`Bill held as ${reference}`);
    resetCart();
  };

  const resumeHeld = async (held: Record<string, unknown>, entityId: string) => {
    const lines = heldItemsToCart(held);
    if (!lines.length) {
      toast.error("Held bill has no items.");
      return;
    }
    setCart(lines);
    setGlobalDiscount(Number(held.discount ?? 0) || 0);
    if (held.customer_name) setPatientName(String(held.customer_name));
    if (held.customer_phone) setPatientPhone(String(held.customer_phone));
    await storage.deleteEntity("held_bill", entityId);
    toast.success(`Resumed ${held.reference}`);
    setShowHeld(false);
  };

  const hospitalInfoForReceipt = {
    name: resolvedHospital.branding.name || "Sri Srinivasa Hospital",
    address: [
      resolvedHospital.contact.address_line1,
      resolvedHospital.contact.city,
      resolvedHospital.contact.state,
      resolvedHospital.contact.pincode,
    ]
      .filter(Boolean)
      .join(", "),
    phone: resolvedHospital.contact.phones?.[0] || "",
    email: resolvedHospital.contact.email || "",
    gst: resolvedSettings.gst_number || "",
    drug_license: resolvedSettings.drug_license_number || "",
    logo_url: resolvedHospital.branding.logo_url || "",
  };

  const reprint = (row: Record<string, unknown>) => {
    const data = receiptDataFromSale(row, {
      hospital: hospitalInfoForReceipt,
      settings: resolvedSettings,
      cashierName,
      pharmacistName: resolvedSettings.pharmacist_name || "",
    });
    if (data) setPreviewData(data);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* ======================= LEFT: scan + search + cart ======================= */}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
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
              <Badge variant={offline.online ? "outline" : "secondary"}>
                {offline.online ? (
                  <Cloud className="h-3 w-3" aria-hidden />
                ) : (
                  <CloudOff className="h-3 w-3" aria-hidden />
                )}
                {offline.online ? "Online" : "Offline"} · {offline.stats.pendingCount} queued
                {offline.syncing && <RefreshCw className="ml-1 h-3 w-3 animate-spin" />}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
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
              {saleType === "prescription" && (
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
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Label>Scan medicine (barcode / QR — continuous mode)</Label>
            <BarcodeScanner
              medicines={medicines}
              onScan={onScan}
              sound={resolvedSettings.enable_sound_effects}
              continuous
            />
            <div>
              <Label>Search medicine</Label>
              <Input
                className="mt-1 text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, generic, manufacturer or SKU…"
                autoComplete="off"
              />
            </div>
            {search.trim() && (
              <div
                ref={resultsRef}
                onScroll={virtual.onScroll}
                className="max-h-80 overflow-auto rounded-lg border"
              >
                <div style={{ height: virtual.totalHeight, position: "relative" }}>
                  <div style={{ transform: `translateY(${virtual.offsetY}px)` }}>
                    {virtual.visible.map((m) => {
                      const server = medRecord(m.id);
                      const price = Number(server?.selling_price ?? 0);
                      const stock = Number(server?.stock_qty ?? 0);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => addToCart(m as unknown as Medicine)}
                          className="flex w-full items-center justify-between gap-2 border-b px-3 py-3 text-left text-sm last:border-0 hover:bg-muted/40"
                          style={{ height: 64 }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{m.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {m.manufacturer} {m.sku ? `· ${m.sku}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-semibold">{formatMoney(price, currency)}</div>
                            <Badge variant={stock <= (server?.reorder_level ?? 0) ? "danger" : "outline"}>
                              {stock} in stock
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                    {virtual.visible.length === 0 && (
                      <p className="p-4 text-center text-sm text-muted-foreground">No matching medicines.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cart */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="h-4 w-4" aria-hidden /> Cart ({cart.length})
              </h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!cart.length} onClick={() => void holdBill()}>
                  <Pause className="h-4 w-4" aria-hidden /> Hold
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowHeld(true)}>
                  <Play className="h-4 w-4" aria-hidden /> Resume ({cachedHeld.length})
                </Button>
                {cart.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={resetCart}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Cart is empty — scan or search a medicine.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {cart.map((line) => (
                  <div key={line.medicine_id || line.name} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ======================= RIGHT: totals + tenders ======================= */}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Discount</span>
              <span className="text-rose-600">-{formatMoney(totals.discount, currency)}</span>
            </div>
            {totals.summary.cgst > 0 && (
              <div className="flex justify-between text-sm">
                <span>CGST</span>
                <span>{formatMoney(totals.summary.cgst, currency)}</span>
              </div>
            )}
            {totals.summary.sgst > 0 && (
              <div className="flex justify-between text-sm">
                <span>SGST</span>
                <span>{formatMoney(totals.summary.sgst, currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Grand Total</span>
              <span>{formatMoney(totals.grand_total, currency)}</span>
            </div>
            <div className="pt-1">
              <Label>Global discount</Label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={globalDiscount || ""}
                onChange={(e) => setGlobalDiscount(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="font-semibold">Payments (split / mixed)</h3>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!m.enabled}
                  title={m.name}
                  onClick={() =>
                    setTenders((prev) => {
                      if (prev.some((t) => t.methodId === m.id)) return prev;
                      return [...prev, { methodId: m.id, amount: 0 }];
                    })
                  }
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    tenders.some((t) => t.methodId === m.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : m.enabled
                        ? "border-border hover:bg-muted/40"
                        : "cursor-not-allowed border-dashed opacity-40"
                  }`}
                >
                  {m.category === "cash" && <Banknote className="h-4 w-4" />}
                  {m.category === "upi" && <Smartphone className="h-4 w-4" />}
                  {m.category === "card" && <CreditCard className="h-4 w-4" />}
                  {m.category === "insurance" && <ShieldCheck className="h-4 w-4" />}
                  {(m.category === "credit" || m.category === "wallet") && <Wallet className="h-4 w-4" />}
                  {m.name}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {tenders.map((t, i) => (
                <div key={t.methodId} className="flex items-center gap-2">
                  <select
                    className="h-10 w-32 rounded-lg border border-input bg-background px-2 text-sm"
                    value={t.methodId}
                    onChange={(e) =>
                      setTenders(tenders.map((x, j) => (j === i ? { ...x, methodId: e.target.value } : x)))
                    }
                  >
                    {methods.map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.enabled}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-10 flex-1 font-mono"
                    value={t.amount || ""}
                    placeholder="0.00"
                    onChange={(e) =>
                      setTenders(tenders.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))
                    }
                  />
                  {t.methodId === "upi" || t.methodId === "credit_card" || t.methodId === "debit_card" ? (
                    <Input
                      className="h-10 w-28"
                      value={t.reference || ""}
                      placeholder="Txn ID"
                      onChange={(e) =>
                        setTenders(tenders.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))
                      }
                    />
                  ) : null}
                  <Button size="icon" variant="ghost" onClick={() => setTenders(tenders.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                className="h-10 flex-1 font-mono"
                value={quickAmount}
                placeholder="Quick amount"
                onChange={(e) => setQuickAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && Number(quickAmount) > 0) {
                    setTenders(
                      tenders.map((t, i) => (i === 0 ? { ...t, amount: Number(quickAmount) || 0 } : t))
                    );
                    setQuickAmount("");
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  setTenders(tenders.map((t, i) => (i === 0 ? { ...t, amount: totals.grand_total } : t)));
                }}
              >
                Exact
              </Button>
            </div>

            <div className="flex justify-between text-sm">
              <span>Collected</span>
              <span className="font-semibold">{formatMoney(tendersTotal, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{due > 0 ? "Balance due (partial / credit)" : "Change"}</span>
              <span className={due > 0 ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
                {formatMoney(due > 0 ? due : over, currency)}
              </span>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={busy || !cart.length}
              onClick={() => void charge()}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : offline.online ? (
                <Printer className="h-5 w-5" />
              ) : (
                <CloudOff className="h-5 w-5" />
              )}
              {busy
                ? "Saving…"
                : `Charge ${formatMoney(totals.grand_total, currency)}${offline.online ? "" : " (offline)"}`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {cashierName} · bills are saved locally and sync automatically
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold">
                <History className="h-4 w-4" aria-hidden /> Today&apos;s bills
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setShowBills((v) => !v)}>
                {showBills ? "Hide" : "Show"} ({cachedSales.length})
              </Button>
            </div>
            {showBills && (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {cachedSales
                  .slice()
                  .reverse()
                  .slice(0, 30)
                  .map((rec) => {
                    const d = rec.data as Record<string, unknown>;
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => reprint(d)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40"
                      >
                        <span className="font-mono text-xs">{String(d.sale_number ?? "")}</span>
                        <span className="text-xs text-muted-foreground">
                          {methodLabel(String(d.payment_method ?? ""))}
                        </span>
                        <span className="font-semibold">
                          {formatMoney(Number(d.grand_total ?? 0), currency)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span>Outstanding</span>
              <Link href="/admin/pharmacy/settlement" className="font-semibold text-amber-600 hover:underline">
                {formatMoney(outstandingTotal, currency)} ({outstanding.length})
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ======================= Unknown barcode workflow ======================= */}
      {unknownCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl">
            <h3 className="flex items-center gap-2 font-semibold">
              <ScanSearch className="h-4 w-4" aria-hidden /> Unknown barcode
            </h3>
            <p className="mt-2 break-all rounded-lg border bg-muted/30 p-3 font-mono text-sm">
              {unknownCode}
              <Badge variant="outline" className="ml-2 align-middle">
                {detectBarcodeFormat(unknownCode)}
              </Badge>
            </p>
            <form onSubmit={(e) => void addUnknownMedicine(e)} className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="unk-name">Medicine name *</Label>
                <Input
                  id="unk-name"
                  autoFocus
                  value={unknownForm.name}
                  onChange={(e) => setUnknownForm({ ...unknownForm, name: e.target.value })}
                  placeholder="e.g. Paracetamol 500mg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="unk-price">Selling price</Label>
                  <Input
                    id="unk-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={unknownForm.price}
                    onChange={(e) => setUnknownForm({ ...unknownForm, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="unk-stock">Stock qty</Label>
                  <Input
                    id="unk-stock"
                    type="number"
                    min={0}
                    value={unknownForm.stock}
                    onChange={(e) => setUnknownForm({ ...unknownForm, stock: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setUnknownCode(null)}>
                  Dismiss
                </Button>
                <Button type="submit">Add &amp; scan again</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Added offline — it appears in the cart immediately and syncs when supported.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ======================= Held bills ======================= */}
      {showHeld && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Held bills ({cachedHeld.length})</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowHeld(false)}>
                Close
              </Button>
            </div>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
              {cachedHeld.map((rec) => {
                const d = rec.data as Record<string, unknown>;
                return (
                  <div key={rec.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <div className="font-mono text-sm font-medium">{String(d.reference ?? "")}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(d.customer_name ?? "Walk-in")} · {Array.isArray(d.items) ? d.items.length : 0} items ·{" "}
                        {(d.created_at as string)?.slice(0, 16).replace("T", " ") ?? ""}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => void resumeHeld(d, rec.id)}>
                      <Play className="h-4 w-4" aria-hidden /> Resume
                    </Button>
                  </div>
                );
              })}
              {cachedHeld.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No held bills.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================= Receipt preview / print ======================= */}
      {previewData && (
        <ReceiptPreview
          data={previewData}
          onClose={() => setPreviewData(null)}
          onPrinted={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}
