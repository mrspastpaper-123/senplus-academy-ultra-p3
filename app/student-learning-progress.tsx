"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, BarChart3, BookOpen, CheckCircle2, Clock3, LogOut, RefreshCw, Target, Trophy } from "lucide-react";
import { isCompleted, loadStudentProgress, progressSubjectIndex, summariseProgress, type ProgressData, type ProgressAttempt } from "./student-progress-data";
import styles from "./student-learning-progress.module.css";

type Props = {
  client: SupabaseClient; studentId: string; grade: string; displayName: string;
  subjects: string[]; onBack: () => void; onSignOut: () => void;
  onPractice: (subjectIndex: number) => void;
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期未有記錄" : new Intl.DateTimeFormat("zh-HK", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default function StudentLearningProgress({ client, studentId, grade, displayName, subjects, onBack, onSignOut, onPractice }: Props) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState("");
  const [tab, setTab] = useState<"subjects" | "units" | "history">("subjects");
  const [subject, setSubject] = useState(-1);
  const [status, setStatus] = useState("all");
  const [visible, setVisible] = useState(20);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null); setVisible(20);
    loadStudentProgress(client, studentId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setData(result); setUpdated(new Intl.DateTimeFormat("zh-HK", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "暫時未能讀取進度，請稍後再試。");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, studentId, refresh]);

  const attempts = data?.attempts || [];
  const nodeMap = useMemo(() => new Map((data?.nodes || []).map(node => [node.id, node])), [data]);
  const subjectIndex = (row: ProgressAttempt) => progressSubjectIndex(nodeMap.get(row.node_id)?.code || "", subjects.length);
  const totals = summariseProgress(attempts);
  const filtered = attempts.filter(row => (subject === -1 || subjectIndex(row) === subject) &&
    (status === "all" || (status === "completed" ? isCompleted(row) : !isCompleted(row))));
  const units = [...new Set(attempts.filter(row => subject === -1 || subjectIndex(row) === subject).map(row => row.node_id))]
    .map(id => ({ id, node: nodeMap.get(id), rows: attempts.filter(row => row.node_id === id) }))
    .sort((a, b) => (a.node?.code || "").localeCompare(b.node?.code || "", "zh-HK", { numeric: true }));
  const score = (value: number | null) => value === null ? "—" : value + " 分";
  const filters = <div className={styles.filters}><label>科目<select value={subject} onChange={event => { setSubject(Number(event.target.value)); setVisible(20); }}>
    <option value={-1}>全部科目</option>{subjects.map((name, index) => <option key={name} value={index}>{name}</option>)}
  </select></label>{tab === "history" && <label>練習狀態<select value={status} onChange={event => { setStatus(event.target.value); setVisible(20); }}>
    <option value="all">全部紀錄</option><option value="completed">已完成</option><option value="in_progress">未完成</option>
  </select></label>}</div>;

  return <main className={styles.page}>
    <header className={styles.header}><button className={styles.brand} onClick={onBack} aria-label="返回我的學習"><b>S+</b><span>SENPlus+<small>Academy Ultra · {grade}</small></span></button>
      <div className={styles.account}><span>{displayName}</span><button onClick={onSignOut}><LogOut size={18} />登出</button></div></header>
    <div className={styles.wrap}>
      <button className={styles.back} onClick={onBack}><ArrowLeft size={18} />返回我的學習</button>
      <section className={styles.hero}><div><p>{grade} · 我的學習紀錄</p><h1>學習進度</h1><span>看看每一次練習累積的小進步，再選一科繼續學習。</span></div><BarChart3 size={56} aria-hidden="true" /></section>
      <div className={styles.toolbar}><p>{updated && !loading && !error ? "更新於 " + updated : "完成練習後，可在這裏查看新紀錄。"}</p><button onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={17} />{loading ? "載入中…" : "更新進度"}</button></div>
      {loading && <div className={styles.notice} role="status">正在整理你的學習紀錄…</div>}
      {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={() => setRefresh(value => value + 1)}>重新載入</button></div>}
      {!loading && !error && data && <>
        <section className={styles.stats} aria-label="整體學習統計">
          <article><CheckCircle2 /><span>已完成練習<strong>{totals.completed}<small> 次</small></strong></span></article>
          <article><Target /><span>平均得分<strong>{totals.average === null ? "—" : totals.average}<small>{totals.average === null ? "" : " 分"}</small></strong></span></article>
          <article><Trophy /><span>累積答對<strong>{totals.correct}<small> 題</small></strong></span></article>
          <article><BookOpen /><span>練習過的單元<strong>{totals.units}<small> 個</small></strong></span></article>
        </section>
        <p className={styles.definition}>平均得分只計已完成並有成績的練習；累積答對包括未完成練習中已答對的題目。</p>
        {attempts.length === 0 && <section className={styles.empty}><BookOpen size={36} /><h2>你的學習旅程正要開始</h2><p>完成第一組練習後，這裏就會顯示你的成績和紀錄。</p><button onClick={onBack}>選擇科目開始練習</button></section>}
        <nav className={styles.tabs} aria-label="進度內容">
          {([{ id: "subjects", name: "各科進度" }, { id: "units", name: "單元紀錄" }, { id: "history", name: "最近練習" }] as const).map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? styles.active : ""} onClick={() => { setTab(item.id); setVisible(20); }}>{item.name}</button>)}
        </nav>
        {tab === "subjects" && <section className={styles.subjects} aria-label="各科練習情況">{subjects.map((name, index) => {
          const rows = attempts.filter(row => subjectIndex(row) === index), stats = summariseProgress(rows);
          return <article key={name}><h2>{name}</h2><div className={styles.subjectNumbers}><p>已完成<strong>{stats.completed} 次</strong></p><p>平均得分<strong>{score(stats.average)}</strong></p><p>練習單元<strong>{stats.units} 個</strong></p></div>
            <p className={styles.note}>{rows.length ? "最近練習：" + dateLabel(rows[0].started_at) : "還未開始，試試第一組練習吧。"}</p>
            {stats.inProgress > 0 && <p className={styles.note}>另有 {stats.inProgress} 次未完成的紀錄</p>}
            <button onClick={() => onPractice(index)}>前往{name}</button></article>;
        })}</section>}
        {tab === "units" && <section className={styles.section}><h2>練習過的單元</h2><p className={styles.note}>完成次數表示做過多少組練習，並不代表已完成整個單元的全部題目。</p>{filters}
          {units.length === 0 ? <p className={styles.notice}>這個科目暫時沒有單元紀錄。</p> : <div className={styles.unitGrid}>{units.map(unit => {
            const stats = summariseProgress(unit.rows), latest = unit.rows.find(row => isCompleted(row) && row.score !== null);
            return <article className={styles.unit} key={unit.id}><span className={styles.code}>{unit.node?.code || "單元"}</span><h3>{unit.node?.title_zh || "單元資料暫不可用"}</h3><div className={styles.unitMetrics}><span>已完成 <b>{stats.completed} 次</b></span><span>最近得分 <b>{score(latest?.score ?? null)}</b></span><span>最高得分 <b>{score(stats.best)}</b></span></div><p className={styles.note}>最近練習：{dateLabel(unit.rows[0].started_at)}</p>{stats.inProgress > 0 && <p className={styles.note}>未完成 {stats.inProgress} 次</p>}</article>;
          })}</div>}
        </section>}
        {tab === "history" && <section className={styles.section}><h2>最近練習</h2>{filters}<p className={styles.note}>共 {filtered.length} 次紀錄，按開始時間由新至舊排列。</p>
          {filtered.length === 0 ? <p className={styles.notice}>暫時沒有符合篩選條件的紀錄。</p> : <ol className={styles.history}>{filtered.slice(0, visible).map(row => {
            const node = nodeMap.get(row.node_id), index = subjectIndex(row);
            return <li key={row.id}><div className={styles.historyTitle}><span className={styles.code}>{node?.code || "單元"}</span><h3>{node?.title_zh || "單元資料暫不可用"}</h3><span className={isCompleted(row) ? styles.done : styles.pending}>{isCompleted(row) ? "已完成" : "未完成"}</span></div><div className={styles.historyMeta}><span>{subjects[index] || "未分類紀錄"}</span><time dateTime={row.started_at}>{dateLabel(row.started_at)}</time><span>已作答 {row.answered_count}／{row.total_questions} 題</span><span>答對 {row.correct_count} 題</span><strong>{isCompleted(row) ? score(row.score) : "尚未計分"}</strong></div></li>;
          })}</ol>}
          {visible < filtered.length && <button className={styles.more} onClick={() => setVisible(value => value + 20)}>顯示更多紀錄</button>}
        </section>}
      </>}
      <footer className={styles.footer}><Clock3 size={16} />每一小步，都會留下紀錄。</footer>
    </div>
  </main>;
}
