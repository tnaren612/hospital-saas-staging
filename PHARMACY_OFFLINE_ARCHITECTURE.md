# Pharmacy Offline Architecture

**Status:** Analysis complete — this is the approved design gate. No code is changed by this document.
**Goal:** A single Pharmacy product that runs standalone offline (SQLite / Excel), connected to Supabase/PostgreSQL (Hospital mode), or hybrid (local SQLite + cloud sync) — **without regressing any existing working hospital/pharmacy functionality.**

---

## 1. Current architecture (verified)

The pharmacy is already a mature, **local-first** subsystem inside the Next.js app:

- **All pharmacy UI writes go through an offline-first layer**, never directly to the server:
  `Component → enqueueMutation(storage, …) → IndexedDB mutation queue + entity cache → SyncEngine → /api/admin/pharmacy/sync`.
- **`src/lib/pharmacy/offline/`** owns: `OfflineStorage` interface (IndexedDB + in-memory impls), `SyncEngine` (transport-agnostic push/pull, last-write-wins, backoff, conflict statuses, integrity counters), `queue` helpers (dedupe, backoff), `SyncTransport` protocol + `createHttpSyncTransport`.
- **`/api/admin/pharmacy/sync`** exists and works: GET pull (filtered by `updated_at >= since`), POST push (idempotent via `pharmacy_sync_ledger` keyed by `op_id`). Server apply paths exist for `sale/return/held_bill/branch/shift/settings`; **medicine/customer/supplier/purchase_order/category currently return `blocked`** (kept queued, never dropped).
- **`pharmacy/service.ts`** talks to Supabase directly (service-role client), falling back to an in-memory demo store when Supabase is not configured. It does **not** use the DataHub `DataProvider`.
- **DataHub** (`src/lib/datahub/`) has a generic, backend-agnostic `DataProvider` interface (`listTables/count/browse/upsertRows/deleteById/existingKeys`), currently **only** implemented by `supabaseProvider()`. `makeProvider()` (in `datahub/_lib.ts`) hard-codes Supabase.
- **POS** (`pos-offline.ts`) is a pure settlement layer (builds queue-ready payloads + receipts, handles split/partial/credit/insurance tenders) but **does NOT deduct local stock** — stock validation/decrement happens only server-side in `createPosSale` (Supabase branch).
- **Excel today is import/export only** (client-side), not a live storage provider.

### Reusable (already built, keep)
- `OfflineStorage` interface — the exact seam to swap IndexedDB → SQLite/Excel.
- `SyncEngine` + `SyncTransport` + sync route + `pharmacy_sync_ledger` idempotency — the hybrid-sync core.
- Cart/tax math (`cart.ts`, `tax.ts`, `payments.ts` settle), receipt HTML engines (`receipt.ts`, `print-engine.ts`, `receipt-enhance.ts`), barcode (`scan/generate/feedback`), importer/exporter, `useVirtualList`, `pos-offline.ts` settlement, `computeTotals`/`buildPosPayload`/`buildReceiptData`.
- All 15 pharmacy UI components (POS, Inventory, Purchases, Returns, Payments, Settlement, Party, Reports, Export, Import, OfflineSync, LabelPrinter, ReceiptPreview, BarcodeScanner) are local-first and already consume the abstractions.

### Gaps (this initiative closes)
1. **No local SQLite / Excel storage providers.**
2. **No storage-mode selection** (config) or provider factory — `makeProvider()` hard-codes Supabase.
3. **No offline stock deduction + immutable ledger** in the POS path (today stock decrement is Supabase-only).
4. **No server apply paths** for medicine/customer/supplier/purchase_order/category (they stay `blocked`).
5. **Missing concrete entity types** for `MedicineBatch`, `Purchase`/`PurchaseOrder`, `SaleItem`, `Customer`, `Supplier`, `Patient` in `pharmacy/`.
6. **`barcode/scan.ts resolveScan` is exact-match only** (no fuzzy fallback the comment claims).
7. **Two latent type errors** to preempt: `EntityRecord` must be made generic (`offline/storage.ts:19`); `OfflineStorage` should be imported from the barrel/storage, not `./types`.
8. **No backup/restore for the local store** and **no first-run setup wizard / standalone config**.

---

## 2. Provider design

Extend the existing generic `DataProvider` (kept intact) with two new implementations and a selection factory. **Business logic and UI must not depend on a concrete provider.**

```
DataProvider  (src/lib/datahub/provider.ts — unchanged interface)
   ├── supabaseProvider()   // PRESERVED exactly as-is
   ├── sqliteProvider()     // NEW — node:sqlite (Node ≥22.5; we're on v24)
   └── excelProvider()      // NEW — SheetJS workbook (xlsx@0.18.5 already present)
```

- Rows remain **keyed by registry field-key**, so `browse/upsertRows/count/existingKeys` work identically across backends. SQLite/Excel map table-name → storage location and translate field-key ↔ column like the Supabase provider already does.
- New factory `createDataProvider(mode, opts?)` in `datahub/provider.ts`, and `makeProvider()` in `datahub/_lib.ts` now reads the resolved **storage mode** from pharmacy/hospital config instead of hard-coding Supabase.
- **Storage modes** (new `storage_mode` on `PharmacySettings`):
  - `supabase` — Integrated Hospital mode (existing behavior, **unchanged**).
  - `sqlite` — Standalone local mode.
  - `excel` — Single-user workbook mode (warn: not for concurrent/multi-user).
  - `hybrid` — Local SQLite for immediate ops + Supabase sync.

### Pharmacy domain service on top of DataProvider
Rather than forcing pharmacy's rich logic onto the generic CRUD interface, add a thin **`PharmacyStore`** domain adapter that composes `DataProvider` for entities (medicines, batches, sales, purchases, customers, suppliers, returns) and adds the **transactional stock engine** (see §6). The existing `pharmacy/service.ts` Supabase path is preserved; `PharmacyStore` is used by new/standalone routes and the offline apply paths. This keeps pharmacy domain logic decoupled from any provider and from the hospital UI.

---

## 3. SQLite strategy

- **Driver:** Node's built-in **`node:sqlite` (`DatabaseSync`)** — zero new dependency, native, synchronous, ACID, available on the deployed Node (v24). Selected over better-sqlite3/sql.js because it needs no native build and no WASM download (critical for an offline install).
- **Where:** server-side, on-disk file (`PHARMACY.db`), path from config/env (default `<repo>/.data/pharmacy.sqlite`). The pharmacy runs the Next server locally on the LAN — internet/cloud not required for local operations.
- **Schema:** relational tables mirroring the existing Supabase schema so hybrid sync is a field-for-field copy:
  `medicines, medicine_batches, inventory, customers, suppliers, purchase_orders, purchase_items, sales, sale_items, payments, returns, return_items, settings, branches, shifts, sync_ledger, stock_movements, audit_log`.
  Every table has `id TEXT PRIMARY KEY` (client-generated UUID), `created_at`, `updated_at`.
- **Transactions:** `DatabaseSync` transactions wrap every multi-statement op (sale = stock deduction + sale insert + ledger insert atomically). `WAL` journaling for concurrency; `foreign_keys = ON`.
- **`sqliteProvider()` implements `DataProvider`**: `listTables` (registered tables), `count`, `browse` (SQL WHERE/LIKE/ORDER/LIMIT), `upsertRows` (INSERT … ON CONFLICT / explicit upsert), `deleteById`, `existingKeys`.
- **Bundling:** `node:sqlite` is a `node:`-prefixed builtin; verified available in the Node runtime. Confirm Next treats it as external (it does for `node:` modules) during M1.
- **Testability:** pure functions over `DatabaseSync`; tests run in Node against in-memory (`:memory:`) or temp-file databases.

---

## 4. Excel strategy

- **Driver:** existing **SheetJS `xlsx@0.18.5`** (already a dependency).
- **Scope warning surfaced in UI:** Excel is for **small / single-user** deployments only; not safe for concurrent multi-user writes. The UI shows this warning when `storage_mode === 'excel'`.
- **Workbook = one file per table domain** (or one workbook with the required sheets):
  `Medicines, Inventory, Batches, Patients, Customers, Suppliers, Purchases, PurchaseItems, Sales, SaleItems, Payments, Returns, Settings, AuditLog`.
  - Sheets auto-created with header rows (from the registry field labels) if missing.
  - Row key = `id` column; `_updated_at`/`_deleted` meta columns for sync.
- **`excelProvider()` implements `DataProvider`**: read = parse workbook → array-of-objects; write = mutate in-memory workbook then **atomic temp-file replacement** (`write <name>.tmp`, rename) to avoid corrupting the live file on crash.
- **Safety:** never silently overwrite corrupt/invalid workbook data — validate on open (required sheets + headers); on failure, fail loudly (and attempt a `.bak` recovery copy). Implement `create/read/update/delete/find/search/pagination/duplicate detection/backup/restore` at the provider level.
- **Concurrency guard:** a write-lock (single-flight promise) prevents overlapping writes within one process; documents the single-user limitation.

---

## 5. Sync design (hybrid mode)

Reuse the existing `SyncEngine`/`SyncTransport`/`pharmacy_sync_ledger`. Changes:

- **Server apply paths:** add apply handlers for `medicine`, `customer`, `supplier`, `purchase_order`, `category` on `/api/admin/pharmacy/sync`, backed by `PharmacyStore` so the target backend is `sqlite` (standalone/hybrid local side) or `supabase` (hospital side). Remove the blanket `blocked` for these entities.
- **Idempotency is already correct** (`op_id` ledger) — retries never duplicate a sale. Preserve this invariant.
- **Watermark:** keep `lastSync::<entity>` cursors; add `last-sync-watermark` meta for the whole run.
- **Conflict detection:** LWW by `updatedAt` today; keep it, and record conflicts in the audit trail. Add manual-retry + failed-queue surfaced in `offline-sync-view` (already renders `failed`/`conflict`).
- **Never double-push:** the existing `findDedupCandidate` dedupe on enqueue stays.

---

## 6. Inventory transaction integrity (offline POS)

Add a **stock engine** in `PharmacyStore` used by both local (SQLite/Excel) and offline POS:

- Every stock change writes an **immutable `stock_movements` ledger** entry (`in/out/adjust/return_in/return_out/transfer/damaged/expired`) with `medicine_id, batch_id, qty, reason, ref, created_at`.
- **Invariants (hard):**
  - `stock_qty` never goes negative (guard before every `out`).
  - selling an expired batch is rejected (`expiry_date > today`).
  - selling more than available quantity is rejected.
- Operations: `addStock`, `purchaseStock`, `adjustStock`, `saleStockReduction`, `salesReturn`, `purchaseReturn`, `damagedStock`, `expiredStock`, `transferStock`, `lowStock`, `nearExpiry`.
- **Offline POS stock flow:** scan → batch → expiry → stock → cart → pay → **decrement local stock + ledger entry atomically** → invoice → queue cloud sync. This closes the current gap where offline sales never decrement local stock.

---

## 7. Schema changes

- **SQLite schema** (new, see §3) — mirrors Supabase tables.
- **Supabase migrations (additive, never modify prior):** `048_pharmacy_offline.sql` adds:
  - `medicine_batches` (id, medicine_id, batch_number, expiry_date, mrp, purchase_price, selling_price, stock_qty, is_active, timestamps) — batch-level stock (today batch is a column on `medicines`).
  - `inventory` or extend `medicines` with `batch_tracking`, `min/max_stock` (already partially in 045).
  - `pharmacy_payments` (id, sale_id, method, amount, reference, status pending/confirmed/unverified, created_at) — **offline payment recording with `unverified` status** for gateway methods not confirmed online.
  - `sync_ledger` already exists (047) — extend apply paths, no schema change needed.
- **PharmacySettings:** add `storage_mode ('supabase'|'sqlite'|'excel'|'hybrid')`, `db_path`, `excel_file`, `auto_backup`, `backup_keep`, `default_currency`, `duplicate_medicine_keys` (array of field keys used for duplicate matching).
- **Payments offline:** record gateway/network-dependent methods as `pending`/`unverified` (never fake a confirmed authorization). `cash/upi/wallet/card` are locally recordable; `insurance/credit` deferred.

---

## 8. Security implications

- **`node:sqlite` runs server-side only** — the DB file must never be served or shipped to the browser. Guard routes with existing `requireHmsAdmin(pharmacy)` + CSRF (`requireSameOriginForMutation`).
- **Path traversal:** validate `db_path`/`excel_file` resolve inside an allowed data directory.
- **SQL injection:** use parameterized statements only (never string-concat user input into SQL).
- **Excel provider:** sanitize cells as strings (existing `escapeSpreadsheetCell` pattern) on export to prevent formula injection; validate on import.
- **Sync:** preserve existing auth gate; `unverified` payments must not be reported as collected revenue until confirmed.
- **Backups:** back up only to the configured data directory; verify checksum before restore.

---

## 9. Implementation phases (incremental — verify each before the next)

Run `npm run lint` (ESLint on changed files) + `npx tsc --noEmit` + `npm test` + `next build` after **every** milestone.

1. **M1 SQLiteProvider + schema + tests** — `node:sqlite` adapter, DDL/schema, `sqliteProvider()` implements `DataProvider`, unit tests (browse/upsert/count/existingKeys, transactions, negative-stock guard).
2. **M2 ExcelProvider + tests** — workbook CRUD provider, atomic writes, schema-validate-on-open, duplicate detection, backup/restore, unit tests (read/write/atomic).
3. **M3 Standalone config + setup wizard** — `storage_mode` on settings, `createDataProvider` factory + `makeProvider()` selection, first-run setup wizard (name→logo→address→GSTIN→drug license→currency/tax→payment methods→printer→storage mode→admin account).
4. **M4 Offline POS + inventory integrity** — `PharmacyStore` stock engine (ledger + guards), wire offline sale to decrement local stock atomically, duplicate-medicine detection UI ("Possible existing medicine found" → View/Edit/Cancel).
5. **M5 Payments + receipt/printing** — payment methods incl. partial/split/insurance/credit, offline `pending`/`unverified` recording, invoice/receipt (58/80/A4/GST, print preview, download PDF, reprint) via existing `print-engine.ts`.
6. **M6 Barcode + labels** — `resolveScan` fuzzy fallback, camera scan fallback, unknown-barcode → Add Medicine, duplicate-SKU/barcode prevention, label printing (existing `label-printer.tsx`).
7. **M7 Hybrid sync** — server apply paths for medicine/customer/supplier/purchase_order/category, retry/backoff + failed queue + manual retry + watermark + audit (reuse SyncEngine).
8. **M8 Backup/restore** — Backup Now, auto-backup, restore with integrity verify + preview + safety backup, export Excel/JSON.
9. **M9 E2E + production validation** — duplicate/expired/insufficient-stock/offline-sale/offline-payment/inventory-deduction/rollback/invoice/reprint/Excel-RW/SQLite-RW/sync-retry/idempotency/conflict/backup-restore tests; full build; no-regression check of existing hospital + pharmacy.

---

## 10. Non-goals / boundaries
- Do **not** rewrite the existing Supabase provider or the existing offline IndexedDB layer.
- Do **not** tightly couple pharmacy domain logic to the hospital UI or to a specific provider.
- Excel mode is **not** recommended for concurrent multi-user production — surface the warning.
