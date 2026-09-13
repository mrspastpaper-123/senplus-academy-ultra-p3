-- SENPlus+ Academy Ultra P5：題庫品質檢查器
-- 功能：檢查重複題、答案缺失／無效、四個選項格式／內容重複，以及可疑貨幣符號。
-- 此檔只建立檢查報告，不會刪除或修改任何題目。
-- 可安全重複執行。

begin;

drop view if exists public.question_quality_issues;

create view public.question_quality_issues
with (security_invoker = true)
as
with question_base as (
  select
    q.id as question_id,
    q.node_id,
    n.code as node_code,
    q.question_text,
    q.options,
    k.correct_answer,
    k.explanation,
    k.hint,
    lower(regexp_replace(
      btrim(regexp_replace(
        coalesce(q.question_text, ''),
        '^[[:space:]]*【[^】]+】[[:space:]]*',
        '',
        'g'
      )),
      '[[:space:]]+',
      ' ',
      'g'
    ))
      as normalised_question,
    coalesce((
      select string_agg(
        lower(regexp_replace(
          btrim(coalesce(option_item.item ->> 'text', '')),
          '[[:space:]]+', ' ', 'g'
        )),
        ' || '
        order by lower(regexp_replace(
          btrim(coalesce(option_item.item ->> 'text', '')),
          '[[:space:]]+', ' ', 'g'
        ))
      )
      from jsonb_array_elements(
        case when jsonb_typeof(q.options) = 'array' then q.options else '[]'::jsonb end
      ) as option_item(item)
    ), '') as normalised_options
  from public.questions q
  left join public.curriculum_nodes n on n.id = q.node_id
  left join public.question_answer_keys k on k.question_id = q.id
),
duplicate_questions as (
  select node_id, normalised_question, normalised_options
  from question_base
  where normalised_question <> ''
  group by node_id, normalised_question, normalised_options
  having count(*) > 1
),
option_stats as (
  select
    qb.question_id,
    case
      when jsonb_typeof(qb.options) = 'array' then jsonb_array_length(qb.options)
      else null
    end as option_count,
    count(*) filter (
      where btrim(coalesce(o.item ->> 'id', '')) <> ''
    ) as non_empty_id_count,
    count(distinct lower(btrim(coalesce(o.item ->> 'id', '')))) filter (
      where btrim(coalesce(o.item ->> 'id', '')) <> ''
    ) as distinct_id_count,
    count(*) filter (
      where btrim(coalesce(o.item ->> 'text', '')) <> ''
    ) as non_empty_text_count,
    count(distinct lower(regexp_replace(
      btrim(coalesce(o.item ->> 'text', '')), '[[:space:]]+', ' ', 'g'
    ))) filter (
      where btrim(coalesce(o.item ->> 'text', '')) <> ''
    ) as distinct_text_count
  from question_base qb
  left join lateral jsonb_array_elements(
    case when jsonb_typeof(qb.options) = 'array' then qb.options else '[]'::jsonb end
  ) as o(item) on true
  group by qb.question_id, qb.options
),
issues as (
  -- 1. 同一單元內的題目文字及選項均相同（忽略選項排列、英文大小寫及多餘空格）
  select
    'duplicate_question'::text as issue_type,
    'error'::text as severity,
    qb.question_id,
    qb.node_code,
    qb.question_text,
    '題目文字及選項與同一單元內另一題相同。'::text as details
  from question_base qb
  join duplicate_questions d using (node_id, normalised_question, normalised_options)

  union all

  -- 2. 沒有答案資料、答案為空、答案不是 a–d，或答案沒有對應選項
  select
    'missing_or_invalid_answer',
    'error',
    qb.question_id,
    qb.node_code,
    qb.question_text,
    case
      when qb.correct_answer is null then '找不到答案資料。'
      when btrim(coalesce(qb.correct_answer #>> '{}', '')) = '' then '答案是空白。'
      when lower(qb.correct_answer #>> '{}') not in ('a', 'b', 'c', 'd')
        then '答案必須是 a、b、c 或 d。'
      else '答案所指的選項不存在。'
    end
  from question_base qb
  where qb.correct_answer is null
     or btrim(coalesce(qb.correct_answer #>> '{}', '')) = ''
     or lower(coalesce(qb.correct_answer #>> '{}', '')) not in ('a', 'b', 'c', 'd')
     or not exists (
       select 1
       from jsonb_array_elements(
         case when jsonb_typeof(qb.options) = 'array' then qb.options else '[]'::jsonb end
       ) as answer_option(item)
       where lower(btrim(coalesce(answer_option.item ->> 'id', '')))
             = lower(btrim(coalesce(qb.correct_answer #>> '{}', '')))
     )

  union all

  -- 3a. options 不是 JSON 陣列或不是四個選項
  select
    'invalid_option_count',
    'error',
    qb.question_id,
    qb.node_code,
    qb.question_text,
    case
      when jsonb_typeof(qb.options) is distinct from 'array' then '選項不是 JSON 陣列。'
      else '選項數量不是 4 個；目前為 ' || coalesce(os.option_count::text, '0') || ' 個。'
    end
  from question_base qb
  join option_stats os using (question_id)
  where jsonb_typeof(qb.options) is distinct from 'array'
     or os.option_count <> 4

  union all

  -- 3b. 選項 id 缺失／重複，或選項文字缺失／重複
  select
    'duplicate_or_empty_options',
    'error',
    qb.question_id,
    qb.node_code,
    qb.question_text,
    concat_ws('；',
      case when os.non_empty_id_count < 4 then '有選項缺少 id' end,
      case when os.distinct_id_count < os.non_empty_id_count then '選項 id 重複' end,
      case when os.non_empty_text_count < 4 then '有選項文字留空' end,
      case when os.distinct_text_count < os.non_empty_text_count then '四個選項中有相同文字' end
    ) || '。'
  from question_base qb
  join option_stats os using (question_id)
  where os.non_empty_id_count < 4
     or os.distinct_id_count < os.non_empty_id_count
     or os.non_empty_text_count < 4
     or os.distinct_text_count < os.non_empty_text_count

  union all

  -- 4. 香港題庫內可能誤用的外幣符號；需人工確認語境
  select
    'currency_symbol_review',
    'warning',
    qb.question_id,
    qb.node_code,
    qb.question_text,
    concat_ws('；',
      case when coalesce(qb.question_text, '') ~ '[£€¥￥₩₹₽]' then '題目文字含外幣符號' end,
      case when coalesce(qb.options::text, '') ~ '[£€¥￥₩₹₽]' then '選項含外幣符號' end,
      case when coalesce(qb.explanation, '') ~ '[£€¥￥₩₹₽]' then '解析含外幣符號' end,
      case when coalesce(qb.hint, '') ~ '[£€¥￥₩₹₽]' then '提示含外幣符號' end
    ) || '；請確認是否應改為 $ 或 HK$。'
  from question_base qb
  where coalesce(qb.question_text, '') ~ '[£€¥￥₩₹₽]'
     or coalesce(qb.options::text, '') ~ '[£€¥￥₩₹₽]'
     or coalesce(qb.explanation, '') ~ '[£€¥￥₩₹₽]'
     or coalesce(qb.hint, '') ~ '[£€¥￥₩₹₽]'
)
select
  issue_type,
  severity,
  question_id,
  node_code,
  question_text,
  details
from issues;

comment on view public.question_quality_issues is
  'SENPlus+ 題庫品質報告：重複題、答案、選項及貨幣符號檢查。';

-- 不把完整答案資料公開給匿名或一般登入帳戶。
revoke all on public.question_quality_issues from public, anon, authenticated;
grant select on public.question_quality_issues to service_role;

commit;

-- 第一個結果：各類問題數量摘要。
select
  severity,
  issue_type,
  count(*) as issue_count
from public.question_quality_issues
group by severity, issue_type
order by severity, issue_type;

-- 第二個結果：逐題詳細報告；零列代表全部通過。
select
  severity,
  issue_type,
  node_code,
  question_id,
  question_text,
  details
from public.question_quality_issues
order by
  case severity when 'error' then 1 else 2 end,
  node_code nulls last,
  issue_type,
  question_id;

