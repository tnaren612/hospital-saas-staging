-- Pharmacy walk-in bill: capture patient age on sales
alter table public.pharmacy_sales
  add column if not exists patient_age int null;

comment on column public.pharmacy_sales.patient_age is
  'Optional patient age (years) captured at pharmacy POS for printed bills';
