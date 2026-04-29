const API_BASE = process.env.SHIFT_API_BASE;
const API_KEY = process.env.SHIFT_ADMIN_API_KEY;

export function checkEnv(): void {
  if (!API_BASE) {
    console.error("エラー: 環境変数 SHIFT_API_BASE が設定されていません");
    console.error("例: export SHIFT_API_BASE=http://localhost:8790");
    process.exit(1);
  }
  if (!API_KEY) {
    console.error("エラー: 環境変数 SHIFT_ADMIN_API_KEY が設定されていません");
    process.exit(1);
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-API-Key": API_KEY!,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = (data as { error?: string }).error || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return data as T;
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
