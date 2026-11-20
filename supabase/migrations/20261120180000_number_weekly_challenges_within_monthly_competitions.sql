
alter table public.weekly_challenges
  add column if not exists competition_id uuid,
  add column if not exists week_number smallint;

update public.weekly_challenges w
set competition_id = c.id,
    week_number = numbered.week_number,
    title = 'الأسبوع ' || (array['الأول','الثاني','الثالث','الرابع','الخامس'])[numbered.week_number]
from (
  select w2.id,
         c2.id as competition_id,
         row_number() over (partition by c2.id order by w2.created_at,w2.id)::smallint as week_number
  from public.weekly_challenges w2
  join lateral (
    select c1.id
    from public.competitions c1
    where c1.month_start <= w2.week_start
      and c1.month_start < (w2.week_start + interval '1 month')::date
    order by c1.month_start desc,c1.created_at desc
    limit 1
  ) c2 on true
) numbered
join public.competitions c on c.id=numbered.competition_id
where w.id=numbered.id
  and numbered.week_number between 1 and 5
  and w.competition_id is null;

do $$
begin
  if exists(select 1 from public.weekly_challenges where competition_id is null or week_number is null) then
    raise exception 'يوجد أسبوع قديم لا يمكن ربطه بتحدٍ شهري تلقائيًا؛ راجع بياناته قبل الترحيل';
  end if;
  if exists(select 1 from public.weekly_challenges where week_number not between 1 and 5) then
    raise exception 'يوجد أكثر من خمسة أسابيع لتحدٍّ شهري واحد؛ راجع البيانات قبل الترحيل';
  end if;
end $$;

alter table public.weekly_challenges
  alter column competition_id set not null,
  alter column week_number set not null;

alter table public.weekly_challenges
  add constraint weekly_challenges_competition_id_fkey
  foreign key (competition_id) references public.competitions(id) on delete restrict,
  add constraint weekly_challenges_week_number_check
  check (week_number between 1 and 5),
  add constraint weekly_challenges_competition_week_unique
  unique (competition_id,week_number);

create or replace function public.admin_start_weekly_challenge(p_week_start date default current_date)
returns table (
  id uuid,
  competition_id uuid,
  week_number smallint,
  title text,
  week_start date
)
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_competition_id uuid;
  v_next smallint;
  v_title text;
  v_id uuid;
begin
  if (select auth.uid()) is null
     or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح ببدء التحدي الأسبوعي';
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

  select (coalesce(max(w.week_number),0)+1)::smallint
  into v_next
  from public.weekly_challenges w
  where w.competition_id=v_competition_id;

  if v_next > 5 then
    raise exception 'اكتملت الأسابيع الخمسة لهذا التحدي الشهري';
  end if;

  v_title := 'الأسبوع ' || (array['الأول','الثاني','الثالث','الرابع','الخامس'])[v_next];

  insert into public.weekly_challenges
    (competition_id,week_number,week_start,title,status,created_by)
  values
    (v_competition_id,v_next,coalesce(p_week_start,current_date),v_title,'active',(select auth.uid()))
  returning weekly_challenges.id into v_id;

  return query
    select w.id,w.competition_id,w.week_number,w.title,w.week_start
    from public.weekly_challenges w
    where w.id=v_id;
end;
$function$;

revoke all on function public.admin_start_weekly_challenge(date) from public;
revoke all on function public.admin_start_weekly_challenge(date) from anon;
grant execute on function public.admin_start_weekly_challenge(date) to authenticated;
