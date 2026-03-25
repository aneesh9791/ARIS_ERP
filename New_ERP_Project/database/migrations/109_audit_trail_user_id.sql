-- Migration 109: Fix fn_audit_trail to capture user_id from session variable
-- Routes call: SELECT set_config('app.current_user_id', '<id>', true)
-- before any write inside a transaction, and the trigger reads it here.

CREATE OR REPLACE FUNCTION public.fn_audit_trail()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_id   INTEGER := NULL;
  v_action    TEXT;
  v_old_vals  JSONB := NULL;
  v_new_vals  JSONB := NULL;
  v_entity_id INTEGER := 0;
BEGIN
  -- Determine action and capture old/new values
  IF TG_OP = 'INSERT' THEN
    v_action   := 'CREATE';
    v_new_vals := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action   := 'UPDATE';
    v_old_vals := to_jsonb(OLD);
    v_new_vals := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action   := 'DELETE';
    v_old_vals := to_jsonb(OLD);
  END IF;

  -- 1. Try session variable set by the application (most reliable)
  BEGIN
    v_user_id := nullif(current_setting('app.current_user_id', true), '')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- 2. Fallback: try updated_by / created_by column on the row
  IF v_user_id IS NULL THEN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      BEGIN v_user_id := (to_jsonb(NEW)->>'updated_by')::INTEGER; EXCEPTION WHEN OTHERS THEN NULL; END;
      IF v_user_id IS NULL THEN
        BEGIN v_user_id := (to_jsonb(NEW)->>'created_by')::INTEGER; EXCEPTION WHEN OTHERS THEN NULL; END;
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      BEGIN v_user_id := (to_jsonb(OLD)->>'updated_by')::INTEGER; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  -- Strip sensitive fields from audit records
  IF v_new_vals IS NOT NULL THEN
    v_new_vals := v_new_vals - 'password_hash' - 'password' - 'pin';
  END IF;
  IF v_old_vals IS NOT NULL THEN
    v_old_vals := v_old_vals - 'password_hash' - 'password' - 'pin';
  END IF;

  -- Safe cast entity id
  BEGIN
    v_entity_id := CASE WHEN TG_OP = 'DELETE'
                        THEN (to_jsonb(OLD)->>'id')::INTEGER
                        ELSE (to_jsonb(NEW)->>'id')::INTEGER END;
  EXCEPTION WHEN OTHERS THEN
    v_entity_id := 0;
  END;

  INSERT INTO audit_trail (entity_type, entity_id, action, user_id, old_values, new_values, timestamp, created_at)
  VALUES (TG_TABLE_NAME, v_entity_id, v_action, v_user_id, v_old_vals, v_new_vals, NOW(), NOW());

  RETURN NULL;
END;
$function$;
