create or replace function public.admin_create_student(p_full_name text)
returns table(student_id uuid, full_name text, student_code text)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_code text;
  v_student_id uuid;
  v_name text := nullif(btrim(p_full_name), '');
  v_attempt integer := 0;
begin
  if (select auth.uid()) is null or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بإضافة الطلاب';
  end if;
  if v_name is null or length(v_name) > 150 then
    raise exception 'اسم الطالب مطلوب ويجب ألا يزيد عن 150 حرفًا';
  end if;
  loop
    v_code := lpad(floor(random() * 100000)::integer::text, 5, '0');
    begin
      insert into public.students(full_name, student_code, is_active)
      values (v_name, v_code, true)
      returning id into v_student_id;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 30 then raise exception 'تعذر توليد كود فريد، حاول مرة أخرى'; end if;
    end;
  end loop;
  return query select v_student_id, v_name, v_code;
end;
$function$;

create or replace function public.admin_delete_student_permanently(p_student_id uuid)
returns table(deleted_point_entries integer)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_count integer;
begin
  if (select auth.uid()) is null or not coalesce((select private.is_active_admin()), false) then
    raise exception 'غير مصرح بحذف الطلاب';
  end if;
  if p_student_id is null then raise exception 'معرّف الطالب غير صحيح'; end if;
  perform 1 from public.students where id = p_student_id for update;
  if not found then raise exception 'الطالب غير موجود'; end if;
  delete from public.admin_audit_logs
  where entity_type = 'point_entry'
    and entity_id in (select pe.id::text from public.point_entries pe where pe.student_id = p_student_id);
  delete from public.point_entries where student_id = p_student_id;
  get diagnostics v_count = row_count;
  delete from public.students where id = p_student_id;
  if not found then raise exception 'تعذر حذف الطالب'; end if;
  return query select v_count;
end;
$function$;

revoke all on function public.admin_create_student(text) from public, anon;
revoke all on function public.admin_delete_student_permanently(uuid) from public, anon;
grant execute on function public.admin_create_student(text) to authenticated;
grant execute on function public.admin_delete_student_permanently(uuid) to authenticated;
