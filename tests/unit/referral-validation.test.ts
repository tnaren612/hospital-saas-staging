import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {referralActionSchema,referralCreateSchema} from "../../src/lib/referral/validation";
describe("referral validation",()=>{
 it("accepts internal referral",()=>assert.equal(referralCreateSchema.safeParse({patient_id:"00000000-0000-4000-8000-000000000001",referral_type:"internal",referred_to:"Cardiology",reason:"Specialist review"}).success,true));
 it("rejects missing reason",()=>assert.equal(referralCreateSchema.safeParse({patient_id:"00000000-0000-4000-8000-000000000001",referral_type:"external",referred_to:"Clinic",reason:""}).success,false));
 it("accepts status workflow",()=>assert.equal(referralActionSchema.safeParse({action:"status",status:"accepted",notes:"Accepted"}).success,true));
 it("validates attachment URL",()=>assert.equal(referralActionSchema.safeParse({action:"attachment",file_name:"referral.pdf",file_url:"https://files.example/referral.pdf"}).success,true));
});
