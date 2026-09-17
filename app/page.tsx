"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";
import { AlertTriangle, ArrowLeft, BarChart3, BookOpen, Brain, CheckCircle2, Clock3, KeyRound, Languages, LayoutDashboard, Lightbulb, Link2, LogOut, MessageSquareText, Microscope, Pencil, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Smartphone, Sparkles, Target, Trophy, UserCheck, UserCog, UserPlus, Users, X } from "lucide-react";

const subjects = [
  { name: "中文", note: "閱讀、語文與寫作", icon: BookOpen, colour: "coral" },
  { name: "英文", note: "Reading, grammar & writing", icon: Languages, colour: "blue" },
  { name: "數學", note: "數、代數、度量與圖形", icon: Brain, colour: "purple" },
  { name: "人文科", note: "社會、文化與世界", icon: Sparkles, colour: "amber" },
  { name: "科學", note: "探索、觀察與實驗", icon: Microscope, colour: "green" },
];

const enabledMathsUnits = new Set(["4N1", "4N2", "4N3", "4N4", "4N5","4N6","4N7","4N8","4N9","4A1", "4A2", "4M1", "4M2", "4S1", "4S2", "4D1"]);

type Profile = { display_name: string | null; role: string; grade: string; login_allowed: boolean };
type MathsUnit = { id: number; domain_id: number; code: string; title_zh: string; title_en: string | null; difficulty: number; curriculum_domains: { title_zh: string; code: string } | null };
type PracticeQuestion = { id: number; question_text: string; options: { id: string; text: string }[] };
type WritingPrompt = { prompt_id: number; genre: string; title: string; instruction: string; min_chars: number; max_chars: number; guidance: string[] };
type WritingResult = { success: boolean; submission_id: number; score: number; char_count: number; rubric: Record<string, number>; feedback: string };
type AnswerFeedback = { is_correct: boolean; correct_answer: string; explanation: string | null; completed: boolean; score: number | null; answered_count: number; correct_count: number; total_questions: number };
type AdminAttempt = { id: number; student_id: string; node_id: number; status: string; total_questions: number; answered_count: number; correct_count: number; score: number | null; started_at: string; completed_at: string | null };
type AdminUser = { id: string; display_name: string | null; grade: string | null; role: string };
type AdminNode = { id: number; code: string; title_zh: string };
type ManagedStudent = { user_id: string; display_name: string | null; email: string; grade: string | null; login_allowed: boolean; created_at: string; device_count: number; attempt_count: number; completed_count: number; average_score: number | null };
type WrongResponse = { id: number; attempt_id: number; question_id: number; selected_answer: unknown; answered_at: string };
type WrongQuestion = { id: number; node_id: number; question_text: string; options: { id: string; text: string }[] };
type WrongAnswerKey = { question_id: number; correct_answer: unknown; explanation: string | null; hint: string | null };
type FeedbackReport = { id: number; user_id: string; category: string; subject: string; message: string; page_context: string | null; status: string; admin_note: string | null; created_at: string };
type ParentAttempt = { id: number; node_code: string; title_zh: string; status: string; total_questions: number; answered_count: number; correct_count: number; score: number | null; started_at: string; completed_at: string | null };
type SubjectPerformance = { subject: string; attempts: number; completed: number; average: number };
type ParentChild = { student_id: string; display_name: string; grade: string; attempt_count: number; completed_count: number; average_score: number; wrong_count: number; last_active: string | null; subject_performance: SubjectPerformance[]; attempts: ParentAttempt[] };
type ParentPending = { student_id: string; display_name: string; requested_at: string };
type ParentRequest = { parent_id: string; display_name: string; status: "pending" | "approved"; requested_at: string; approved_at: string | null };
type ParentError = { response_id: number; question_id: number; selected_answer: unknown; answered_at: string; node_code: string; title_zh: string; question_text: string; options: { id: string; text: string }[]; correct_answer: unknown; explanation: string | null; hint: string | null };
type QualityIssue = { issue_type: string; severity: "error" | "warning"; question_id: number; node_code: string | null; question_text: string; details: string; options: { id: string; text: string }[] | null; correct_answer: string | null; explanation: string | null; hint: string | null };
type QualitySummary = { total_questions: number; total_issues: number; affected_questions: number; error_count: number; warning_count: number };
type QualityEditor = { questionId: number; questionText: string; optionA: string; optionB: string; optionC: string; optionD: string; correctAnswer: string; explanation: string; hint: string };
type AppView = "subjects" | "parent" | "chinese" | "english" | "maths" | "humanities" | "science" | "practice" | "complete" | "admin" | "students" | "studentDetail" | "studentErrors" | "quality" | "feedback" | "adminFeedback" | "privacy";
type AuthMode = "login" | "register";
type RegistrationRole = "student" | "parent";

// These are browser-safe Supabase connection values. Database security remains
// enforced by Supabase authentication and row-level security policies.
const SUPABASE_URL = "https://noaoqdwllmcnmczroyfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-hYVvTs_A97aG_jT_nyiMA_dostycdf";

function answerValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return value === null || value === undefined ? "—" : String(value);
}

function parentAnswerText(error: ParentError, value: unknown) {
  const id = answerValue(value);
  return error.options?.find((option) => option.id === id)?.text || id;
}

function localiseCurrency(value: string) {
  return value.replaceAll("£", "$");
}

function cleanMarkedText(value: string) {
  return localiseCurrency(value).replaceAll("\u0332", "");
}

function localiseQuestion<T extends PracticeQuestion>(question: T): T {
  return {
    ...question,
    question_text: localiseCurrency(question.question_text),
    options: question.options.map((option) => ({ ...option, text: localiseCurrency(option.text) })),
  };
}

function renderMarkedText(value: string) {
  return value.split(/((?:[^\u0332]\u0332)+)/g).filter(Boolean).map((part, index) =>
    part.includes("\u0332")
      ? <span className="proper-name" key={index}>{cleanMarkedText(part)}</span>
      : cleanMarkedText(part)
  );
}

export default function Home() {
  const supabase = useMemo(() => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetRequestLoading, setResetRequestLoading] = useState(false);
  const [resetRequestMessage, setResetRequestMessage] = useState("");
  const [resetRequestSuccess, setResetRequestSuccess] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [registrationRole, setRegistrationRole] = useState<RegistrationRole>("student");
  const [registrationName, setRegistrationName] = useState("");
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [registrationPasswordConfirm, setRegistrationPasswordConfirm] = useState("");
  const [registrationConsent, setRegistrationConsent] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeMessage, setPasswordChangeMessage] = useState("");
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>("subjects");
  const [chineseUnits, setChineseUnits] = useState<MathsUnit[]>([]);
  const [chineseUnitsLoading, setChineseUnitsLoading] = useState(false);
  const [chineseUnitsMessage, setChineseUnitsMessage] = useState("");
  const [englishUnits, setEnglishUnits] = useState<MathsUnit[]>([]);
  const [englishUnitsLoading, setEnglishUnitsLoading] = useState(false);
  const [englishUnitsMessage, setEnglishUnitsMessage] = useState("");
  const [humanitiesUnits, setHumanitiesUnits] = useState<MathsUnit[]>([]);
  const [humanitiesUnitsLoading, setHumanitiesUnitsLoading] = useState(false);
  const [humanitiesUnitsMessage, setHumanitiesUnitsMessage] = useState("");
  const [scienceUnits, setScienceUnits] = useState<MathsUnit[]>([]);
  const [scienceUnitsLoading, setScienceUnitsLoading] = useState(false);
  const [scienceUnitsMessage, setScienceUnitsMessage] = useState("");
  const [mathsUnits, setMathsUnits] = useState<MathsUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsMessage, setUnitsMessage] = useState("");
  const [activeUnit, setActiveUnit] = useState<MathsUnit | null>(null);
  const [activeSubject, setActiveSubject] = useState<"maths" | "chinese" | "english" | "humanities" | "science">("maths");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [readingAnswers, setReadingAnswers] = useState<Record<number, string>>({});
  const [readingSubmitted, setReadingSubmitted] = useState<number[]>([]);
  const [writingPrompt, setWritingPrompt] = useState<WritingPrompt | null>(null);
  const [writingContent, setWritingContent] = useState("");
  const [writingResult, setWritingResult] = useState<WritingResult | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [completedResult, setCompletedResult] = useState<AnswerFeedback | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceMessage, setPracticeMessage] = useState("");
  const [adminAttempts, setAdminAttempts] = useState<AdminAttempt[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminNodes, setAdminNodes] = useState<AdminNode[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityMessage, setQualityMessage] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [qualityHasRun, setQualityHasRun] = useState(false);
  const [qualitySummary, setQualitySummary] = useState<QualitySummary | null>(null);
  const [qualityEditor, setQualityEditor] = useState<QualityEditor | null>(null);
  const [qualitySaving, setQualitySaving] = useState(false);
  const [qualitySaveMessage, setQualitySaveMessage] = useState("");
  const [managedStudents, setManagedStudents] = useState<ManagedStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsMessage, setStudentsMessage] = useState("");
  const [studentActionId, setStudentActionId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetailReturnView, setStudentDetailReturnView] = useState<"admin" | "students">("admin");
  const [wrongResponses, setWrongResponses] = useState<WrongResponse[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [wrongAnswerKeys, setWrongAnswerKeys] = useState<WrongAnswerKey[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsMessage, setErrorsMessage] = useState("");
  const [passwordResetStudent, setPasswordResetStudent] = useState<ManagedStudent | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [passwordResetMessage, setPasswordResetMessage] = useState("");
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [confirmStudentPassword, setConfirmStudentPassword] = useState("");
  const [createStudentLoading, setCreateStudentLoading] = useState(false);
  const [createStudentMessage, setCreateStudentMessage] = useState("");
  const [createStudentSuccess, setCreateStudentSuccess] = useState(false);
  const [feedbackReturnView, setFeedbackReturnView] = useState<AppView>("subjects");
  const [reportCategory, setReportCategory] = useState("problem");
  const [reportSubject, setReportSubject] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [feedbackReports, setFeedbackReports] = useState<FeedbackReport[]>([]);
  const [feedbackListLoading, setFeedbackListLoading] = useState(false);
  const [parentChildren, setParentChildren] = useState<ParentChild[]>([]);
  const [parentPending, setParentPending] = useState<ParentPending[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentMessage, setParentMessage] = useState("");
  const [parentInviteCode, setParentInviteCode] = useState("");
  const [selectedParentChildId, setSelectedParentChildId] = useState<string | null>(null);
  const [parentErrors, setParentErrors] = useState<ParentError[]>([]);
  const [parentErrorsLoading, setParentErrorsLoading] = useState(false);
  const [studentLinkCode, setStudentLinkCode] = useState("");
  const [studentLinkExpiry, setStudentLinkExpiry] = useState<string | null>(null);
  const [studentParentRequests, setStudentParentRequests] = useState<ParentRequest[]>([]);
  const [familyLinkMessage, setFamilyLinkMessage] = useState("");
  const currentQuestion = questions[currentIndex] || null;
  const isReadingUnit = activeUnit ? /^(4CR|4ER)/.test(activeUnit.code) : false;
  const isWritingUnit = activeUnit?.code.startsWith("4CW") || false;
  const writingCharCount = writingContent.replace(/\\s/g, "").length;
  const displayedOptions = useMemo(() => {
    if (!currentQuestion || !attemptId) return [];
    const items = [...currentQuestion.options];
    let seed = (attemptId * 2654435761 + currentQuestion.id * 1013904223) >>> 0;
    const random = () => { seed += 0x6D2B79F5; let value = seed; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
    for (let index = items.length - 1; index > 0; index--) { const swapWith = Math.floor(random() * (index + 1)); [items[index], items[swapWith]] = [items[swapWith], items[index]]; }
    return items.map((option, index) => ({ ...option, label: String.fromCharCode(65 + index) }));
  }, [attemptId, currentQuestion]);

  function optionsForQuestion(question: PracticeQuestion) {
    if (!attemptId) return [];
    const items = [...question.options];
    let seed = (attemptId * 2654435761 + question.id * 1013904223) >>> 0;
    const random = () => { seed += 0x6D2B79F5; let value = seed; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
    for (let index = items.length - 1; index > 0; index--) { const swapWith = Math.floor(random() * (index + 1)); [items[index], items[swapWith]] = [items[swapWith], items[index]]; }
    return items.map((option, index) => ({ ...option, label: String.fromCharCode(65 + index) }));
  }

  function splitReadingQuestion(questionText: string) {
    const markers = ["問題：", "問題:", "Question:"];
    const matchedMarker = markers
      .map((marker) => ({ marker, index: questionText.lastIndexOf(marker) }))
      .sort((a, b) => b.index - a.index)[0];
    const markerIndex = matchedMarker.index;
    if (markerIndex < 0) return { passage: "閱讀理解", prompt: questionText };
    return {
      passage: questionText.slice(0, markerIndex).trim(),
      prompt: questionText.slice(markerIndex + matchedMarker.marker.length).trim(),
    };
  }

  const readingGroups = useMemo(() => {
    const groups = new Map<string, { passage: string; questions: { question: PracticeQuestion; prompt: string }[] }>();
    for (const question of questions) {
      const { passage, prompt } = splitReadingQuestion(question.question_text);
      const existing = groups.get(passage) || { passage, questions: [] };
      existing.questions.push({ question, prompt });
      groups.set(passage, existing);
    }
    return [...groups.values()];
  }, [questions]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "recovery") {
      setPasswordRecoveryMode(true);
    }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecoveryMode(true);
      setSession(nextSession);
      if (!nextSession) setProfile(null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session?.user || passwordRecoveryMode) return;
    async function verifyAccess() {
      let deviceKey = window.localStorage.getItem("senplus_device_key");
      if (!deviceKey) {
        deviceKey = crypto.randomUUID();
        window.localStorage.setItem("senplus_device_key", deviceKey);
      }
      const deviceName = `${navigator.platform || "裝置"} · ${navigator.userAgent.includes("Mobile") ? "流動裝置" : "瀏覽器"}`;
      const { error: deviceError } = await supabase.rpc("register_user_device", {
        p_device_key: deviceKey,
        p_device_name: deviceName,
      });
      if (deviceError) {
        await supabase.auth.signOut();
        setMessage(deviceError.message.includes("maximum") || deviceError.message.includes("limit") ? "此帳戶已達登入裝置上限，請聯絡管理員。" : "此帳戶目前不能登入，請聯絡管理員。");
        return;
      }
      const { data, error } = await supabase.from("profiles").select("display_name, role, grade, login_allowed").eq("id", session!.user.id).single();
      if (error) {
        setMessage("未能讀取用戶資料，請聯絡管理員。");
      } else if (data.role === "student" && data.grade !== "P4") {
        await supabase.auth.signOut();
        setMessage("這是P4學習平台，請使用P4學生帳戶登入。");
      } else {
        setProfile(data);
      }
    }
    verifyAccess();
  }, [session, supabase, passwordRecoveryMode]);

  useEffect(() => {
    if (profile?.role === "parent") {
      setView("parent");
      loadParentDashboard();
    } else if (profile?.role === "student") {
      loadStudentParentRequests();
    }
  }, [profile]);

  async function loadParentDashboard() {
    setParentLoading(true); setParentMessage("");
    const { data, error } = await supabase.rpc("parent_get_dashboard");
    if (error || !data?.success) {
      setParentMessage("未能載入家長儀表板。請先確認已執行家長功能設定 SQL。");
    } else {
      const children = ((data.children || []) as ParentChild[]).filter((child) => child.grade === "P4");
      setParentChildren(children);
      setParentPending((data.pending_requests || []) as ParentPending[]);
      setSelectedParentChildId((current) => current && children.some((child) => child.student_id === current) ? current : children[0]?.student_id || null);
    }
    setParentLoading(false);
  }

  async function linkStudentToParent(event: FormEvent) {
    event.preventDefault(); setParentMessage("");
    const code = parentInviteCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { setParentMessage("請輸入學生提供的6位邀請碼。"); return; }
    setParentLoading(true);
    const { data, error } = await supabase.rpc("parent_link_student", { p_code: code });
    if (error || !data?.success) setParentMessage(data?.message || "邀請碼無效或已過期，請學生重新產生。");
    else {
      setParentInviteCode("");
      setParentMessage(`已向${data.display_name || "學生"}送出連結申請，等待學生確認。`);
      await loadParentDashboard();
    }
    setParentLoading(false);
  }

  async function unlinkParentChild(child: ParentChild) {
    if (!window.confirm(`確定解除與${child.display_name}的連結嗎？`)) return;
    setParentLoading(true); setParentMessage("");
    const { error } = await supabase.rpc("parent_unlink_student", { p_student_id: child.student_id });
    if (error) setParentMessage("未能解除連結，請稍後再試。"); else await loadParentDashboard();
    setParentLoading(false);
  }

  async function loadParentErrors(studentId: string) {
    setSelectedParentChildId(studentId); setParentErrorsLoading(true); setParentErrors([]); setParentMessage("");
    const { data, error } = await supabase.rpc("parent_get_child_errors", { p_student_id: studentId });
    if (error || !data?.success) setParentMessage("未能載入錯題，請稍後再試。");
    else setParentErrors((data.errors || []) as ParentError[]);
    setParentErrorsLoading(false);
  }

  async function createStudentParentCode() {
    setFamilyLinkMessage("");
    const { data, error } = await supabase.rpc("create_parent_link_code");
    if (error || !data?.success) setFamilyLinkMessage("暫時未能產生邀請碼，請稍後再試。");
    else { setStudentLinkCode(data.code); setStudentLinkExpiry(data.expires_at); setFamilyLinkMessage("邀請碼已產生，請只交給你的家長或監護人。"); }
  }

  async function loadStudentParentRequests() {
    const { data, error } = await supabase.rpc("student_get_parent_requests");
    if (!error && data?.success) setStudentParentRequests((data.requests || []) as ParentRequest[]);
  }

  async function respondToParentRequest(parentId: string, approve: boolean) {
    setFamilyLinkMessage("");
    const { error } = await supabase.rpc("student_respond_parent_request", { p_parent_id: parentId, p_approve: approve });
    if (error) setFamilyLinkMessage("未能處理連結申請，請稍後再試。");
    else { setFamilyLinkMessage(approve ? "已批准家長連結。" : "已拒絕連結申請。"); await loadStudentParentRequests(); }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage("電郵或密碼不正確，請再試一次。");
    setLoading(false);
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = resetEmail.trim().toLowerCase();
    setResetRequestMessage("");
    setResetRequestSuccess(false);
    if (!cleanEmail) {
      setResetRequestMessage("請輸入帳戶的電郵地址。");
      return;
    }
    setResetRequestLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/?mode=recovery`,
    });
    if (error) {
      const detail = `${error.message || ""} ${(error as { code?: string }).code || ""}`.toLowerCase();
      setResetRequestMessage(/rate|limit|too many/.test(detail)
        ? "發送次數太頻密，請稍候約一小時後再試。"
        : "暫時未能發送重設電郵，請稍後再試。");
    } else {
      setResetRequestSuccess(true);
      setResetRequestMessage("重設密碼電郵已發送。請使用最新一封郵件內的連結。");
    }
    setResetRequestLoading(false);
  }

  async function completePasswordRecovery(event: FormEvent) {
    event.preventDefault();
    setPasswordChangeMessage("");
    if (newPassword.length < 8 || newPassword.length > 72) {
      setPasswordChangeMessage("新密碼必須為8至72個字元。");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeMessage("兩次輸入的新密碼不一致。");
      return;
    }
    setPasswordChangeLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordChangeMessage("重設連結可能已過期，請返回登入頁重新申請。");
    } else {
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordRecoveryMode(false);
      await supabase.auth.signOut();
      window.history.replaceState({}, "", window.location.pathname);
      setMessage("密碼已更新，請使用新密碼登入。");
      setForgotPasswordMode(false);
      setAuthMode("login");
    }
    setPasswordChangeLoading(false);
  }

  async function registerAccount(event: FormEvent) {
    event.preventDefault();
    setRegistrationMessage("");
    setRegistrationSuccess(false);
    const cleanName = registrationName.trim();
    const cleanEmail = registrationEmail.trim().toLowerCase();
    if (cleanName.length < 2) {
      setRegistrationMessage("請輸入至少2個字的姓名。");
      return;
    }
    if (registrationPassword.length < 8 || registrationPassword.length > 72) {
      setRegistrationMessage("密碼必須為8至72個字元。");
      return;
    }
    if (registrationPassword !== registrationPasswordConfirm) {
      setRegistrationMessage("兩次輸入的密碼不一致。");
      return;
    }
    if (!registrationConsent) {
      setRegistrationMessage(registrationRole === "student" ? "請確認已獲家長或監護人同意。" : "請確認你同意私隱聲明。");
      return;
    }
    setRegistrationLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: registrationPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: cleanName,
          requested_role: registrationRole,
          grade: registrationRole === "student" ? "P4" : null,
          signup_source: "self_service",
        },
      },
    });
    if (error) {
      const detail = `${error.message || ""} ${(error as { code?: string }).code || ""}`.toLowerCase();
      if (/already|registered|exists|user_already_exists/.test(detail)) {
        setRegistrationMessage("這個電郵已經註冊，請返回登入或使用其他電郵。");
      } else if (/invalid.*email|email.*invalid|email_address_invalid/.test(detail)) {
        setRegistrationMessage("這個電郵地址無效。請使用可以接收確認信的真實電郵，不要使用 @test.com 或 @example.com。");
      } else if (/rate|limit|too many|over_email_send_rate_limit/.test(detail)) {
        setRegistrationMessage("短時間內嘗試次數太多，請稍候約一小時再試，或使用另一個真實電郵。");
      } else if (/database|saving new user|unexpected_failure/.test(detail)) {
        setRegistrationMessage("帳戶資料庫暫時未能建立個人檔案，請通知管理員執行註冊修正 SQL。");
      } else {
        setRegistrationMessage(`暫時未能建立帳戶：${error.message || "請檢查資料後再試。"}`);
      }
    } else if (data.session) {
      setRegistrationSuccess(true);
      setRegistrationMessage("帳戶已建立，正在進入學習平台。");
    } else {
      setRegistrationSuccess(true);
      setRegistrationMessage("帳戶已建立。請到電郵信箱按確認連結，然後返回登入。");
    }
    setRegistrationLoading(false);
  }

  async function signOut() { await supabase.auth.signOut(); setMessage(""); }

  async function changeFirstLoginPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordChangeMessage("");
    if (newPassword.length < 8 || newPassword.length > 72) {
      setPasswordChangeMessage("新密碼必須為8至72個字元。");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeMessage("兩次輸入的新密碼不一致。");
      return;
    }
    setPasswordChangeLoading(true);
    const currentMetadata = session?.user.user_metadata || {};
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { ...currentMetadata, must_change_password: false },
    });
    if (error) {
      setPasswordChangeMessage("未能更新密碼，請稍後再試。新密碼不能與臨時密碼相同。");
    } else {
      setPasswordChanged(true);
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChangeMessage("");
    }
    setPasswordChangeLoading(false);
  }

  async function openAdminDashboard() {
    if (profile?.role !== "admin") return;
    setView("admin"); setAdminLoading(true); setAdminMessage("");
    const [attemptResult, userResult, nodeResult] = await Promise.all([
      supabase.from("practice_attempts").select("id, student_id, node_id, status, total_questions, answered_count, correct_count, score, started_at, completed_at").order("started_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("id, display_name, grade, role"),
      supabase.from("curriculum_nodes").select("id, code, title_zh").eq("is_active", true),
    ]);
    if (attemptResult.error || userResult.error || nodeResult.error) {
      setAdminMessage("未能載入完整學習紀錄，請稍後再試。");
    } else {
      const gradeUsers = ((userResult.data || []) as AdminUser[]).filter((user) => user.role !== "student" || user.grade === "P4");
      const gradeUserIds = new Set(gradeUsers.map((user) => user.id));
      setAdminAttempts(((attemptResult.data || []) as AdminAttempt[]).filter((attempt) => gradeUserIds.has(attempt.student_id)));
      setAdminUsers(gradeUsers);
      setAdminNodes(((nodeResult.data || []) as AdminNode[]).filter((node) => node.code.startsWith("4")));
    }
    setAdminLoading(false);
  }

  async function openStudentManagement() {
    if (profile?.role !== "admin") return;
    setView("students"); setStudentsLoading(true); setStudentsMessage("");
    const { data, error } = await supabase.rpc("admin_get_students");
    if (error) setStudentsMessage("未能載入學生帳戶，請稍後再試。"); else setManagedStudents(((data || []) as ManagedStudent[]).filter((student) => student.grade === "P4"));
    setStudentsLoading(false);
  }

  async function openQuestionQualityAudit() {
    if (profile?.role !== "admin") return;
    setView("quality");
    setQualityLoading(true);
    setQualityMessage("");
    const [reportResult, summaryResult] = await Promise.all([
      supabase.rpc("admin_question_quality_report_for_grade", { p_grade: "P4" }),
      supabase.rpc("admin_question_quality_summary_for_grade", { p_grade: "P4" }),
    ]);
    if (reportResult.error || summaryResult.error) {
      const error = reportResult.error || summaryResult.error;
      setQualityHasRun(false);
      setQualitySummary(null);
      setQualityMessage(error?.message.includes("管理員")
        ? "目前帳戶沒有執行題庫檢查的權限，請重新登入管理員帳戶。"
        : `未能執行題庫檢查：${error?.message || "未知錯誤"}`);
    } else {
      setQualityIssues((reportResult.data || []) as QualityIssue[]);
      setQualitySummary(summaryResult.data as QualitySummary);
      setQualityHasRun(true);
    }
    setQualityLoading(false);
  }

  function openQualityEditor(issue: QualityIssue) {
    const availableOptions = Array.isArray(issue.options) ? issue.options : [];
    const option = (id: string) => availableOptions.find((item) => item.id.toLowerCase() === id)?.text || "";
    setQualityEditor({
      questionId: issue.question_id,
      questionText: issue.question_text,
      optionA: option("a"),
      optionB: option("b"),
      optionC: option("c"),
      optionD: option("d"),
      correctAnswer: (issue.correct_answer || "a").toLowerCase(),
      explanation: issue.explanation || "",
      hint: issue.hint || "",
    });
    setQualitySaveMessage("");
  }

  function updateQualityEditor(field: keyof QualityEditor, value: string | number) {
    setQualityEditor((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveQualityCorrection(event: FormEvent) {
    event.preventDefault();
    if (!qualityEditor || profile?.role !== "admin") return;
    setQualitySaving(true);
    setQualitySaveMessage("");
    const { data, error } = await supabase.rpc("admin_update_question_quality", {
      p_question_id: qualityEditor.questionId,
      p_question_text: qualityEditor.questionText,
      p_option_a: qualityEditor.optionA,
      p_option_b: qualityEditor.optionB,
      p_option_c: qualityEditor.optionC,
      p_option_d: qualityEditor.optionD,
      p_correct_answer: qualityEditor.correctAnswer,
      p_explanation: qualityEditor.explanation,
      p_hint: qualityEditor.hint,
    });
    if (error) {
      setQualitySaveMessage(error.message || "未能儲存修正，請檢查所有欄位。");
      setQualitySaving(false);
      return;
    }
    const remaining = Number(data?.remaining_issues || 0);
    setQualityEditor(null);
    setQualitySaveMessage(remaining ? "修正已儲存，但這題仍有其他項目需要處理。" : "修正已儲存，這題已通過檢查。");
    setQualitySaving(false);
    await openQuestionQualityAudit();
  }

  async function openStudentDetail(studentId: string, returnView: "admin" | "students") {
    setSelectedStudentId(studentId);
    setStudentDetailReturnView(returnView);
    setView("studentDetail");
    if (!adminUsers.length || !adminNodes.length) await openAdminDashboardDataOnly();
  }

  async function openAdminDashboardDataOnly() {
    setAdminLoading(true); setAdminMessage("");
    const [attemptResult, userResult, nodeResult] = await Promise.all([
      supabase.from("practice_attempts").select("id, student_id, node_id, status, total_questions, answered_count, correct_count, score, started_at, completed_at").order("started_at", { ascending: false }).limit(300),
      supabase.from("profiles").select("id, display_name, grade, role"),
      supabase.from("curriculum_nodes").select("id, code, title_zh").eq("is_active", true),
    ]);
    if (attemptResult.error || userResult.error || nodeResult.error) setAdminMessage("未能載入完整學習紀錄，請稍後再試。");
    else {
      const gradeUsers = ((userResult.data || []) as AdminUser[]).filter((user) => user.role !== "student" || user.grade === "P4");
      const gradeUserIds = new Set(gradeUsers.map((user) => user.id));
      setAdminAttempts(((attemptResult.data || []) as AdminAttempt[]).filter((attempt) => gradeUserIds.has(attempt.student_id)));
      setAdminUsers(gradeUsers);
      setAdminNodes(((nodeResult.data || []) as AdminNode[]).filter((node) => node.code.startsWith("4")));
    }
    setAdminLoading(false);
  }

  async function openStudentErrors() {
    if (!selectedStudentId || profile?.role !== "admin") return;
    setView("studentErrors");
    setErrorsLoading(true);
    setErrorsMessage("");
    setWrongResponses([]);
    setWrongQuestions([]);
    setWrongAnswerKeys([]);
    const attemptIds = adminAttempts.filter((attempt) => attempt.student_id === selectedStudentId).map((attempt) => attempt.id);
    if (!attemptIds.length) { setErrorsLoading(false); return; }
    const responseResult = await supabase.from("question_responses").select("id, attempt_id, question_id, selected_answer, answered_at").in("attempt_id", attemptIds).eq("is_correct", false).order("answered_at", { ascending: false }).limit(500);
    if (responseResult.error) { setErrorsMessage("未能載入錯題紀錄，請稍後再試。"); setErrorsLoading(false); return; }
    const responses = (responseResult.data || []) as WrongResponse[];
    setWrongResponses(responses);
    const questionIds = [...new Set(responses.map((response) => response.question_id))];
    if (questionIds.length) {
      const [questionResult, keyResult] = await Promise.all([
        supabase.from("questions").select("id, node_id, question_text, options").in("id", questionIds),
        supabase.from("question_answer_keys").select("question_id, correct_answer, explanation, hint").in("question_id", questionIds),
      ]);
      if (questionResult.error || keyResult.error) setErrorsMessage("錯題已載入，但部分題目解釋暫時未能顯示。");
      else {
        setWrongQuestions(((questionResult.data || []) as WrongQuestion[]).map(localiseQuestion));
        setWrongAnswerKeys(((keyResult.data || []) as WrongAnswerKey[]).map((key) => ({
          ...key,
          explanation: key.explanation ? localiseCurrency(key.explanation) : null,
          hint: key.hint ? localiseCurrency(key.hint) : null,
        })));
      }
    }
    setErrorsLoading(false);
  }

  async function setStudentAccess(student: ManagedStudent) {
    setStudentActionId(student.user_id); setStudentsMessage("");
    const { data, error } = await supabase.rpc("admin_set_student_access", { p_user_id: student.user_id, p_login_allowed: !student.login_allowed });
    if (error || !data?.success) setStudentsMessage("未能更新登入權限，請稍後再試。");
    else setManagedStudents((items) => items.map((item) => item.user_id === student.user_id ? { ...item, login_allowed: !student.login_allowed } : item));
    setStudentActionId(null);
  }

  async function resetStudentDevices(student: ManagedStudent) {
    if (!window.confirm(`確定重設 ${student.display_name || student.email} 的登入裝置嗎？`)) return;
    setStudentActionId(student.user_id); setStudentsMessage("");
    const { data, error } = await supabase.rpc("admin_reset_student_devices", { p_user_id: student.user_id });
    if (error || !data?.success) setStudentsMessage("未能重設登入裝置，請稍後再試。");
    else setManagedStudents((items) => items.map((item) => item.user_id === student.user_id ? { ...item, device_count: 0 } : item));
    setStudentActionId(null);
  }

  async function resetStudentPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordResetStudent) return;
    setPasswordResetMessage(""); setPasswordResetSuccess(false);
    if (temporaryPassword.length < 8 || temporaryPassword.length > 72) { setPasswordResetMessage("臨時密碼必須為8至72個字元。"); return; }
    if (temporaryPassword !== confirmTemporaryPassword) { setPasswordResetMessage("兩次輸入的臨時密碼不一致。"); return; }
    setStudentActionId(passwordResetStudent.user_id);
    const { data, error } = await supabase.functions.invoke("admin-reset-student-password", {
      body: { student_id: passwordResetStudent.user_id, temporary_password: temporaryPassword },
    });
    if (error || !data?.success) {
      const reasonMessages: Record<string, string> = {
        invalid_password: "臨時密碼必須為8至72個字元。",
        student_not_found: "找不到這個學生帳戶。",
        admin_required: "目前帳戶沒有重設學生密碼的權限。",
        invalid_session: "登入狀態已失效，請重新登入。",
      };
      setPasswordResetMessage(reasonMessages[data?.reason] || "未能重設密碼，請稍後再試。");
    } else {
      setPasswordResetSuccess(true);
      setPasswordResetMessage(`已為 ${passwordResetStudent.display_name || passwordResetStudent.email} 設定新臨時密碼。學生下次登入必須自行更改密碼。`);
      setTemporaryPassword(""); setConfirmTemporaryPassword("");
      setManagedStudents((items) => items.map((item) => item.user_id === passwordResetStudent.user_id ? { ...item, device_count: 0 } : item));
    }
    setStudentActionId(null);
  }

  async function createStudent(event: FormEvent) {
    event.preventDefault();
    setCreateStudentMessage(""); setCreateStudentSuccess(false);
    if (studentName.trim().length < 2) { setCreateStudentMessage("請輸入至少2個字的學生姓名。"); return; }
    if (studentPassword.length < 8) { setCreateStudentMessage("臨時密碼最少需要8個字元。"); return; }
    if (studentPassword !== confirmStudentPassword) { setCreateStudentMessage("兩次輸入的臨時密碼不一致。"); return; }
    setCreateStudentLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-create-student", { body: { display_name: studentName.trim(), email: studentEmail.trim().toLowerCase(), password: studentPassword, grade: "P4" } });
    const reason = data?.reason;
    if (error || !data?.success) {
      const reasonMessages: Record<string, string> = {
        email_already_exists: "這個電郵已經建立帳戶。",
        invalid_email: "請輸入有效的學生電郵。",
        invalid_password: "臨時密碼必須為8至72個字元。",
        admin_required: "目前登入帳戶沒有新增學生的權限。",
        invalid_session: "登入狀態已失效，請重新登入。",
        profile_creation_failed: "登入帳戶已取消建立，請稍後再試。",
      };
      setCreateStudentMessage(reasonMessages[reason] || "未能建立學生帳戶，請稍後再試。");
    } else {
      setCreateStudentSuccess(true); setCreateStudentMessage(`已成功建立 ${studentName.trim()} 的學生帳戶。`);
      setStudentName(""); setStudentEmail(""); setStudentPassword(""); setConfirmStudentPassword("");
      const { data: refreshedStudents } = await supabase.rpc("admin_get_students");
      if (refreshedStudents) setManagedStudents(refreshedStudents as ManagedStudent[]);
    }
    setCreateStudentLoading(false);
  }

  async function openMaths() {
    setView("maths");
    if (mathsUnits.length) return;
    setUnitsLoading(true); setUnitsMessage("");
    const { data: subject, error: subjectError } = await supabase.from("curriculum_subjects").select("id").eq("grade", "P4").eq("code", "mathematics").single();
    if (subjectError || !subject) { setUnitsMessage("未能讀取P4數學課程，請稍後再試。"); setUnitsLoading(false); return; }
    const { data: domains, error: domainsError } = await supabase.from("curriculum_domains").select("id, name_zh, code").eq("subject_id", subject.id);
    if (domainsError || !domains?.length) { setUnitsMessage("未能找到P4數學範疇，請聯絡管理員。"); setUnitsLoading(false); return; }
    const { data, error } = await supabase.from("curriculum_nodes").select("id, domain_id, code, title_zh, title_en, difficulty").in("domain_id", domains.map((domain) => domain.id)).eq("is_active", true).order("code");
    if (error) {
      setUnitsMessage("未能載入數學單位，請稍後再試。");
    } else {
      const domainMap = new Map(domains.map((domain) => [domain.id, { title_zh: domain.name_zh, code: domain.code }]));
      setMathsUnits((data || []).map((unit) => ({ ...unit, curriculum_domains: domainMap.get(unit.domain_id) || null })) as MathsUnit[]);
    }
    setUnitsLoading(false);
  }


  async function openEnglish() {
    setView("english");
    if (englishUnits.length) return;
    setEnglishUnitsLoading(true); setEnglishUnitsMessage("");
    const { data: subject, error: subjectError } = await supabase.from("curriculum_subjects").select("id").eq("grade", "P4").eq("code", "english").single();
    if (subjectError || !subject) { setEnglishUnitsMessage("未能讀取P4英文課程，請稍後再試。"); setEnglishUnitsLoading(false); return; }
    const { data: domains, error: domainsError } = await supabase.from("curriculum_domains").select("id, name_zh, code").eq("subject_id", subject.id);
    if (domainsError || !domains?.length) { setEnglishUnitsMessage("未能找到P4英文範疇，請聯絡管理員。"); setEnglishUnitsLoading(false); return; }
    const { data, error } = await supabase.from("curriculum_nodes").select("id, domain_id, code, title_zh, title_en, difficulty").in("domain_id", domains.map((domain) => domain.id)).eq("is_active", true).order("code");
    if (error) {
      setEnglishUnitsMessage("未能載入英文單元，請稍後再試。");
    } else {
      const domainMap = new Map(domains.map((domain) => [domain.id, { title_zh: domain.name_zh, code: domain.code }]));
      setEnglishUnits((data || []).map((unit) => ({ ...unit, curriculum_domains: domainMap.get(unit.domain_id) || null })) as MathsUnit[]);
    }
    setEnglishUnitsLoading(false);
  }

  async function openChinese() {
    setView("chinese");
    if (chineseUnits.length) return;
    setChineseUnitsLoading(true); setChineseUnitsMessage("");
    const { data: subject, error: subjectError } = await supabase.from("curriculum_subjects").select("id").eq("grade", "P4").eq("code", "chinese").single();
    if (subjectError || !subject) { setChineseUnitsMessage("未能讀取P4中文課程，請稍後再試。"); setChineseUnitsLoading(false); return; }
    const { data: domains, error: domainsError } = await supabase.from("curriculum_domains").select("id, name_zh, code").eq("subject_id", subject.id);
    if (domainsError || !domains?.length) { setChineseUnitsMessage("未能找到P4中文範疇，請聯絡管理員。"); setChineseUnitsLoading(false); return; }
    const { data, error } = await supabase.from("curriculum_nodes").select("id, domain_id, code, title_zh, title_en, difficulty").in("domain_id", domains.map((domain) => domain.id)).eq("is_active", true).order("code");
    if (error) {
      setChineseUnitsMessage("未能載入中文單位，請稍後再試。");
    } else {
      const domainMap = new Map(domains.map((domain) => [domain.id, { title_zh: domain.name_zh, code: domain.code }]));
      setChineseUnits((data || []).map((unit) => ({ ...unit, curriculum_domains: domainMap.get(unit.domain_id) || null })) as MathsUnit[]);
    }
    setChineseUnitsLoading(false);
  }

  async function openHumanities() {
    setView("humanities");
    if (humanitiesUnits.length) return;
    setHumanitiesUnitsLoading(true); setHumanitiesUnitsMessage("");
    const { data: subject, error: subjectError } = await supabase.from("curriculum_subjects").select("id").eq("grade", "P4").eq("code", "humanities").single();
    if (subjectError || !subject) { setHumanitiesUnitsMessage("未能讀取P4人文科課程，請稍後再試。"); setHumanitiesUnitsLoading(false); return; }
    const { data: domains, error: domainsError } = await supabase.from("curriculum_domains").select("id, name_zh, code").eq("subject_id", subject.id);
    if (domainsError || !domains?.length) { setHumanitiesUnitsMessage("未能找到P4人文科範疇，請聯絡管理員。"); setHumanitiesUnitsLoading(false); return; }
    const { data, error } = await supabase.from("curriculum_nodes").select("id, domain_id, code, title_zh, title_en, difficulty").in("domain_id", domains.map((domain) => domain.id)).eq("is_active", true).order("code");
    if (error) {
      setHumanitiesUnitsMessage("未能載入人文科單元，請稍後再試。");
    } else {
      const domainMap = new Map(domains.map((domain) => [domain.id, { title_zh: domain.name_zh, code: domain.code }]));
      setHumanitiesUnits((data || []).filter((unit) => /^4H[1-6]$/.test(unit.code)).map((unit) => ({ ...unit, curriculum_domains: domainMap.get(unit.domain_id) || null })) as MathsUnit[]);
    }
    setHumanitiesUnitsLoading(false);
  }

  async function openScience() {
    setView("science");
    if (scienceUnits.length) return;
    setScienceUnitsLoading(true); setScienceUnitsMessage("");
    const { data: subject, error: subjectError } = await supabase.from("curriculum_subjects").select("id").eq("grade", "P4").eq("code", "science").single();
    if (subjectError || !subject) { setScienceUnitsMessage("未能讀取P4科學科課程，請稍後再試。"); setScienceUnitsLoading(false); return; }
    const { data: domains, error: domainsError } = await supabase.from("curriculum_domains").select("id, name_zh, code").eq("subject_id", subject.id);
    if (domainsError || !domains?.length) { setScienceUnitsMessage("未能找到P4科學科範疇，請聯絡管理員。"); setScienceUnitsLoading(false); return; }
    const { data, error } = await supabase.from("curriculum_nodes").select("id, domain_id, code, title_zh, title_en, difficulty").in("domain_id", domains.map((domain) => domain.id)).eq("is_active", true).order("code");
    if (error) {
      setScienceUnitsMessage("未能載入科學科單元，請稍後再試。");
    } else {
      const domainMap = new Map(domains.map((domain) => [domain.id, { title_zh: domain.name_zh, code: domain.code }]));
      setScienceUnits((data || []).filter((unit) => /^4SC[1-7]$/.test(unit.code)).map((unit) => ({ ...unit, curriculum_domains: domainMap.get(unit.domain_id) || null })) as MathsUnit[]);
    }
    setScienceUnitsLoading(false);
  }

  async function startWritingTask(unit: MathsUnit) {
    const previousPromptId = writingPrompt?.prompt_id ?? null;
    setActiveSubject("chinese");
    setActiveUnit(unit); setView("practice"); setPracticeLoading(true); setPracticeMessage("");
    setQuestions([]); setWritingPrompt(null); setWritingContent(""); setWritingResult(null);
    const { data, error } = await supabase.rpc("start_writing_task", { p_node_id: unit.id, p_exclude_prompt_id: previousPromptId });
    if (error || !data?.success) {
      setPracticeMessage(data?.reason === "no_prompt" ? "這個單元目前未有作文題目。" : "未能載入作文題目，請先執行作文工作室 SQL。");
    } else {
      setWritingPrompt(data as WritingPrompt);
    }
    setPracticeLoading(false);
  }

  async function submitWritingTask() {
    if (!writingPrompt || writingCharCount < 50 || writingResult) return;
    setPracticeLoading(true); setPracticeMessage("");
    const { data, error } = await supabase.rpc("submit_writing_task", { p_prompt_id: writingPrompt.prompt_id, p_content: writingContent });
    if (error || !data?.success) {
      setPracticeMessage(data?.reason === "too_short" ? "文章最少要有50字才可提交。" : "未能儲存及評改作文，請稍後再試。");
    } else {
      setWritingResult(data as WritingResult);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setPracticeLoading(false);
  }

  async function startUnit(unit: MathsUnit, subject: "maths" | "chinese" | "english" | "humanities" | "science" = activeSubject) {
    if (subject === "maths" && !enabledMathsUnits.has(unit.code)) return;
    if (subject === "chinese" && unit.code.startsWith("4CW")) { await startWritingTask(unit); return; }
    setActiveSubject(subject);
    setActiveUnit(unit); setView("practice"); setPracticeLoading(true); setPracticeMessage(""); setQuestions([]); setCurrentIndex(0); setSelectedAnswer(""); setReadingAnswers({}); setReadingSubmitted([]); setFeedback(null); setCompletedResult(null);
    const readingMode = /^(4CR|4ER)/.test(unit.code);
    const { data: startResult, error: startError } = readingMode
      ? await supabase.rpc("start_reading_practice", { p_node_id: unit.id })
      : await supabase.rpc("start_practice", { p_node_id: unit.id, p_question_count: 10 });
    if (startError || !startResult?.success) {
      const reason = startResult?.reason;
      setPracticeMessage(reason === "no_published_questions" || reason === "no_complete_passage" ? "這個單位目前未有一篇完整的10題閱讀文章。" : "未能開始練習，請稍後再試。");
      setPracticeLoading(false); return;
    }
    setAttemptId(startResult.attempt_id);
    const { data: links, error: linkError } = await supabase.from("attempt_questions").select("question_id, position").eq("attempt_id", startResult.attempt_id).order("position");
    if (linkError || !links?.length) { setPracticeMessage("未能載入練習題目。"); setPracticeLoading(false); return; }
    const { data: questions, error: questionError } = await supabase.from("questions").select("id, question_text, options").in("id", links.map((link) => link.question_id));
    if (questionError || !questions?.length) setPracticeMessage("未能讀取題目內容。");
    else {
      const questionMap = new Map(questions.map((item) => [item.id, localiseQuestion(item as PracticeQuestion)]));
      setQuestions(links.map((link) => questionMap.get(link.question_id)).filter(Boolean) as PracticeQuestion[]);
    }
    setPracticeLoading(false);
  }

  async function submitAnswer() {
    if (!attemptId || !currentQuestion || !selectedAnswer || feedback) return;
    setPracticeLoading(true); setPracticeMessage("");
    const { data, error } = await supabase.rpc("submit_practice_answer", { p_attempt_id: attemptId, p_question_id: currentQuestion.id, p_answer: selectedAnswer });
    if (error || !data?.success) setPracticeMessage(data?.reason === "already_answered" ? "這題已經提交，不能重複作答。" : "未能提交答案，請稍後再試。");
    else {
      const result = data as AnswerFeedback;
      if (result.completed) {
        setCompletedResult(result);
        setView("complete");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setFeedback(result);
      }
    }
    setPracticeLoading(false);
  }

  async function submitReadingAnswers() {
    if (!attemptId || readingSubmitted.length === questions.length || questions.some((question) => !readingAnswers[question.id])) return;
    setPracticeLoading(true); setPracticeMessage("");
    const submitted = new Set(readingSubmitted);
    let finalResult: AnswerFeedback | null = null;
    for (const question of questions) {
      if (submitted.has(question.id)) continue;
      const { data, error } = await supabase.rpc("submit_practice_answer", { p_attempt_id: attemptId, p_question_id: question.id, p_answer: readingAnswers[question.id] });
      if (error || !data?.success) {
        setReadingSubmitted([...submitted]);
        setPracticeMessage("部分答案未能提交，請按一次「提交全部答案」繼續。");
        setPracticeLoading(false);
        return;
      }
      submitted.add(question.id);
      finalResult = data as AnswerFeedback;
      setReadingSubmitted([...submitted]);
    }
    if (finalResult?.completed) {
      setCompletedResult(finalResult);
      setView("complete");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setPracticeLoading(false);
  }

  function nextQuestion() {
    if (!feedback || feedback.completed) return;
    setCurrentIndex((index) => index + 1); setSelectedAnswer(""); setFeedback(null); setPracticeMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openFeedback() {
    setFeedbackReturnView(view === "feedback" || view === "privacy" ? "subjects" : view);
    setReportStatus("");
    setView("feedback");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!session?.user || reportSubject.trim().length < 2 || reportMessage.trim().length < 5) return;
    setReportLoading(true); setReportStatus("");
    const { error } = await supabase.from("feedback_reports").insert({
      user_id: session.user.id,
      category: reportCategory,
      subject: reportSubject.trim(),
      message: reportMessage.trim(),
      page_context: feedbackReturnView,
    });
    if (error) setReportStatus("未能送出回報。若這是首次使用，請先完成管理員提供的資料庫設定。");
    else { setReportStatus("已收到你的回報，謝謝你幫助我們改善平台。"); setReportSubject(""); setReportMessage(""); }
    setReportLoading(false);
  }

  async function openAdminFeedback() {
    if (profile?.role !== "admin") return;
    setView("adminFeedback"); setFeedbackListLoading(true);
    const { data } = await supabase.from("feedback_reports").select("id,user_id,category,subject,message,page_context,status,admin_note,created_at").order("created_at", { ascending: false }).limit(200);
    setFeedbackReports((data || []) as FeedbackReport[]);
    setFeedbackListLoading(false);
  }

  async function updateReportStatus(id: number, status: "reviewing" | "resolved") {
    const { error } = await supabase.from("feedback_reports").update({ status }).eq("id", id);
    if (!error) setFeedbackReports((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  }

  if (view === "privacy") return (
    <main className="policy-page"><section className="policy-card">
      <button className="back-button" onClick={() => setView(session ? "subjects" : "subjects")}><ArrowLeft size={18} />返回{session ? "學習平台" : "登入頁"}</button>
      <div className="policy-icon"><ShieldCheck size={34} /></div><p className="eyebrow">試用版私隱聲明</p><h1>我們如何保護你的資料</h1><p className="policy-updated">最後更新：2026年8月28日</p>
      <div className="policy-sections">
        <section><h2>收集的資料</h2><p>平台會保存帳戶姓名、電郵、年級、登入裝置記錄、練習答案與成績，以及你主動提交的問題回報。</p></section>
        <section><h2>使用目的</h2><p>資料只用於帳戶登入、安全管理、提供學習練習、整理學習成績及處理意見。</p></section>
        <section className="policy-warning"><h2>請勿輸入敏感資料</h2><p>請不要提交住址、電話、身份證或護照號碼、健康資料、銀行或付款資料。問題回報只需描述平台問題。</p></section>
        <section><h2>查閱與保安</h2><p>學生只可查看自己的學習內容；家長帳戶日後只可查看已連結子女的資料；獲授權管理員可查看帳戶、成績及回報，以管理平台。請勿與他人分享密碼。</p></section>
        <section><h2>保存、更正與刪除</h2><p>如需更正或刪除試用資料，請聯絡 SENPlus+ 管理員。試用完結後，管理員可按需要刪除測試帳戶及相關記錄。</p></section>
        <section><h2>服務供應</h2><p>平台使用 Supabase 及網站託管服務處理必要資料。我們不會出售學生資料。</p></section>
      </div>
    </section></main>
  );

  if (passwordRecoveryMode && session) return (
    <main className="password-change-page"><section className="password-change-card">
      <div className="password-change-icon"><KeyRound size={34} aria-hidden="true" /></div>
      <p className="eyebrow">帳戶安全</p><h1>設定新密碼</h1>
      <p className="password-change-copy">請輸入8至72個字元的新密碼。完成後，你需要使用新密碼重新登入。</p>
      <form onSubmit={completePasswordRecovery}>
        <label>新密碼<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="輸入新密碼" /></label>
        <label>確認新密碼<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder="再次輸入新密碼" /></label>
        {passwordChangeMessage && <p className="error-message">{passwordChangeMessage}</p>}
        <button type="submit" disabled={passwordChangeLoading}>{passwordChangeLoading ? "正在更新…" : "更新密碼"}</button>
      </form>
    </section></main>
  );

  if (!session) return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark">S+</div><p className="eyebrow">SENPlus+ Academy Ultra</p>
        <h1>每一步，都是<br />成長的亮光。</h1>
        <p className="intro-copy">為香港小五學生而設的個人化學習空間，以清晰步驟建立信心，讓練習變得自在而有方向。</p>
        <div className="subject-dots" aria-label="五個科目">{subjects.map((subject) => <span key={subject.name}>{subject.name}</span>)}</div>
      </section>
      <section className="login-panel"><div className="login-card">
        <div className="mobile-brand"><div className="brand-mark">S+</div><span>SENPlus+</span></div>
        <div className="auth-tabs" role="tablist" aria-label="登入或註冊">
          <button type="button" role="tab" aria-selected={authMode === "login"} className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setForgotPasswordMode(false); setMessage(""); }}>登入</button>
          <button type="button" role="tab" aria-selected={authMode === "register"} className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setForgotPasswordMode(false); setRegistrationMessage(""); }}>建立帳戶</button>
        </div>
        {authMode === "login" && forgotPasswordMode ? <form onSubmit={requestPasswordReset}>
          <p className="eyebrow">帳戶安全</p><h2>忘記密碼</h2><p className="form-note">輸入學生或家長帳戶的電郵，我們會發送安全重設連結。</p>
          <label>電郵地址<input type="email" required autoComplete="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="name@example.com" /></label>
          {resetRequestMessage && <p className={resetRequestSuccess ? "registration-success" : "error-message"}>{resetRequestMessage}</p>}
          <button type="submit" disabled={resetRequestLoading}>{resetRequestLoading ? "正在發送…" : "發送重設密碼電郵"}</button>
          <p className="privacy-note"><button type="button" onClick={() => { setForgotPasswordMode(false); setResetRequestMessage(""); }}>返回登入</button></p>
        </form> : authMode === "login" ? <form onSubmit={signIn}>
          <p className="eyebrow">P4 學習平台</p><h2>歡迎回來</h2><p className="form-note">使用你的帳戶登入學習平台。</p>
          <label>電郵地址<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
          <label>密碼<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="輸入密碼" /></label>
          {message && <p className="error-message">{message}</p>}
          <button type="submit" disabled={loading}>{loading ? "登入中…" : "登入學習平台"}</button>
          <p className="forgot-password-link"><button type="button" onClick={() => { setResetEmail(email); setForgotPasswordMode(true); setResetRequestMessage(""); }}>忘記密碼？</button></p>
          <p className="privacy-note">還沒有帳戶？<button type="button" onClick={() => setAuthMode("register")}>學生或家長可自行建立</button><br /><button type="button" onClick={() => setView("privacy")}>查看私隱聲明</button></p>
        </form> : <form onSubmit={registerAccount}>
          <p className="eyebrow">P4 學習平台</p><h2>建立帳戶</h2><p className="form-note">選擇身分並填寫基本資料。</p>
          <fieldset className="role-choice"><legend>帳戶身分</legend>
            <label className={registrationRole === "student" ? "selected" : ""}><input type="radio" name="registration-role" value="student" checked={registrationRole === "student"} onChange={() => { setRegistrationRole("student"); setRegistrationConsent(false); }} /><span><strong>學生</strong><small>P4 練習及成績紀錄</small></span></label>
            <label className={registrationRole === "parent" ? "selected" : ""}><input type="radio" name="registration-role" value="parent" checked={registrationRole === "parent"} onChange={() => { setRegistrationRole("parent"); setRegistrationConsent(false); }} /><span><strong>家長</strong><small>家長帳戶</small></span></label>
          </fieldset>
          <label>姓名<input type="text" required minLength={2} maxLength={60} autoComplete="name" value={registrationName} onChange={(e) => setRegistrationName(e.target.value)} placeholder={registrationRole === "student" ? "學生姓名" : "家長姓名"} /></label>
          <label>電郵地址<input type="email" required autoComplete="email" value={registrationEmail} onChange={(e) => setRegistrationEmail(e.target.value)} placeholder="name@example.com" /></label>
          <label>密碼<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={registrationPassword} onChange={(e) => setRegistrationPassword(e.target.value)} placeholder="8至72個字元" /></label>
          <label>確認密碼<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={registrationPasswordConfirm} onChange={(e) => setRegistrationPasswordConfirm(e.target.value)} placeholder="再次輸入密碼" /></label>
          <label className="consent-check"><input type="checkbox" checked={registrationConsent} onChange={(e) => setRegistrationConsent(e.target.checked)} /><span>{registrationRole === "student" ? "我已獲家長或監護人同意建立帳戶，並同意" : "我同意"} <button type="button" onClick={() => setView("privacy")}>私隱聲明</button>。</span></label>
          {registrationMessage && <p className={registrationSuccess ? "registration-success" : "error-message"}>{registrationMessage}</p>}
          <button type="submit" disabled={registrationLoading}>{registrationLoading ? "建立中…" : <><UserPlus size={17} />建立{registrationRole === "student" ? "學生" : "家長"}帳戶</>}</button>
          <p className="privacy-note">已經有帳戶？<button type="button" onClick={() => setAuthMode("login")}>返回登入</button></p>
        </form>}
      </div></section>
    </main>
  );

  if (session.user.user_metadata?.must_change_password === true && !passwordChanged) return (
    <main className="password-change-page">
      <section className="password-change-card">
        <div className="password-change-icon"><KeyRound size={34} aria-hidden="true" /></div>
        <p className="eyebrow">首次登入安全設定</p>
        <h1>設定你的新密碼</h1>
        <p className="password-change-copy">你好，{profile?.display_name || session.user.user_metadata?.display_name || "同學"}。為保障帳戶安全，請先更改管理員提供的臨時密碼，完成後便可開始學習。</p>
        <form onSubmit={changeFirstLoginPassword}>
          <label>新密碼<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="最少8個字元" /></label>
          <label>確認新密碼<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder="再次輸入新密碼" /></label>
          {passwordChangeMessage && <p className="error-message">{passwordChangeMessage}</p>}
          <button type="submit" disabled={passwordChangeLoading}>{passwordChangeLoading ? "正在更新…" : "儲存新密碼並開始學習"}</button>
        </form>
        <button className="password-change-signout" type="button" onClick={signOut}><LogOut size={16} />暫時登出</button>
        <p className="password-guidance">請使用自己容易記住、其他人難以猜到的密碼，並且不要與他人分享。</p>
      </section>
    </main>
  );

  if (profile && !profile.login_allowed) return <main className="status-page"><div className="status-card"><h1>帳戶暫停使用</h1><p>請聯絡 SENPlus+ 管理員重新啟用登入權限。</p><button onClick={signOut}>登出</button></div></main>;

  if (view === "parent" && profile?.role === "parent") {
    const selectedChild = parentChildren.find((child) => child.student_id === selectedParentChildId) || parentChildren[0];
    const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("zh-HK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "尚未開始";
    return <main className="dashboard-page parent-dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>家長學習儀表板</span></div></div><div className="account"><span>{profile.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="dashboard-wrap parent-wrap">
        <div className="parent-heading"><div><p className="eyebrow">家長專區</p><h1>子女學習概覽</h1><p>只顯示已由學生親自確認的連結及學習紀錄。</p></div><button onClick={loadParentDashboard} disabled={parentLoading}><RefreshCw size={17} />{parentLoading ? "更新中…" : "更新資料"}</button></div>
        <section className="parent-link-panel"><div className="parent-link-copy"><div className="parent-link-icon"><Link2 size={25} /></div><div><h2>連結另一位子女</h2><p>請學生登入後產生6位邀請碼。提交後仍須由學生確認，家長才可查看資料。</p></div></div><form onSubmit={linkStudentToParent}><input aria-label="6位邀請碼" maxLength={6} value={parentInviteCode} onChange={(event) => setParentInviteCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="例如 AB23CD" /><button type="submit" disabled={parentLoading}><UserPlus size={17} />送出連結申請</button></form></section>
        {parentMessage && <div className={parentMessage.startsWith("已") ? "parent-notice success" : "parent-notice"}>{parentMessage}</div>}
        {parentPending.length > 0 && <section className="pending-links"><div><Clock3 size={20} /><div><strong>等待學生確認</strong><p>{parentPending.map((item) => item.display_name).join("、")}尚未批准連結。</p></div></div></section>}
        {parentLoading && !parentChildren.length ? <div className="unit-status">正在整理子女學習紀錄…</div> : parentChildren.length === 0 ? <section className="parent-empty"><UserCheck size={34} /><h2>尚未連結子女</h2><p>請子女登入學生帳戶產生邀請碼，再於上方提交連結申請。</p></section> : <>
          <div className="child-tabs" role="tablist" aria-label="選擇子女">{parentChildren.map((child) => <button role="tab" aria-selected={selectedChild?.student_id === child.student_id} className={selectedChild?.student_id === child.student_id ? "active" : ""} key={child.student_id} onClick={() => { setSelectedParentChildId(child.student_id); setParentErrors([]); }}><strong>{child.display_name}</strong><span>{child.grade}</span></button>)}</div>
          {selectedChild && <>
            <section className="parent-child-hero"><div><p className="eyebrow">已確認連結</p><h2>{selectedChild.display_name}</h2><p>最近學習：{formatDate(selectedChild.last_active)}</p></div><button onClick={() => unlinkParentChild(selectedChild)}>解除連結</button></section>
            <div className="metric-grid parent-metrics"><article><div className="metric-icon teal"><BarChart3 size={22} /></div><span>練習總次數</span><strong>{selectedChild.attempt_count}</strong><small>{selectedChild.completed_count}次已完成</small></article><article><div className="metric-icon purple"><Target size={22} /></div><span>平均分</span><strong>{Math.round(Number(selectedChild.average_score || 0))}<b>分</b></strong><small>已完成練習平均</small></article><article><div className="metric-icon green"><CheckCircle2 size={22} /></div><span>完成率</span><strong>{selectedChild.attempt_count ? Math.round((selectedChild.completed_count / selectedChild.attempt_count) * 100) : 0}<b>%</b></strong><small>完成／已開始</small></article><article><div className="metric-icon amber"><AlertTriangle size={22} /></div><span>錯誤作答</span><strong>{selectedChild.wrong_count}</strong><button className="metric-link" onClick={() => loadParentErrors(selectedChild.student_id)}>查看錯題</button></article></div>
            <div className="parent-panels"><section className="admin-panel"><div className="panel-title"><div><p className="eyebrow">五科表現</p><h2>各科平均分</h2></div><span>{selectedChild.subject_performance?.length || 0}科</span></div>{selectedChild.subject_performance?.length ? <div className="unit-performance">{selectedChild.subject_performance.map((row) => <div key={row.subject}><div><strong>{row.subject}</strong><span>{row.attempts}次練習 · {row.completed}次完成 · 平均{Math.round(Number(row.average))}分</span></div><div className="performance-track"><span style={{ width: `${Math.round(Number(row.average))}%` }} /></div></div>)}</div> : <p className="empty-admin">尚未有科目成績。</p>}</section>
            <section className="admin-panel recent-panel"><div className="panel-title"><div><p className="eyebrow">最新動態</p><h2>最近練習</h2></div><span>最近10項</span></div>{selectedChild.attempts?.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>單元</th><th>狀態</th><th>答對</th><th>分數</th><th>時間</th></tr></thead><tbody>{selectedChild.attempts.slice(0, 10).map((attempt) => <tr key={attempt.id}><td><strong>{attempt.node_code} {attempt.title_zh}</strong></td><td><span className={`status-pill ${attempt.status}`}>{attempt.status === "completed" ? "已完成" : "進行中"}</span></td><td>{attempt.correct_count}／{attempt.total_questions}</td><td><strong>{attempt.score === null ? "—" : `${attempt.score}分`}</strong></td><td>{formatDate(attempt.started_at)}</td></tr>)}</tbody></table></div> : <p className="empty-admin">尚未有練習紀錄。</p>}</section></div>
            {(parentErrorsLoading || parentErrors.length > 0) && <section className="admin-panel parent-errors-panel"><div className="panel-title"><div><p className="eyebrow">錯題重溫</p><h2>{selectedChild.display_name}的最近錯題</h2></div><span>{parentErrorsLoading ? "載入中…" : `${parentErrors.length}項`}</span></div>{!parentErrorsLoading && <div className="wrong-question-list">{parentErrors.map((error) => <article className="wrong-question-card" key={error.response_id}><div className="wrong-question-head"><div><span className="unit-code">{error.node_code}</span><b>{error.title_zh}</b></div><time>{formatDate(error.answered_at)}</time></div><h3>{renderMarkedText(error.question_text)}</h3><div className="answer-comparison"><div className="student-wrong-answer"><span>學生答案</span><strong>{parentAnswerText(error, error.selected_answer)}</strong></div><div className="correct-answer"><span>正確答案</span><strong>{parentAnswerText(error, error.correct_answer)}</strong></div></div>{error.explanation && <div className="explanation-box"><Lightbulb size={18} /><div><strong>解題說明</strong><p>{renderMarkedText(error.explanation)}</p></div></div>}</article>)}</div>}</section>}
          </>}
        </>}
        <footer className="site-footer"><button onClick={openFeedback}>問題回報／意見</button><button onClick={() => setView("privacy")}>私隱聲明</button></footer>
      </section>
    </main>;
  }

  if (view === "feedback") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>問題回報與意見</span></div></div><div className="account"><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="support-wrap"><button className="back-button" onClick={() => setView(feedbackReturnView)}><ArrowLeft size={18} />返回上一頁</button>
      <div className="support-hero"><div className="support-icon"><MessageSquareText size={30} /></div><div><p className="eyebrow">協助我們改善</p><h1>問題回報／意見</h1><p>遇到操作問題、發現題目錯誤，或有改善建議，都可以在這裡告訴我們。</p></div></div>
      <form className="support-form" onSubmit={submitReport}>
        <label>回報類別<select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)}><option value="problem">平台問題</option><option value="suggestion">改善建議</option><option value="question_error">題目／答案錯誤</option></select></label>
        <label>主題<input required minLength={2} maxLength={120} value={reportSubject} onChange={(e) => setReportSubject(e.target.value)} placeholder="簡單說明問題" /></label>
        <label>詳細內容<textarea required minLength={5} maxLength={1500} value={reportMessage} onChange={(e) => setReportMessage(e.target.value)} placeholder="請描述發生了甚麼、在哪個頁面，以及你期望的結果。請勿輸入敏感個人資料。" /></label>
        <p className="data-warning"><ShieldCheck size={17} />請勿提交住址、電話、身份證、健康或付款資料。</p>
        {reportStatus && <p className={reportStatus.startsWith("已收到") ? "support-success" : "error-message"}>{reportStatus}</p>}
        <button type="submit" disabled={reportLoading}>{reportLoading ? "送出中…" : "送出回報"}</button>
      </form>
      <button className="policy-inline-link" onClick={() => setView("privacy")}>查看私隱聲明</button>
    </section>
  </main>;

  if (view === "adminFeedback" && profile?.role === "admin") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>管理員回報中心</span></div></div><div className="account"><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap admin-wrap"><button className="back-button" onClick={openAdminDashboard}><ArrowLeft size={18} />返回成績總覽</button>
      <div className="admin-heading"><div><p className="eyebrow">試用意見</p><h1>問題回報</h1><p>查看朋友提交的平台問題、建議及題目錯誤。</p></div><button onClick={openAdminFeedback}>更新資料</button></div>
      <section className="report-list">{feedbackListLoading ? <p className="empty-admin">正在載入…</p> : feedbackReports.length === 0 ? <p className="empty-admin">目前未有回報。</p> : feedbackReports.map((item) => { const user = adminUsers.find((u) => u.id === item.user_id); return <article key={item.id}><div className="report-head"><div><span className={`report-status ${item.status}`}>{item.status === "new" ? "新回報" : item.status === "reviewing" ? "處理中" : "已解決"}</span><strong>{item.subject}</strong></div><time>{new Date(item.created_at).toLocaleString("zh-HK")}</time></div><p>{item.message}</p><small>{user?.display_name || item.user_id} · {item.category === "problem" ? "平台問題" : item.category === "suggestion" ? "改善建議" : "題目／答案錯誤"} · {item.page_context || "未提供頁面"}</small><div className="report-actions"><button onClick={() => updateReportStatus(item.id,"reviewing")}>標記處理中</button><button onClick={() => updateReportStatus(item.id,"resolved")}>標記已解決</button></div></article>})}</section>
    </section>
  </main>;

  if (view === "studentErrors" && profile?.role === "admin" && selectedStudentId) {
    const student = managedStudents.find((item) => item.user_id === selectedStudentId);
    const user = adminUsers.find((item) => item.id === selectedStudentId);
    const displayName = student?.display_name || user?.display_name || "未命名學生";
    const nodeMap = new Map(adminNodes.map((node) => [node.id, node]));
    const questionMap = new Map(wrongQuestions.map((question) => [question.id, question]));
    const keyMap = new Map(wrongAnswerKeys.map((key) => [key.question_id, key]));
    const grouped = Array.from(wrongResponses.reduce((map, response) => {
      const current = map.get(response.question_id) || { count: 0, latest: response };
      current.count += 1;
      if (new Date(response.answered_at) > new Date(current.latest.answered_at)) current.latest = response;
      map.set(response.question_id, current);
      return map;
    }, new Map<number, { count: number; latest: WrongResponse }>()).entries()).map(([questionId, data]) => ({ questionId, ...data, question: questionMap.get(questionId), key: keyMap.get(questionId) })).sort((a, b) => b.count - a.count || new Date(b.latest.answered_at).getTime() - new Date(a.latest.answered_at).getTime());
    const unitRows = Array.from(grouped.reduce((map, row) => {
      const nodeId = row.question?.node_id;
      if (!nodeId) return map;
      const current = map.get(nodeId) || { total: 0, questions: 0 };
      current.total += row.count; current.questions += 1; map.set(nodeId, current); return map;
    }, new Map<number, { total: number; questions: number }>()).entries()).map(([nodeId, stats]) => ({ node: nodeMap.get(nodeId), ...stats })).sort((a, b) => b.total - a.total);
    const optionText = (question: WrongQuestion | undefined, value: unknown) => {
      const id = answerValue(value);
      const option = question?.options?.find((item) => item.id === id);
      return cleanMarkedText(option ? `${id} · ${option.text}` : id);
    };
    const displayQuestionText = (question: WrongQuestion | undefined) => {
      const text = question?.question_text || "題目內容暫時未能顯示";
      const code = nodeMap.get(question?.node_id || 0)?.code || "";
      return /^(4CR|4ER)/.test(code) ? splitReadingQuestion(text).prompt : text;
    };
    const readingSources = Array.from(grouped.reduce((map, row) => {
      const node = nodeMap.get(row.question?.node_id || 0);
      if (!node || !/^(4CR|4ER)/.test(node.code) || !row.question?.question_text) return map;
      const { passage } = splitReadingQuestion(row.question.question_text);
      if (passage !== "閱讀理解") map.set(`${node.code}:${passage}`, { code: node.code, title: node.title_zh, passage });
      return map;
    }, new Map<string, { code: string; title: string; passage: string }>()).values());
    const maxUnitErrors = Math.max(1, ...unitRows.map((row) => row.total));
    return <main className="dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>學生錯題分析</span></div></div><div className="account"><span>{profile.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="dashboard-wrap admin-wrap student-detail-wrap error-analysis-wrap">
        <button className="back-button" onClick={() => setView("studentDetail")}><ArrowLeft size={18} />返回個人成績詳情</button>
        <div className="error-analysis-hero"><div><p className="eyebrow">個人錯題報告</p><h1>{displayName} 的錯題分析</h1><p>按錯誤次數整理薄弱知識點，並顯示學生答案、正確答案及解題說明。</p></div><AlertTriangle size={42} /></div>
        {errorsMessage && <div className="unit-status error-message">{errorsMessage}</div>}
        {errorsLoading ? <div className="unit-status">正在整理錯題紀錄…</div> : <>
          <div className="metric-grid error-metrics">
            <article><div className="metric-icon teal"><AlertTriangle size={22} /></div><span>答錯總次數</span><strong>{wrongResponses.length}</strong><small>所有練習的錯誤作答</small></article>
            <article><div className="metric-icon purple"><Brain size={22} /></div><span>不同錯題</span><strong>{grouped.length}</strong><small>需要重新掌握的題目</small></article>
            <article><div className="metric-icon green"><BookOpen size={22} /></div><span>涉及單位</span><strong>{unitRows.length}</strong><small>出現錯題的學習單位</small></article>
            <article><div className="metric-icon amber"><Target size={22} /></div><span>最多錯題單位</span><strong className="metric-code">{unitRows[0]?.node?.code || "—"}</strong><small>{unitRows[0] ? `${unitRows[0].total}次錯誤` : "暫無錯題"}</small></article>
          </div>
          {wrongResponses.length ? <>
            <section className="admin-panel error-unit-panel"><div className="panel-title"><div><p className="eyebrow">薄弱範疇</p><h2>錯題單位分布</h2></div><span>{unitRows.length}個單位</span></div><div className="error-unit-list">{unitRows.map((row) => <article key={row.node?.id || row.node?.code}><div><strong>{row.node?.code || "—"} {row.node?.title_zh || "未知單位"}</strong><span>{row.total}次錯誤 · {row.questions}條題目</span></div><div className="performance-track error-track"><span style={{ width: `${Math.max(8, row.total / maxUnitErrors * 100)}%` }} /></div></article>)}</div></section>
            {readingSources.length > 0 && <section className="admin-panel reading-source-panel"><div className="panel-title"><div><p className="eyebrow">閱讀原文</p><h2>錯題相關文章</h2></div><span>{readingSources.length}篇</span></div><div className="reading-source-list">{readingSources.map((source) => <details key={source.code + source.passage}><summary><span className="unit-code">{source.code}</span><strong>{source.title}</strong><b>查看閱讀原文</b></summary><div>{renderMarkedText(source.passage)}</div></details>)}</div></section>}
            <section className="admin-panel wrong-question-panel"><div className="panel-title"><div><p className="eyebrow">錯題清單</p><h2>優先重溫題目</h2></div><span>按錯誤次數排序</span></div><div className="wrong-question-list">{grouped.map((row, index) => <article key={row.questionId} className="wrong-question-card"><div className="wrong-question-head"><div><span className="unit-code">{nodeMap.get(row.question?.node_id || 0)?.code || "—"}</span><b>第 {index + 1} 項重點</b></div><strong>答錯 {row.count} 次</strong></div><h3>{renderMarkedText(displayQuestionText(row.question))}</h3><div className="answer-comparison"><div className="student-wrong-answer"><span>最近錯誤答案</span><strong>{optionText(row.question, row.latest.selected_answer)}</strong></div><div className="correct-answer"><span>正確答案</span><strong>{optionText(row.question, row.key?.correct_answer)}</strong></div></div>{row.key?.explanation && <div className="explanation-box"><Lightbulb size={18} /><div><strong>解題說明</strong><p>{renderMarkedText(row.key.explanation)}</p></div></div>}</article>)}</div></section>
          </> : <section className="admin-panel error-empty"><CheckCircle2 size={42} /><h2>目前沒有錯題紀錄</h2><p>這位學生完成練習並答錯題目後，系統會自動在此整理分析。</p></section>}
        </>}
      </section>
    </main>;
  }

  if (view === "studentDetail" && profile?.role === "admin" && selectedStudentId) {
    const student = managedStudents.find((item) => item.user_id === selectedStudentId);
    const user = adminUsers.find((item) => item.id === selectedStudentId);
    const studentAttempts = adminAttempts.filter((attempt) => attempt.student_id === selectedStudentId);
    const completedAttempts = studentAttempts.filter((attempt) => attempt.status === "completed");
    const average = completedAttempts.length ? Math.round(completedAttempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / completedAttempts.length) : 0;
    const bestScore = completedAttempts.length ? Math.max(...completedAttempts.map((attempt) => Number(attempt.score || 0))) : 0;
    const completionRate = studentAttempts.length ? Math.round((completedAttempts.length / studentAttempts.length) * 100) : 0;
    const nodeMap = new Map(adminNodes.map((node) => [node.id, node]));
    const unitRows = Array.from(studentAttempts.reduce((map, attempt) => {
      const current = map.get(attempt.node_id) || { attempts: 0, completed: 0, scoreTotal: 0, best: 0 };
      current.attempts += 1;
      if (attempt.status === "completed") { current.completed += 1; current.scoreTotal += Number(attempt.score || 0); current.best = Math.max(current.best, Number(attempt.score || 0)); }
      map.set(attempt.node_id, current); return map;
    }, new Map<number, { attempts: number; completed: number; scoreTotal: number; best: number }>()).entries()).map(([nodeId, stats]) => ({ node: nodeMap.get(nodeId), ...stats, average: stats.completed ? Math.round(stats.scoreTotal / stats.completed) : 0 })).sort((a, b) => (a.node?.code || "").localeCompare(b.node?.code || ""));
    const formatDate = (value: string) => new Intl.DateTimeFormat("zh-HK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    const displayName = student?.display_name || user?.display_name || "未命名學生";
    return <main className="dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>學生個人成績詳情</span></div></div><div className="account"><span>{profile.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="dashboard-wrap admin-wrap student-detail-wrap">
        <button className="back-button" onClick={() => setView(studentDetailReturnView)}><ArrowLeft size={18} />{studentDetailReturnView === "students" ? "返回學生帳戶管理" : "返回成績總覽"}</button>
        <div className="student-detail-hero"><div><p className="eyebrow">個人學習報告</p><h1>{displayName}</h1><p>{student?.email || "P4 學生帳戶"} · {student?.grade || user?.grade || "P4"}</p></div><div className="student-detail-hero-actions"><div className={`student-detail-status ${student?.login_allowed === false ? "blocked" : "allowed"}`}>{student?.login_allowed === false ? "已停用登入" : "帳戶正常"}</div><button onClick={openStudentErrors}><AlertTriangle size={16} />查看錯題分析</button></div></div>
        {adminMessage && <div className="unit-status error-message">{adminMessage}</div>}
        {adminLoading && !adminUsers.length ? <div className="unit-status">正在整理個人成績…</div> : <>
          <div className="metric-grid student-detail-metrics">
            <article><div className="metric-icon teal"><BarChart3 size={22} /></div><span>練習總次數</span><strong>{studentAttempts.length}</strong><small>已開始的所有練習</small></article>
            <article><div className="metric-icon purple"><Target size={22} /></div><span>平均分</span><strong>{average}<b>分</b></strong><small>已完成練習平均</small></article>
            <article><div className="metric-icon green"><Trophy size={22} /></div><span>最高分</span><strong>{bestScore}<b>分</b></strong><small>個人最佳成績</small></article>
            <article><div className="metric-icon amber"><CheckCircle2 size={22} /></div><span>完成率</span><strong>{completionRate}<b>%</b></strong><small>{completedAttempts.length} 次已完成</small></article>
          </div>
          <div className="student-detail-grid">
            <section className="admin-panel"><div className="panel-title"><div><p className="eyebrow">學習單位</p><h2>各單位表現</h2></div><span>{unitRows.length}個單位</span></div>{unitRows.length ? <div className="detail-unit-list">{unitRows.map((row) => <article key={row.node?.id || row.node?.code}><div className="detail-unit-heading"><div><span className="unit-code">{row.node?.code || "—"}</span><strong>{row.node?.title_zh || "未知單位"}</strong></div><b className={row.average >= 60 ? "good" : "needs-work"}>{row.average}分</b></div><div className="performance-track"><span style={{ width: `${row.average}%` }} /></div><p>{row.attempts}次練習 · {row.completed}次完成 · 最高{row.best}分</p></article>)}</div> : <p className="empty-admin">這位學生尚未開始任何練習。</p>}</section>
            <section className="admin-panel"><div className="panel-title"><div><p className="eyebrow">學習提示</p><h2>需要關注</h2></div></div>{unitRows.length ? <div className="focus-list">{[...unitRows].sort((a, b) => a.average - b.average).slice(0, 3).map((row) => <div key={row.node?.id || row.node?.code}><Brain size={19} /><div><strong>{row.node?.code} {row.node?.title_zh}</strong><p>{row.average >= 80 ? "表現穩定，可繼續挑戰更多題目。" : row.average >= 60 ? "基礎已掌握，建議再練習鞏固。" : "建議優先重練並查看每題解釋。"}</p></div></div>)}</div> : <p className="empty-admin">完成練習後，系統會在此提供學習重點。</p>}</section>
          </div>
          <section className="admin-panel recent-panel"><div className="panel-title"><div><p className="eyebrow">練習歷程</p><h2>最近練習紀錄</h2></div><span>最近20項</span></div>{studentAttempts.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>單位</th><th>狀態</th><th>答對</th><th>分數</th><th>開始時間</th><th>完成時間</th></tr></thead><tbody>{studentAttempts.slice(0, 20).map((attempt) => <tr key={attempt.id}><td><strong>{nodeMap.get(attempt.node_id)?.code || "—"} {nodeMap.get(attempt.node_id)?.title_zh || ""}</strong></td><td><span className={`status-pill ${attempt.status}`}>{attempt.status === "completed" ? "已完成" : attempt.status === "in_progress" ? "進行中" : "已放棄"}</span></td><td>{attempt.correct_count}／{attempt.total_questions}</td><td><strong>{attempt.score ?? "—"}{attempt.score !== null ? "分" : ""}</strong></td><td>{formatDate(attempt.started_at)}</td><td>{attempt.completed_at ? formatDate(attempt.completed_at) : "—"}</td></tr>)}</tbody></table></div> : <p className="empty-admin">尚未有練習紀錄。</p>}</section>
        </>}
      </section>
    </main>;
  }

  if (view === "quality" && profile?.role === "admin") {
    const issueTypeLabels: Record<string, string> = {
      duplicate_question: "重複題目",
      missing_or_invalid_answer: "答案缺失／無效",
      invalid_option_count: "選項數量錯誤",
      duplicate_or_empty_options: "選項重複／留空",
      currency_symbol_review: "貨幣符號覆核",
    };
    const affectedQuestions = qualitySummary?.affected_questions ?? new Set(qualityIssues.map((issue) => issue.question_id)).size;
    const errorCount = qualitySummary?.error_count ?? qualityIssues.filter((issue) => issue.severity === "error").length;
    const warningCount = qualitySummary?.warning_count ?? qualityIssues.filter((issue) => issue.severity === "warning").length;
    const filteredQualityIssues = qualityFilter === "all" ? qualityIssues : qualityIssues.filter((issue) => issue.issue_type === qualityFilter);
    return <main className="dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>題庫品質檢查</span></div></div><div className="account"><span>{profile.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="dashboard-wrap admin-wrap quality-wrap">
        <button className="back-button" onClick={() => setView("admin")}><ArrowLeft size={18} />返回管理員儀表板</button>
        <div className="admin-heading"><div><p className="eyebrow">自動品質審核</p><h1>題庫健康狀況</h1><p>掃描所有題目，檢查重複題、答案、四個選項及香港貨幣符號。</p></div><div className="admin-heading-actions"><button onClick={openQuestionQualityAudit} disabled={qualityLoading}><RefreshCw size={17} />{qualityLoading ? "檢查中…" : "執行品質檢查"}</button></div></div>
        {qualityMessage && <div className="unit-status error-message">{qualityMessage}</div>}
        {qualitySaveMessage && <div className="quality-save-notice">{qualitySaveMessage}</div>}
        {qualityLoading && !qualityHasRun ? <div className="unit-status">正在掃描全部題目…</div> : qualityHasRun && <>
          <div className="metric-grid quality-metrics">
            <article><div className="metric-icon purple"><ShieldCheck size={22} /></div><span>已掃描題目</span><strong>{qualitySummary?.total_questions ?? 0}</strong><small>Supabase 題庫總數</small></article>
            <article><div className="metric-icon amber"><AlertTriangle size={22} /></div><span>受影響題目</span><strong>{affectedQuestions}</strong><small>同一題可能有多項問題</small></article>
            <article><div className="metric-icon teal"><Search size={22} /></div><span>錯誤</span><strong>{errorCount}</strong><small>需要優先修正</small></article>
            <article><div className="metric-icon green"><CheckCircle2 size={22} /></div><span>警告</span><strong>{warningCount}</strong><small>需要人工覆核</small></article>
          </div>
          <section className="quality-check-grid">
            <article><span>重複題目</span><strong>{qualityIssues.filter((issue) => issue.issue_type === "duplicate_question").length}</strong></article>
            <article><span>答案缺失／無效</span><strong>{qualityIssues.filter((issue) => issue.issue_type === "missing_or_invalid_answer").length}</strong></article>
            <article><span>選項問題</span><strong>{qualityIssues.filter((issue) => issue.issue_type === "invalid_option_count" || issue.issue_type === "duplicate_or_empty_options").length}</strong></article>
            <article><span>貨幣符號覆核</span><strong>{qualityIssues.filter((issue) => issue.issue_type === "currency_symbol_review").length}</strong></article>
          </section>
          <section className="admin-panel quality-list-panel"><div className="quality-list-heading"><div className="panel-title"><div><p className="eyebrow">檢查結果</p><h2>{qualityIssues.length ? "需要處理的題目" : "沒有發現問題"}</h2></div><span>{filteredQualityIssues.length}項</span></div>{qualityIssues.length > 0 && <label className="quality-filter"><span>問題類型</span><select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}><option value="all">全部問題</option>{Object.entries(issueTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}</div>
            {filteredQualityIssues.length ? <div className="quality-issue-list">{filteredQualityIssues.map((issue, index) => <article key={`${issue.question_id}-${issue.issue_type}-${index}`}><div><span className={`quality-issue-tag ${issue.issue_type}`}>{issueTypeLabels[issue.issue_type] || issue.issue_type}</span><b>{issue.node_code || "未分類單元"}</b><small>題目 ID：{issue.question_id}</small></div><p>{issue.question_text.slice(0, 260)}{issue.question_text.length > 260 ? "…" : ""}</p><strong>{issue.details}</strong><button className="quality-edit-button" onClick={() => openQualityEditor(issue)}><Pencil size={15} />逐題修正</button></article>)}</div> : qualityIssues.length ? <div className="quality-clean"><Search size={44} /><h3>此類型沒有問題</h3><p>請選擇其他問題類型或顯示全部結果。</p></div> : <div className="quality-clean"><CheckCircle2 size={48} /><h3>題庫檢查通過</h3><p>沒有發現重複題、答案缺失、選項問題或需要覆核的貨幣符號。</p></div>}
          </section>
        </>}
      </section>
      {qualityEditor && <div className="quality-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !qualitySaving) setQualityEditor(null); }}><section className="quality-editor-modal" role="dialog" aria-modal="true" aria-labelledby="quality-editor-title"><div className="quality-editor-heading"><div><p className="eyebrow">題目 ID：{qualityEditor.questionId}</p><h2 id="quality-editor-title">逐題修正</h2></div><button type="button" aria-label="關閉修正視窗" disabled={qualitySaving} onClick={() => setQualityEditor(null)}><X size={20} /></button></div><form onSubmit={saveQualityCorrection}><label className="quality-editor-wide"><span>題目文字</span><textarea required value={qualityEditor.questionText} onChange={(event) => updateQualityEditor("questionText", event.target.value)} /></label><div className="quality-option-grid">{(["A", "B", "C", "D"] as const).map((letter) => { const field = `option${letter}` as "optionA" | "optionB" | "optionC" | "optionD"; return <label key={letter}><span>選項 {letter}</span><input required value={qualityEditor[field]} onChange={(event) => updateQualityEditor(field, event.target.value)} /></label>; })}</div><label><span>正確答案</span><select value={qualityEditor.correctAnswer} onChange={(event) => updateQualityEditor("correctAnswer", event.target.value)}><option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option></select></label><label className="quality-editor-wide"><span>提示</span><textarea value={qualityEditor.hint} onChange={(event) => updateQualityEditor("hint", event.target.value)} /></label><label className="quality-editor-wide"><span>答案解析</span><textarea value={qualityEditor.explanation} onChange={(event) => updateQualityEditor("explanation", event.target.value)} /></label>{qualitySaveMessage && <p className="quality-editor-message">{qualitySaveMessage}</p>}<div className="quality-editor-actions"><button type="button" disabled={qualitySaving} onClick={() => setQualityEditor(null)}>取消</button><button type="submit" disabled={qualitySaving}><ShieldCheck size={17} />{qualitySaving ? "儲存並檢查中…" : "儲存並重新檢查"}</button></div></form></section></div>}
    </main>;
  }

  if (view === "students" && profile?.role === "admin") {
    const query = studentSearch.trim().toLowerCase();
    const filteredStudents = managedStudents.filter((student) => !query || (student.display_name || "").toLowerCase().includes(query) || student.email.toLowerCase().includes(query));
    return <main className="dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>學生帳戶管理</span></div></div><div className="account"><span>{profile.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="dashboard-wrap admin-wrap">
        <button className="back-button" onClick={() => setView("admin")}><ArrowLeft size={18} />返回成績儀表板</button>
        <div className="admin-heading student-heading"><div><p className="eyebrow">帳戶與裝置</p><h1>學生帳戶管理</h1><p>建立學生帳戶、控制登入權限，並在更換裝置時清除原有裝置紀錄。</p></div><div className="admin-heading-actions"><button className="create-student-button" onClick={() => { setShowCreateStudent((value) => !value); setCreateStudentMessage(""); setCreateStudentSuccess(false); }}>{showCreateStudent ? <X size={17} /> : <Plus size={17} />}{showCreateStudent ? "關閉表格" : "新增學生"}</button><button onClick={openStudentManagement} disabled={studentsLoading}>{studentsLoading ? "更新中…" : "更新學生資料"}</button></div></div>
        {showCreateStudent && <section className="create-student-panel">
          <div className="create-student-title"><div className="create-student-icon"><UserPlus size={24} /></div><div><p className="eyebrow">建立登入帳戶</p><h2>新增一位P4學生</h2><p>學生可立即使用電郵及臨時密碼登入，最多登記兩部裝置。</p></div></div>
          <form className="create-student-form" onSubmit={createStudent}>
            <label><span>學生姓名</span><input required minLength={2} maxLength={80} value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="例如：陳小明" /></label>
            <label><span>學生電郵</span><input required type="email" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} placeholder="student@example.com" /></label>
            <label><span>年級</span><input value="P4" readOnly aria-readonly="true" /></label>
            <label><span>臨時密碼</span><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={studentPassword} onChange={(event) => setStudentPassword(event.target.value)} placeholder="最少8個字元" /></label>
            <label><span>確認臨時密碼</span><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={confirmStudentPassword} onChange={(event) => setConfirmStudentPassword(event.target.value)} placeholder="再次輸入臨時密碼" /></label>
            <button type="submit" disabled={createStudentLoading}><UserPlus size={18} />{createStudentLoading ? "建立中…" : "建立學生帳戶"}</button>
          </form>
          {createStudentMessage && <p className={`create-student-result ${createStudentSuccess ? "success" : "error"}`}>{createStudentMessage}</p>}
          <p className="password-reminder">請以安全方式把臨時密碼交給學生，不要在公開群組傳送。</p>
        </section>}
        <div className="student-tools"><div className="student-search"><Search size={18} /><input aria-label="搜尋學生" placeholder="搜尋學生姓名或電郵" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} /></div><div className="student-count"><Users size={18} /><strong>{managedStudents.length}</strong><span>個學生帳戶</span></div></div>
        {studentsMessage && <div className="unit-status error-message">{studentsMessage}</div>}
        {passwordResetStudent && <section className="password-reset-panel"><div className="password-reset-heading"><div className="password-reset-icon"><KeyRound size={23} /></div><div><p className="eyebrow">管理員安全操作</p><h2>重設 {passwordResetStudent.display_name || passwordResetStudent.email} 的密碼</h2><p>設定一次性臨時密碼；原有密碼會立即失效，學生下次登入時必須建立自己的新密碼。</p></div><button type="button" aria-label="關閉重設密碼表格" onClick={() => { setPasswordResetStudent(null); setTemporaryPassword(""); setConfirmTemporaryPassword(""); setPasswordResetMessage(""); }}><X size={19} /></button></div><form onSubmit={resetStudentPassword}><label><span>新臨時密碼</span><input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="最少8個字元" /></label><label><span>確認臨時密碼</span><input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmTemporaryPassword} onChange={(event) => setConfirmTemporaryPassword(event.target.value)} placeholder="再次輸入臨時密碼" /></label><button type="submit" disabled={studentActionId === passwordResetStudent.user_id}><KeyRound size={17} />{studentActionId === passwordResetStudent.user_id ? "重設中…" : "確認重設密碼"}</button></form>{passwordResetMessage && <p className={`create-student-result ${passwordResetSuccess ? "success" : "error"}`}>{passwordResetMessage}</p>}<p className="password-reminder">請以安全方式把臨時密碼交給學生，不要在公開群組傳送。</p></section>}
        {studentsLoading && !managedStudents.length ? <div className="unit-status">正在載入學生帳戶…</div> : <section className="admin-panel student-panel"><div className="admin-table-wrap"><table className="admin-table student-table"><thead><tr><th>學生</th><th>年級</th><th>登入狀態</th><th>裝置</th><th>練習</th><th>平均分</th><th>帳戶操作</th></tr></thead><tbody>{filteredStudents.map((student) => <tr key={student.user_id}><td><button className="student-name-link" onClick={() => openStudentDetail(student.user_id, "students")}><strong>{student.display_name || "未命名學生"}</strong><small>{student.email}</small></button></td><td>{student.grade || "P4"}</td><td><span className={`access-pill ${student.login_allowed ? "allowed" : "blocked"}`}>{student.login_allowed ? "允許登入" : "已停用"}</span></td><td><span className="device-value"><Smartphone size={15} />{student.device_count}／2</span></td><td>{student.completed_count}／{student.attempt_count}</td><td><strong>{student.average_score === null ? "—" : `${Math.round(Number(student.average_score))}分`}</strong></td><td><div className="student-actions"><button className="detail-action" onClick={() => openStudentDetail(student.user_id, "students")}><BarChart3 size={13} />查看成績</button><button className={student.login_allowed ? "disable-action" : "enable-action"} disabled={studentActionId === student.user_id} onClick={() => setStudentAccess(student)}>{student.login_allowed ? "停用登入" : "重新啟用"}</button><button className="reset-action" disabled={studentActionId === student.user_id || Number(student.device_count) === 0} onClick={() => resetStudentDevices(student)}>重設裝置</button><button className="password-action" disabled={studentActionId === student.user_id} onClick={() => { setPasswordResetStudent(student); setTemporaryPassword(""); setConfirmTemporaryPassword(""); setPasswordResetMessage(""); setPasswordResetSuccess(false); window.scrollTo({ top: 260, behavior: "smooth" }); }}><KeyRound size={13} />重設密碼</button></div></td></tr>)}</tbody></table></div>{!filteredStudents.length && <p className="empty-admin">{managedStudents.length ? "找不到符合搜尋條件的學生。" : "目前尚未建立學生帳戶。"}</p>}</section>}
        <aside className="management-note"><UserCog size={21} /><div><strong>安全管理</strong><p>停用登入後，學生即使仍有舊登入狀態也不能讀取課程或開始練習。重設裝置不會刪除學生的成績。</p></div></aside>
      </section>
    </main>;
  }

  if (view === "admin" && profile?.role === "admin") {
    const completed = adminAttempts.filter((attempt) => attempt.status === "completed");
    const averageScore = completed.length ? Math.round(completed.reduce((total, attempt) => total + (attempt.score || 0), 0) / completed.length) : 0;
    const completionRate = adminAttempts.length ? Math.round((completed.length / adminAttempts.length) * 100) : 0;
    const activeLearners = new Set(adminAttempts.map((attempt) => attempt.student_id)).size;
    const userMap = new Map(adminUsers.map((user) => [user.id, user]));
    const nodeMap = new Map(adminNodes.map((node) => [node.id, node]));
    const unitRows = Array.from(adminAttempts.reduce((map, attempt) => {
      const current = map.get(attempt.node_id) || { attempts: 0, completed: 0, scoreTotal: 0 };
      current.attempts += 1;
      if (attempt.status === "completed") { current.completed += 1; current.scoreTotal += attempt.score || 0; }
      map.set(attempt.node_id, current); return map;
    }, new Map<number, { attempts: number; completed: number; scoreTotal: number }>()).entries()).map(([nodeId, stats]) => ({ node: nodeMap.get(nodeId), ...stats, average: stats.completed ? Math.round(stats.scoreTotal / stats.completed) : 0 })).sort((a, b) => b.attempts - a.attempts);
    const learnerRows = Array.from(adminAttempts.reduce((map, attempt) => {
      const current = map.get(attempt.student_id) || { attempts: 0, completed: 0, scoreTotal: 0 };
      current.attempts += 1;
      if (attempt.status === "completed") { current.completed += 1; current.scoreTotal += attempt.score || 0; }
      map.set(attempt.student_id, current); return map;
    }, new Map<string, { attempts: number; completed: number; scoreTotal: number }>()).entries()).map(([userId, stats]) => ({ user: userMap.get(userId), ...stats, average: stats.completed ? Math.round(stats.scoreTotal / stats.completed) : 0 })).sort((a, b) => b.attempts - a.attempts);
    const formatDate = (value: string) => new Intl.DateTimeFormat("zh-HK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    return <main className="dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>管理員學習成績儀表板</span></div></div><div className="account"><span>{profile.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="dashboard-wrap admin-wrap">
        <button className="back-button" onClick={() => setView("subjects")}><ArrowLeft size={18} />返回學習平台</button>
        <div className="admin-heading"><div><p className="eyebrow">學習分析</p><h1>成績總覽</h1><p>查看學生完成情況、平均成績及各數學單位表現。</p></div><div className="admin-heading-actions"><button className="student-management-button" onClick={openStudentManagement}><UserCog size={17} />學生帳戶</button><button className="student-management-button" onClick={openQuestionQualityAudit}><ShieldCheck size={17} />題庫檢查</button><button className="student-management-button" onClick={openAdminFeedback}><MessageSquareText size={17} />問題回報</button><button onClick={openAdminDashboard} disabled={adminLoading}>{adminLoading ? "更新中…" : "更新資料"}</button></div></div>
        {adminMessage && <div className="unit-status error-message">{adminMessage}</div>}
        {adminLoading && !adminAttempts.length ? <div className="unit-status">正在整理學習紀錄…</div> : <>
          <div className="metric-grid">
            <article><div className="metric-icon teal"><BarChart3 size={22} /></div><span>練習總次數</span><strong>{adminAttempts.length}</strong><small>所有已開始練習</small></article>
            <article><div className="metric-icon purple"><Target size={22} /></div><span>平均分</span><strong>{averageScore}<b>分</b></strong><small>已完成練習平均</small></article>
            <article><div className="metric-icon green"><CheckCircle2 size={22} /></div><span>完成率</span><strong>{completionRate}<b>%</b></strong><small>{completed.length} 次已完成</small></article>
            <article><div className="metric-icon amber"><Users size={22} /></div><span>活躍學習者</span><strong>{activeLearners}</strong><small>曾建立練習紀錄</small></article>
          </div>
          <div className="admin-panels">
            <section className="admin-panel"><div className="panel-title"><div><p className="eyebrow">學生表現</p><h2>學習者總覽</h2></div><span>{learnerRows.length}人</span></div>{learnerRows.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>學習者</th><th>練習</th><th>完成</th><th>平均分</th><th></th></tr></thead><tbody>{learnerRows.map((row, index) => <tr key={row.user?.id || index}><td><button className="student-name-link" disabled={!row.user?.id} onClick={() => row.user?.id && openStudentDetail(row.user.id, "admin")}><strong>{row.user?.display_name || "未命名帳戶"}</strong><small>{row.user?.grade || row.user?.role || "P4"}</small></button></td><td>{row.attempts}</td><td>{row.completed}</td><td><span className={`score-pill ${row.average >= 60 ? "good" : "needs-work"}`}>{row.average}分</span></td><td>{row.user?.id && <button className="table-detail-link" onClick={() => openStudentDetail(row.user!.id, "admin")}>查看詳情</button>}</td></tr>)}</tbody></table></div> : <p className="empty-admin">尚未有學習者練習紀錄。</p>}</section>
            <section className="admin-panel"><div className="panel-title"><div><p className="eyebrow">單位分析</p><h2>數學單位表現</h2></div><span>{unitRows.length}個單位</span></div>{unitRows.length ? <div className="unit-performance">{unitRows.slice(0, 12).map((row) => <div key={row.node?.id || row.node?.code}><div><strong>{row.node?.code || "—"} {row.node?.title_zh || "未知單位"}</strong><span>{row.attempts}次練習 · 平均{row.average}分</span></div><div className="performance-track"><span style={{ width: `${row.average}%` }} /></div></div>)}</div> : <p className="empty-admin">尚未有單位成績可供分析。</p>}</section>
          </div>
          <section className="admin-panel recent-panel"><div className="panel-title"><div><p className="eyebrow">最新動態</p><h2>最近練習紀錄</h2></div><span>最近10項</span></div>{adminAttempts.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>學習者</th><th>單位</th><th>狀態</th><th>答對</th><th>分數</th><th>時間</th></tr></thead><tbody>{adminAttempts.slice(0, 10).map((attempt) => <tr key={attempt.id}><td><strong>{userMap.get(attempt.student_id)?.display_name || "未命名帳戶"}</strong></td><td>{nodeMap.get(attempt.node_id)?.code || "—"} {nodeMap.get(attempt.node_id)?.title_zh || ""}</td><td><span className={`status-pill ${attempt.status}`}>{attempt.status === "completed" ? "已完成" : attempt.status === "in_progress" ? "進行中" : "已放棄"}</span></td><td>{attempt.correct_count}／{attempt.total_questions}</td><td><strong>{attempt.score ?? "—"}{attempt.score !== null ? "分" : ""}</strong></td><td>{formatDate(attempt.started_at)}</td></tr>)}</tbody></table></div> : <p className="empty-admin">尚未有練習紀錄。</p>}</section>
        </>}
      </section>
    </main>;
  }

  if (view === "complete" && completedResult && activeUnit) {
    const score = completedResult.score ?? 0;
    const resultMessage = score >= 80 ? "表現出色，繼續保持！" : score >= 60 ? "做得不錯，再練習一次會更熟練。" : "每次練習都是進步，看看解題提示再試一次吧。";
    return <main className="dashboard-page">
      <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
      <section className="completion-wrap">
        <div className="completion-card">
          <div className="completion-icon"><Trophy size={42} aria-hidden="true" /></div>
          <p className="eyebrow">練習完成</p>
          <h1>{activeUnit.code} {activeUnit.title_zh}</h1>
          <p className="completion-message">{resultMessage}</p>
          <div className="score-ring" style={{ background: `radial-gradient(circle at center, #fff 61%, transparent 62%), conic-gradient(var(--teal) 0 ${score}%, #e8efec ${score}% 100%)` }} aria-label={`本次得分 ${score} 分`}><strong>{score}</strong><span>分</span></div>
          <div className="result-summary">
            <div><CheckCircle2 size={21} /><span>答對題數</span><strong>{completedResult.correct_count}／{completedResult.total_questions}</strong></div>
            <div><Brain size={21} /><span>完成題數</span><strong>{completedResult.answered_count}／{completedResult.total_questions}</strong></div>
          </div>
          <div className="completion-actions">
            <button className="retry-button" onClick={() => startUnit(activeUnit, activeSubject)}><RotateCcw size={18} />重新練習</button>
            <button className="units-button" onClick={() => setView(activeSubject)}><ArrowLeft size={18} />返回學習單位</button>
          </div>
          <p className="saved-note">本次成績及錯題已儲存到學習紀錄。</p>
        </div>
      </section>
    </main>;
  }

  if (view === "practice") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap practice-wrap">
      <button className="back-button" onClick={() => setView(activeSubject)}><ArrowLeft size={18} />返回{activeSubject === "chinese" ? "中文" : activeSubject === "english" ? "英文" : activeSubject === "humanities" ? "人文科" : activeSubject === "science" ? "科學科" : "數學"}單位</button>
      <div className="practice-heading"><span className="unit-code">{activeUnit?.code}</span><p>P4 {activeSubject === "chinese" ? "中文" : activeSubject === "english" ? "英文" : activeSubject === "humanities" ? "人文科" : activeSubject === "science" ? "科學科" : "數學"} · {activeUnit?.curriculum_domains?.title_zh}</p><h1>{activeUnit?.title_zh}</h1></div>
      {practiceLoading && !currentQuestion && <div className="unit-status">正在建立10題練習…</div>}
      {practiceMessage && <div className="unit-status error-message">{practiceMessage}</div>}
      {isReadingUnit && questions.length > 0 && <section className="reading-paper">
        <div className="reading-paper-intro"><div><span className="unit-code">閱讀練習</span><h2>閱讀文章，回答同編號的題目</h2></div><strong>{Object.keys(readingAnswers).length}／{questions.length} 已作答</strong></div>
        <div className="reading-instructions">
          <strong>{activeSubject === "english" ? "Instructions 作答指示" : "作答指示"}</strong>
          <p>{activeSubject === "english" ? "Read the complete passage on the left, then answer all 10 questions on the right." : "細閱左方的完整文章，然後回答右方全部10題。"}</p>
          <span>{activeSubject === "english" ? "Choose one answer (A–D) for each question. Answer all questions before you submit." : "每題選出一個答案（A–D）；完成全部題目後才提交。"}</span>
        </div>
        <div className="reading-pairs">{readingGroups.map((group) => <section className="reading-pair" key={group.passage}>
          <article className="reading-passage"><span>{activeSubject === "english" ? "Complete Passage" : "完整文章"}</span><div>{renderMarkedText(group.passage)}</div></article>
          <section className="reading-question-group"><div className="reading-question-group-title"><span>{activeSubject === "english" ? "Questions 1–10" : "第1至10題"}</span><strong>{group.questions.length} 題</strong></div><div className="reading-question-list">{group.questions.map(({ question, prompt }, questionIndex) => { const options = optionsForQuestion(question); const questionNumber = questions.findIndex((item) => item.id === question.id) + 1; return <section className="reading-question" key={question.id}><div className="question-meta"><span>第 {questionNumber || questionIndex + 1} 題</span><span>四選一</span></div><h3>{renderMarkedText(prompt)}</h3><div className="option-list">{options.map((option) => <label className={`option ${readingAnswers[question.id] === option.id ? "selected" : ""}`} key={option.id}><input type="radio" name={`answer-${question.id}`} value={option.id} checked={readingAnswers[question.id] === option.id} disabled={readingSubmitted.includes(question.id) || practiceLoading} onChange={() => setReadingAnswers((answers) => ({ ...answers, [question.id]: option.id }))} /><strong>{option.label}</strong><span>{renderMarkedText(option.text)}</span></label>)}</div></section>; })}</div></section>
        </section>)}</div>
        <div className="reading-submit-bar"><span>{questions.every((question) => readingAnswers[question.id]) ? "已完成所有題目，可以提交。" : `尚有 ${questions.filter((question) => !readingAnswers[question.id]).length} 題未作答`}</span><button className="submit-answer" disabled={questions.some((question) => !readingAnswers[question.id]) || practiceLoading} onClick={submitReadingAnswers}>{practiceLoading ? "正在批改…" : "提交全部答案"}</button></div>
      </section>}
      {isWritingUnit && writingPrompt && <section className="writing-workshop">
        <div className="writing-workshop-head"><div><span className="unit-code">作文工作室 · {writingPrompt.genre}</span><h2>{writingPrompt.title}</h2><p>{writingPrompt.instruction}</p></div><div className={`writing-count ${writingCharCount >= writingPrompt.min_chars && writingCharCount <= writingPrompt.max_chars ? "in-range" : ""}`}><strong>{writingCharCount}</strong><span>建議 {writingPrompt.min_chars}–{writingPrompt.max_chars} 字</span></div></div>
        <div className="writing-guidance"><strong>寫作提示</strong><div>{writingPrompt.guidance.map((item) => <span key={item}>{item}</span>)}</div></div>
        {!writingResult ? <><textarea className="writing-editor" value={writingContent} onChange={(event) => setWritingContent(event.target.value)} placeholder="在這裏輸入作文……&#10;&#10;建議按內容分段，完成後再檢查錯別字和標點。" rows={18} disabled={practiceLoading} /><div className="writing-actions"><span>{writingCharCount < 50 ? `最少還需 ${50 - writingCharCount} 字才可提交` : "可以提交；系統會儲存全文並按四項準則評改。"}</span><button className="submit-answer" disabled={writingCharCount < 50 || practiceLoading} onClick={submitWritingTask}>{practiceLoading ? "正在儲存及評改…" : "提交作文"}</button></div></> : <div className="writing-result"><div className="writing-score"><span>自動評改</span><strong>{writingResult.score}<small>／100</small></strong><p>{writingResult.char_count} 字 · 作文已儲存</p></div><div className="writing-rubric">{Object.entries(writingResult.rubric).map(([name, score]) => <div key={name}><span>{name}</span><strong>{score}</strong></div>)}</div><div className="writing-feedback"><Lightbulb size={20} /><div><strong>改善建議</strong><p>{writingResult.feedback}</p><small>這是按篇幅、段落、標點和題目重點作出的初步評估；老師評語及分數會以人工評閱為準。</small></div></div><button className="retry-button" onClick={() => startWritingTask(activeUnit!)}><RotateCcw size={18} />抽選另一題</button></div>}
      </section>}
      {!isReadingUnit && !isWritingUnit && currentQuestion && <section className="question-card"><div className="practice-progress"><span style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div><div className="question-meta"><span>第 {currentIndex + 1} 題／共 {questions.length} 題</span><span>四選一</span></div><h2>{currentQuestion.question_text}</h2><div className="option-list">{displayedOptions.map((option) => <label className={`option ${selectedAnswer === option.id ? "selected" : ""} ${feedback ? "locked" : ""}`} key={option.id}><input type="radio" name="answer" value={option.id} checked={selectedAnswer === option.id} disabled={!!feedback} onChange={() => setSelectedAnswer(option.id)} /><strong>{option.label}</strong><span>{option.text}</span></label>)}</div>
        {!feedback && <button className="submit-answer" disabled={!selectedAnswer || practiceLoading} onClick={submitAnswer}>{practiceLoading ? "批改中…" : "提交答案"}</button>}
        {feedback && <div className={`feedback ${feedback.is_correct ? "correct" : "incorrect"}`}><h3>{feedback.is_correct ? "答對了！" : "答案不正確"}</h3><p>正確答案：{displayedOptions.find((option) => option.id === feedback.correct_answer)?.label} · {displayedOptions.find((option) => option.id === feedback.correct_answer)?.text}</p>{feedback.explanation && <p>{feedback.explanation}</p>}{feedback.completed ? <div className="final-score"><span>完成10題</span><strong>{feedback.correct_count}／{feedback.total_questions} 題答對</strong><b>{feedback.score ?? 0} 分</b></div> : <button className="next-question" onClick={nextQuestion}>下一題</button>}</div>}
      </section>}
    </section>
  </main>;

  if (view === "maths") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap units-wrap">
      <button className="back-button" onClick={() => setView("subjects")}><ArrowLeft size={18} />返回科目</button>
      <div className="units-heading"><div className="subject-icon purple"><Brain size={25} /></div><div><p className="eyebrow">P4 數學</p><h1>選擇學習單位</h1><p>按自己的步伐逐步練習，完成後會即時批改。</p></div></div>
      {unitsLoading && <div className="unit-status">正在載入12個數學單位…</div>}
      {unitsMessage && <div className="unit-status error-message">{unitsMessage}</div>}
      {!unitsLoading && !unitsMessage && <div className="unit-grid">{mathsUnits.map((unit) => <button className={`unit-card ${enabledMathsUnits.has(unit.code) ? "enabled" : "disabled"}`} key={unit.id} type="button" disabled={!enabledMathsUnits.has(unit.code)} onClick={() => startUnit(unit, "maths")}><span className="unit-code">{unit.code}</span><h2>{unit.title_zh}</h2><p>{unit.title_en}</p><div><span>{unit.curriculum_domains?.title_zh || "數學"}</span><span>{enabledMathsUnits.has(unit.code) ? "開始練習" : `難度 ${unit.difficulty}/5`}</span></div></button>)}</div>}
      {!unitsLoading && !unitsMessage && mathsUnits.length === 0 && <div className="unit-status">目前尚未建立數學單位。</div>}
    </section>
    <button className="feedback-fab" onClick={openFeedback}><MessageSquareText size={19} />回報問題</button>
  </main>;

  if (view === "english") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap units-wrap english-units">
      <button className="back-button" onClick={() => setView("subjects")}><ArrowLeft size={18} />返回科目</button>
      <div className="units-heading"><div className="subject-icon blue"><Languages size={25} /></div><div><p className="eyebrow">P4 English</p><h1>Choose a learning unit</h1><p>Complete a 10-question practice. Answers, explanations and mistakes will be recorded automatically.</p></div></div>
      {englishUnitsLoading && <div className="unit-status">Loading English units…</div>}
      {englishUnitsMessage && <div className="unit-status error-message">{englishUnitsMessage}</div>}
      {!englishUnitsLoading && !englishUnitsMessage && <div className="unit-grid">{englishUnits.map((unit) => <button className="unit-card english-unit-card enabled" key={unit.id} type="button" onClick={() => startUnit(unit, "english")}><span className="unit-code">{unit.code}</span><h2>{unit.title_en || unit.title_zh}</h2><p>{unit.title_zh}</p><div><span>{unit.curriculum_domains?.title_zh || "Grammar"}</span><span>Start practice</span></div></button>)}</div>}
      {!englishUnitsLoading && !englishUnitsMessage && englishUnits.length === 0 && <div className="unit-status">No English units are available yet.</div>}
    </section>
    <button className="feedback-fab" onClick={openFeedback}><MessageSquareText size={19} />回報問題</button>
  </main>;

  if (view === "chinese") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap units-wrap chinese-units">
      <button className="back-button" onClick={() => setView("subjects")}><ArrowLeft size={18} />返回科目</button>
      <div className="units-heading"><div className="subject-icon coral"><BookOpen size={25} /></div><div><p className="eyebrow">P4 中文</p><h1>選擇學習單位</h1><p>選擇單位完成10題練習，系統會即時批改並記錄錯題。</p></div></div>
      {chineseUnitsLoading && <div className="unit-status">正在載入20個中文單位…</div>}
      {chineseUnitsMessage && <div className="unit-status error-message">{chineseUnitsMessage}</div>}
      {!chineseUnitsLoading && !chineseUnitsMessage && <div className="unit-grid">{chineseUnits.map((unit) => <button className="unit-card chinese-unit-card enabled" key={unit.id} type="button" onClick={() => startUnit(unit, "chinese")}><span className="unit-code">{unit.code}</span><h2>{unit.title_zh}</h2><p>{unit.title_en}</p><div><span>{unit.curriculum_domains?.title_zh || "中文"}</span><span>開始練習</span></div></button>)}</div>}
      {!chineseUnitsLoading && !chineseUnitsMessage && chineseUnits.length === 0 && <div className="unit-status">目前尚未建立中文單位。</div>}
    </section>
    <button className="feedback-fab" onClick={openFeedback}><MessageSquareText size={19} />回報問題</button>
  </main>;

  if (view === "humanities") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap units-wrap humanities-units">
      <button className="back-button" onClick={() => setView("subjects")}><ArrowLeft size={18} />返回科目</button>
      <div className="units-heading"><div className="subject-icon amber"><Sparkles size={25} /></div><div><p className="eyebrow">P4 人文科</p><h1>選擇學習單元</h1><p>每次隨機完成10題，系統會即時批改、提供解析並記錄錯題。</p></div></div>
      {humanitiesUnitsLoading && <div className="unit-status">正在載入6個人文科單元…</div>}
      {humanitiesUnitsMessage && <div className="unit-status error-message">{humanitiesUnitsMessage}</div>}
      {!humanitiesUnitsLoading && !humanitiesUnitsMessage && <div className="unit-grid">{humanitiesUnits.map((unit) => <button className="unit-card humanities-unit-card enabled" key={unit.id} type="button" onClick={() => startUnit(unit, "humanities")}><span className="unit-code">{unit.code}</span><h2>{unit.title_zh}</h2><p>{unit.title_en}</p><div><span>{unit.curriculum_domains?.title_zh || "人文科"}</span><span>開始練習</span></div></button>)}</div>}
      {!humanitiesUnitsLoading && !humanitiesUnitsMessage && humanitiesUnits.length === 0 && <div className="unit-status">目前尚未建立人文科單元。</div>}
    </section>
    <button className="feedback-fab" onClick={openFeedback}><MessageSquareText size={19} />回報問題</button>
  </main>;

  if (view === "science") return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap units-wrap science-units">
      <button className="back-button" onClick={() => setView("subjects")}><ArrowLeft size={18} />返回科目</button>
      <div className="units-heading"><div className="subject-icon green"><Microscope size={25} /></div><div><p className="eyebrow">P4 科學科</p><h1>選擇學習單元</h1><p>每次隨機完成10題，系統會即時批改、提供科學解析並記錄錯題。</p></div></div>
      {scienceUnitsLoading && <div className="unit-status">正在載入7個科學科單元…</div>}
      {scienceUnitsMessage && <div className="unit-status error-message">{scienceUnitsMessage}</div>}
      {!scienceUnitsLoading && !scienceUnitsMessage && <div className="unit-grid">{scienceUnits.map((unit) => <button className="unit-card science-unit-card enabled" key={unit.id} type="button" onClick={() => startUnit(unit, "science")}><span className="unit-code">{unit.code}</span><h2>{unit.title_zh}</h2><p>{unit.title_en}</p><div><span>{unit.curriculum_domains?.title_zh || "科學科"}</span><span>開始練習</span></div></button>)}</div>}
      {!scienceUnitsLoading && !scienceUnitsMessage && scienceUnits.length === 0 && <div className="unit-status">目前尚未建立科學科單元。</div>}
    </section>
    <button className="feedback-fab" onClick={openFeedback}><MessageSquareText size={19} />回報問題</button>
  </main>;

  return <main className="dashboard-page">
    <header className="topbar"><div className="brand"><div className="brand-mark small">S+</div><div><strong>SENPlus+</strong><span>Academy Ultra · P4</span></div></div><div className="account"><span>{profile?.display_name || session.user.email}</span><button onClick={signOut}><LogOut size={17} />登出</button></div></header>
    <section className="dashboard-wrap"><div className="welcome-row"><div className="welcome"><p className="eyebrow">今日學習</p><h1>你好，{profile?.display_name || "同學"}</h1><p>選擇一個科目，開始今天的小五練習。</p></div>{profile?.role === "admin" && <button className="admin-entry" onClick={openAdminDashboard}><LayoutDashboard size={20} /><span><strong>管理員儀表板</strong><small>查看學習成績與進度</small></span></button>}</div>
      {profile?.role === "student" && <section className="student-family-panel"><div className="student-family-heading"><div className="parent-link-icon"><Link2 size={23} /></div><div><strong>家長連結</strong><p>產生一次性邀請碼，或處理家長的連結申請。</p></div><button onClick={createStudentParentCode}>{studentLinkCode ? "重新產生" : "產生邀請碼"}</button></div>{studentLinkCode && <div className="student-code-row"><div><span>一次性邀請碼</span><strong>{studentLinkCode}</strong><small>{studentLinkExpiry ? `${new Intl.DateTimeFormat("zh-HK", { hour: "2-digit", minute: "2-digit" }).format(new Date(studentLinkExpiry))} 前有效` : "30分鐘內有效"}</small></div><p>請只把邀請碼交給你的家長或監護人。家長提交後，仍須由你確認。</p></div>}{studentParentRequests.length > 0 && <div className="student-parent-requests">{studentParentRequests.map((request) => <article key={request.parent_id}><div><span className={`request-state ${request.status}`}>{request.status === "pending" ? "等待確認" : "已連結"}</span><strong>{request.display_name}</strong><small>{request.status === "pending" ? "希望查看你的學習成績及錯題" : "可以查看你的學習紀錄"}</small></div><div>{request.status === "pending" && <button className="approve-request" onClick={() => respondToParentRequest(request.parent_id, true)}>批准</button>}<button className="reject-request" onClick={() => respondToParentRequest(request.parent_id, false)}>{request.status === "pending" ? "拒絕" : "解除"}</button></div></article>)}</div>}{familyLinkMessage && <p className="family-link-message">{familyLinkMessage}</p>}</section>}
      <div className="subject-grid">{subjects.map(({ name, note, icon: Icon, colour }) => name === "數學" ? <button className={`subject-card subject-button ${colour}`} key={name} onClick={openMaths}><div className="subject-icon"><Icon size={25} /></div><div><h2>{name}</h2><p>{note}</p></div><span className="coming available">開始學習</span></button> : name === "中文" ? <button className={`subject-card subject-button ${colour}`} key={name} onClick={openChinese}><div className="subject-icon"><Icon size={25} /></div><div><h2>{name}</h2><p>{note}</p></div><span className="coming available">查看課程</span></button> : name === "英文" ? <button className={`subject-card subject-button ${colour}`} key={name} onClick={openEnglish}><div className="subject-icon"><Icon size={25} /></div><div><h2>{name}</h2><p>{note}</p></div><span className="coming available">Start learning</span></button> : name === "人文科" ? <button className={`subject-card subject-button ${colour}`} key={name} onClick={openHumanities}><div className="subject-icon"><Icon size={25} /></div><div><h2>{name}</h2><p>{note}</p></div><span className="coming available">開始學習</span></button> : <button className={`subject-card subject-button ${colour}`} key={name} onClick={openScience}><div className="subject-icon"><Icon size={25} /></div><div><h2>{name}</h2><p>{note}</p></div><span className="coming available">開始學習</span></button>)}</div>
      <aside className="progress-card"><div><span>你的年級</span><strong>{profile?.grade || "P4"}</strong></div><div><span>學習狀態</span><strong>準備開始</strong></div><div><span>今日目標</span><strong>完成 1 個練習</strong></div></aside>
      <footer className="site-footer"><button onClick={openFeedback}>問題回報／意見</button><button onClick={() => setView("privacy")}>私隱聲明</button></footer>
    </section>
    <button className="feedback-fab" onClick={openFeedback}><MessageSquareText size={19} />回報問題</button>
  </main>;
}
