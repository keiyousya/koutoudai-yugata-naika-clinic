const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8789";

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new Error("認証に失敗しました。APIキーを確認してください。");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `エラーが発生しました (${res.status})`);
  }
  return res.json();
}

// ========================================
// 打刻
// ========================================

export interface PunchResult {
  staff_name: string;
  type: "in" | "out";
  timestamp: string;
  message: string;
}

export interface PunchError {
  error: string;
  message: string;
}

export async function punch(cardUid: string, method: "nfc" | "manual" = "nfc"): Promise<PunchResult> {
  const res = await fetch(`${API_BASE}/api/timecard/punch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card_uid: cardUid, method }),
  });

  if (res.status === 429) {
    const data = await res.json();
    throw new Error(data.message || "連続打刻です");
  }
  if (res.status === 404) {
    const data = await res.json();
    throw new Error(data.message || "未登録のカードです");
  }

  return handleResponse<PunchResult>(res);
}

// ========================================
// 記録取得
// ========================================

export interface TimecardRecord {
  id: number;
  staff_id: number;
  staff_name: string;
  type: "in" | "out";
  method: "nfc" | "manual" | "admin";
  timestamp: string;
  is_modified: number;
}

export interface EditLogEntry {
  id: number;
  record_id: number;
  action: "create" | "update" | "delete";
  changes: string;
  edited_at: string;
}

export async function fetchTodayRecords(): Promise<TimecardRecord[]> {
  const res = await fetch(`${API_BASE}/api/timecard/today`);
  return handleResponse<TimecardRecord[]>(res);
}

export type AuthKey = { type: "admin"; key: string } | { type: "viewer"; key: string };

function authKeyToHeaders(authKey: AuthKey): HeadersInit {
  if (authKey.type === "admin") return { "X-Admin-API-Key": authKey.key };
  return { "X-Viewer-API-Key": authKey.key };
}

export async function fetchMonthlyRecords(month: string, authKey: AuthKey): Promise<TimecardRecord[]> {
  const res = await fetch(`${API_BASE}/api/timecard/history?month=${month}`, {
    headers: authKeyToHeaders(authKey),
  });
  return handleResponse<TimecardRecord[]>(res);
}

export interface MyHistoryResult {
  staff_name: string;
  records: TimecardRecord[];
}

export async function fetchMyHistory(cardUid: string, month: string): Promise<MyHistoryResult> {
  const res = await fetch(`${API_BASE}/api/timecard/my-history?month=${month}`, {
    headers: { "X-Card-UID": cardUid },
  });
  return handleResponse<MyHistoryResult>(res);
}

export async function downloadExport(month: string, authKey: AuthKey): Promise<void> {
  const res = await fetch(`${API_BASE}/api/timecard/export?month=${month}`, {
    headers: authKeyToHeaders(authKey),
  });
  if (!res.ok) {
    throw new Error("CSVエクスポートに失敗しました");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timecard_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function validateHistoryKey(key: string): Promise<"admin" | "viewer" | null> {
  // Admin キーで試す
  const adminRes = await fetch(`${API_BASE}/api/timecard/history?month=2000-01`, {
    headers: { "X-Admin-API-Key": key },
  });
  if (adminRes.ok) return "admin";

  // Viewer キーで試す
  const viewerRes = await fetch(`${API_BASE}/api/timecard/history?month=2000-01`, {
    headers: { "X-Viewer-API-Key": key },
  });
  if (viewerRes.ok) return "viewer";

  return null;
}

// ========================================
// スタッフ管理（Admin 認証）
// ========================================

export interface Staff {
  id: number;
  name: string;
  card_uid: string;
  is_active: number;
  created_at: string;
}

function adminHeaders(adminKey: string): HeadersInit {
  return { "Content-Type": "application/json", "X-Admin-API-Key": adminKey };
}

export async function fetchStaff(adminKey: string): Promise<Staff[]> {
  const res = await fetch(`${API_BASE}/api/timecard/staff`, {
    headers: adminHeaders(adminKey),
  });
  return handleResponse<Staff[]>(res);
}

export async function createStaff(adminKey: string, name: string, cardUid: string): Promise<{ success: boolean; id: number; message: string }> {
  const res = await fetch(`${API_BASE}/api/timecard/staff`, {
    method: "POST",
    headers: adminHeaders(adminKey),
    body: JSON.stringify({ name, card_uid: cardUid }),
  });
  return handleResponse(res);
}

export async function updateStaff(adminKey: string, id: number, data: { name?: string; card_uid?: string; is_active?: boolean }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/timecard/staff/${id}`, {
    method: "PUT",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(data),
  });
  await handleResponse(res);
}

export async function deleteStaff(adminKey: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/timecard/staff/${id}`, {
    method: "DELETE",
    headers: adminHeaders(adminKey),
  });
  await handleResponse(res);
}

// ========================================
// 打刻記録管理（Admin 認証）
// ========================================

export async function updateRecord(
  adminKey: string,
  id: number,
  data: { timestamp?: string; type?: "in" | "out" }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/timecard/records/${id}`, {
    method: "PUT",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(data),
  });
  await handleResponse(res);
}

export async function deleteRecord(adminKey: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/timecard/records/${id}`, {
    method: "DELETE",
    headers: adminHeaders(adminKey),
  });
  await handleResponse(res);
}

export async function createRecord(
  adminKey: string,
  data: { staff_id: number; type: "in" | "out"; timestamp: string }
): Promise<{ success: boolean; id: number; message: string }> {
  const res = await fetch(`${API_BASE}/api/timecard/records`, {
    method: "POST",
    headers: adminHeaders(adminKey),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchEditLog(authKey: AuthKey, recordId: number): Promise<EditLogEntry[]> {
  const res = await fetch(`${API_BASE}/api/timecard/records/${recordId}/edits`, {
    headers: authKeyToHeaders(authKey),
  });
  return handleResponse<EditLogEntry[]>(res);
}
