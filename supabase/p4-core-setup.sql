-- SENPlus+ Academy Ultra P4：核心年級設定
-- 與現有 P5 共用 Supabase；只新增 P4 課程骨架並把自助註冊改為安全支援 P1–P6。
-- 不刪除、不修改 P5 課程、題目、答案或成績。可安全重複執行。

begin;

create or replace function public.handle_self_service_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_grade text;
  display_name_value text;
begin
  if coalesce(new.raw_user_meta_data ->> 'signup_source', '') <> 'self_service' then
    return new;
  end if;

  requested_role := case when new.raw_user_meta_data ->> 'requested_role' = 'parent' then 'parent' else 'student' end;
  requested_grade := case
    when requested_role = 'student' and new.raw_user_meta_data ->> 'grade' in ('P1','P2','P3','P4','P5','P6')
      then new.raw_user_meta_data ->> 'grade'
    when requested_role = 'student' then 'P4'
    else null
  end;
  display_name_value := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60);

  if char_length(display_name_value) < 2 then
    raise exception 'Display name must contain at least 2 characters.';
  end if;

  insert into public.profiles (id, display_name, role, grade, login_allowed)
  values (new.id, display_name_value, requested_role, requested_grade, true)
  on conflict (id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      grade = excluded.grade,
      login_allowed = true;

  return new;
end;
$$;

insert into public.curriculum_subjects (grade, code, name_zh, name_en, sort_order)
select v.grade, v.code, v.name_zh, v.name_en, v.sort_order
from (values
  ('P4','chinese','中文','Chinese',1),
  ('P4','english','英文','English',2),
  ('P4','mathematics','數學','Mathematics',3),
  ('P4','humanities','人文科','Humanities',4),
  ('P4','science','科學','Science',5)
) as v(grade,code,name_zh,name_en,sort_order)
where not exists (
  select 1 from public.curriculum_subjects s where s.grade=v.grade and s.code=v.code
);

insert into public.curriculum_domains (subject_id, code, name_zh, name_en, sort_order)
select s.id, v.code, v.name_zh, v.name_en, v.sort_order
from public.curriculum_subjects s
join (values
  ('chinese','language','語文基礎','Language',1),
  ('chinese','reading','閱讀理解','Reading',2),
  ('chinese','writing','寫作','Writing',3),
  ('english','grammar','Grammar','Grammar',1),
  ('english','reading','Reading','Reading',2),
  ('mathematics','number','數','Number',1),
  ('mathematics','algebra','代數','Algebra',2),
  ('mathematics','measures','度量','Measures',3),
  ('mathematics','shape','圖形與空間','Shape and Space',4),
  ('mathematics','data','數據處理','Data Handling',5),
  ('humanities','general','人文科上學期','Humanities Term 1',1),
  ('science','general','科學科上學期','Science Term 1',1)
) as v(subject_code,code,name_zh,name_en,sort_order) on v.subject_code=s.code
where s.grade='P4'
  and not exists (
    select 1 from public.curriculum_domains d where d.subject_id=s.id and d.code=v.code
  );

create or replace function public.admin_question_quality_report_for_grade(p_grade text)
returns table (
  issue_type text, severity text, question_id bigint, node_code text,
  question_text text, details text, options jsonb, correct_answer text,
  explanation text, hint text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_user_admin() then
    raise exception '只有管理員可以執行題庫品質檢查。' using errcode='42501';
  end if;
  if p_grade not in ('P1','P2','P3','P4','P5','P6') then
    raise exception '年級無效。';
  end if;

  return query
  select i.issue_type, i.severity, i.question_id::bigint, i.node_code,
         i.question_text, i.details, q.options, k.correct_answer #>> '{}',
         k.explanation, k.hint
  from public.question_quality_issues i
  join public.questions q on q.id=i.question_id
  join public.curriculum_nodes n on n.id=q.node_id
  join public.curriculum_domains d on d.id=n.domain_id
  join public.curriculum_subjects s on s.id=d.subject_id
  left join public.question_answer_keys k on k.question_id=q.id
  where s.grade=p_grade
  order by case i.severity when 'error' then 1 else 2 end,
           i.node_code nulls last, i.issue_type, i.question_id;
end;
$$;

revoke all on function public.admin_question_quality_report_for_grade(text) from public;
grant execute on function public.admin_question_quality_report_for_grade(text) to authenticated;

create or replace function public.admin_question_quality_summary_for_grade(p_grade text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.is_current_user_admin() then
    raise exception '只有管理員可以執行題庫品質檢查。' using errcode='42501';
  end if;

  select jsonb_build_object(
    'total_questions', count(distinct q.id),
    'total_issues', count(i.question_id),
    'affected_questions', count(distinct i.question_id),
    'error_count', count(i.question_id) filter (where i.severity='error'),
    'warning_count', count(i.question_id) filter (where i.severity='warning')
  ) into result
  from public.curriculum_subjects s
  join public.curriculum_domains d on d.subject_id=s.id
  join public.curriculum_nodes n on n.domain_id=d.id
  join public.questions q on q.node_id=n.id
  left join public.question_quality_issues i on i.question_id=q.id
  where s.grade=p_grade;

  return result;
end;
$$;

revoke all on function public.admin_question_quality_summary_for_grade(text) from public;
grant execute on function public.admin_question_quality_summary_for_grade(text) to authenticated;

commit;

select s.grade, s.code, s.name_zh
from public.curriculum_subjects s
where s.grade='P4'
order by s.sort_order;
