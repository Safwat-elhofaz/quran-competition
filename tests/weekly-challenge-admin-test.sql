\set ON_ERROR_STOP on

-- Disposable PostgreSQL fixture for the weekly challenge admin migration.
-- This runs only in GitHub Actions, never against the live Supabase database.
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE FUNCTION private.is_active_admin() RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT coalesce(current_setting('test.is_active_admin', true), 'false') = 'true' $$;

CREATE TABLE public.competitions (
  id uuid PRIMARY KEY,
  month_start date NOT NULL,
  month_end date,
  title text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.weekly_challenges (
  id uuid PRIMARY KEY,
  competition_id uuid NOT NULL REFERENCES public.competitions(id),
  week_number smallint NOT NULL,
  week_start date NOT NULL,
  week_end date,
  title text NOT NULL,
  status text NOT NULL,
  created_by uuid NOT NULL,
  ended_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX one_active_week_fixture
ON public.weekly_challenges ((status))
WHERE status = 'active';

CREATE TABLE public.admin_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.challenge_result_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_type text NOT NULL,
  period_id uuid NOT NULL,
  student_id uuid NOT NULL,
  student_name text NOT NULL,
  total_points integer NOT NULL,
  rank integer NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_type, period_id, student_id)
);

CREATE TABLE public.weekly_totals_fixture (
  weekly_challenge_id uuid NOT NULL,
  student_id uuid NOT NULL,
  full_name text NOT NULL,
  total_points integer NOT NULL
);

CREATE VIEW public.student_weekly_totals AS
SELECT weekly_challenge_id, student_id, full_name, total_points
FROM public.weekly_totals_fixture;

CREATE FUNCTION public.capture_challenge_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF old.status <> 'archived' AND new.status = 'archived' THEN
    IF tg_table_name = 'weekly_challenges' THEN
      INSERT INTO public.challenge_result_snapshots(period_type,period_id,student_id,student_name,total_points,rank)
      SELECT 'weekly',new.id,t.student_id,t.full_name,t.total_points,
             row_number() over(order by t.total_points desc,t.full_name asc)::integer
      FROM public.student_weekly_totals t
      WHERE t.weekly_challenge_id = new.id
      ON CONFLICT(period_type,period_id,student_id) DO NOTHING;
    END IF;
  END IF;
  RETURN new;
END;
$function$;

CREATE TRIGGER capture_weekly_challenge_results
AFTER UPDATE OF status ON public.weekly_challenges
FOR EACH ROW EXECUTE FUNCTION public.capture_challenge_results();

INSERT INTO public.competitions(id,month_start,month_end,title,status)
VALUES ('10000000-0000-0000-0000-000000000001','2026-11-01','2026-11-30','اختبار نوفمبر','active');

INSERT INTO public.weekly_challenges(id,competition_id,week_number,week_start,week_end,title,status,created_by,ended_at,ended_by)
VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'2026-11-01','2026-11-07','الأسبوع الأول','archived','30000000-0000-0000-0000-000000000001',now(),'30000000-0000-0000-0000-000000000001');

INSERT INTO public.weekly_totals_fixture(weekly_challenge_id,student_id,full_name,total_points) VALUES
('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','طالب ألف',10),
('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','طالب باء',5);

INSERT INTO public.challenge_result_snapshots(id,period_type,period_id,student_id,student_name,total_points,rank)
OVERRIDING SYSTEM VALUE VALUES
(501,'weekly','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','طالب ألف',10,1),
(502,'weekly','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','طالب باء',5,2);

SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',false);
SELECT set_config('test.is_active_admin','true',false);

\i supabase/migrations/20261126180000_complete_weekly_challenge_admin.sql

DO $test$
DECLARE
  v_result record;
  v_points_before integer;
  v_points_after integer;
  v_id_before bigint;
  v_id_after bigint;
  v_rank integer;
  v_total integer;
BEGIN
  SELECT sum(total_points) INTO v_points_before
  FROM public.weekly_totals_fixture
  WHERE weekly_challenge_id='20000000-0000-0000-0000-000000000001';

  SELECT id INTO v_id_before
  FROM public.challenge_result_snapshots
  WHERE period_type='weekly'
    AND period_id='20000000-0000-0000-0000-000000000001'
    AND student_id='40000000-0000-0000-0000-000000000001';

  PERFORM public.admin_reopen_weekly_challenge('20000000-0000-0000-0000-000000000001');

  IF (SELECT status FROM public.weekly_challenges WHERE id='20000000-0000-0000-0000-000000000001') <> 'active' THEN
    RAISE EXCEPTION 'Reopen did not activate the existing week';
  END IF;

  SELECT sum(total_points) INTO v_points_after
  FROM public.weekly_totals_fixture
  WHERE weekly_challenge_id='20000000-0000-0000-0000-000000000001';

  IF v_points_before <> v_points_after THEN
    RAISE EXCEPTION 'Reopening changed the existing points';
  END IF;

  SELECT * INTO v_result
  FROM public.admin_set_weekly_dates(
    '20000000-0000-0000-0000-000000000001','2026-11-02','2026-11-08'
  );

  IF v_result.week_start <> '2026-11-02' OR v_result.week_end <> '2026-11-08' THEN
    RAISE EXCEPTION 'Weekly date update returned unexpected dates';
  END IF;

  UPDATE public.weekly_totals_fixture SET total_points=4
  WHERE weekly_challenge_id='20000000-0000-0000-0000-000000000001'
    AND student_id='40000000-0000-0000-0000-000000000001';

  UPDATE public.weekly_totals_fixture SET total_points=12
  WHERE weekly_challenge_id='20000000-0000-0000-0000-000000000001'
    AND student_id='40000000-0000-0000-0000-000000000002';

  UPDATE public.weekly_challenges
  SET status='archived', ended_at=now(), ended_by='30000000-0000-0000-0000-000000000001'
  WHERE id='20000000-0000-0000-0000-000000000001';

  SELECT id,total_points,rank INTO v_id_after,v_total,v_rank
  FROM public.challenge_result_snapshots
  WHERE period_type='weekly'
    AND period_id='20000000-0000-0000-0000-000000000001'
    AND student_id='40000000-0000-0000-0000-000000000001';

  IF v_id_after <> v_id_before THEN
    RAISE EXCEPTION 'Re-archiving replaced the existing snapshot ID';
  END IF;
  IF v_total <> 4 OR v_rank <> 2 THEN
    RAISE EXCEPTION 'Re-archiving did not refresh the changed points/rank';
  END IF;

  SELECT total_points,rank INTO v_total,v_rank
  FROM public.challenge_result_snapshots
  WHERE period_type='weekly'
    AND period_id='20000000-0000-0000-0000-000000000001'
    AND student_id='40000000-0000-0000-0000-000000000002';

  IF v_total <> 12 OR v_rank <> 1 THEN
    RAISE EXCEPTION 'Re-archiving did not update the new leader';
  END IF;

  IF (SELECT count(*) FROM public.admin_audit_logs
      WHERE action='REOPEN' AND entity_id='20000000-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Reopen audit event was not recorded exactly once';
  END IF;

  INSERT INTO public.weekly_challenges(id,competition_id,week_number,week_start,week_end,title,status,created_by)
  VALUES ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',2,'2026-11-09','2026-11-15','الأسبوع الثاني','archived','30000000-0000-0000-0000-000000000001');

  BEGIN
    PERFORM public.admin_reopen_weekly_challenge('20000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Expected reopening a non-last week to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected reopening a non-last week to fail' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%آخر أسبوع%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('test.is_active_admin','false',false);
  BEGIN
    PERFORM public.admin_set_weekly_dates(
      '20000000-0000-0000-0000-000000000001','2026-11-03','2026-11-09'
    );
    RAISE EXCEPTION 'Expected unauthorized date update to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expected unauthorized date update to fail' THEN
      RAISE;
    END IF;
    IF SQLERRM NOT LIKE '%غير مصرح%' THEN
      RAISE;
    END IF;
  END;
END;
$test$;

SELECT 'weekly challenge migration tests passed' AS result;
