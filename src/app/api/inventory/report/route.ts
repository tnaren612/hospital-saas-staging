import { NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { requireHmsAdmin } from "@/lib/hms/server";

const roles = [ROLES.PHARMACIST, ROLES.MANAGER, ROLES.BILLING];
const cell = (value: unknown) => {
  let text = String(value ?? ""); if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export async function GET(request: Request) {
  const g = await requireHmsAdmin(roles); if (g.error || !g.supabase) return g.error!;
  const tenant = await getTenantContext(); if (!tenant.hospitalId) return NextResponse.json({ error: "Tenant required" }, { status: 409 });
  const type = new URL(request.url).searchParams.get("type") || "stock";
  let headers: string[] = [], rows: unknown[][] = [];
  if (type === "purchases") {
    const {data,error}=await g.supabase.from("purchase_orders").select("po_number,status,order_date,expected_date,subtotal,tax_amount,total_amount,suppliers(name),inventory_locations(name)").eq("hospital_id",tenant.hospitalId).order("order_date",{ascending:false});
    if(error)return NextResponse.json({error:error.message},{status:400});
    type R={po_number:string;status:string;order_date:string;expected_date:string|null;subtotal:number;tax_amount:number;total_amount:number;suppliers?:{name:string}|null;inventory_locations?:{name:string}|null};
    headers=["PO","Supplier","Location","Status","Order date","Expected","Subtotal","Tax","Total"];rows=(data as unknown as R[]||[]).map((r)=>[r.po_number,r.suppliers?.name,r.inventory_locations?.name,r.status,r.order_date,r.expected_date,r.subtotal,r.tax_amount,r.total_amount]);
  } else if (type === "suppliers") {
    const {data,error}=await g.supabase.from("suppliers").select("supplier_code,name,status,rating,total_orders,on_time_deliveries,payment_terms").eq("hospital_id",tenant.hospitalId).order("name");
    if(error)return NextResponse.json({error:error.message},{status:400});
    headers=["Code","Supplier","Status","Rating","Orders","On-time deliveries","Payment terms"];rows=(data||[]).map((r)=>[r.supplier_code,r.name,r.status,r.rating,r.total_orders,r.on_time_deliveries,r.payment_terms]);
  } else if (type === "movements" || type === "consumption" || type === "audit") {
    const { data, error } = type === "audit"
      ? await g.supabase.from("inventory_audit_logs").select("entity_type,action,created_at,entity_id").eq("hospital_id", tenant.hospitalId).order("created_at", { ascending: false })
      : await g.supabase.from("inventory_stock_movements").select("movement_type,direction,quantity,unit_cost,reason,created_at,inventory_items(item_code,name),inventory_locations(name)").eq("hospital_id", tenant.hospitalId).order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (type === "audit") {
      type AuditRow = { entity_type:string;action:string;entity_id:string;created_at:string };
      headers = ["Entity", "Action", "Entity ID", "Date"];
      rows = (data as unknown as AuditRow[] || []).map((r) => [r.entity_type, r.action, r.entity_id, r.created_at]);
    }
    else {
      type R = { movement_type:string;direction:string;quantity:number;unit_cost:number;reason:string;created_at:string;inventory_items?:{item_code:string;name:string}|null;inventory_locations?:{name:string}|null };
      headers = ["Code","Item","Location","Movement","Direction","Quantity","Unit cost","Reason","Date"];
      rows = (data as unknown as R[] || []).filter((r) => type !== "consumption" || r.direction === "out").map((r) => [r.inventory_items?.item_code,r.inventory_items?.name,r.inventory_locations?.name,r.movement_type,r.direction,r.quantity,r.unit_cost,r.reason,r.created_at]);
    }
  } else if (type === "expiry") {
    const { data, error } = await g.supabase.from("inventory_expiry_batches").select("batch_number,serial_number,quantity,expiry_date,recalled,inventory_items(item_code,name),inventory_locations(name)").eq("hospital_id", tenant.hospitalId).order("expiry_date");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    type R={batch_number:string;serial_number:string|null;quantity:number;expiry_date:string|null;recalled:boolean;inventory_items?:{item_code:string;name:string}|null;inventory_locations?:{name:string}|null};
    headers=["Code","Item","Location","Batch","Serial","Quantity","Expiry","Recalled"]; rows=(data as unknown as R[]||[]).map((r)=>[r.inventory_items?.item_code,r.inventory_items?.name,r.inventory_locations?.name,r.batch_number,r.serial_number,r.quantity,r.expiry_date,r.recalled]);
  } else {
    const { data, error } = await g.supabase.from("inventory_stock").select("quantity,reserved_quantity,inventory_items(item_code,name,unit,purchase_price,reorder_level),inventory_locations(name)").eq("hospital_id", tenant.hospitalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    type R={quantity:number;reserved_quantity:number;inventory_items?:{item_code:string;name:string;unit:string;purchase_price:number;reorder_level:number}|null;inventory_locations?:{name:string}|null};
    headers=["Code","Item","Location","Quantity","Reserved","Unit","Unit cost","Value","Reorder level"];
    rows=(data as unknown as R[]||[]).filter((r)=>type!=="low_stock"||Number(r.quantity)<=Number(r.inventory_items?.reorder_level||0)).map((r)=>[r.inventory_items?.item_code,r.inventory_items?.name,r.inventory_locations?.name,r.quantity,r.reserved_quantity,r.inventory_items?.unit,r.inventory_items?.purchase_price,Number(r.quantity)*Number(r.inventory_items?.purchase_price||0),r.inventory_items?.reorder_level]);
  }
  const csv=[headers,...rows].map((row)=>row.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="inventory-${type}.csv"`}});
}
