-- SENPlus+ Academy Ultra P5
-- 管理員儀表板：題庫品質檢查及逐題修正後端
-- 前置要求：public.question_quality_issues 已由 question-bank-quality-check.sql 建立。
-- 可安全重複執行。

begin;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.login_allowed, true) = true
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.admin_question_quality_report()
returns table (
  issue_type text,
  severity text,
  question_id bigint,
  node_code text,
  question_text text,
  details text,
  options jsonb,
  correct_answer text,
  explanation text,
  hint text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_current_user_admin() then
    raise exception '只有管理員可以執行題庫品質檢查。'
      using errcode = '42501';
  end if;

  return query
  select
    i.issue_type,
    i.severity,
    i.question_id::bigint,
    i.node_code,
    i.question_text,
    i.details,
    q.options,
    k.correct_answer #>> '{}',
    k.explanation,
    k.hint
  from public.question_quality_issues i
  join public.questions q on q.id = i.question_id
  left join public.question_answer_keys k on k.question_id = q.id
  order by
    case i.severity when 'error' then 1 else 2 end,
    i.node_code nulls last,
    i.issue_type,
    i.question_id;
end;
$$;

revoke all on function public.admin_question_quality_report() from public;
grant execute on function public.admin_question_quality_report() to authenticated;

create or replace function public.admin_update_question_quality(
  p_question_id bigint,
  p_question_text text,
  p_option_a text,
  p_option_b text,
  p_option_c text,
  p_option_d text,
  p_correct_answer text,
  p_explanation text default '',
  p_hint text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  answer_value text;
  remaining_issue_count integer;
begin
  if not public.is_current_user_admin() then
    raise exception '只有管理員可以修改題庫。'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.questions q where q.id = p_question_id) then
    raise exception '找不到題目 ID：%', p_question_id;
  end if;

  if btrim(coalesce(p_question_text, '')) = '' then
    raise exception '題目文字不能留空。';
  end if;

  if btrim(coalesce(p_option_a, '')) = ''
     or btrim(coalesce(p_option_b, '')) = ''
     or btrim(coalesce(p_option_c, '')) = ''
     or btrim(coalesce(p_option_d, '')) = '' then
    raise exception '四個選項均不能留空。';
  end if;

  if (
    select count(distinct lower(btrim(v.option_text)))
    from (values
      (p_option_a), (p_option_b), (p_option_c), (p_option_d)
    ) as v(option_text)
  ) <> 4 then
    raise exception '四個選項不能重複。';
  end if;

  answer_value := lower(btrim(coalesce(p_correct_answer, '')));
  if answer_value not in ('a', 'b', 'c', 'd') then
    raise exception '正確答案必須是 A、B、C 或 D。';
  end if;

  update public.questions
  set question_text = btrim(p_question_text),
      options = jsonb_build_array(
        jsonb_build_object('id', 'a', 'text', btrim(p_option_a)),
        jsonb_build_object('id', 'b', 'text', btrim(p_option_b)),
        jsonb_build_object('id', 'c', 'text', btrim(p_option_c)),
        jsonb_build_object('id', 'd', 'text', btrim(p_option_d))
      )
  where id = p_question_id;

  insert into public.question_answer_keys
    (question_id, correct_answer, explanation, hint)
  values (
    p_question_id,
    to_jsonb(answer_value),
    btrim(coalesce(p_explanation, '')),
    btrim(coalesce(p_hint, ''))
  )
  on conflict (question_id) do update
  set correct_answer = excluded.correct_answer,
      explanation = excluded.explanation,
      hint = excluded.hint;

  select count(*)::integer
  into remaining_issue_count
  from public.question_quality_issues i
  where i.question_id = p_question_id;

  return jsonb_build_object(
    'ok', true,
    'question_id', p_question_id,
    'remaining_issues', remaining_issue_count
  );
end;
$$;

revoke all on function public.admin_update_question_quality(
  bigint, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.admin_update_question_quality(
  bigint, text, text, text, text, text, text, text, text
) to authenticated;

commit;

select
  'admin_question_quality_backend_ready' as status,
  to_regprocedure('public.admin_question_quality_report()') is not null as report_ready,
  to_regprocedure(
    'public.admin_update_question_quality(bigint,text,text,text,text,text,text,text,text)'
  ) is not null as correction_ready;

