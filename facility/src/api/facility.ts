const API_BASE = import.meta.env.PROD
  ? "https://koutoudai-facility-api.kit-tamtam.workers.dev"
  : "http://localhost:8792";

interface Staff {
  id: number;
  name: string;
}

interface LoginResponse {
  success: boolean;
  staff: Staff;
}

interface TemperatureLog {
  id: number;
  staff_id: number;
  staff_name: string;
  equipment_name: string;
  temperature: number;
  recorded_date: string;
  recorded_time: string;
  note: string | null;
  created_at: string;
}

interface TemperatureLogsResponse {
  month: string;
  logs: TemperatureLog[];
}

// 公開API（認証不要）
export async function fetchStaffList(): Promise<Staff[]> {
  const res = await fetch(`${API_BASE}/api/facility/staff`);
  if (!res.ok) throw new Error("スタッフ一覧の取得に失敗しました");
  return res.json();
}

export async function login(staffId: number, passcode: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/facility/auth/login`, {
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

// スタッフ認証が必要なAPI
function getAuthHeaders(): Record<string, string> {
  const auth = sessionStorage.getItem("facility_auth");
  if (!auth) throw new Error("認証情報がありません");
  const { staffId, passcode } = JSON.parse(auth);
  return {
    "Content-Type": "application/json",
    "X-Staff-Id": String(staffId),
    "X-Staff-Passcode": passcode,
  };
}

export async function createTemperatureLog(data: {
  equipment_name: string;
  temperature: number;
  recorded_date: string;
  recorded_time: string;
  note?: string;
}): Promise<{ success: boolean; id: number }> {
  const res = await fetch(`${API_BASE}/api/facility/temperature-logs`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "温度記録の登録に失敗しました");
  }
  return res.json();
}

export async function fetchTemperatureLogs(month: string): Promise<TemperatureLogsResponse> {
  const res = await fetch(`${API_BASE}/api/facility/temperature-logs?month=${month}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("温度記録の取得に失敗しました");
  return res.json();
}

export async function deleteTemperatureLog(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/facility/temperature-logs/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "温度記録の削除に失敗しました");
  }
  return res.json();
}

export type { Staff, LoginResponse, TemperatureLog, TemperatureLogsResponse };
