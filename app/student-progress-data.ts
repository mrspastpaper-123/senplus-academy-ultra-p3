import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgressAttempt = {
  id: number; student_id: string; node_id: number; status: string;
  total_questions: number; answered_count: number; correct_count: number;
  score: number | null; started_at: string; completed_at: string | null;
};
export type ProgressNode = { id: number; code: string; title_zh: string };
export type ProgressData = { attempts: ProgressAttempt[]; nodes: ProgressNode[] };
export const isCompleted = (row: ProgressAttempt) => row.status === "completed" || !!row.completed_at;

export function summariseProgress(rows: ProgressAttempt[]) {
  const completed = rows.filter(isCompleted);
  const scored = completed.filter(row => row.score !== null && Number.isFinite(row.score));
  return {
    completed: completed.length,
    inProgress: rows.filter(row => !isCompleted(row)).length,
    answered: rows.reduce((n, row) => n + (row.answered_count || 0), 0),
    correct: rows.reduce((n, row) => n + (row.correct_count || 0), 0),
    average: scored.length ? Math.round(scored.reduce((n, row) => n + row.score!, 0) / scored.length) : null,
    best: scored.length ? Math.max(...scored.map(row => row.score!)) : null,
    units: new Set(rows.map(row => row.node_id)).size,
  };
}

// Subject labels are supplied by the grade's existing home page.
export function progressSubjectIndex(code: string, subjectCount: number): number {
  if (/^\d+(?:CL|CR|CW)/i.test(code)) return 0;
  if (/^\d+E/i.test(code)) return 1;
  if (/^\d+SC/i.test(code)) return subjectCount === 5 ? 4 : 3;
  if (/^\d+(?:N|M|S|D|A)/i.test(code)) return 2;
  if (/^\d+(?:GS|H|PS|LS)/i.test(code)) return 3;
  return -1;
}

export async function loadStudentProgress(
  client: SupabaseClient, expectedStudentId: string, signal?: AbortSignal,
): Promise<ProgressData> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== expectedStudentId) {
    throw new Error("登入狀態已改變，請重新登入後再查看。");
  }
  const studentId = auth.user.id;
  const attempts: ProgressAttempt[] = [];
  let newestId: number | null = null;
  for (let offset = 0; ; offset += 500) {
    if (signal?.aborted) throw new Error("cancelled");
    let query = client.from("practice_attempts")
      .select("id, student_id, node_id, status, total_questions, answered_count, correct_count, score, started_at, completed_at")
      .eq("student_id", studentId)
      .order("id", { ascending: false })
      .range(offset, offset + 499);
    if (newestId !== null) query = query.lte("id", newestId);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error("暫時未能讀取練習紀錄，請稍後再試。");
    const page = (data || []) as ProgressAttempt[];
    if (page.some(row => row.student_id !== studentId)) throw new Error("未能核對練習紀錄，請重新登入。");
    if (newestId === null && page.length) newestId = page[0].id;
    attempts.push(...page);
    if (page.length < 500) break;
  }
  const unique = [...new Map(attempts.map(row => [row.id, row])).values()]
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at) || b.id - a.id);
  const nodeIds = [...new Set(unique.map(row => row.node_id))];
  const nodes: ProgressNode[] = [];
  for (let offset = 0; offset < nodeIds.length; offset += 100) {
    if (signal?.aborted) throw new Error("cancelled");
    let query = client.from("curriculum_nodes").select("id, code, title_zh").in("id", nodeIds.slice(offset, offset + 100));
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error("暫時未能讀取單元資料，請稍後再試。");
    nodes.push(...((data || []) as ProgressNode[]));
  }
  return { attempts: unique, nodes };
}
