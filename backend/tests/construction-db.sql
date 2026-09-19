BEGIN;
INSERT INTO users(id,role) VALUES ('00000000-0000-0000-0000-000000000001','Customer'),('00000000-0000-0000-0000-000000000002','Customer'),('00000000-0000-0000-0000-000000000003','Admin'),('00000000-0000-0000-0000-000000000004','Customer');
INSERT INTO construction_admins(user_id) VALUES('00000000-0000-0000-0000-000000000003');
INSERT INTO projects(project_id,user_id,project_name,city) VALUES('PRJ-TEST','00000000-0000-0000-0000-000000000001','Test only','Coimbatore');
INSERT INTO construction_professionals(id,name,profession,city,experience_years,service_radius_km) VALUES('00000000-0000-0000-0000-000000000002','Test professional','Plumber','Coimbatore',5,30);
SELECT construction_verify('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','verified','test-case');
INSERT INTO construction_engagements(id,project_id,customer_id,professional_id,data) VALUES('10000000-0000-0000-0000-000000000001','PRJ-TEST','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','{"stage":"requested"}');
SELECT id,version FROM construction_save('10000000-0000-0000-0000-000000000001',1,'{"stage":"quoted"}','00000000-0000-0000-0000-000000000002','quote');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM construction_engagements WHERE version=2 AND data->>'stage'='quoted') THEN RAISE EXCEPTION 'State not saved'; END IF;
 IF (SELECT count(*) FROM construction_events)<>3 THEN RAISE EXCEPTION 'Audit events missing'; END IF;
 IF (SELECT count(*) FROM construction_notifications)<>3 THEN RAISE EXCEPTION 'Notifications missing'; END IF;
 BEGIN
 PERFORM construction_save('10000000-0000-0000-0000-000000000001',1,'{}','00000000-0000-0000-0000-000000000001','stale');
 RAISE EXCEPTION 'Stale update accepted';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
 BEGIN
 PERFORM construction_save('10000000-0000-0000-0000-000000000001',2,'{}','00000000-0000-0000-0000-000000000004','intruder');
 RAISE EXCEPTION 'Intruder accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF has_table_privilege('authenticated','construction_professionals','UPDATE') THEN RAISE EXCEPTION 'Public verification writes allowed'; END IF;
 IF has_function_privilege('authenticated','construction_save(uuid,integer,jsonb,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Public workflow writes allowed'; END IF;
 IF (SELECT count(*) FROM construction_events)<>3 THEN RAISE EXCEPTION 'Failed actions wrote audit events'; END IF;
END $$;
ROLLBACK;
SELECT 'Database invariants passed; all test data rolled back' AS result;

