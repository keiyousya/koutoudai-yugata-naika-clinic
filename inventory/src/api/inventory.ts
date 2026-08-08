const API_BASE = import.meta.env.PROD
  ? "https://koutoudai-inventory-api.kit-tamtam.workers.dev"
  : "http://localhost:8791";

function getAuthHeaders(): Record<string, string> {
  const auth = sessionStorage.getItem("inventory_auth");
  if (!auth) return {};
  const { staffId, passcode } = JSON.parse(auth);
  return {
    "X-Staff-Id": String(staffId),
    "X-Staff-Passcode": passcode,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    sessionStorage.removeItem("inventory_auth");
    window.location.reload();
    throw new Error("認証に失敗しました");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || `エラーが発生しました (${res.status})`
    );
  }
  return res.json();
}

// ========================================
// 認証
// ========================================

export interface Staff {
  id: number;
  name: string;
  role: string;
}

export async function fetchStaffList(): Promise<Staff[]> {
  const res = await fetch(`${API_BASE}/api/inventory/auth/staff`);
  return handleResponse<Staff[]>(res);
}

export async function login(
  staffId: number,
  passcode: string
): Promise<{ staff_id: number; name: string; role: string }> {
  const res = await fetch(`${API_BASE}/api/inventory/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff_id: staffId, passcode }),
  });
  return handleResponse(res);
}

// ========================================
// 型定義
// ========================================

export interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export interface InventoryItem {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  dosage: string | null;
  unit: string;
  sort_order: number;
  is_active: number;
  /** 発注の規定量（この数を下回ると発注対象） */
  order_threshold: number;
  /** 発注管理の対象にするか（1: 対象） */
  is_orderable: number;
}

export interface InventoryRecord {
  id: number;
  item_id: number;
  item_name: string;
  dosage: string | null;
  unit: string;
  date: string;
  quantity: number | null;
  recorded_by: string | null;
  category_name: string;
  item_sort_order: number;
  category_sort_order: number;
}

export interface ExpiryRecord {
  id: number;
  item_id: number;
  item_name: string;
  dosage: string | null;
  expiry_date: string;
  lot_number: string | null;
  note: string | null;
}

export interface OrderRecord {
  id: number;
  item_id: number;
  item_name: string;
  dosage: string | null;
  unit: string;
  quantity: number;
  status: "pending" | "ordered" | "delivered" | "cancelled";
  ordered_by: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  note: string | null;
  created_at: string;
}

// ========================================
// カテゴリ
// ========================================

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE}/api/inventory/categories`);
  return handleResponse<Category[]>(res);
}

// ========================================
// 品目
// ========================================

export async function fetchItems(categoryId?: number): Promise<InventoryItem[]> {
  const params = categoryId ? `?category_id=${categoryId}` : "";
  const res = await fetch(`${API_BASE}/api/inventory/items${params}`);
  return handleResponse<InventoryItem[]>(res);
}

export async function updateItemOrderSettings(
  itemId: number,
  data: { order_threshold?: number; is_orderable?: number }
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/inventory/items/${itemId}/order-settings`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
    }
  );
  return handleResponse(res);
}

// ========================================
// 在庫記録
// ========================================

export async function fetchRecords(
  month: string,
  categoryId?: number
): Promise<InventoryRecord[]> {
  const params = new URLSearchParams({ month });
  if (categoryId) params.set("category_id", String(categoryId));
  const res = await fetch(
    `${API_BASE}/api/inventory/records?${params.toString()}`
  );
  return handleResponse<InventoryRecord[]>(res);
}

/** 指定日より前の直近記録（品目ごとに1件） */
export interface LatestRecord {
  item_id: number;
  date: string;
  quantity: number;
}

export async function fetchLatestRecords(
  date: string,
  categoryId?: number
): Promise<LatestRecord[]> {
  const params = new URLSearchParams({ date });
  if (categoryId) params.set("category_id", String(categoryId));
  const res = await fetch(
    `${API_BASE}/api/inventory/records/latest?${params.toString()}`
  );
  return handleResponse<LatestRecord[]>(res);
}

export async function saveRecords(
  date: string,
  records: { item_id: number; quantity: number | null }[],
  recordedBy?: string
): Promise<{ success: boolean; count: number }> {
  const res = await fetch(`${API_BASE}/api/inventory/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ date, records, recorded_by: recordedBy }),
  });
  return handleResponse(res);
}

export async function updateRecord(
  itemId: number,
  date: string,
  quantity: number | null,
  recordedBy?: string
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/inventory/records/${itemId}/${date}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ quantity, recorded_by: recordedBy }),
    }
  );
  return handleResponse(res);
}

// ========================================
// 使用期限
// ========================================

export async function fetchExpiry(
  itemId?: number
): Promise<ExpiryRecord[]> {
  const params = itemId ? `?item_id=${itemId}` : "";
  const res = await fetch(`${API_BASE}/api/inventory/expiry${params}`);
  return handleResponse<ExpiryRecord[]>(res);
}

export async function createExpiry(data: {
  item_id: number;
  expiry_date: string;
  lot_number?: string;
  note?: string;
}): Promise<{ success: boolean; id: number }> {
  const res = await fetch(`${API_BASE}/api/inventory/expiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateExpiry(
  id: number,
  data: Partial<{
    item_id: number;
    expiry_date: string;
    lot_number: string;
    note: string;
  }>
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/inventory/expiry/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteExpiry(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/inventory/expiry/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

// ========================================
// 発注
// ========================================

export async function fetchOrders(
  status?: string
): Promise<OrderRecord[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE}/api/inventory/orders${params}`);
  return handleResponse<OrderRecord[]>(res);
}

export async function createOrder(data: {
  item_id: number;
  quantity: number;
  ordered_by?: string;
  note?: string;
}): Promise<{ success: boolean; id: number }> {
  const res = await fetch(`${API_BASE}/api/inventory/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateOrderStatus(
  id: number,
  status: string,
  note?: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/inventory/orders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  return handleResponse(res);
}
