import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createNotification, requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import {
  adjustmentSchema, categorySchema, inventoryItemSchema, inventoryItemUpdateSchema, purchaseOrderSchema,
  receiptSchema, supplierSchema, transferSchema, locationSchema,
} from "@/lib/inventory/validation";

const roles = [ROLES.PHARMACIST, ROLES.MANAGER, ROLES.BILLING];
const failure = (details: unknown) => NextResponse.json({ error: "Validation failed", details }, { status: 400 });

export async function GET(request: Request) {
  const g = await requireHmsAdmin(roles);
  if (g.error || !g.supabase) return g.error!;
  const tenant = await getTenantContext();
  if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const kind = new URL(request.url).searchParams.get("kind") || "dashboard";
  const h = tenant.hospitalId;
  if (kind === "items") {
    const { data, error } = await g.supabase.from("inventory_items")
      .select("*,inventory_categories(name),suppliers(name),inventory_stock(quantity,location_id,inventory_locations(name))")
      .eq("hospital_id", h).order("name");
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ data });
  }
  if (kind === "suppliers") {
    const { data, error } = await g.supabase.from("suppliers").select("*,supplier_contacts(*)").eq("hospital_id", h).order("name");
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ data });
  }
  if (kind === "purchase_orders") {
    const { data, error } = await g.supabase.from("purchase_orders")
      .select("*,suppliers(name),inventory_locations(name),purchase_order_items(*,inventory_items(name,item_code))")
      .eq("hospital_id", h).order("created_at", { ascending: false });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ data });
  }
  if (kind === "movements") {
    const { data, error } = await g.supabase.from("inventory_stock_movements")
      .select("*,inventory_items(name,item_code),inventory_locations(name)").eq("hospital_id", h)
      .order("created_at", { ascending: false }).limit(500);
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ data });
  }
  if (kind === "master") {
    const [categories, locations, items, suppliers] = await Promise.all([
      g.supabase.from("inventory_categories").select("*").eq("hospital_id", h).order("name"),
      g.supabase.from("inventory_locations").select("*").eq("hospital_id", h).order("name"),
      g.supabase.from("inventory_items").select("id,item_code,name,purchase_price,reorder_level,expiry_tracking,batch_tracking,serial_tracking").eq("hospital_id", h).eq("status", "active").order("name"),
      g.supabase.from("suppliers").select("id,supplier_code,name").eq("hospital_id", h).eq("status", "active").order("name"),
    ]);
    return NextResponse.json({ data: { categories: categories.data || [], locations: locations.data || [], items: items.data || [], suppliers: suppliers.data || [] } });
  }
  const [stock, items, orders, batches, receipts, suppliers] = await Promise.all([
    g.supabase.from("inventory_stock").select("quantity,inventory_items(purchase_price,reorder_level)").eq("hospital_id", h),
    g.supabase.from("inventory_items").select("id,reorder_level,inventory_stock(quantity)").eq("hospital_id", h).eq("status", "active"),
    g.supabase.from("purchase_orders").select("id,status").eq("hospital_id", h),
    g.supabase.from("inventory_expiry_batches").select("quantity,expiry_date").eq("hospital_id", h).gt("quantity", 0),
    g.supabase.from("goods_receipts").select("quantity,unit_cost,received_at").eq("hospital_id", h).gte("received_at", new Date().toISOString().slice(0, 10)),
    g.supabase.from("suppliers").select("id,status,rating").eq("hospital_id", h),
  ]);
  const now = new Date(), near = new Date(Date.now() + 90 * 86_400_000);
  const stockRows = (stock.data || []) as unknown as { quantity: number; inventory_items?: { purchase_price: number; reorder_level: number } | null }[];
  const itemRows = (items.data || []) as unknown as { reorder_level: number; inventory_stock?: { quantity: number }[] }[];
  const totalFor = (item: typeof itemRows[number]) => (item.inventory_stock || []).reduce((sum, row) => sum + Number(row.quantity), 0);
  return NextResponse.json({ data: {
    stock_value: stockRows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.inventory_items?.purchase_price || 0), 0),
    today_receipts: (receipts.data || []).reduce((sum, row) => sum + Number(row.quantity) * Number(row.unit_cost), 0),
    low_stock: itemRows.filter((item) => totalFor(item) > 0 && totalFor(item) <= Number(item.reorder_level)).length,
    out_of_stock: itemRows.filter((item) => totalFor(item) <= 0).length,
    expired: (batches.data || []).filter((batch) => batch.expiry_date && new Date(batch.expiry_date) < now).length,
    near_expiry: (batches.data || []).filter((batch) => batch.expiry_date && new Date(batch.expiry_date) >= now && new Date(batch.expiry_date) <= near).length,
    pending_orders: (orders.data || []).filter((order) => ["submitted", "approved", "partially_received"].includes(order.status)).length,
    suppliers: { active: (suppliers.data || []).filter((supplier) => supplier.status === "active").length, average_rating: (suppliers.data || []).reduce((sum, supplier) => sum + Number(supplier.rating), 0) / Math.max(1, (suppliers.data || []).length) },
  }});
}

export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request); if (csrf) return csrf;
  const g = await requireHmsAdmin(roles); if (g.error || !g.supabase || !g.session) return g.error!;
  const tenant = await getTenantContext(); if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const body = await request.json().catch(() => ({})); const action = String(body.action || "");
  const h = tenant.hospitalId, actor = g.session.user.id;
  if (action === "category") {
    const p = categorySchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const result = await g.supabase.from("inventory_categories").insert({ ...p.data, hospital_id: h }).select("*").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 409 }) : NextResponse.json({ data: result.data }, { status: 201 });
  }
  if (action === "category_update" || action === "category_delete") {
    const id = String(body.id || "");
    const patch = action === "category_delete" ? { status: "inactive" } : categorySchema.partial().parse(body);
    const result = await g.supabase.from("inventory_categories").update(patch).eq("id", id).eq("hospital_id", h).select("*").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json({ data: result.data });
  }
  if (action === "location") {
    const p = locationSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const result = await g.supabase.from("inventory_locations").insert({ ...p.data, hospital_id: h }).select("*").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 409 }) : NextResponse.json({ data: result.data }, { status: 201 });
  }
  if (action === "item") {
    const p = inventoryItemSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const result = await g.supabase.from("inventory_items").insert({ ...p.data, barcode: p.data.barcode || null, hospital_id: h, created_by: actor, updated_by: actor }).select("*").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 409 }) : NextResponse.json({ data: result.data }, { status: 201 });
  }
  if (action === "item_update" || action === "item_delete") {
    const id = String(body.id || "");
    const patch = action === "item_delete" ? { status: "discontinued", updated_by: actor } : { ...inventoryItemUpdateSchema.parse(body), updated_by: actor };
    const result = await g.supabase.from("inventory_items").update(patch).eq("id", id).eq("hospital_id", h).select("*").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json({ data: result.data });
  }
  if (action === "recall_batch") {
    const id = String(body.id || ""), reason = String(body.reason || "").trim();
    if (!reason) return failure("Recall reason required");
    const result = await g.supabase.from("inventory_expiry_batches").update({ recalled: true, recall_reason: reason }).eq("id", id).eq("hospital_id", h).select("*").single();
    if(result.error)return NextResponse.json({error:result.error.message},{status:400});
    await createNotification(g.supabase,{type:"inventory_batch_recalled",title:"Inventory batch recalled",message:`Batch ${result.data.batch_number} recalled: ${reason}`,meta:{batch_id:result.data.id,item_id:result.data.item_id,hospital_id:h}});
    return NextResponse.json({data:result.data});
  }
  if (action === "supplier") {
    const p = supplierSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const { contact, ...supplier } = p.data;
    const result = await g.supabase.from("suppliers").insert({ ...supplier, hospital_id: h }).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
    if (contact) await g.supabase.from("supplier_contacts").insert({ ...contact, hospital_id: h, supplier_id: result.data.id, is_primary: true });
    return NextResponse.json({ data: result.data }, { status: 201 });
  }
  if (action === "supplier_update" || action === "supplier_delete") {
    const id = String(body.id || ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return failure("Invalid supplier");
    const patch = action === "supplier_delete" ? { status: "inactive" } : supplierSchema.omit({ contact: true }).partial().parse(body);
    const result = await g.supabase.from("suppliers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("hospital_id", h).select("*").single();
    return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json({ data: result.data });
  }
  if (action === "purchase_order") {
    const p = purchaseOrderSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const subtotal = p.data.items.reduce((sum, item) => sum + item.ordered_quantity * item.unit_price, 0);
    const tax = p.data.items.reduce((sum, item) => sum + item.ordered_quantity * item.unit_price * item.gst_percent / 100, 0);
    const result = await g.supabase.from("purchase_orders").insert({ hospital_id: h, po_number: "", supplier_id: p.data.supplier_id, location_id: p.data.location_id, expected_date: p.data.expected_date || null, notes: p.data.notes, subtotal, tax_amount: tax, total_amount: subtotal + tax, created_by: actor }).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    const lines = p.data.items.map((item) => ({ ...item, hospital_id: h, purchase_order_id: result.data.id }));
    const lineResult = await g.supabase.from("purchase_order_items").insert(lines);
    if (lineResult.error) return NextResponse.json({ error: lineResult.error.message }, { status: 400 });
    await createNotification(g.supabase,{type:"inventory_purchase_created",title:"Purchase order created",message:`${result.data.po_number} created`,meta:{purchase_order_id:result.data.id,hospital_id:h}});
    return NextResponse.json({ data: result.data }, { status: 201 });
  }
  if (action === "approve_purchase_order") {
    const result = await g.supabase.from("purchase_orders").update({ status: "approved", approved_by: actor, approved_at: new Date().toISOString() }).eq("id", body.id).eq("hospital_id", h).in("status", ["draft", "submitted"]).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
    await createNotification(g.supabase, { type: "inventory_purchase_approved", title: "Purchase order approved", message: `${result.data.po_number} approved`, meta: { purchase_order_id: result.data.id, hospital_id: h } });
    return NextResponse.json({ data: result.data });
  }
  if (action === "receive") {
    const p = receiptSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const { data: line } = await g.supabase.from("purchase_order_items").select("*").eq("purchase_order_id", p.data.purchase_order_id).eq("item_id", p.data.item_id).eq("hospital_id", h).maybeSingle();
    if (!line || Number(line.received_quantity) + p.data.quantity > Number(line.ordered_quantity)) return NextResponse.json({ error: "Receipt exceeds outstanding quantity" }, { status: 409 });
    const receipt = await g.supabase.from("goods_receipts").insert({ ...p.data, hospital_id: h, grn_number: "", received_by: actor }).select("*").single();
    if (receipt.error) return NextResponse.json({ error: receipt.error.message }, { status: 400 });
    await g.supabase.from("inventory_stock_movements").insert({ hospital_id: h, item_id: p.data.item_id, location_id: p.data.location_id, movement_type: "receipt", direction: "in", quantity: p.data.quantity, unit_cost: p.data.unit_cost, reference_type: "goods_receipt", reference_id: receipt.data.id, batch_number: p.data.batch_number || null, serial_number: p.data.serial_number || null, performed_by: actor });
    if (p.data.batch_number || p.data.serial_number || p.data.expiry_date) await g.supabase.from("inventory_expiry_batches").upsert({ hospital_id: h, item_id: p.data.item_id, location_id: p.data.location_id, batch_number: p.data.batch_number || "UNBATCHED", serial_number: p.data.serial_number || null, expiry_date: p.data.expiry_date || null, quantity: p.data.quantity }, { onConflict: "hospital_id,item_id,location_id,batch_number,serial_number" });
    const received = Number(line.received_quantity) + p.data.quantity;
    await g.supabase.from("purchase_order_items").update({ received_quantity: received }).eq("id", line.id);
    const { data: remaining } = await g.supabase.from("purchase_order_items").select("ordered_quantity,received_quantity").eq("purchase_order_id", p.data.purchase_order_id);
    const complete = (remaining || []).every((row) => Number(row.received_quantity) >= Number(row.ordered_quantity));
    await g.supabase.from("purchase_orders").update({ status: complete ? "received" : "partially_received" }).eq("id", p.data.purchase_order_id).eq("hospital_id", h);
    await createNotification(g.supabase, { type: "inventory_goods_received", title: "Goods received", message: `${receipt.data.grn_number} received`, meta: { goods_receipt_id: receipt.data.id, hospital_id: h } });
    if(p.data.expiry_date){
      const days=Math.ceil((new Date(p.data.expiry_date).getTime()-Date.now())/86_400_000);
      if(days<=90)await createNotification(g.supabase,{type:days<0?"inventory_expired":"inventory_near_expiry",title:days<0?"Expired stock received":"Stock nearing expiry",message:`${receipt.data.grn_number} batch ${p.data.batch_number||"UNBATCHED"} expires ${p.data.expiry_date}`,meta:{goods_receipt_id:receipt.data.id,item_id:p.data.item_id,hospital_id:h}});
    }
    return NextResponse.json({ data: receipt.data }, { status: 201 });
  }
  if (action === "transfer") {
    const p = transferSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const transfer = await g.supabase.from("inventory_transfers").insert({ ...p.data, hospital_id: h, transfer_number: "", requested_by: actor, completed_by: actor, completed_at: new Date().toISOString() }).select("*").single();
    if (transfer.error) return NextResponse.json({ error: transfer.error.message }, { status: 400 });
    const movements = [
      { hospital_id: h, item_id: p.data.item_id, location_id: p.data.from_location_id, movement_type: "transfer_out", direction: "out", quantity: p.data.quantity, reference_type: "transfer", reference_id: transfer.data.id, batch_number: p.data.batch_number || null, serial_number: p.data.serial_number || null, performed_by: actor },
      { hospital_id: h, item_id: p.data.item_id, location_id: p.data.to_location_id, movement_type: "transfer_in", direction: "in", quantity: p.data.quantity, reference_type: "transfer", reference_id: transfer.data.id, batch_number: p.data.batch_number || null, serial_number: p.data.serial_number || null, performed_by: actor },
    ];
    const movement = await g.supabase.from("inventory_stock_movements").insert(movements);
    if (movement.error) return NextResponse.json({ error: movement.error.message }, { status: 409 });
    await createNotification(g.supabase, { type: "inventory_transfer_completed", title: "Stock transfer completed", message: `${transfer.data.transfer_number} completed`, meta: { transfer_id: transfer.data.id, hospital_id: h } });
    return NextResponse.json({ data: transfer.data }, { status: 201 });
  }
  if (action === "adjustment") {
    const p = adjustmentSchema.safeParse(body); if (!p.success) return failure(p.error.flatten());
    const adjustment = await g.supabase.from("inventory_adjustments").insert({ ...p.data, hospital_id: h, adjustment_number: "", created_by: actor, approved_by: actor }).select("*").single();
    if (adjustment.error) return NextResponse.json({ error: adjustment.error.message }, { status: 400 });
    const incoming = ["increase", "return"].includes(p.data.adjustment_type);
    const movement = await g.supabase.from("inventory_stock_movements").insert({ hospital_id: h, item_id: p.data.item_id, location_id: p.data.location_id, movement_type: p.data.adjustment_type === "increase" || p.data.adjustment_type === "decrease" ? "adjustment" : p.data.adjustment_type, direction: incoming ? "in" : "out", quantity: p.data.quantity, reason: p.data.reason, reference_type: "adjustment", reference_id: adjustment.data.id, performed_by: actor });
    if (movement.error) return NextResponse.json({ error: movement.error.message }, { status: 409 });
    const { data: stock } = await g.supabase.from("inventory_stock").select("quantity").eq("hospital_id", h).eq("item_id", p.data.item_id).eq("location_id", p.data.location_id).single();
    const { data: item } = await g.supabase.from("inventory_items").select("name,reorder_level").eq("hospital_id", h).eq("id", p.data.item_id).single();
    if (item && stock && Number(stock.quantity) <= Number(item.reorder_level)) await createNotification(g.supabase, { type: Number(stock.quantity) === 0 ? "inventory_out_of_stock" : "inventory_low_stock", title: Number(stock.quantity) === 0 ? "Out of stock" : "Low stock", message: `${item.name} has ${stock.quantity} remaining`, meta: { item_id: p.data.item_id, hospital_id: h } });
    await createNotification(g.supabase,{type:"inventory_adjustment_completed",title:"Inventory adjusted",message:`${adjustment.data.adjustment_number} completed`,meta:{adjustment_id:adjustment.data.id,item_id:p.data.item_id,hospital_id:h}});
    return NextResponse.json({ data: adjustment.data }, { status: 201 });
  }
  return NextResponse.json({ error: "Unsupported inventory action" }, { status: 400 });
}
