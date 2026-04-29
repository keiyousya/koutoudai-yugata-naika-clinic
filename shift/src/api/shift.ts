const API_BASE = import.meta.env.PROD
  ? "https://koutoudai-shift-api.tamurakeito.workers.dev"
  : "http://localhost:8790";

interface Staff {
  id: number;
  name: string;
  role: "nurse" | "clerk";
}

interface LoginResponse {
  success: boolean;
  staff: Staff;
}

interface CalendarDay {
  date: string;
  is_open: boolean;
  reason: "weekly" | "override";
  note?: string;
}

interface CalendarResponse {
  month: string;
  days: CalendarDay[];
}

interface PeriodResponse {
  month: string;
  submission_locked: boolean;
  submission_locked_at: string | null;
  published: boolean;
  published_at: string | null;
}

interface RequestItem {
  id: number;
  date: string;
  availability: "available" | "unavailable";
  note?: string;
  created_at: string;
  updated_at: string;
}

interface MyRequestsResponse {
  month: string;
  staff_id: number;
  requests: RequestItem[];
}

interface AssignmentItem {
  date: string;
  role: "nurse" | "clerk";
  staff: {
    id: number;
    name: string;
  };
}

interface AssignmentsResponse {
  month: string;
  published_at: string;
  assignments: AssignmentItem[];
}

// 公開API（認証不要）
export async function fetchStaffList(): Promise<Staff[]> {
  const res = await fetch(`${API_BASE}/api/shift/staff`);
  if (!res.ok) throw new Error("スタッフ一覧の取得に失敗しました");
  return res.json();
}

export async function login(staffId: number, passcode: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/shift/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff_id: staffId, passcode }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "ログインに失敗しました");
  }
  return res.json();
}

export async function fetchCalendar(month: string): Promise<CalendarResponse> {
  const res = await fetch(`${API_BASE}/api/shift/calendar?month=${month}`);
  if (!res.ok) throw new Error("カレンダーの取得に失敗しました");
  return res.json();
}

export async function fetchPeriod(month: string): Promise<PeriodResponse> {
  const res = await fetch(`${API_BASE}/api/shift/periods/${month}`);
  if (!res.ok) throw new Error("期間情報の取得に失敗しました");
  return res.json();
}

// スタッフ認証が必要なAPI
function getAuthHeaders(): Record<string, string> {
  const auth = sessionStorage.getItem("shift_auth");
  if (!auth) throw new Error("認証情報がありません");
  const { staffId, passcode } = JSON.parse(auth);
  return {
    "Content-Type": "application/json",
    "X-Staff-Id": String(staffId),
    "X-Staff-Passcode": passcode,
  };
}

export async function fetchMyRequests(month: string): Promise<MyRequestsResponse> {
  const res = await fetch(`${API_BASE}/api/shift/requests/me?month=${month}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("希望の取得に失敗しました");
  return res.json();
}

export async function updateMyRequests(
  month: string,
  items: Array<{ date: string; availability: "available" | "unavailable"; note?: string }>
): Promise<{ success: boolean; message: string; count: number }> {
  const res = await fetch(`${API_BASE}/api/shift/requests/me`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ month, items }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "希望の保存に失敗しました");
  }
  return res.json();
}

export async function fetchAssignments(month: string): Promise<AssignmentsResponse> {
  const res = await fetch(`${API_BASE}/api/shift/assignments?month=${month}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 404) {
    throw new Error("シフトはまだ公開されていません");
  }
  if (!res.ok) throw new Error("シフトの取得に失敗しました");
  return res.json();
}

export type {
  Staff,
  LoginResponse,
  CalendarDay,
  CalendarResponse,
  PeriodResponse,
  RequestItem,
  MyRequestsResponse,
  AssignmentItem,
  AssignmentsResponse,
};
