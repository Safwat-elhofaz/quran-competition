alter table public.weekly_challenges
  add column if not exists week_end date;

drop function if exists public.admin_start_weekly_challenge(date);

create or replace function public.admin_start_weekly_challenge(
  p_week_number smallint,
  p_week_start date,
  p_week_end date
)
returns table(id uuid,competition_id uuid,week_number smallint,title text,week_start date,week_end date)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_competition_id uuid;
  v_title text;
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح ببدء التحدي الأسبوعي';
  end if;
  if p_week_number is null or p_week_number < 1 or p_week_number > 5 then
    raise exception 'اختر أسبوعًا من الأول إلى الخامس';
  end if;
  if p_week_start is null or p_week_end is null or p_week_end < p_week_start then
    raise exception 'تأكد من صحة تاريخ البداية والنهاية';
  end if;
  select c.id into v_competition_id
  from public.competitions c
  where c.status='active'
  order by c.created_at desc
  limit 1
  for update;
  if v_competition_id is null then
    raise exception 'ابدأ التحدي الشهري أولًا قبل بدء الأسابيع';
  end if;
  if exists(select 1 from public.weekly_challenges w where w.status='active') then
    raise exception 'يوجد أسبوع نشط بالفعل؛ أنهِه أولًا';
  end if;
  if exists(select 1 from public.weekly_challenges w where w.competition_id=v_competition_id and w.week_number=p_week_number) then
    raise exception 'هذا الأسبوع تم استخدامه بالفعل في المسابقة الشهرية';
  end if;
  v_title := 'الأسبوع ' || (array['الأول','الثاني','الثالث','الرابع','الخامس'])[p_week_number];
  insert into public.weekly_challenges
    (competition_id,week_number,week_start,week_end,title,status,created_by)
  values
    (v_competition_id,p_week_number,p_week_start,p_week_end,v_title,'active',(select auth.uid()))
  returning weekly_challenges.id into v_id;
  return query
    select w.id,w.competition_id,w.week_number,w.title,w.week_start,w.week_end
    from public.weekly_challenges w where w.id=v_id;
end;
$function$;
revoke execute on function public.admin_start_weekly_challenge(smallint,date,date) from public, anon;
grant execute on function public.admin_start_weekly_challenge(smallint,date,date) to authenticated;
