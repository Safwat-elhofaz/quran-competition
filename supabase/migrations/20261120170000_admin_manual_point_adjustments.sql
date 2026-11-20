alter table public.point_entries
  add column if not exists adjustment_reason text,
  add column if not exists previous_total integer,
  add column if not exists new_total integer;

create or replace function public.audit_point_entry_insert()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  insert into public.admin_audit_logs
    (admin_user_id, action, entity_type, entity_id, details)
  values (
    (select auth.uid()),
    'INSERT',
    'point_entry',
    new.id::text,
    jsonb_build_object(
      'student_id', new.student_id,
      'competition_id', new.competition_id,
      'weekly_challenge_id', new.weekly_challenge_id,
      'points_delta', new.points_delta,
      'entry_type', new.entry_type,
      'adjustment_reason', new.adjustment_reason,
      'previous_total', new.previous_total,
      'new_total', new.new_total
    )
  );
  return new;
end;
$function$;

create or replace function public.admin_adjust_student_points(
  p_student_id uuid,
  p_mode text,
  p_points integer,
  p_reason text default null
)
returns table (
  previous_total integer,
  new_total integer,
  points_delta integer,
  monthly_challenge_id uuid,
  weekly_challenge_id uuid
)
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_previous bigint;
  v_new bigint;
  v_delta integer;
  v_monthly uuid;
  v_weekly uuid;
begin
  if (select auth.uid()) is null
     or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بتنفيذ تعديل النقاط';
  end if;
  if p_student_id is null or p_mode not in ('add','subtract','set_total') or p_points is null then
    raise exception 'بيانات تعديل النقاط غير صحيحة';
  end if;
  perform 1 from public.students where id = p_student_id for update;
  if not found then raise exception 'الطالب غير موجود'; end if;
  select coalesce(sum(pe.points_delta),0)::bigint into v_previous
    from public.point_entries pe where pe.student_id = p_student_id;
  if p_mode = 'add' then
    if p_points <= 0 then raise exception 'عدد النقاط المضافة يجب أن يكون أكبر من صفر'; end if;
    v_delta := p_points;
  elsif p_mode = 'subtract' then
    if p_points <= 0 then raise exception 'عدد النقاط المخصومة يجب أن يكون أكبر من صفر'; end if;
    v_delta := -p_points;
  else
    if p_points < 0 then raise exception 'الإجمالي الجديد لا يمكن أن يكون سالبًا'; end if;
    v_delta := p_points - v_previous;
  end if;
  v_new := v_previous + v_delta;
  if v_new < 0 then raise exception 'لا يمكن أن يصبح إجمالي نقاط الطالب أقل من صفر'; end if;
  if v_new > 2147483647 then raise exception 'إجمالي النقاط أكبر من الحد المسموح'; end if;
  select c.id into v_monthly from public.competitions c where c.status = 'active' order by c.created_at desc limit 1;
  select w.id into v_weekly from public.weekly_challenges w where w.status = 'active' order by w.created_at desc limit 1;
  if v_delta <> 0 then
    insert into public.point_entries (
      student_id, points_delta, competition_id, weekly_challenge_id,
      created_by, entry_type, adjustment_reason, previous_total, new_total
    ) values (
      p_student_id, v_delta, v_monthly, v_weekly,
      (select auth.uid()), 'adjustment', nullif(btrim(p_reason), ''),
      v_previous::integer, v_new::integer
    );
  end if;
  return query select v_previous::integer, v_new::integer, v_delta, v_monthly, v_weekly;
end;
$function$;

revoke all on function public.admin_adjust_student_points(uuid,text,integer,text) from public;
revoke all on function public.admin_adjust_student_points(uuid,text,integer,text) from anon;
grant execute on function public.admin_adjust_student_points(uuid,text,integer,text) to authenticated;
