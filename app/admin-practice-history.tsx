"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressAttempt } from "./student-progress-data";
import { loadAdminHistoryPage, type HistoryNode, type HistoryStudent } from "./admin-history-data";
import styles from "./admin-practice-history.module.css";

type Props = {
  client: SupabaseClient; adminId: string; studentId?: string; refreshKey: unknown;
};
const dateLabel = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-HK", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
};

export default function AdminPracticeHistory({ client, adminId, studentId, refreshKey }: Props) {
  const [rows, setRows] = useState<ProgressAttempt[]>([]);
  const [nodes, setNodes] = useState(new Map<number, HistoryNode>());
  const [students, setStudents] = useState(new Map<string, HistoryStudent>());
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);

  const fetchPage = useCallback(async (nextCursor: number | null, reset: boolean) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller; busy.current = true;
    setLoading(true); setError("");
    if (reset) { setRows([]); setNodes(new Map()); setStudents(new Map()); setCursor(null); setHasMore(false); }
    try {
      const page = await loadAdminHistoryPage(client, adminId, studentId, nextCursor, controller.signal);
      if (controller.signal.aborted) return;
      setRows(previous => [...new Map([...(reset ? [] : previous), ...page.attempts].map(row => [row.id, row])).values()]);
      setNodes(previous => new Map([...(reset ? [] : previous), ...page.nodes.map(node => [node.id, node] as const)]));
      setStudents(previous => new Map([...(reset ? [] : previous), ...page.students.map(student => [student.id, student] as const)]));
      setCursor(page.nextCursor); setHasMore(page.hasMore);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "未能讀取練習紀錄，請重試。");
    } finally {
      if (request.current === controller && !controller.signal.aborted) { busy.current = false; setLoading(false); }
    }
  }, [client, adminId, studentId]);

  useEffect(() => {
    void fetchPage(null, true);
    return () => request.current?.abort();
  }, [fetchPage, refreshKey]);

  const more = () => { if (!busy.current) void fetchPage(cursor, false); };
  return <section className="admin-panel recent-panel" aria-label={studentId ? "學生練習紀錄" : "管理員練習紀錄"}>
    <div className="panel-title"><div><p className="eyebrow">練習歷程</p><h2>練習紀錄</h2></div><span>已顯示 {rows.length} 項</span></div>
    <p className={styles.note}>按建立次序由新至舊排列，每次載入 50 項，可繼續查看較早紀錄。</p>
    {rows.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr>
      {!studentId && <th>學習者</th>}<th>單元</th><th>狀態</th><th>答對</th><th>分數</th><th>開始時間</th><th>完成時間</th>
    </tr></thead><tbody>{rows.map(row => {
      const node = nodes.get(row.node_id), student = students.get(row.student_id);
      return <tr key={row.id}>
        {!studentId && <td><strong>{student?.display_name || "未命名帳戶"}</strong><small>{student?.grade || ""}</small></td>}
        <td><strong>{node?.code || "—"}</strong> {node?.title_zh || "單元資料暫不可用"}</td>
        <td><span className={`status-pill ${["completed", "in_progress", "abandoned"].includes(row.status) ? row.status : "abandoned"}`}>{row.status === "completed" ? "已完成" : row.status === "in_progress" ? "進行中" : row.status === "abandoned" ? "已放棄" : "其他狀態"}</span></td>
        <td>{row.correct_count}／{row.total_questions}</td><td><strong>{row.score === null ? "—" : `${row.score}分`}</strong></td><td>{dateLabel(row.started_at)}</td><td>{dateLabel(row.completed_at)}</td>
      </tr>;
    })}</tbody></table></div>}
    {loading && <p className={styles.note} role="status">正在載入練習紀錄…</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button className={styles.button} onClick={more} disabled={loading}>重試載入</button></div>}
    {!loading && !error && rows.length === 0 && <p className="empty-admin">尚未有練習紀錄。</p>}
    <div className={styles.controls}>
      {hasMore && !error && <button className={styles.button} onClick={more} disabled={loading}>{loading ? "載入中…" : "載入更多（50 項）"}</button>}
      {!hasMore && !loading && !error && rows.length > 0 && <span className={styles.note}>已顯示全部紀錄</span>}
      <button className={styles.button} onClick={() => { if (!busy.current) void fetchPage(null, true); }} disabled={loading}>更新紀錄</button>
    </div>
  </section>;
}
