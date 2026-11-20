create or replace function private.student_lookup_by_code_internal(p_student_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_code text := btrim(coalesce(p_student_code, ''));
  v_headers jsonb; v_ip text; v_ip_hash text; v_attempts integer; v_result jsonb;
begin
  if v_code !~ '^[0-9]{5}$' then raise exception 'اكتب كودًا صحيحًا مكوّنًا من خمسة أرقام'; end if;
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip := split_part(coalesce(v_headers->>'x-forwarded-for',v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip','unknown'), ',', 1);
  v_ip_hash := md5(coalesce(nullif(btrim(v_ip), ''), 'unknown'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_ip_hash));
  delete from private.student_lookup_attempts where ip_hash=v_ip_hash and attempted_at<now()-interval '1 day';
  select count(*)::integer into v_attempts from private.student_lookup_attempts where ip_hash=v_ip_hash and attempted_at>now()-interval '10 minutes';
  if v_attempts>=10 then raise exception 'تم تجاوز عدد محاولات الاستعلام. حاول مرة أخرى بعد عشر دقائق.'; end if;
  insert into private.student_lookup_attempts(ip_hash) values(v_ip_hash);
  with totals as (
    select s.id,s.full_name,s.student_code,coalesce(sum(pe.points_delta),0)::integer as total_points
    from public.students s left join public.point_entries pe on pe.student_id=s.id where s.is_active
    group by s.id,s.full_name,s.student_code
  ), classified as (
    select *,case when total_points>=300 then 'الملكي' when total_points>=250 then 'الماسي' when total_points>=200 then 'الذهبي'
      when total_points>=150 then 'الفضي' when total_points>=100 then 'البرونزي' when total_points>=75 then 'الساعي' else 'بدون مستوى' end as level_name
    from totals
  ), ranked as (
    select *,dense_rank() over(order by total_points desc) as overall_rank,
      dense_rank() over(partition by level_name order by total_points desc) as level_rank,count(*) over(partition by level_name) as level_size from classified
  ), target as (select * from ranked where student_code=v_code limit 1),
  monthly_active as (select id,title,month_start from public.competitions where status='active' order by month_start desc,created_at desc limit 1),
  monthly_ranked as (select mt.student_id,mt.total_points,dense_rank() over(order by mt.total_points desc) as challenge_rank
    from public.student_monthly_totals mt join monthly_active ma on ma.id=mt.competition_id where mt.is_active),
  weekly_active as (select id,title,week_number,week_start,week_end from public.weekly_challenges where status='active' order by created_at desc limit 1),
  weekly_ranked as (select wt.student_id,wt.total_points,dense_rank() over(order by wt.total_points desc) as challenge_rank
    from public.student_weekly_totals wt join weekly_active wa on wa.id=wt.weekly_challenge_id where wt.is_active)
  select jsonb_build_object(
    'student',jsonb_build_object('full_name',t.full_name,'student_code',t.student_code,'total_points',t.total_points,'level',t.level_name,
      'level_rank',t.level_rank,'level_size',t.level_size,'overall_rank',t.overall_rank,'overall_size',(select count(*) from ranked),
      'next_level',case when t.total_points<75 then 'الساعي' when t.total_points<100 then 'البرونزي' when t.total_points<150 then 'الفضي'
        when t.total_points<200 then 'الذهبي' when t.total_points<250 then 'الماسي' when t.total_points<300 then 'الملكي' else null end,
      'next_level_points',case when t.total_points<75 then 75 when t.total_points<100 then 100 when t.total_points<150 then 150
        when t.total_points<200 then 200 when t.total_points<250 then 250 when t.total_points<300 then 300 else null end),
    'monthly',(select jsonb_build_object('title',ma.title,'month_start',ma.month_start,'total_points',coalesce(mr.total_points,0),'rank',coalesce(mr.challenge_rank,0))
      from monthly_active ma left join monthly_ranked mr on mr.student_id=t.id),
    'weekly',(select jsonb_build_object('title',wa.title,'week_number',wa.week_number,'week_start',wa.week_start,'week_end',wa.week_end,
      'total_points',coalesce(wr.total_points,0),'rank',coalesce(wr.challenge_rank,0)) from weekly_active wa left join weekly_ranked wr on wr.student_id=t.id)
  ) into v_result from target t;
  return v_result;
end;
$function$;
revoke all on function private.student_lookup_by_code_internal(text) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.student_lookup_by_code_internal(text) to anon,authenticated;
create or replace function public.student_lookup_by_code(p_student_code text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.student_lookup_by_code_internal(p_student_code); $function$;
revoke all on function public.student_lookup_by_code(text) from public;
grant execute on function public.student_lookup_by_code(text) to anon,authenticated;