const API_BASE = "http://localhost:8789";

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

export async function fetchReservations(): Promise<Reservation[]> {
  const res = await fetch(`${API_BASE}/api/reservations`);
  if (!res.ok) throw new Error("予約の取得に失敗しました");
  return res.json();
}

export async function updateReservationStatus(
  id: number,
  status: ReservationStatus
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("ステータスの更新に失敗しました");
}

export async function deleteReservation(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("予約の削除に失敗しました");
}
