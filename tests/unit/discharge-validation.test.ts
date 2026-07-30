import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {dischargeActionSchema,dischargeCreateSchema} from "../../src/lib/discharge/validation";
const id="11111111-1111-4111-8111-111111111111";
describe("enterprise discharge validation",()=>{
 it("accepts a discharge initiation",()=>assert.equal(dischargeCreateSchema.safeParse({admission_id:id,primary_diagnosis:"Community acquired pneumonia"}).success,true));
 it("requires a meaningful final summary",()=>assert.equal(dischargeActionSchema.safeParse({action:"update_summary",condition_at_discharge:"ok",discharge_summary:"",secondary_diagnoses:[],procedures_performed:"",hospital_course:"",medication_instructions:"",diet_instructions:"",activity_instructions:"",warning_signs:"",emergency_instructions:"",transport_required:false}).success,false));
 it("accepts departmental clearance",()=>assert.equal(dischargeActionSchema.safeParse({action:"clearance",clearance_type:"inventory",status:"approved",notes:"Equipment returned"}).success,true));
 it("accepts nursing clearance",()=>assert.equal(dischargeActionSchema.safeParse({action:"clearance",clearance_type:"nursing",status:"approved",notes:"Checklist complete"}).success,true));
 it("accepts referral and follow-up",()=>{
  assert.equal(dischargeActionSchema.safeParse({action:"referral",referred_to:"Regional Cardiac Centre",reason:"Specialist review",urgency:"urgent",specialty:"Cardiology",facility_name:""}).success,true);
  assert.equal(dischargeActionSchema.safeParse({action:"follow_up",follow_up_at:"2026-08-10T09:00:00.000Z",purpose:"Post-discharge review",department:"Medicine",instructions:"Bring reports"}).success,true);
 });
});
