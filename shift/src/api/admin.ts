const API_BASE = import.meta.env.PROD
  ? "https://koutoudai-shift-api.kit-tamtam.workers.dev"
  : "http://localhost:8790";

function getAdminKey(): string {
  const key = localStorage.getItem("shift_admin_key");
  if (!key) throw new Error("管理者キーが設定されていません");
  return key;
}

async function adminRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-API-Key": getAdminKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// スタッフ管理
export interface AdminStaff {
  id: number;
  name: string;
  role: "nurse" | "clerk";
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function fetchAdminStaff(): Promise<AdminStaff[]> {
  return adminRequest("GET", "/api/shift/admin/staff");
}

export async function createStaff(data: {
  name: string;
  role: "nurse" | "clerk";
  passcode: string;
  sort_order?: number;
}): Promise<{ success: boolean; id: number; message: string }> {
  return adminRequest("POST", "/api/shift/admin/staff", data);
}

export async function updateStaff(
  id: number,
  data: {
    name?: string;
    role?: "nurse" | "clerk";
    passcode?: string;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<{ success: boolean; message: string }> {
  return adminRequest("PUT", `/api/shift/admin/staff/${id}`, data);
}

export async function deleteStaff(id: number): Promise<{ success: boolean; message: string }> {
  return adminRequest("DELETE", `/api/shift/admin/staff/${id}`);
}

// カレンダー例外日
export interface CalendarOverride {
  date: string;
  is_open: number;
  note?: string;
  created_at: string;
}

export async function fetchCalendarOverrides(): Promise<CalendarOverride[]> {
  return adminRequest("GET", "/api/shift/admin/calendar/overrides");
}

export async function addCalendarOverride(data: {
  date: string;
  is_open: boolean;
  note?: string;
}): Promise<{ success: boolean; message: string }> {
  return adminRequest("POST", "/api/shift/admin/calendar/overrides", data);
}

export async function deleteCalendarOverride(date: string): Promise<{ success: boolean; message: string }> {
  return adminRequest("DELETE", `/api/shift/admin/calendar/overrides/${date}`);
}

// 希望管理
export interface RequestsMatrix {
  month: string;
  staff: Array<{ id: number; name: string; role: string }>;
  days: string[];
  matrix: Record<string, Record<number, { availability: string; note?: string }>>;
}

export async function fetchAdminRequests(month: string): Promise<RequestsMatrix> {
  return adminRequest("GET", `/api/shift/admin/requests?month=${month}`);
}

export async function lockPeriod(month: string): Promise<{ success: boolean; message: string }> {
  return adminRequest("POST", `/api/shift/admin/periods/${month}/lock`);
}

export async function unlockPeriod(month: string): Promise<{ success: boolean; message: string }> {
  return adminRequest("DELETE", `/api/shift/admin/periods/${month}/lock`);
}

// 確定シフト管理
export interface AdminAssignment {
  id: number;
  date: string;
  role: "nurse" | "clerk";
  staff: {
    id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export interface AdminAssignmentsResponse {
  month: string;
  published: boolean;
  published_at: string | null;
  assignments: AdminAssignment[];
}

export async function fetchAdminAssignments(month: string): Promise<AdminAssignmentsResponse> {
  return adminRequest("GET", `/api/shift/admin/assignments?month=${month}`);
}

export async function saveAssignments(
  month: string,
  assignments: Array<{ date: string; role: "nurse" | "clerk"; staff_id: number }>,
  force?: boolean
): Promise<{ success: boolean; message: string; count: number; warnings?: string[] }> {
  const query = force ? `?month=${month}&force=1` : `?month=${month}`;
  return adminRequest("PUT", `/api/shift/admin/assignments${query}`, {
    month,
    assignments,
  });
}

export async function publishPeriod(month: string): Promise<{ success: boolean; message: string }> {
  return adminRequest("POST", `/api/shift/admin/periods/${month}/publish`);
}

export async function unpublishPeriod(month: string): Promise<{ success: boolean; message: string }> {
  return adminRequest("DELETE", `/api/shift/admin/periods/${month}/publish`);
}

// 認証チェック
export async function checkAdminAuth(): Promise<boolean> {
  try {
    await adminRequest("GET", "/api/shift/_ping/admin");
    return true;
  } catch {
    return false;
  }
}
