-- Isolated PostgreSQL only. Roll back every test record.
BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); p uuid; j oh3d_jobs; j2 oh3d_jobs; v uuid;
BEGIN
 INSERT INTO users(id,role) VALUES(u,'user');
 INSERT INTO oh3d_projects(user_id,prompt) VALUES(u,'test') RETURNING id INTO p;
 j:=oh3d_enqueue(p,u,0,'generate','test',gen_random_uuid());
 j2:=oh3d_enqueue(p,u,0,'generate','test',j.request_key);
 ASSERT j.id=j2.id,'Idempotency failed';
 BEGIN PERFORM oh3d_enqueue(p,u,0,'generate','test',gen_random_uuid()); RAISE EXCEPTION 'Duplicate job allowed'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM oh3d_enqueue(p,gen_random_uuid(),0,'generate','test',gen_random_uuid()); RAISE EXCEPTION 'Ownership bypass'; EXCEPTION WHEN no_data_found THEN NULL; END;
 SELECT * INTO j2 FROM oh3d_claim('test-worker','test-blender');
 ASSERT j2.id=j.id,'Claim failed';
 ASSERT NOT EXISTS(SELECT 1 FROM oh3d_claim('other-worker','test-blender')),'Concurrent Blender claim';
 ASSERT NOT oh3d_heartbeat(j.id,'other-worker','test-blender','rendering',80,'test'),'Heartbeat ownership';
 ASSERT oh3d_heartbeat(j.id,'test-worker','test-blender','rendering',80,'test'),'Heartbeat failed';
 ASSERT NOT oh3d_finish(j.id,'other-worker','{}','{}'),'Completion ownership';
 ASSERT oh3d_finish(j.id,'test-worker','{}','{"project":"test.blend"}'),'Completion failed';
 v:=j.version_id;
 j:=oh3d_enqueue(p,u,1,'modify','pool',gen_random_uuid());
 ASSERT j.base_version_id=v,'Version base lost';
 PERFORM oh3d_claim('test-worker','test-blender');
 ASSERT oh3d_finish(j.id,'test-worker','{}','{"project":"test2.blend"}'),'Second completion failed';
 PERFORM oh3d_restore(p,u,v,2);
 ASSERT (SELECT current_version=1 FROM oh3d_projects WHERE id=p),'Restore failed';
 j:=oh3d_enqueue(p,u,1,'modify','marble',gen_random_uuid());
 ASSERT (SELECT version=3 FROM oh3d_versions WHERE id=j.version_id),'Version number reused after restore';
 ASSERT NOT has_table_privilege('anon','oh3d_projects','SELECT'),'Anonymous table access';
 ASSERT NOT has_function_privilege('authenticated','oh3d_claim(text,text)','EXECUTE'),'Public worker access';
 RAISE NOTICE '3D queue, ownership, leases, idempotency and version tests passed';
END $$;
ROLLBACK;
