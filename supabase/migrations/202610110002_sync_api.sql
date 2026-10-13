-- Internal helper: caller must hold the per-pharmacy sync_heads row lock.
CREATE FUNCTION erp.log_change(p_pharmacy uuid,p_entity text,p_record uuid,p_version bigint,p_operation uuid,p_payload jsonb,p_deleted boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c bigint;
BEGIN
    UPDATE erp.sync_heads SET cursor=cursor+1 WHERE pharmacy_id=p_pharmacy RETURNING cursor INTO c;
    IF c IS NULL THEN RAISE EXCEPTION 'Sync head missing'; END IF;
    INSERT INTO erp.change_log(pharmacy_id,cursor,entity,record_id,version,operation_id,payload,deleted)
    VALUES(p_pharmacy,c,p_entity,p_record,p_version,p_operation,p_payload,p_deleted);
END $$;

CREATE FUNCTION erp.sync_actor(p_device uuid)
RETURNS erp.employee_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor erp.employee_profiles;
BEGIN
    SELECT e.* INTO actor FROM erp.employee_profiles e JOIN erp.registered_devices d
    ON d.pharmacy_id=e.pharmacy_id
    WHERE e.auth_user_id=auth.uid() AND e.disabled_at IS NULL AND e.deleted_at IS NULL
    AND d.id=p_device AND d.revoked_at IS NULL;
    IF actor.id IS NULL THEN RAISE EXCEPTION 'Device or user not authorized' USING ERRCODE='42501'; END IF;
    RETURN actor;
END $$;

CREATE FUNCTION public.erp_sync_pull(p_device uuid,p_cursor bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor erp.employee_profiles; changes jsonb; lease timestamptz; head bigint; last_cursor bigint;
BEGIN
    actor := erp.sync_actor(p_device);
    IF p_cursor < 0 THEN RAISE EXCEPTION 'Invalid cursor'; END IF;
    INSERT INTO erp.sync_heads(pharmacy_id) VALUES(actor.pharmacy_id) ON CONFLICT DO NOTHING;
    SELECT cursor INTO head FROM erp.sync_heads WHERE pharmacy_id=actor.pharmacy_id FOR UPDATE;
    IF p_cursor > head THEN RAISE EXCEPTION 'Cursor is ahead of server'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.cursor),'[]'::jsonb),coalesce(max(c.cursor),p_cursor)
      INTO changes,last_cursor FROM (
        SELECT cursor,entity,record_id,version,operation_id,payload,deleted
        FROM erp.change_log WHERE pharmacy_id=actor.pharmacy_id AND cursor>p_cursor ORDER BY cursor LIMIT 200
      ) c;
    lease := now()+interval '24 hours';
    INSERT INTO erp.offline_leases(pharmacy_id,device_id,employee_id,issued_at,expires_at)
      VALUES(actor.pharmacy_id,p_device,actor.id,now(),lease)
      ON CONFLICT(pharmacy_id,device_id,employee_id) DO UPDATE SET issued_at=now(),expires_at=excluded.expires_at,revoked_at=NULL;
    UPDATE erp.registered_devices SET last_seen_at=now() WHERE pharmacy_id=actor.pharmacy_id AND id=p_device;
    RETURN jsonb_build_object('changes',changes,'cursor',last_cursor,'has_more',last_cursor<head,
      'server_time',now(),'lease_expires_at',lease,'employee_id',actor.id,'role',actor.role,'pharmacy_id',actor.pharmacy_id,
      'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM erp.stock_allocations a WHERE a.pharmacy_id=actor.pharmacy_id AND a.device_id=p_device));
END $$;

-- Records use optimistic versions; mutations are idempotent and replay-safe.
CREATE FUNCTION public.erp_sync_push(p_device uuid,p_operation uuid,p_entity text,p_record uuid,p_base_version bigint,p_payload jsonb,p_deleted boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor erp.employee_profiles; prior erp.processed_operations; fingerprint text;
    allowed text[]; cols text; vals text; assignments text; key text;
    old jsonb; saved jsonb; result jsonb; next_version bigint; payload jsonb;
BEGIN
    actor := erp.sync_actor(p_device);
    IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>262144 THEN RAISE EXCEPTION 'Invalid payload'; END IF;
    IF p_entity NOT IN ('suppliers','customers','medicines','prescriptions') THEN RAISE EXCEPTION 'Unsupported entity'; END IF;
    IF p_base_version IS NULL OR p_base_version<0 OR p_record IS NULL OR p_operation IS NULL THEN RAISE EXCEPTION 'Invalid operation'; END IF;
    allowed := CASE p_entity
      WHEN 'suppliers' THEN ARRAY['name','contact_person','phone','email','address']
      WHEN 'customers' THEN ARRAY['full_name','phone','email','date_of_birth']
      WHEN 'medicines' THEN ARRAY['name','generic_name','sku','batch_number','expiry_date','purchase_price','selling_price','reorder_level','supplier_id']
      WHEN 'prescriptions' THEN ARRAY['customer_id','doctor_name','prescribed_on','notes','status'] END;
    FOR key IN SELECT jsonb_object_keys(p_payload) LOOP
      IF NOT(key=ANY(allowed)) THEN RAISE EXCEPTION 'Unsupported field'; END IF;
    END LOOP;
    fingerprint := encode(sha256(convert_to(jsonb_build_array(p_entity,p_record,p_base_version,p_payload,p_deleted)::text,'UTF8')),'hex');
    INSERT INTO erp.sync_heads(pharmacy_id) VALUES(actor.pharmacy_id) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM erp.sync_heads WHERE pharmacy_id=actor.pharmacy_id FOR UPDATE;
    SELECT * INTO prior FROM erp.processed_operations WHERE pharmacy_id=actor.pharmacy_id AND device_id=p_device AND operation_id=p_operation;
    IF prior.operation_id IS NOT NULL THEN
      IF prior.payload_hash<>fingerprint OR prior.actor_id<>actor.id THEN RAISE EXCEPTION 'Operation ID reused with different contents'; END IF;
      RETURN prior.result;
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM erp.%I t WHERE pharmacy_id=$1 AND id=$2',p_entity)
      INTO old USING actor.pharmacy_id,p_record;
    IF coalesce((old->>'version')::bigint,0)<>p_base_version OR (old->>'deleted_at') IS NOT NULL OR (old IS NULL AND p_deleted) THEN
      result := jsonb_build_object('status','conflict','current',old);
      INSERT INTO erp.sync_conflicts(pharmacy_id,device_id,operation_id,entity,record_id,reason,proposed,current_record)
        VALUES(actor.pharmacy_id,p_device,p_operation,p_entity,p_record,'version_conflict',p_payload,old);
    ELSE
      next_version := p_base_version+1;
      payload := coalesce(old,'{}'::jsonb)||p_payload||jsonb_build_object('pharmacy_id',actor.pharmacy_id,'id',p_record,
        'version',next_version,'created_at',coalesce(old->>'created_at',now()::text),'updated_at',now(),
        'deleted_at',CASE WHEN p_deleted THEN now() ELSE NULL END);
      cols := ''; vals := ''; assignments := '';
      FOREACH key IN ARRAY allowed LOOP
        cols := cols||format(',%I',key); vals := vals||format(',r.%I',key);
        assignments := assignments||format(',%I=excluded.%I',key,key);
      END LOOP;
      EXECUTE format('INSERT INTO erp.%1$I AS t(pharmacy_id,id,version,created_at,updated_at,deleted_at%2$s)
        SELECT r.pharmacy_id,r.id,r.version,r.created_at,r.updated_at,r.deleted_at%3$s FROM jsonb_populate_record(NULL::erp.%1$I,$1) r
        ON CONFLICT(pharmacy_id,id) DO UPDATE SET version=excluded.version,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at%4$s
        RETURNING to_jsonb(t)',p_entity,cols,vals,assignments) INTO saved USING payload;
      PERFORM erp.log_change(actor.pharmacy_id,p_entity,p_record,next_version,p_operation,saved,p_deleted);
      result := jsonb_build_object('status','applied','record',saved);
    END IF;
    INSERT INTO erp.processed_operations(pharmacy_id,device_id,operation_id,actor_id,payload_hash,result)
      VALUES(actor.pharmacy_id,p_device,p_operation,actor.id,fingerprint,result);
    RETURN result;
END $$;

-- All helper functions are private. Only two explicit authenticated RPC entry points.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_sync_pull(uuid,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_sync_push(uuid,uuid,text,uuid,bigint,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_pull(uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_sync_push(uuid,uuid,text,uuid,bigint,jsonb,boolean) TO authenticated;
