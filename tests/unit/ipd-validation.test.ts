import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {admissionSchema,bedSchema,ipdActionSchema,wardSchema} from "../../src/lib/ipd/validation";
describe("IPD validation",()=>{
 it("accepts admission",()=>assert.equal(admissionSchema.safeParse({patient_id:"11111111-1111-4111-8111-111111111111",bed_id:"22222222-2222-4222-8222-222222222222",reason:"Clinical observation"}).success,true));
 it("requires discharge summary",()=>assert.equal(ipdActionSchema.safeParse({action:"discharge",discharge_summary:"",discharge_instructions:"Rest"}).success,false));
 it("accepts transfer",()=>assert.equal(ipdActionSchema.safeParse({action:"transfer",bed_id:"22222222-2222-4222-8222-222222222222"}).success,true));
 it("accepts ward and bed administration",()=>{assert.equal(wardSchema.safeParse({name:"General Ward",code:"GW"}).success,true);assert.equal(bedSchema.safeParse({ward_id:"11111111-1111-4111-8111-111111111111",bed_number:"G-01"}).success,true)});
});
