-- Migration 111: Fix payroll finance_account_mappings and employees optional fields
-- Reason: Migration 037 used account codes (2020, 2030) that don't exist in the
-- healthcare COA (036), so PAYROLL_RUN/PF, ESI, SALARY rows were never inserted.
-- This migration upserts all required payroll GL mappings using correct codes.

DO $$
DECLARE
  _sal_med  INTEGER; -- 5210 Salaries – Medical & Technical Staff
  _sal_adm  INTEGER; -- 5220 Salaries – Administrative Staff
  _sal_sup  INTEGER; -- 5230 Salaries – Support & Housekeeping
  _emp_pf   INTEGER; -- 5240 Employer PF & ESI Contributions
  _cr_sal   INTEGER; -- 2131 Salaries & Wages Payable
  _cr_pf    INTEGER; -- 2132 Provident Fund Payable
  _cr_esi   INTEGER; -- 2133 ESI Payable
  _cr_pt    INTEGER; -- 2125 Professional Tax Payable
BEGIN
  SELECT id INTO _sal_med FROM chart_of_accounts WHERE account_code = '5210' AND is_active = true LIMIT 1;
  SELECT id INTO _sal_adm FROM chart_of_accounts WHERE account_code = '5220' AND is_active = true LIMIT 1;
  SELECT id INTO _sal_sup FROM chart_of_accounts WHERE account_code = '5230' AND is_active = true LIMIT 1;
  SELECT id INTO _emp_pf  FROM chart_of_accounts WHERE account_code = '5240' AND is_active = true LIMIT 1;
  SELECT id INTO _cr_sal  FROM chart_of_accounts WHERE account_code = '2131' AND is_active = true LIMIT 1;
  SELECT id INTO _cr_pf   FROM chart_of_accounts WHERE account_code = '2132' AND is_active = true LIMIT 1;
  SELECT id INTO _cr_esi  FROM chart_of_accounts WHERE account_code = '2133' AND is_active = true LIMIT 1;
  SELECT id INTO _cr_pt   FROM chart_of_accounts WHERE account_code = '2125' AND is_active = true LIMIT 1;

  -- ── Generic SALARY fallback (used when no per-category mapping matches) ──
  IF _sal_med IS NOT NULL AND _cr_sal IS NOT NULL THEN
    INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
    VALUES ('PAYROLL_RUN', 'SALARY', _sal_med, _cr_sal, 'Generic salary accrual — DR 5210 / CR 2131')
    ON CONFLICT (event_type, sub_type) DO UPDATE
      SET debit_account_id  = EXCLUDED.debit_account_id,
          credit_account_id = EXCLUDED.credit_account_id,
          description       = EXCLUDED.description,
          updated_at        = NOW();
  END IF;

  -- ── GENERAL department fallback ──
  IF _sal_med IS NOT NULL AND _cr_sal IS NOT NULL THEN
    INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
    VALUES ('PAYROLL_RUN', 'GENERAL', COALESCE(_sal_adm, _sal_med), _cr_sal, 'General/unclassified salaries — DR 5220 / CR 2131')
    ON CONFLICT (event_type, sub_type) DO UPDATE
      SET debit_account_id  = EXCLUDED.debit_account_id,
          credit_account_id = EXCLUDED.credit_account_id,
          updated_at        = NOW();
  END IF;

  -- ── Employer PF contribution ──
  IF _emp_pf IS NOT NULL AND _cr_pf IS NOT NULL THEN
    INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
    VALUES ('PAYROLL_RUN', 'PF', _emp_pf, _cr_pf, 'Employer + Employee PF — DR 5240 / CR 2132')
    ON CONFLICT (event_type, sub_type) DO UPDATE
      SET debit_account_id  = EXCLUDED.debit_account_id,
          credit_account_id = EXCLUDED.credit_account_id,
          description       = EXCLUDED.description,
          updated_at        = NOW();
  END IF;

  -- ── Employer ESI contribution ──
  IF _emp_pf IS NOT NULL AND _cr_esi IS NOT NULL THEN
    INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
    VALUES ('PAYROLL_RUN', 'ESI', _emp_pf, _cr_esi, 'Employer + Employee ESI — DR 5240 / CR 2133')
    ON CONFLICT (event_type, sub_type) DO UPDATE
      SET debit_account_id  = EXCLUDED.debit_account_id,
          credit_account_id = EXCLUDED.credit_account_id,
          description       = EXCLUDED.description,
          updated_at        = NOW();
  END IF;

  -- ── Professional Tax payable ──
  IF _cr_pt IS NOT NULL THEN
    INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
    VALUES ('PAYROLL_RUN', 'PROF_TAX', NULL, _cr_pt, 'Professional Tax collected from employees — CR 2125')
    ON CONFLICT (event_type, sub_type) DO UPDATE
      SET credit_account_id = EXCLUDED.credit_account_id,
          description       = EXCLUDED.description,
          updated_at        = NOW();
  END IF;

END $$;
