import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressAttempt } from "./student-progress-data";

export const ADMIN_HISTORY_PAGE_SIZE = 50;
export type HistoryNode = { id: number; code: string; title_zh: string };
export type HistoryStudent = { id: string; display_name: string | null; grade: string | null };
export type AdminHistoryPage = {
  attempts: ProgressAttempt[]; nodes: HistoryNode[]; students: HistoryStudent[];
  nextCursor: number | null; hasMore: boolean;
};

export async function loadAdminHistoryPage(
  client: SupabaseClient, adminId: string, studentId?: string,
  cursor: number | null = null, signal?: AbortSignal,
): Promise<AdminHistoryPage> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || auth.user?.id !== adminId) throw new Error("登入狀態已改變，請重新登入。");
  if (signal?.aborted) throw new Error("cancelled");
  const access = await client.from("profiles").select("role, login_allowed").eq("id", adminId).abortSignal(signal || new AbortController().signal).single();
  if (access.error || access.data?.role !== "admin" || !access.data.login_allowed) {
    throw new Error("只有已啟用的管理員帳戶可以查看這些紀錄。");
  }
  let query = client.from("practice_attempts")
    .select("id, student_id, node_id, status, total_questions, answered_count, correct_count, score, started_at, completed_at")
    .order("id", { ascending: false }).limit(ADMIN_HISTORY_PAGE_SIZE + 1);
  if (studentId) query = query.eq("student_id", studentId);
  if (cursor !== null) query = query.lt("id", cursor);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error("未能讀取練習紀錄，請重試。");
  const records = (data || []) as ProgressAttempt[];
  if (studentId && records.some(row => row.student_id !== studentId)) throw new Error("未能核對學生紀錄，請重新載入。");
  const attempts = records.slice(0, ADMIN_HISTORY_PAGE_SIZE);
  const nodeIds = [...new Set(attempts.map(row => row.node_id))];
  const studentIds = [...new Set(attempts.map(row => row.student_id))];
  if (signal?.aborted) throw new Error("cancelled");
  const [nodes, students] = await Promise.all([
    nodeIds.length ? client.from("curriculum_nodes").select("id, code, title_zh").in("id", nodeIds).abortSignal(signal || new AbortController().signal) : Promise.resolve({ data: [], error: null }),
    studentIds.length ? client.from("profiles").select("id, display_name, grade").in("id", studentIds).abortSignal(signal || new AbortController().signal) : Promise.resolve({ data: [], error: null }),
  ]);
  if (nodes.error || students.error) throw new Error("未能讀取學生或單元資料，請重試。");
  return {
    attempts, nodes: (nodes.data || []) as HistoryNode[], students: (students.data || []) as HistoryStudent[],
    hasMore: records.length > ADMIN_HISTORY_PAGE_SIZE,
    nextCursor: attempts.length ? attempts[attempts.length - 1].id : null,
  };
}
