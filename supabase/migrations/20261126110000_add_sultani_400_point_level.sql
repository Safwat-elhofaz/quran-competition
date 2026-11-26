-- Add the Sultan level at 400 lifetime points and include it in student groups,
-- public level classification, award progression, and admin group validation.

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_group_level_check;
ALTER TABLE public.students ADD CONSTRAINT students_group_level_check
  CHECK (group_level IS NULL OR group_level IN ('السلطاني','الملكي','الماسي','الذهبي','الفضي','البرونزي','الساعي'));

CREATE OR REPLACE FUNCTION private.issue_competition_rank_awards(p_competition_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_competition public.competitions;
begin
  select * into v_competition from public.competitions where id=p_competition_id and status='archived';
  if not found then return; end if;

  with base as (
    select mt.student_id,mt.full_name,mt.student_code,mt.total_points,s.group_level
    from public.student_monthly_totals mt
    join public.students s on s.id=mt.student_id
    where mt.competition_id=p_competition_id and mt.is_active=true and s.is_active=true
      and mt.total_points>0
  ), ranked as (
    select *,dense_rank() over(order by total_points desc) as rnk from base
  )
  insert into public.achievement_awards(
    student_id,student_name,student_code,competition_id,competition_title,month_start,
    achievement_key,medal_tier,target_group_at_award,rank_at_award,points_at_award
  )
  select student_id,full_name,student_code,p_competition_id,v_competition.title,v_competition.month_start,
    case when rnk=1 then 'overall_first' when rnk<=3 then 'overall_2_3' else 'overall_4_10' end,
    case when rnk=1 then 'وسام التاج' when rnk<=3 then 'وسام النخبة' else 'وسام الريادة' end,
    group_level,rnk,total_points
  from ranked where rnk<=10
  on conflict do nothing;

  with base as (
    select mt.student_id,mt.full_name,mt.student_code,mt.total_points,s.group_level
    from public.student_monthly_totals mt
    join public.students s on s.id=mt.student_id
    where mt.competition_id=p_competition_id and mt.is_active=true and s.is_active=true
      and mt.total_points>0
  ), ranked as (
    select *,dense_rank() over(partition by group_level order by total_points desc) as rnk
    from base where group_level is not null
  )
  insert into public.achievement_awards(
    student_id,student_name,student_code,competition_id,competition_title,month_start,
    achievement_key,medal_tier,target_group_at_award,rank_at_award,points_at_award
  )
  select student_id,full_name,student_code,p_competition_id,v_competition.title,v_competition.month_start,
    'target_group_leader','وسام التفوق',group_level,rnk,total_points
  from ranked where rnk=1
  on conflict do nothing;

  with lifetime as (
    select s.id,s.full_name,s.student_code,s.group_level,coalesce(lt.total_points,0)::integer as lifetime_points,
      case when coalesce(lt.total_points,0)>=400 then 7 when coalesce(lt.total_points,0)>=300 then 6 when coalesce(lt.total_points,0)>=250 then 5
        when coalesce(lt.total_points,0)>=200 then 4 when coalesce(lt.total_points,0)>=150 then 3
        when coalesce(lt.total_points,0)>=100 then 2 when coalesce(lt.total_points,0)>=75 then 1 else 0 end as current_level_rank
    from public.students s left join public.student_lifetime_totals lt on lt.student_id=s.id
    where s.is_active=true and s.group_level is not null
  ), ranked as (
    select *,dense_rank() over(partition by current_level_rank order by lifetime_points desc) as level_leader_rank
    from lifetime where current_level_rank>0
  )
  insert into public.achievement_awards(
    student_id,student_name,student_code,competition_id,competition_title,month_start,
    achievement_key,medal_tier,target_group_at_award,rank_at_award,points_at_award
  )
  select id,full_name,student_code,p_competition_id,v_competition.title,v_competition.month_start,
    'higher_group_leader','وسام التميز',group_level,level_leader_rank,lifetime_points
  from ranked
  where level_leader_rank=1 and current_level_rank >
    case group_level when 'الساعي' then 1 when 'البرونزي' then 2 when 'الفضي' then 3
      when 'الذهبي' then 4 when 'الماسي' then 5 when 'السلطاني' then 7 when 'الملكي' then 6 else 99 end
  on conflict do nothing;
end;
$function$


CREATE OR REPLACE FUNCTION private.issue_target_achievement_awards_internal(p_student_id uuid, p_competition_id uuid, p_allow_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student public.students;
  v_competition public.competitions;
  v_points integer;
  v_target_rank integer;
  v_current_rank integer;
begin
  if p_student_id is null or p_competition_id is null then return; end if;
  select * into v_competition from public.competitions
   where id=p_competition_id
     and ((status='active' and awards_finalized_at is null)
       or (p_allow_archived=true and status='archived' and awards_revision_pending=true));
  if not found then return; end if;
  select * into v_student from public.students where id=p_student_id and is_active=true;
  if not found then return; end if;
  select coalesce(total_points,0)::integer into v_points
   from public.student_lifetime_totals where student_id=p_student_id;
  v_points:=coalesce(v_points,0);
  v_target_rank:=case v_student.group_level
    when 'الساعي' then 1 when 'البرونزي' then 2 when 'الفضي' then 3
    when 'الذهبي' then 4 when 'الماسي' then 5 when 'السلطاني' then 7 when 'الملكي' then 6 else null end;
  v_current_rank:=case
    when v_points>=400 then 7 when v_points>=300 then 6 when v_points>=250 then 5
    when v_points>=200 then 4 when v_points>=150 then 3
    when v_points>=100 then 2 when v_points>=75 then 1 else 0 end;
  if v_target_rank is not null and v_current_rank>=v_target_rank then
    insert into public.achievement_awards(
      student_id,student_name,student_code,competition_id,competition_title,month_start,
      achievement_key,medal_tier,target_group_at_award,points_at_award
    ) values (
      v_student.id,v_student.full_name,v_student.student_code,v_competition.id,
      v_competition.title,v_competition.month_start,'target_reached','وسام الاستحقاق',
      v_student.group_level,v_points
    ) on conflict do nothing;
  end if;
  if v_target_rank is not null and v_current_rank>v_target_rank then
    insert into public.achievement_awards(
      student_id,student_name,student_code,competition_id,competition_title,month_start,
      achievement_key,medal_tier,target_group_at_award,points_at_award
    ) values (
      v_student.id,v_student.full_name,v_student.student_code,v_competition.id,
      v_competition.title,v_competition.month_start,'target_exceeded','وسام التقدير',
      v_student.group_level,v_points
    ) on conflict do nothing;
  end if;
end;
$function$


CREATE OR REPLACE FUNCTION private.public_leaderboards()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select s.student_id,s.full_name,coalesce(s.total_points,0)::integer as total_points,
      case
        when coalesce(s.total_points,0)>=400 then 'السلطاني' when coalesce(s.total_points,0)>=300 then 'الملكي'
        when coalesce(s.total_points,0)>=250 then 'الماسي'
        when coalesce(s.total_points,0)>=200 then 'الذهبي'
        when coalesce(s.total_points,0)>=150 then 'الفضي'
        when coalesce(s.total_points,0)>=100 then 'البرونزي'
        when coalesce(s.total_points,0)>=75 then 'الساعي'
        else 'بدون مستوى'
      end as level_name,
      coalesce(st.group_level,'غير محددة') as group_name
    from public.student_lifetime_totals s
    left join public.students st on st.id=s.student_id
    where s.is_active=true
  ),
  overall_ranked as (
    select dense_rank() over(order by total_points desc) rn,full_name,total_points from base
  ),
  overall as (
    select jsonb_agg(jsonb_build_object('rank',ranked.rn,'name',ranked.full_name,'points',ranked.total_points) order by ranked.rn,ranked.full_name collate "C") items
    from (select * from overall_ranked where rn<=10) ranked
  ),
  group_ranked as (
    select group_name,full_name,total_points,dense_rank() over(partition by group_name order by total_points desc) rn from base
  ),
  groups as (
    select group_name,jsonb_agg(jsonb_build_object('rank',rn,'name',full_name,'points',total_points) order by rn,full_name collate "C") items
    from group_ranked where rn<=10 group by group_name
  ),
  level_ranked as (
    select level_name,full_name,total_points,dense_rank() over(partition by level_name order by total_points desc) rn
    from base where level_name<>'بدون مستوى'
  ),
  levels as (
    select level_name,jsonb_agg(jsonb_build_object('rank',rn,'name',full_name,'points',total_points) order by rn,full_name collate "C") items
    from level_ranked where rn<=10 group by level_name
  ),
  last_update as (
    select max(updated_at) as updated_at from (
      select max(pe.created_at) as updated_at
      from public.point_entries pe join public.students s on s.id=pe.student_id
      where s.is_active=true
      union all
      select max(al.created_at) as updated_at
      from public.admin_audit_logs al where al.entity_type='student'
    ) updates
  )
  select jsonb_build_object(
    'overall',coalesce((select items from overall),'[]'::jsonb),
    'groups',coalesce((select jsonb_object_agg(group_name,items) from groups),'{}'::jsonb),
    'levels',coalesce((select jsonb_object_agg(level_name,items) from levels),'{}'::jsonb),
    'updated_at',(select updated_at from last_update)
  );
$function$


CREATE OR REPLACE FUNCTION private.student_lookup_by_code_internal(p_student_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text := btrim(coalesce(p_student_code, ''));
  v_headers jsonb; v_ip text; v_ip_hash text; v_attempts integer; v_result jsonb;
begin
  if v_code !~ '^[0-9]{5}$' then raise exception 'اكتب كودًا صحيحًا مكوّنًا من خمسة أرقام'; end if;
  if coalesce(current_setting('app.achievement_card_refresh', true), 'false') <> 'true' then
  v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip := split_part(coalesce(v_headers->>'x-forwarded-for',v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip','unknown'), ',', 1);
  v_ip_hash := md5(coalesce(nullif(btrim(v_ip), ''), 'unknown'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_ip_hash));
  delete from private.student_lookup_attempts where ip_hash=v_ip_hash and attempted_at<now()-interval '1 day';
  select count(*)::integer into v_attempts from private.student_lookup_attempts where ip_hash=v_ip_hash and attempted_at>now()-interval '10 minutes';
  if v_attempts>=10 then raise exception 'تم تجاوز عدد محاولات الاستعلام. حاول مرة أخرى بعد عشر دقائق.'; end if;
  insert into private.student_lookup_attempts(ip_hash) values(v_ip_hash);
  end if;

  with totals as (
    select s.id,s.full_name,s.student_code,s.group_level,coalesce(sum(pe.points_delta),0)::integer as total_points
    from public.students s left join public.point_entries pe on pe.student_id=s.id
    where s.is_active group by s.id,s.full_name,s.student_code,s.group_level
  ), classified as (
    select *,case when total_points>=400 then 'السلطاني' when total_points>=300 then 'الملكي' when total_points>=250 then 'الماسي'
      when total_points>=200 then 'الذهبي' when total_points>=150 then 'الفضي'
      when total_points>=100 then 'البرونزي' when total_points>=75 then 'الساعي' else 'بدون مستوى' end as level_name from totals
  ), ranked as (
    select *,dense_rank() over(order by total_points desc) as overall_rank,
      dense_rank() over(partition by level_name order by total_points desc) as level_rank,
      count(*) over(partition by level_name) as level_size from classified
  ), target as (select * from ranked where student_code=v_code limit 1),
  monthly_active as (select id,title,month_start from public.competitions where status='active' order by month_start desc,created_at desc limit 1),
  monthly_ranked as (
    select mt.student_id,mt.total_points,dense_rank() over(order by mt.total_points desc) as challenge_rank
    from public.student_monthly_totals mt join monthly_active ma on ma.id=mt.competition_id where mt.is_active
  ), weekly_active as (
    select id,title,week_number,week_start,week_end,competition_id
    from public.weekly_challenges where status='active' order by created_at desc limit 1
  ), weekly_ranked as (
    select wt.student_id,wt.total_points,dense_rank() over(order by wt.total_points desc) as challenge_rank
    from private.student_weekly_running_totals wt join weekly_active wa on wa.id=wt.weekly_challenge_id where wt.is_active
  ), group_ranked as (
    select totals.*,dense_rank() over(partition by group_level order by total_points desc) as group_rank,
      count(*) over(partition by group_level) as group_size,
      round(avg(total_points) over(partition by group_level))::integer as group_average
    from totals
  )
  select jsonb_build_object(
    'student',jsonb_build_object(
      'full_name',t.full_name,'student_code',t.student_code,'group_level',t.group_level,
      'total_points',t.total_points,'level',t.level_name,'level_rank',t.level_rank,
      'level_size',t.level_size,'overall_rank',t.overall_rank,'overall_size',(select count(*) from ranked),
      'next_level',case when t.total_points<75 then 'الساعي' when t.total_points<100 then 'البرونزي'
        when t.total_points<150 then 'الفضي' when t.total_points<200 then 'الذهبي'
        when t.total_points<250 then 'الماسي' when t.total_points<300 then 'الملكي' when t.total_points<400 then 'السلطاني' else null end,
      'next_level_points',case when t.total_points<75 then 75 when t.total_points<100 then 100
        when t.total_points<150 then 150 when t.total_points<200 then 200 when t.total_points<250 then 250
        when t.total_points<300 then 300 when t.total_points<400 then 400 else null end
    ),
    'monthly',(select jsonb_build_object('title',ma.title,'month_start',ma.month_start,
      'total_points',coalesce(mr.total_points,0),'rank',coalesce(mr.challenge_rank,0))
      from monthly_active ma left join monthly_ranked mr on mr.student_id=t.id),
    'weekly',(select jsonb_build_object('title',wa.title,'week_number',wa.week_number,'week_start',wa.week_start,'week_end',wa.week_end,
      'total_points',coalesce(wr.total_points,0),'rank',coalesce(wr.challenge_rank,0))
      from weekly_active wa left join weekly_ranked wr on wr.student_id=t.id),
    'performance',jsonb_build_object(
      'group_rank',(select gr.group_rank from group_ranked gr where gr.id=t.id),
      'group_size',(select gr.group_size from group_ranked gr where gr.id=t.id),
      'group_average',(select gr.group_average from group_ranked gr where gr.id=t.id),
      'group_top_points',(select max(gr.total_points) from group_ranked gr where gr.group_level is not distinct from t.group_level),
      'group_students',(select coalesce(jsonb_agg(jsonb_build_object('name',nearby.full_name,'points',nearby.total_points,'rank',nearby.group_rank,'is_student',nearby.id=t.id) order by nearby.group_rank),'[]'::jsonb)
        from group_ranked nearby join group_ranked me on me.id=t.id
        where nearby.group_level is not distinct from t.group_level
          and nearby.group_rank between me.group_rank-2 and me.group_rank+2),
      'weekly_history',(select coalesce(jsonb_agg(jsonb_build_object(
          'week_number',wh.week_number,'title',wh.title,'week_start',wh.week_start,'week_end',wh.week_end,
          'points',coalesce((select sum(pe.points_delta)::integer from public.point_entries pe where pe.student_id=t.id and pe.weekly_challenge_id=wh.id),0),
          'group_average',coalesce((select round(avg(coalesce((select sum(pe2.points_delta)::numeric from public.point_entries pe2 where pe2.student_id=gs.id and pe2.weekly_challenge_id=wh.id),0)))::integer
            from public.students gs where gs.is_active and gs.group_level is not distinct from t.group_level),0)
        ) order by wh.week_number),'[]'::jsonb)
        from public.weekly_challenges wh join monthly_active ma on ma.id=wh.competition_id),
      'weeks_count',(select count(*) from public.weekly_challenges wh join monthly_active ma on ma.id=wh.competition_id),
      'highest_week',(select coalesce(max(coalesce((select sum(pe.points_delta)::integer from public.point_entries pe where pe.student_id=t.id and pe.weekly_challenge_id=wh.id),0)),0)
        from public.weekly_challenges wh join monthly_active ma on ma.id=wh.competition_id)
    )
  ) into v_result from target t;
  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_create_student(p_full_name text, p_group_level text)
 RETURNS TABLE(student_id uuid, full_name text, student_code text, group_level text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_code text;
  v_student_id uuid;
  v_name text := nullif(btrim(p_full_name), '');
  v_group text := nullif(btrim(p_group_level), '');
  v_attempt integer := 0;
begin
  if (select auth.uid()) is null or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بإضافة الطلاب';
  end if;
  if v_name is null or length(v_name) > 150 then
    raise exception 'اسم الطالب مطلوب ويجب ألا يزيد عن 150 حرفًا';
  end if;
  if v_group not in ('السلطاني','الملكي','الماسي','الذهبي','الفضي','البرونزي','الساعي') then
    raise exception 'اختر مجموعة صحيحة من المجموعات السبع';
  end if;
  if exists (select 1 from public.students s where lower(btrim(s.full_name)) = lower(v_name)) then
    raise exception 'يوجد طالب مسجل بنفس الاسم بالفعل';
  end if;
  loop
    v_code := lpad(floor(random() * 100000)::integer::text, 5, '0');
    begin
      insert into public.students(full_name, student_code, is_active, group_level)
      values (v_name, v_code, true, v_group)
      returning id into v_student_id;
      exit;
    exception when unique_violation then
      if exists (select 1 from public.students s where lower(btrim(s.full_name)) = lower(v_name)) then
        raise exception 'يوجد طالب مسجل بنفس الاسم بالفعل';
      end if;
      v_attempt := v_attempt + 1;
      if v_attempt >= 30 then raise exception 'تعذر توليد كود فريد، حاول مرة أخرى'; end if;
    end;
  end loop;
  return query select v_student_id, v_name, v_code, v_group;
end;
$function$


CREATE OR REPLACE FUNCTION public.admin_update_student_profile(p_student_id uuid, p_full_name text, p_group_level text)
 RETURNS TABLE(student_id uuid, full_name text, group_level text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text := nullif(btrim(p_full_name), '');
  v_group text := nullif(btrim(p_group_level), '');
begin
  if (select auth.uid()) is null or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بتعديل بيانات الطلاب';
  end if;
  if p_student_id is null then raise exception 'الطالب غير محدد'; end if;
  if v_name is null or length(v_name) > 150 then
    raise exception 'اسم الطالب مطلوب ويجب ألا يزيد عن 150 حرفًا';
  end if;
  if v_group not in ('السلطاني','الملكي','الماسي','الذهبي','الفضي','البرونزي','الساعي') then
    raise exception 'اختر مجموعة صحيحة من المجموعات السبع';
  end if;
  update public.students set full_name=v_name, group_level=v_group, updated_at=now() where id=p_student_id;
  if not found then raise exception 'الطالب غير موجود'; end if;
  return query select p_student_id,v_name,v_group;
end;
$function$


CREATE OR REPLACE FUNCTION public.student_lookup_by_code(p_student_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_student jsonb;
  v_group text;
  v_points integer;
  v_required integer;
  v_reached boolean;
  v_status text;
  v_top_points integer;
  v_top_difference integer;
  v_student_id uuid;
  v_active_competition_id uuid;
begin
  v_result := private.student_lookup_by_code_internal(p_student_code);
  if v_result is null then return null; end if;
  v_student := coalesce(v_result->'student','{}'::jsonb);
  v_group := v_student->>'group_level';
  v_points := coalesce((v_student->>'total_points')::integer,0);
  v_required := case v_group
    when 'الساعي' then 75 when 'البرونزي' then 100 when 'الفضي' then 150
    when 'الذهبي' then 200 when 'الماسي' then 250 when 'السلطاني' then 400 when 'الملكي' then 300 else null end;
  v_reached := case when v_required is null then null else v_points>=v_required end;
  v_status := case when v_required is null then 'لم تُحدد مجموعة مستهدفة'
    when v_reached then 'حققت مجموعتك المستهدفة' else 'لسه في الطريق إلى '||v_group end;
  v_top_points := nullif(v_result#>>'{performance,group_top_points}','')::integer;
  v_top_difference := case when coalesce(v_top_points,0)=0 then null
    else round(((v_points-v_top_points)::numeric/v_top_points)*100)::integer end;
  v_student := v_student || jsonb_build_object(
    'target_group_rank',v_result#>'{performance,group_rank}',
    'target_group_size',v_result#>'{performance,group_size}',
    'target_group_reached',v_reached,'target_group_status',v_status,
    'target_group_required_points',v_required,'target_group_top_points',v_top_points,
    'target_group_top_difference_percent',v_top_difference
  );
  select id into v_student_id from public.students
   where student_code=btrim(coalesce(p_student_code,'')) and is_active=true limit 1;
  select id into v_active_competition_id from public.competitions
   where status='active' order by month_start desc,created_at desc limit 1;
  if v_active_competition_id is null then
    select id into v_active_competition_id from public.competitions
     order by month_start desc,created_at desc limit 1;
  end if;
  v_result := jsonb_set(v_result,'{student}',v_student,true);
  v_result := v_result || jsonb_build_object(
    'achievement_awards',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'achievement_key',a.achievement_key,'medal_tier',a.medal_tier,
        'target_group_at_award',a.target_group_at_award,'rank_at_award',a.rank_at_award,
        'points_at_award',a.points_at_award,'earned_at',a.earned_at,'competition_id',a.competition_id,
        'competition_title',a.competition_title,'month_start',a.month_start,'greeting_seen_at',a.greeting_seen_at
      ) order by a.earned_at desc)
      from public.achievement_awards a
      where a.student_id=v_student_id and a.status='active' and a.competition_id=v_active_competition_id
    ),'[]'::jsonb),
    'all_achievement_awards',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'achievement_key',a.achievement_key,'medal_tier',a.medal_tier,
        'target_group_at_award',a.target_group_at_award,'rank_at_award',a.rank_at_award,
        'points_at_award',a.points_at_award,'earned_at',a.earned_at,'competition_id',a.competition_id,
        'competition_title',a.competition_title,'month_start',a.month_start,'greeting_seen_at',a.greeting_seen_at
      ) order by a.month_start desc,a.earned_at desc)
      from public.achievement_awards a where a.student_id=v_student_id and a.status='active'
    ),'[]'::jsonb),
    'new_achievement_awards',coalesce((
      select jsonb_agg(jsonb_build_object('id',a.id,'achievement_key',a.achievement_key,'medal_tier',a.medal_tier,
        'competition_title',a.competition_title,'month_start',a.month_start)
        order by a.month_start desc,a.earned_at desc)
      from public.achievement_awards a where a.student_id=v_student_id and a.status='active' and a.greeting_seen_at is null
    ),'[]'::jsonb)
  );
  return v_result;
end;
$function$

