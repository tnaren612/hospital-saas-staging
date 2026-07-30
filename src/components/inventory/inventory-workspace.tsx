"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RecordRow = Record<string, unknown> & { id: string };
type Master = { categories: RecordRow[]; locations: RecordRow[]; items: RecordRow[]; suppliers: RecordRow[] };
const nav = [
  ["", "Dashboard"], ["items", "Items"], ["categories", "Categories"], ["suppliers", "Suppliers"],
  ["purchase-orders", "Purchase Orders"], ["goods-receipts", "Goods Receipt"], ["movements", "Stock Movement"],
  ["transfers", "Transfers"], ["adjustments", "Adjustments"], ["reports", "Reports"], ["settings", "Settings"],
];
const selectClass = "h-11 w-full rounded-xl border bg-background px-3";

export function InventoryWorkspace({ section = "" }: { section?: string }) {
  const [master, setMaster] = useState<Master>({ categories: [], locations: [], items: [], suppliers: [] });
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [dashboard, setDashboard] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [search, setSearch] = useState("");

  const kind = section === "suppliers" ? "suppliers" : section === "purchase-orders" || section === "goods-receipts" ? "purchase_orders" : section === "movements" ? "movements" : section === "items" ? "items" : "dashboard";
  const load = useCallback(async () => {
    const [masterResponse, dataResponse] = await Promise.all([fetch("/api/inventory?kind=master"), fetch(`/api/inventory?kind=${kind}`)]);
    const masterJson = await masterResponse.json(), dataJson = await dataResponse.json();
    if (masterResponse.ok) setMaster(masterJson.data);
    if (dataResponse.ok) {
      if (kind === "dashboard") setDashboard(dataJson.data);
      else setRows(dataJson.data || []);
    }
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (action: string, payload: Record<string, unknown>, success: string) => {
    const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const json = await response.json();
    if (!response.ok) { toast.error(json.error || "Inventory update failed"); return null; }
    toast.success(success); setForm({}); await load(); return json.data;
  };
  const value = (key: string) => String(form[key] ?? "");
  const set = (key: string, next: string | boolean) => setForm((current) => ({ ...current, [key]: next }));
  const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Inventory Management</h1><p className="text-sm text-muted-foreground">Purchasing, warehouse stock, suppliers, batches, expiry, valuation and audit.</p></div>
    <nav className="flex flex-wrap gap-2" aria-label="Inventory sections">{nav.map(([path, label]) => <Button key={path} size="sm" variant={section === path ? "default" : "outline"} asChild><Link href={`/admin/inventory${path ? `/${path}` : ""}`}>{label}</Link></Button>)}</nav>

    {!section && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(dashboard).filter(([,v]) => typeof v !== "object").map(([label, count]) => <Card key={label}><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">{label.replaceAll("_", " ")}</p><p className="text-2xl font-bold">{typeof count === "number" ? count.toLocaleString() : String(count)}</p></CardContent></Card>)}</div>}

    {section === "categories" && <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2"><Field label="Category name"><Input aria-label="Category name" value={value("name")} onChange={(e)=>set("name",e.target.value)}/></Field><Field label="Description"><Input aria-label="Category description" value={value("description")} onChange={(e)=>set("description",e.target.value)}/></Field><Button onClick={()=>void submit("category",{name:value("name"),description:value("description")},"Category created")}>Create category</Button><div className="md:col-span-2 text-sm">{master.categories.map((category)=><p key={category.id} className="border-b py-2">{String(category.name)}</p>)}</div></CardContent></Card>}

    {section === "items" && <><Card><CardContent className="grid gap-4 p-5 md:grid-cols-3">
      <Field label="Item code"><Input aria-label="Item code" value={value("item_code")} onChange={(e)=>set("item_code",e.target.value)}/></Field>
      <Field label="Barcode"><Input aria-label="Barcode" value={value("barcode")} onChange={(e)=>set("barcode",e.target.value)}/></Field>
      <Field label="Item name"><Input aria-label="Item name" value={value("name")} onChange={(e)=>set("name",e.target.value)}/></Field>
      <Field label="Generic name"><Input aria-label="Generic name" value={value("generic_name")} onChange={(e)=>set("generic_name",e.target.value)}/></Field>
      <Field label="Category"><select aria-label="Item category" className={selectClass} value={value("category_id")} onChange={(e)=>set("category_id",e.target.value)}><option value="">Uncategorized</option>{master.categories.map((row)=><option key={row.id} value={row.id}>{String(row.name)}</option>)}</select></Field>
      <Field label="Unit"><Input aria-label="Unit" value={value("unit")} onChange={(e)=>set("unit",e.target.value)}/></Field>
      <Field label="Manufacturer"><Input aria-label="Manufacturer" value={value("manufacturer")} onChange={(e)=>set("manufacturer",e.target.value)}/></Field>
      <Field label="HSN code"><Input aria-label="HSN code" value={value("hsn_code")} onChange={(e)=>set("hsn_code",e.target.value)}/></Field>
      <Field label="GST %"><Input aria-label="GST percent" type="number" value={value("gst_percent")} onChange={(e)=>set("gst_percent",e.target.value)}/></Field>
      <Field label="Purchase price"><Input aria-label="Purchase price" type="number" value={value("purchase_price")} onChange={(e)=>set("purchase_price",e.target.value)}/></Field>
      <Field label="Selling price"><Input aria-label="Selling price" type="number" value={value("selling_price")} onChange={(e)=>set("selling_price",e.target.value)}/></Field>
      <Field label="Reorder level"><Input aria-label="Reorder level" type="number" value={value("reorder_level")} onChange={(e)=>set("reorder_level",e.target.value)}/></Field>
      {["expiry_tracking","batch_tracking","serial_tracking"].map((key)=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form[key])} onChange={(e)=>set(key,e.target.checked)}/>{key.replaceAll("_"," ")}</label>)}
      <Button onClick={()=>void submit("item",{...form,barcode:value("barcode")||null,category_id:value("category_id")||null,purchase_price:Number(value("purchase_price")),selling_price:Number(value("selling_price")),gst_percent:Number(value("gst_percent")||0),reorder_level:Number(value("reorder_level")||0),minimum_stock:0},"Item created")}>Create item</Button>
    </CardContent></Card><Search value={search} onChange={setSearch}/><RowList rows={filtered} titleKeys={["item_code","name","generic_name"]}/></>}

    {section === "suppliers" && <><Card><CardContent className="grid gap-4 p-5 md:grid-cols-3">
      <Field label="Supplier code"><Input aria-label="Supplier code" value={value("supplier_code")} onChange={(e)=>set("supplier_code",e.target.value)}/></Field>
      <Field label="Supplier name"><Input aria-label="Supplier name" value={value("name")} onChange={(e)=>set("name",e.target.value)}/></Field>
      <Field label="GST/Tax number"><Input aria-label="Supplier tax number" value={value("tax_number")} onChange={(e)=>set("tax_number",e.target.value)}/></Field>
      <Field label="Contact name"><Input aria-label="Supplier contact name" value={value("contact_name")} onChange={(e)=>set("contact_name",e.target.value)}/></Field>
      <Field label="Contact email"><Input aria-label="Supplier contact email" value={value("contact_email")} onChange={(e)=>set("contact_email",e.target.value)}/></Field>
      <Field label="Contact phone"><Input aria-label="Supplier contact phone" value={value("contact_phone")} onChange={(e)=>set("contact_phone",e.target.value)}/></Field>
      <Button onClick={()=>void submit("supplier",{supplier_code:value("supplier_code"),name:value("name"),tax_number:value("tax_number")||null,address:"",payment_terms:"",rating:0,contact:{name:value("contact_name"),designation:"",email:value("contact_email")||null,phone:value("contact_phone")||null}},"Supplier created")}>Create supplier</Button>
    </CardContent></Card><Search value={search} onChange={setSearch}/><RowList rows={filtered} titleKeys={["supplier_code","name","status","rating"]}/></>}

    {section === "purchase-orders" && <><Card><CardContent className="grid gap-4 p-5 md:grid-cols-3">
      <Select label="PO supplier" options={master.suppliers} value={value("supplier_id")} onChange={(v)=>set("supplier_id",v)}/>
      <Select label="PO location" options={master.locations} value={value("location_id")} onChange={(v)=>set("location_id",v)}/>
      <Select label="PO item" options={master.items} value={value("item_id")} onChange={(v)=>set("item_id",v)}/>
      <Field label="Order quantity"><Input aria-label="Order quantity" type="number" value={value("quantity")} onChange={(e)=>set("quantity",e.target.value)}/></Field>
      <Field label="Unit price"><Input aria-label="PO unit price" type="number" value={value("unit_price")} onChange={(e)=>set("unit_price",e.target.value)}/></Field>
      <Button onClick={()=>void submit("purchase_order",{supplier_id:value("supplier_id"),location_id:value("location_id"),notes:"",items:[{item_id:value("item_id"),ordered_quantity:Number(value("quantity")),unit_price:Number(value("unit_price")),gst_percent:0}]},"Purchase order created")}>Create purchase order</Button>
    </CardContent></Card><RowList rows={filtered} titleKeys={["po_number","status","total_amount"]} action={(row)=>row.status==="draft"?<Button size="sm" onClick={()=>void submit("approve_purchase_order",{id:row.id},"Purchase order approved")}>Approve</Button>:null}/></>}

    {section === "goods-receipts" && <Card><CardContent className="grid gap-4 p-5 md:grid-cols-3">
      <Select label="Purchase order" options={rows.filter((row)=>["approved","partially_received"].includes(String(row.status))).map((row)=>({...row,name:row.po_number}))} value={value("purchase_order_id")} onChange={(v)=>set("purchase_order_id",v)}/>
      <Select label="Receipt item" options={master.items} value={value("item_id")} onChange={(v)=>set("item_id",v)}/>
      <Select label="Receipt location" options={master.locations} value={value("location_id")} onChange={(v)=>set("location_id",v)}/>
      <Field label="Received quantity"><Input aria-label="Received quantity" type="number" value={value("quantity")} onChange={(e)=>set("quantity",e.target.value)}/></Field>
      <Field label="Receipt unit cost"><Input aria-label="Receipt unit cost" type="number" value={value("unit_cost")} onChange={(e)=>set("unit_cost",e.target.value)}/></Field>
      <Field label="Batch number"><Input aria-label="Batch number" value={value("batch_number")} onChange={(e)=>set("batch_number",e.target.value)}/></Field>
      <Field label="Serial number"><Input aria-label="Serial number" value={value("serial_number")} onChange={(e)=>set("serial_number",e.target.value)}/></Field>
      <Field label="Expiry date"><Input aria-label="Expiry date" type="date" value={value("expiry_date")} onChange={(e)=>set("expiry_date",e.target.value)}/></Field>
      <Button onClick={()=>void submit("receive",{...form,quantity:Number(value("quantity")),unit_cost:Number(value("unit_cost")),batch_number:value("batch_number")||null,serial_number:value("serial_number")||null,expiry_date:value("expiry_date")||null},"Goods received")}>Receive goods</Button>
    </CardContent></Card>}

    {section === "transfers" && <MovementForm master={master} form={form} set={set} button="Complete transfer" onSubmit={()=>submit("transfer",{item_id:value("item_id"),from_location_id:value("from_location_id"),to_location_id:value("to_location_id"),quantity:Number(value("quantity")),batch_number:value("batch_number")||null},"Stock transferred")} transfer/>}
    {section === "adjustments" && <MovementForm master={master} form={form} set={set} button="Post adjustment" onSubmit={()=>submit("adjustment",{item_id:value("item_id"),location_id:value("location_id"),adjustment_type:value("adjustment_type"),quantity:Number(value("quantity")),reason:value("reason")},"Stock adjusted")}/>}
    {section === "movements" && <><Search value={search} onChange={setSearch}/><RowList rows={filtered} titleKeys={["movement_type","direction","quantity","reason","created_at"]}/></>}
    {section === "reports" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{["stock","low_stock","movements","consumption","expiry","purchases","suppliers","audit"].map((type)=><Button key={type} variant="outline" asChild><a href={`/api/inventory/report?type=${type}`}>Export {type.replaceAll("_"," ")} report</a></Button>)}</div>}
    {section === "settings" && <><Card><CardContent className="grid gap-4 p-5 md:grid-cols-3"><Field label="Location code"><Input aria-label="Location code" value={value("code")} onChange={(e)=>set("code",e.target.value)}/></Field><Field label="Location name"><Input aria-label="Location name" value={value("name")} onChange={(e)=>set("name",e.target.value)}/></Field><Field label="Location type"><select aria-label="Location type" className={selectClass} value={value("location_type")} onChange={(e)=>set("location_type",e.target.value)}>{["warehouse","store_room","pharmacy","laboratory","radiology","emergency","department"].map((x)=><option key={x}>{x}</option>)}</select></Field><Button onClick={()=>void submit("location",{code:value("code"),name:value("name"),location_type:value("location_type")||"store_room"},"Location created")}>Create location</Button></CardContent></Card><RowList rows={master.locations} titleKeys={["code","name","location_type","status"]}/></>}
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <div><Label>{label}</Label>{children}</div>; }
function Search({value,onChange}:{value:string;onChange:(value:string)=>void}) { return <Input aria-label="Inventory search" placeholder="Search item, barcode, category, supplier, location, batch or serial" value={value} onChange={(e)=>onChange(e.target.value)}/>; }
function Select({label,options,value,onChange}:{label:string;options:RecordRow[];value:string;onChange:(v:string)=>void}) { return <Field label={label}><select aria-label={label} className={selectClass} value={value} onChange={(e)=>onChange(e.target.value)}><option value="">Select</option>{options.map((row)=><option key={row.id} value={row.id}>{String(row.name||row.item_code||row.id)}</option>)}</select></Field>; }
function RowList({rows,titleKeys,action}:{rows:RecordRow[];titleKeys:string[];action?:(row:RecordRow)=>React.ReactNode}) { return <div className="space-y-2">{rows.map((row)=><Card key={row.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">{titleKeys.map((key)=>String(row[key]??"")).filter(Boolean).join(" · ")}</p>{action?.(row)}</CardContent></Card>)}</div>; }
function MovementForm({master,form,set,button,onSubmit,transfer=false}:{master:Master;form:Record<string,string|boolean>;set:(k:string,v:string|boolean)=>void;button:string;onSubmit:()=>Promise<unknown>;transfer?:boolean}) {
 const v=(key:string)=>String(form[key]??""); return <Card><CardContent className="grid gap-4 p-5 md:grid-cols-3"><Select label="Movement item" options={master.items} value={v("item_id")} onChange={(x)=>set("item_id",x)}/>{transfer?<><Select label="From location" options={master.locations} value={v("from_location_id")} onChange={(x)=>set("from_location_id",x)}/><Select label="To location" options={master.locations} value={v("to_location_id")} onChange={(x)=>set("to_location_id",x)}/></>:<><Select label="Adjustment location" options={master.locations} value={v("location_id")} onChange={(x)=>set("location_id",x)}/><Field label="Adjustment type"><select aria-label="Adjustment type" className={selectClass} value={v("adjustment_type")} onChange={(e)=>set("adjustment_type",e.target.value)}><option value="">Select</option>{["increase","decrease","damage","expired","lost","return"].map((x)=><option key={x}>{x}</option>)}</select></Field></>}<Field label="Movement quantity"><Input aria-label="Movement quantity" type="number" value={v("quantity")} onChange={(e)=>set("quantity",e.target.value)}/></Field>{transfer?<Field label="Transfer batch"><Input aria-label="Transfer batch" value={v("batch_number")} onChange={(e)=>set("batch_number",e.target.value)}/></Field>:<Field label="Adjustment reason"><Input aria-label="Adjustment reason" value={v("reason")} onChange={(e)=>set("reason",e.target.value)}/></Field>}<Button onClick={()=>void onSubmit()}>{button}</Button></CardContent></Card>;
}
