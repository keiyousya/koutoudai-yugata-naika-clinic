const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8789";
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";

export type ReservationStatus =
  | "not_visited"      // 未来院
  | "checked_in"       // 受付済
  | "in_consultation"  // 診察中
  | "consultation_done" // 診察終了
  | "paid"             // 会計済
  | "cancelled";       // キャンセル

export interface Reservation {
  id: number;
  name: string;
  name_kana: string | null;
  phone: string;
  email: string | null;
  gender: "male" | "female" | "other" | null;
  birthdate: string | null;
  visit_type: "first" | "return" | null;
  date: string;
  time: string;
  symptoms: string | null;
  status: ReservationStatus;
  created_at: string;
}

// 認証ヘッダーを生成
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (ADMIN_API_KEY) {
    headers["X-Admin-API-Key"] = ADMIN_API_KEY;
  }

  return headers;
}

// APIエラーをハンドリング
async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new Error("認証に失敗しました。APIキーを確認してください。");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `エラーが発生しました (${res.status})`);
  }

  return res.json();
}

export async function fetchReservations(): Promise<Reservation[]> {
  const res = await fetch(`${API_BASE}/api/reservations`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Reservation[]>(res);
}

export async function updateReservationStatus(
  id: number,
  status: ReservationStatus
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  await handleResponse(res);
}

export async function deleteReservation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  await handleResponse(res);
}
