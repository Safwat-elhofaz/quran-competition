create table if not exists public.weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  week_start date not null default current_date,
  title text not null default 'التحدي الأسبوعي',
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  ended_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.point_entries
  alter column competition_id drop not null;
alter table public.point_entries
  add column if not exists weekly_challenge_id uuid references public.weekly_challenges(id) on delete restrict;

create unique index if not exists competitions_one_active_idx
  on public.competitions ((status)) where status = 'active';
create unique index if not exists weekly_challenges_one_active_idx
  on public.weekly_challenges ((status)) where status = 'active';

alter table public.competitions
  add column if not exists ended_by uuid references auth.users(id) on delete restrict;

alter table public.weekly_challenges enable row level security;
drop policy if exists "active admins manage weekly challenges" on public.weekly_challenges;
create policy "active admins manage weekly challenges"
  on public.weekly_challenges
  for all to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

create or replace view public.student_lifetime_totals
with (security_invoker = true)
as
select s.id as student_id, s.full_name, s.student_code, s.category, s.is_active,
       coalesce(sum(pe.points_delta), 0)::integer as total_points
from public.students s
left join public.point_entries pe on pe.student_id = s.id
group by s.id, s.full_name, s.student_code, s.category, s.is_active;

create or replace view public.student_weekly_totals
with (security_invoker = true)
as
select s.id as student_id, s.full_name, s.student_code, s.category, s.is_active,
       w.id as weekly_challenge_id, w.week_start, w.title, w.status,
       coalesce(sum(pe.points_delta), 0)::integer as total_points
from public.students s
cross join public.weekly_challenges w
left join public.point_entries pe
  on pe.student_id = s.id and pe.weekly_challenge_id = w.id
group by s.id, s.full_name, s.student_code, s.category, s.is_active,
         w.id, w.week_start, w.title, w.status;

grant select on public.student_lifetime_totals to authenticated;
grant select on public.student_weekly_totals to authenticated;
grant select, insert, update on public.weekly_challenges to authenticated;
grant select, insert, update on public.weekly_challenges to service_role;
