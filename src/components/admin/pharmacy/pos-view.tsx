"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  runBootstrap,
  useCloudStatus,
  useOfflineEntities,
  useOfflineStore,
  useOfflineSync,
  useStorageHealth,
} from "@/lib/pharmacy/offline";
import {
  type BootstrapOutcome,
  classifyFetchError,
} from "@/lib/pharmacy/offline/cloud";
import { createUuid } from "@/lib/pharmacy/offline/storage";
import {
  commitMedicineWithBatchLocally,
  commitSaleLocally,
  fetchLocalMedicines,
} from "@/lib/pharmacy/local-tx";
import {
  addLineToCart,
  addSplitTenderRow,
  defaultTenders,
  dispatchPosScan,
  visibleCatalogList,
  type CatalogMed,
} from "@/lib/pharmacy/pos-catalog";
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
  findDuplicateMedicineKey,
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

/** Search/scanner results carry price+stock so the offline catalog prices correctly. */
type PosMedicine = IndexedMedicine & {
  selling_price?: number | string | null;
  stock_qty?: number | string | null;
  mrp?: number | string | null;
  expiry_date?: string | null;
  batch_number?: string | null;
  updated_at?: string | null;
  reorder_level?: number | string | null;
};

export function PosView() {
  const session = useAdminSession();
  const storage = useOfflineStore();
  const storageHealth = useStorageHealth();
  const offline = useOfflineSync({
    autoSync: true,
    pullEntities: ["sale", "return", "held_bill", "branch", "shift", "settings"],
  });  const cachedMeds = useOfflineEntities<Record<string, unknown>>("medicine");
  const cachedSales = useOfflineEntities<Record<string, unknown>>("sale");
  const cachedHeld = useOfflineEntities<Record<string, unknown>>("held_bill");
  const cachedSettings = useOfflineEntities<Record<string, unknown>>("settings");

  const [settings, setSettings] = useState<PharmacySettings | null>(null);
  const [hospital, setHospital] = useState<HospitalConfig | null>(null);
  const [serverMeds, setServerMeds] = useState<Medicine[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [tenders, setTenders] = useState<PosPaymentLine[]>(defaultTenders());
  const [splitMode, setSplitMode] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewData, setPreviewData] = useState<ReceiptData | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [unknownForm, setUnknownForm] = useState({ name: "", price: "", stock: "" });
  // Bumped whenever the unknown-barcode dialog closes — the scanner input
  // refocuses so the next scan lands immediately.
  const [scannerFocusSignal, setScannerFocusSignal] = useState(0);
  const [showHeld, setShowHeld] = useState(false);
  const [showBills, setShowBills] = useState(false);
  const cloud = useCloudStatus();
  const [bootstrap, setBootstrap] = useState<BootstrapOutcome | null>(null);

  // Patient info
  const [patientName, setPatientName] = useState("Walk-in Customer");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [saleType, setSaleType] = useState<"walk_in" | "prescription">("walk_in");
  const [doctorName, setDoctorName] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");

  /**
   * Canonical local stock refresh: the SQLite store is the stock authority,
   * so after every committed transaction (and on mount) the POS re-reads the
   * medicine list from it and merges the rows into the catalog state and the
   * IndexedDB cache. Search results, scanner resolution, stock badges and
   * cart validation all read from the same merged state — no shadow system.
   */
  const mergeLocalMedicines = useCallback(async () => {
    try {
      const rows = await fetchLocalMedicines();
      if (!rows.length) return;
      setServerMeds((prev) => {
        const map = new Map(prev.map((m) => [m.id, m as unknown as Record<string, unknown>]));
        for (const row of rows) map.set(row.id, row);
        return [...map.values()] as unknown as Medicine[];
      });
      for (const row of rows) {
        await storage.putEntity("medicine", row.id, row, "local");
      }
    } catch {
      // SQLite rows stay authoritative; the next successful refresh wins.
    }
  }, [storage]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const outcome = await runBootstrap(
        {
          dashboard: async () => {
            try {
              const res = await fetch("/api/admin/pharmacy/dashboard", { cache: "no-store" });
              const json = (await res.json().catch(() => null)) as {
                data?: { settings: PharmacySettings; hospital: HospitalConfig };
                error?: string;
              } | null;
              if (!res.ok || !json?.data) {
                return { ok: false as const, kind: classifyFetchError(new Error(json?.error || `HTTP ${res.status}`), { status: res.status, bodyError: json?.error ?? null }), message: json?.error || "dashboard failed" };
              }
              return { ok: true as const, data: { settings: json.data.settings as Record<string, unknown>, hospital: json.data.hospital as Record<string, unknown> } };
            } catch (err) {
              return { ok: false as const, kind: classifyFetchError(err), message: err instanceof Error ? err.message : "fetch failed" };
            }
          },
          medicines: async () => {
            try {
              const res = await fetch("/api/phase2/pharmacy?kind=medicines", { cache: "no-store" });
              const json = (await res.json().catch(() => null)) as {
                data?: unknown[];
                error?: string;
              } | null;
              if (!res.ok || !Array.isArray(json?.data)) {
                return { ok: false as const, kind: classifyFetchError(new Error(json?.error || `HTTP ${res.status}`), { status: res.status, bodyError: json?.error ?? null }), message: json?.error || "medicines failed" };
              }
              return { ok: true as const, data: json.data as Array<Record<string, unknown>> };
            } catch (err) {
              return { ok: false as const, kind: classifyFetchError(err), message: err instanceof Error ? err.message : "fetch failed" };
            }
          },
        },
        storage
      );
      if (!active) return;
      setBootstrap(outcome);
      if (outcome.settings) {
        setSettings(outcome.settings.settings as unknown as PharmacySettings);
        setHospital(outcome.settings.hospital as unknown as HospitalConfig);
        await storage.putEntity("settings", "server", outcome.settings.settings, "local");
      }
      setServerMeds(outcome.medicines as unknown as Medicine[]);
      void mergeLocalMedicines();
    })();
    return () => {
      active = false;
    };
  }, [storage, mergeLocalMedicines]);

  // ---- cloud recovery: resume sync and confirm exactly once per transition ----
  const prevCloudState = useRef<string>("connected");
  useEffect(() => {
    const prev = prevCloudState.current;
    prevCloudState.current = cloud.state;
    if (prev === "connected" || cloud.state !== "connected") return;
    // Unavailable/error → connected: notify once, resume automatically.
    toast.success("Connection restored — syncing…");
    void offline.syncNow().then((result) => {
      if (result.errors.length === 0) toast.success("Synced ✓");
    });
  }, [cloud.state]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Cached rows carry price/stock too, so offline search & scanning price
  // correctly from the local catalog (no network, no stock-authority change).
  const medicines: PosMedicine[] = useMemo(() => {
    const map = new Map<string, PosMedicine>();
    for (const m of serverMeds) {
      map.set(m.id, {
        id: m.id,
        name: m.name,
        sku: m.sku || null,
        barcode: (m as { barcode?: unknown }).barcode ? String((m as { barcode?: unknown }).barcode) : null,
        generic_name: m.generic_name || null,
        manufacturer: m.manufacturer || null,
        selling_price: m.selling_price ?? null,
        stock_qty: m.stock_qty ?? null,
        mrp: (m as { mrp?: unknown }).mrp ? Number((m as { mrp?: unknown }).mrp) : null,
        expiry_date: m.expiry_date ?? null,
        batch_number: m.batch_number ?? null,
        reorder_level: (m as { reorder_level?: unknown }).reorder_level ? Number((m as { reorder_level?: unknown }).reorder_level) : null,
        updated_at: (m as { updated_at?: unknown }).updated_at ? String((m as { updated_at?: unknown }).updated_at) : null,
      });
    }
    for (const rec of cachedMeds) {
      const d = rec.data as Record<string, unknown>;
      const barcode = d.barcode ? String(d.barcode) : "";
      if (barcode && [...map.values()].some((m) => String(m.barcode ?? "") === barcode)) continue;
      map.set(rec.id, {
        id: rec.id,
        name: String(d.name ?? ""),
        sku: d.sku ? String(d.sku) : null,
        barcode: d.barcode ? String(d.barcode) : null,
        generic_name: d.generic_name ? String(d.generic_name) : null,
        manufacturer: d.manufacturer ? String(d.manufacturer) : null,
        selling_price: (d.selling_price as number | string | null) ?? null,
        stock_qty: (d.stock_qty as number | string | null) ?? null,
        mrp: (d.mrp as number | string | null) ?? null,
        expiry_date: d.expiry_date ? String(d.expiry_date) : null,
        batch_number: d.batch_number ? String(d.batch_number) : null,
        reorder_level: d.reorder_level ? Number(d.reorder_level) : null,
        updated_at: d.updated_at ? String(d.updated_at) : null,
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
  // Search covers name / generic / manufacturer / SKU / barcode.
  const results = useMemo(
    () =>
      search.trim()
        ? searchMedicines(index, search, {
            limit: 200,
            fields: ["name", "generic_name", "manufacturer", "sku", "barcode"],
          })
        : [],
    [index, search]
  );
  // The medicine LIST under the search box: search results when typing,
  // otherwise recently-used/available medicines with a "View all" toggle —
  // the full catalog is never rendered by default.
  const [viewAll, setViewAll] = useState(false);
  const catalogList = useMemo(
    () =>
      visibleCatalogList({
        medicines,
        search,
        // Search results ARE catalog rows (built from the same `medicines`
        // array), so the cast only restores the enriched row type.
        results: results as PosMedicine[],
        viewAll,
        recentLimit: 8,
      }),
    [medicines, search, results, viewAll]
  );
  const resultsRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualList(catalogList.items, resultsRef, { rowHeight: 64, overscan: 8 });

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

  const addToCart = (med: CatalogMed, qty = 1) => {
    const gst = resolvedSettings.default_gst_percent || 0;
    let blocked: string | null = null;
    setCart((prev) => {
      const out = addLineToCart(prev, med, qty, gst);
      if (!out.ok) {
        blocked = out.message;
        return prev;
      }
      return out.cart;
    });
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setSearch("");
    setViewAll(false);
  };

  const onScan = (raw: string, medicine: IndexedMedicine | null) => {
    // Every scanner source converges here (USB/BT HID, Android HID, camera,
    // image upload, manual, BLE companion): empty payloads are ignored, an
    // unknown code opens Add Medicine, a resolved medicine goes to the cart.
    dispatchPosScan({
      raw,
      medicine,
      add: (med) => {
        const found = medRecord(med.id) || medicines.find((m) => m.id === med.id);
        if (!found) {
          toast.error("Medicine record incomplete — add it in Inventory.");
          return;
        }
        addToCart(found);
      },
      onUnknown: (code) => {
        setUnknownCode(code);
        setUnknownForm({ name: "", price: "", stock: "" });
      },
    });
  };

  const addUnknownMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unknownCode || !unknownForm.name.trim()) {
      toast.error("Medicine name is required.");
      return;
    }
    const dup = findDuplicateMedicineKey(medicines, {
      name: unknownForm.name.trim(),
      sku: unknownCode,
      barcode: unknownCode,
    });
    if (dup) {
      toast.error(
        dup.kind === "name"
          ? `${dup.medicine.name} already exists — use it instead of creating a duplicate.`
          : `SKU / barcode ${unknownCode} is already used by ${dup.medicine.name}.`
      );
      setUnknownCode(null);
      setScannerFocusSignal((x) => x + 1);
      return;
    }
    const name = unknownForm.name.trim();
    const price = Number(unknownForm.price) || 0;
    const stock = Number(unknownForm.stock) || 0;
    const timestamp = new Date().toISOString();
    const batchNumber = `B-${unknownCode.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20) || "OPEN"}`;
    const medicinePayload: Record<string, unknown> = {
      name,
      sku: unknownCode,
      barcode: unknownCode,
      generic_name: "",
      manufacturer: "Unknown",
      selling_price: price,
      purchase_price: 0,
      reorder_level: 0,
      min_stock_level: 0,
      unit: "tab",
      batch_number: batchNumber,
      expiry_date: null,
      qty: stock,
      stock_qty: stock,
    };
    setBusy(true);
    try {
      const created = await commitMedicineWithBatchLocally(medicinePayload);
      if (!created.ok) {
        toast.error(
          created.kind === "network"
            ? "Local store is unreachable — the medicine was not saved."
            : created.error || "The medicine could not be saved."
        );
        return;
      }

      const sqliteId = String(created.data.id);
      await enqueueMutation(storage, {
        id: sqliteId,
        hospitalId: "local",
        entity: "medicine",
        action: "create",
        payload: {
          _clientId: sqliteId,
          ...medicinePayload,
          created_at: timestamp,
          updated_at: timestamp,
        },
        targetKey: `medicine::${sqliteId}`,
      });

      await mergeLocalMedicines();

      toast.success(`${name} added to the local store — you can scan it again now.`);
      setUnknownCode(null);
      setUnknownForm({ name: "", price: "", stock: "" });
      setScannerFocusSignal((x) => x + 1);

      addToCart(
        {
          id: sqliteId,
          name,
          sku: unknownCode,
          barcode: unknownCode,
          generic_name: "",
          manufacturer: "Unknown",
          selling_price: price,
          stock_qty: stock,
          batch_number: batchNumber,
          expiry_date: null,
          reorder_level: 0,
          updated_at: timestamp,
        },
        1
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The medicine could not be saved.");
    } finally {
      setBusy(false);
    }
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
    setTenders(defaultTenders());
    setQuickAmount("");
    setSplitMode(false);
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
        payments: result.settlement
          .filter((r) => Number(r.amount) > 0)
          .map((r) => ({
            method: r.methodId,
            amount: Number(r.amount),
            reference:
              tenders.find((t) => t.methodId === r.methodId)?.reference || null,
          })),
      } as Record<string, unknown>;

      // 1) COMMIT — the SQLite transaction is the authority. Unless the
      //    transaction commits there is NO successful sale, NO payment
      //    state, NO receipt, NO stock decrement and NO queue entry.
      const tx = await commitSaleLocally(payload);
      if (!tx.ok) {
        if (tx.kind === "stock") {
          toast.error(tx.error);
        } else if (tx.kind === "network") {
          toast.error("Local store is unreachable — the sale was not recorded.");
        } else {
          toast.error(`Sale was not recorded: ${tx.error}`);
        }
        return;
      }

      const committed = tx.data;

      // 2) Receipt becomes FINAL only from the committed transaction row.
      const receipt =
        receiptDataFromSale(committed, {
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
          cashierName,
          pharmacistName: resolvedSettings.pharmacist_name || "",
        }) ??
        buildReceiptData({
          sale: { id: String(committed.id), sale_number: saleNumber, created_at: String(committed.created_at ?? "") },
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
          amountPaid: Number(committed.amount_paid ?? result.payload.amount_paid),
          amountReturned: Number(committed.amount_returned ?? result.payload.amount_returned),
          paymentMethod: String(committed.payment_method ?? result.payload.payment_method),
          paymentReference:
            (committed.payment_reference as string) || result.payload.payment_reference || undefined,
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
          transactionId: String(committed.id),
        });

      // 3) Queue the COMMITTED transaction for cloud sync. Idempotent by
      //    sale_number server-side, so a retry can never create a second
      //    local sale or double-deduct stock.
      try {
        await enqueueMutation(storage, {
          id: String(committed.id),
          hospitalId: "local",
          entity: "sale",
          action: "create",
          payload,
          targetKey: `sale::${committed.id}`,
        });
      } catch {
        toast.error("Sale committed locally, but could not be queued for cloud sync.");
      }

      // 4) Immediate stock refresh from the SQLite authority.
      void mergeLocalMedicines();

      toast.success(
        `${saleNumber} · ${formatMoney(totals.grand_total, currency)} recorded${
          cloud.state === "connected" ? "" : " (will sync automatically)"
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
      {!storageHealth.ready && (
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            Offline storage is unavailable
            {storageHealth.error ? ` — ${storageHealth.error}` : ""}. Sales
            cannot be saved offline. Try reloading the page; if it persists,
            the browser cannot open its local database.
          </div>
        </div>
      )}
      {storageHealth.ready && cloud.state === "unavailable" && (
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Cloud unavailable — working offline. New sales are saved locally
              and will sync automatically when the connection returns.
            </span>
          </div>
        </div>
      )}
      {storageHealth.ready &&
        (cloud.state === "error" || bootstrap?.catalogState === "error") && (
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <Cloud className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {cloud.kind === "unauthorized" || bootstrap?.authKind === "unauthorized"
                  ? "Session expired — please sign in again."
                  : cloud.kind === "forbidden" || bootstrap?.authKind === "forbidden"
                    ? "You do not have permission to use pharmacy cloud sync."
                    : cloud.message || "Cloud sync error — check your connection."}
              </span>
            </div>
          </div>
        )}
      {storageHealth.ready &&
        bootstrap?.catalogState === "empty" &&
        !(cloud.state === "error") && (
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <ScanSearch className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Medicine catalog is not available offline yet. Connect to the
                cloud once to download it, or add medicines in Inventory.
              </span>
            </div>
          </div>
        )}
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
              <Badge variant="outline" className="gap-1.5">
                <span
                  className={
                    storageHealth.ready ? "text-emerald-500" : "text-rose-500"
                  }
                  aria-hidden
                >
                  ●
                </span>
                <span>{storageHealth.ready ? "Local ready" : "Local error"}</span>
                <span className="text-muted-foreground">·</span>
                {cloud.state === "connected" && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ● Cloud connected
                  </span>
                )}
                {cloud.state === "unavailable" && (
                  <span className="text-amber-600 dark:text-amber-400">
                    ○ Cloud unavailable
                  </span>
                )}
                {cloud.state === "syncing" && <span>○ Syncing…</span>}
                {cloud.state === "error" && (
                  <span className="text-rose-600 dark:text-rose-400">
                    ○ Cloud error
                  </span>
                )}
                <span className="text-muted-foreground">·</span>
                <span>{offline.stats.pendingCount} queued</span>
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
              focusSignal={scannerFocusSignal}
            />
            <div>
              <Label>Search medicine</Label>
              <Input
                className="mt-1 text-base"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value.trim()) setViewAll(false);
                }}
                placeholder="Name, generic, manufacturer, SKU or barcode…"
                autoComplete="off"
              />
            </div>
            {(search.trim() || catalogList.items.length > 0) && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {catalogList.mode === "search"
                      ? "Search results"
                      : catalogList.mode === "all"
                        ? "All medicines"
                        : "Available medicines"}
                  </span>
                  {catalogList.mode === "recent" &&
                    catalogList.total > catalogList.items.length && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => setViewAll(true)}
                      >
                        View all medicines ({catalogList.total})
                      </Button>
                    )}
                  {catalogList.mode === "all" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setViewAll(false)}
                    >
                      Show recent
                    </Button>
                  )}
                </div>
                <div
                  ref={resultsRef}
                  onScroll={virtual.onScroll}
                  className="max-h-80 overflow-auto rounded-lg border"
                >
                  <div style={{ height: virtual.totalHeight, position: "relative" }}>
                    <div style={{ transform: `translateY(${virtual.offsetY}px)` }}>
                      {virtual.visible.map((m) => {
                        const price = Number(m.selling_price ?? 0);
                        const stock = Number(m.stock_qty ?? 0);
                        const outOfStock = stock <= 0;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={outOfStock}
                            onClick={() => addToCart(m)}
                            className="flex w-full items-center justify-between gap-2 border-b px-3 py-3 text-left text-sm last:border-0 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
                            style={{ height: 64 }}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{m.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {m.barcode ? (
                                  <span className="font-mono">{m.barcode}</span>
                                ) : (
                                  m.manufacturer || m.sku
                                )}
                                {m.batch_number ? ` · Batch ${m.batch_number}` : ""}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-semibold">{formatMoney(price, currency)}</div>
                              <Badge
                                variant={
                                  outOfStock || stock <= Number(m.reorder_level ?? 0)
                                    ? "danger"
                                    : "outline"
                                }
                              >
                                {outOfStock ? "Out of stock" : `Stock ${stock}`}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                      {virtual.visible.length === 0 && (
                        <p className="p-4 text-center text-sm text-muted-foreground">
                          No matching medicines.
                        </p>
                      )}
                    </div>
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
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Payments</h3>
              <Button
                size="sm"
                variant={splitMode ? "default" : "outline"}
                onClick={() => setSplitMode((v) => !v)}
              >
                {splitMode ? "Done" : "+ Split Payment"}
              </Button>
            </div>
            {/* Additional tender rows are created ONLY after the pharmacist
                explicitly activates split payment. Normal mode keeps a
                single Cash row. */}
            {splitMode && (
              <div className="grid grid-cols-3 gap-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!m.enabled}
                    title={m.name}
                    onClick={() => setTenders((prev) => addSplitTenderRow(prev, m.id))}
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
            )}

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
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={tenders.length <= 1}
                    onClick={() => setTenders(tenders.filter((_, j) => j !== i))}
                  >
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
              ) : cloud.state === "connected" ? (
                <Printer className="h-5 w-5" />
              ) : (
                <CloudOff className="h-5 w-5" />
              )}
              {busy
                ? "Saving…"
                : `Charge ${formatMoney(totals.grand_total, currency)}${cloud.state === "connected" ? "" : " (offline)"}`}
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
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setUnknownCode(null);
                    setScannerFocusSignal((x) => x + 1);
                  }}
                >
                  Dismiss
                </Button>
                <Button type="submit" disabled={busy}>Add &amp; scan again</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saved to the local SQLite store — searchable and scannable immediately.
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
