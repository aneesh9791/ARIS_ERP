-- Migration 060: Fix v_study_cost_summary
-- Replaces fragile payable-number pattern match (RAD-BILL-%) with direct FK
-- studies.reporting_payable_id → payables.id (set by postReporterPayableJE)
-- Also adds study_id and reporter_code columns for better traceability.

CREATE OR REPLACE VIEW v_study_cost_summary AS
SELECT
  pb.id                                                        AS bill_id,
  pb.invoice_number                                            AS bill_number,
  pb.bill_date,
  pb.center_id,
  c.name                                                       AS center_name,
  p.id                                                         AS patient_id,
  p.name                                                       AS patient_name,
  p.phone                                                      AS patient_phone,
  s.id                                                         AS study_id,
  COALESCE(
    string_agg(DISTINCT bi.study_name::text, ', ' ORDER BY bi.study_name::text),
    pb.notes
  )                                                            AS study_name,
  COALESCE(
    (SELECT bi2.modality FROM bill_items bi2
     WHERE bi2.bill_id = pb.id AND bi2.active = true LIMIT 1)
  )                                                            AS modality,
  pb.total_amount                                              AS revenue,
  pb.discount_amount                                           AS discount,
  pb.total_amount - COALESCE(pb.discount_amount, 0)           AS net_revenue,

  -- Consumables: summed from bill_consumables linked to this bill
  COALESCE(
    (SELECT ROUND(SUM(bc.qty_used * bc.unit_cost), 2)
     FROM bill_consumables bc
     WHERE bc.bill_id = pb.id AND bc.qty_used > 0),
    0
  )                                                            AS consumables_cost,

  -- Reporter cost: direct FK via studies.reporting_payable_id (fixed — was RAD-BILL-% pattern)
  COALESCE(
    (SELECT pay.amount FROM payables pay WHERE pay.id = s.reporting_payable_id),
    0
  )                                                            AS reporter_cost,

  COALESCE(s.exam_workflow_status, 'EXAM_SCHEDULED')          AS exam_status,
  s.report_date,
  rm.radiologist_name                                          AS reporter_name,
  rm.radiologist_code                                          AS reporter_code,
  rm.reporter_type

FROM patient_bills pb
LEFT JOIN patients          p  ON p.id::text = pb.patient_id::text
LEFT JOIN centers           c  ON c.id = pb.center_id
LEFT JOIN bill_items        bi ON bi.bill_id = pb.id AND bi.active = true
LEFT JOIN studies           s  ON s.id::text = pb.study_id::text AND s.active = true
LEFT JOIN radiologist_master rm ON rm.id = s.reporter_radiologist_id

WHERE pb.payment_status = 'PAID'

GROUP BY
  pb.id, pb.invoice_number, pb.bill_date, pb.center_id, c.name,
  p.id, p.name, p.phone,
  s.id, s.exam_workflow_status, s.report_date, s.reporting_payable_id,
  rm.radiologist_name, rm.radiologist_code, rm.reporter_type,
  pb.total_amount, pb.discount_amount, pb.notes;
