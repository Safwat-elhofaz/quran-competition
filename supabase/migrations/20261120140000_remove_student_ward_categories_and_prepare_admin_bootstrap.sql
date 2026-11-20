drop view if exists public.student_monthly_totals;
drop view if exists public.student_weekly_totals;
drop view if exists public.student_lifetime_totals;
alter table public.students drop constraint if exists students_category_check;
alter table public.students drop column if exists category;
create or replace view public.student_lifetime_totals with (security_invoker = true) as
select s.id as student_id,s.full_name,s.student_code,s.is_active,coalesce(sum(pe.points_delta),0)::integer as total_points
from public.students s left join public.point_entries pe on pe.student_id=s.id
group by s.id,s.full_name,s.student_code,s.is_active;
create or replace view public.student_monthly_totals with (security_invoker = true) as
select s.id as student_id,s.full_name,s.student_code,s.is_active,c.id as competition_id,c.month_start,coalesce(sum(pe.points_delta),0)::integer as total_points
from public.students s cross join public.competitions c left join public.point_entries pe on pe.student_id=s.id and pe.competition_id=c.id
group by s.id,s.full_name,s.student_code,s.is_active,c.id,c.month_start;
create or replace view public.student_weekly_totals with (security_invoker = true) as
select s.id as student_id,s.full_name,s.student_code,s.is_active,w.id as weekly_challenge_id,w.week_start,w.title,w.status,coalesce(sum(pe.points_delta),0)::integer as total_points
from public.students s cross join public.weekly_challenges w left join public.point_entries pe on pe.student_id=s.id and pe.weekly_challenge_id=w.id
group by s.id,s.full_name,s.student_code,s.is_active,w.id,w.week_start,w.title,w.status;
grant select on public.student_lifetime_totals,public.student_monthly_totals,public.student_weekly_totals to authenticated;
alter table public.admin_profiles add column if not exists must_change_password boolean not null default false;
revoke update on public.admin_profiles from authenticated;
grant update (must_change_password) on public.admin_profiles to authenticated;
drop policy if exists "admins update own password setup flag" on public.admin_profiles;
create policy "admins update own password setup flag" on public.admin_profiles for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create table if not exists public.admin_bootstrap_state(
 id smallint primary key check(id=1),
 status text not null check(status in ('in_progress','failed','completed')),
 updated_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.admin_bootstrap_state enable row level security;
revoke all on public.admin_bootstrap_state from anon,authenticated;
grant all on public.admin_bootstrap_state to service_role;
