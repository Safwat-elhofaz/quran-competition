-- Complete weekly challenge administration without changing existing scoring rules.
-- Reopening preserves the same weekly row and its existing points; re-archiving refreshes its snapshot.
create or replace function public.admin_set_weekly_dates(
  p_weekly_challenge_id uuid,
  p_week_start date,
  p_week_end date
)
returns table(id uuid, week_start date, week_end date)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week public.weekly_challenges;
  v_month public.competitions;
begin
  if (select auth.uid()) is null or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بتعديل تواريخ التحدي الأسبوعي';
  end if;
  if p_weekly_challenge_id is null or p_week_start is null or p_week_end is null or p_week_end < p_week_start then
    raise exception 'تأكد من صحة تاريخ بداية ونهاية الأسبوع';
  end if;

  select * into v_week
  from public.weekly_challenges
  where weekly_challenges.id = p_weekly_challenge_id and status = 'active'
  for update;

  if not found then
    raise exception 'لا يمكن تعديل تواريخ أسبوع غير نشط';
  end if;

  select * into v_month
  from public.competitions
  where competitions.id = v_week.competition_id and status = 'active'
  for update;

  if not found then
    raise exception 'الدورة الشهرية المرتبطة بالأسبوع ليست نشطة';
  end if;

  if p_week_start < v_month.month_start or (v_month.month_end is not null and p_week_end > v_month.month_end) then
    raise exception 'يجب أن تظل فترة الأسبوع داخل فترة التحدي الشهري';
  end if;

  update public.weekly_challenges
  set week_start = p_week_start, week_end = p_week_end
  where weekly_challenges.id = p_weekly_challenge_id;

  return query
  select w.id, w.week_start, w.week_end
  from public.weekly_challenges w
  where w.id = p_weekly_challenge_id;
end;
$function$;

revoke all on function public.admin_set_weekly_dates(uuid,date,date) from public;
grant execute on function public.admin_set_weekly_dates(uuid,date,date) to authenticated;

create or replace function public.admin_reopen_weekly_challenge(
  p_weekly_challenge_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin uuid := (select auth.uid());
  v_week public.weekly_challenges;
begin
  if v_admin is null or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بإعادة فتح التحدي الأسبوعي';
  end if;
  if p_weekly_challenge_id is null then
    raise exception 'اختر أسبوعًا من الأرشيف';
  end if;

  if exists(select 1 from public.weekly_challenges where status = 'active') then
    raise exception 'يوجد أسبوع نشط بالفعل؛ أنهِه أولًا';
  end if;

  select w.* into v_week
  from public.weekly_challenges w
  join public.competitions c on c.id = w.competition_id
  where w.id = p_weekly_challenge_id
    and w.status = 'archived'
    and c.status = 'active'
  for update of w;

  if not found then
    raise exception 'لا يمكن إعادة فتح هذا الأسبوع؛ تأكد أن دورته الشهرية نشطة وأن الأسبوع مؤرشف';
  end if;

  if exists (
    select 1 from public.weekly_challenges later
    where later.competition_id = v_week.competition_id
      and later.week_number > v_week.week_number
  ) then
    raise exception 'يمكن إعادة فتح آخر أسبوع منتهٍ فقط حتى لا يتغير ترتيب الأسابيع';
  end if;

  update public.weekly_challenges
  set status = 'active', ended_at = null, ended_by = null
  where id = v_week.id;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values (
    v_admin,
    'REOPEN',
    'weekly_challenge',
    v_week.id::text,
    jsonb_build_object(
      'competition_id', v_week.competition_id,
      'week_number', v_week.week_number,
      'week_start', v_week.week_start,
      'week_end', v_week.week_end,
      'preserved_existing_points', true
    )
  );

  return v_week.id;
end;
$function$;

revoke all on function public.admin_reopen_weekly_challenge(uuid) from public;
grant execute on function public.admin_reopen_weekly_challenge(uuid) to authenticated;

-- Refresh the weekly archived snapshot after a reopened week is ended again.
-- Monthly snapshot behavior remains unchanged.
create or replace function public.capture_challenge_results()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.status <> 'archived' and new.status = 'archived' then
    if tg_table_name = 'weekly_challenges' then
      delete from public.challenge_result_snapshots
      where period_type = 'weekly' and period_id = new.id;
      insert into public.challenge_result_snapshots(period_type,period_id,student_id,student_name,total_points,rank)
      select 'weekly',new.id,t.student_id,t.full_name,t.total_points,
             row_number() over(order by t.total_points desc,t.full_name asc)::integer
      from public.student_weekly_totals t
      where t.weekly_challenge_id = new.id
      on conflict(period_type,period_id,student_id) do update
        set student_name = excluded.student_name,
            total_points = excluded.total_points,
            rank = excluded.rank,
            captured_at = now();
    elsif tg_table_name = 'competitions' then
      insert into public.challenge_result_snapshots(period_type,period_id,student_id,student_name,total_points,rank)
      select 'monthly',new.id,t.student_id,t.full_name,t.total_points,
             row_number() over(order by t.total_points desc,t.full_name asc)::integer
      from public.student_monthly_totals t
      where t.competition_id = new.id
      on conflict(period_type,period_id,student_id) do update
        set student_name = excluded.student_name,
            total_points = excluded.total_points,
            rank = excluded.rank,
            captured_at = now();
    end if;
  end if;
  return new;
end;
$function$;
