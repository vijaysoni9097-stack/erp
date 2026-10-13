ALTER TABLE erp.registered_devices ADD COLUMN credential_hash text CHECK(length(credential_hash)=64);

-- Remove the original entry points from the exposed schema; only the wrappers
-- below may call them, after verifying the installation credential.
ALTER FUNCTION public.erp_sync_pull(uuid,bigint) SET SCHEMA erp;
ALTER FUNCTION public.erp_sync_push(uuid,uuid,text,uuid,bigint,jsonb,boolean) SET SCHEMA erp;
ALTER FUNCTION public.erp_stock_command(uuid,uuid,text,jsonb) SET SCHEMA erp;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp FROM PUBLIC,anon,authenticated;

CREATE FUNCTION erp.verify_device(p_device uuid,p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor erp.employee_profiles;
BEGIN
    actor:=erp.sync_actor(p_device);
    IF p_secret IS NULL OR length(p_secret)<32 OR NOT EXISTS(
      SELECT 1 FROM erp.registered_devices WHERE pharmacy_id=actor.pharmacy_id AND id=p_device
      AND credential_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') AND revoked_at IS NULL)
    THEN RAISE EXCEPTION 'Invalid device credential' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION erp.verify_device(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_sync_pull(p_device uuid,p_device_secret text,p_cursor bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    PERFORM erp.verify_device(p_device,p_device_secret);
    RETURN erp.erp_sync_pull(p_device,p_cursor);
END $$;
CREATE FUNCTION public.erp_sync_push(p_device uuid,p_device_secret text,p_operation uuid,p_entity text,p_record uuid,p_base_version bigint,p_payload jsonb,p_deleted boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    PERFORM erp.verify_device(p_device,p_device_secret);
    RETURN erp.erp_sync_push(p_device,p_operation,p_entity,p_record,p_base_version,p_payload,p_deleted);
END $$;
CREATE FUNCTION public.erp_stock_command(p_device uuid,p_device_secret text,p_operation uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    PERFORM erp.verify_device(p_device,p_device_secret);
    RETURN erp.erp_stock_command(p_device,p_operation,p_kind,p_payload);
END $$;
REVOKE ALL ON FUNCTION public.erp_sync_pull(uuid,text,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_sync_push(uuid,text,uuid,text,uuid,bigint,jsonb,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_stock_command(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_pull(uuid,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_sync_push(uuid,text,uuid,text,uuid,bigint,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_stock_command(uuid,text,uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
