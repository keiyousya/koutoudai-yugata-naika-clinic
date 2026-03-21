import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useRef } from "react";
import { Calendar, Download, LogIn, Nfc, Lock, User, LogOut, Keyboard, Eye, EyeOff, Pencil, Trash2, Plus, X, Check, ShieldCheck, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  fetchMonthlyRecords, fetchMyHistory, downloadExport,
  validateHistoryKey, updateRecord, deleteRecord, createRecord,
  fetchEditLog, fetchStaff,
} from "@/api/timecard";
import type { TimecardRecord, AuthKey, EditLogEntry, Staff } from "@/api/timecard";
import { useNfc } from "@/hooks/NfcContext";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ========================================
// メインページ: 認証状態でルーティング
// ========================================

type AuthState =
  | { type: "gate" }
  | { type: "full"; authKey: AuthKey }
  | { type: "personal"; cardUid: string; staffName: string };

function HistoryPage() {
  const [authState, setAuthState] = useState<AuthState>({ type: "gate" });

  if (authState.type === "gate") {
    return (
      <HistoryAuthGate
        onFullAccess={(authKey) => setAuthState({ type: "full", authKey })}
        onPersonalAccess={(cardUid, staffName) =>
          setAuthState({ type: "personal", cardUid, staffName })
        }
      />
    );
  }

  if (authState.type === "personal") {
    return (
      <MyHistoryView
        cardUid={authState.cardUid}
        staffName={authState.staffName}
        onLogout={() => setAuthState({ type: "gate" })}
      />
    );
  }

  return <FullHistoryView
    authKey={authState.authKey}
    onLogout={() => setAuthState({ type: "gate" })}
  />;
}

// ========================================
// 認証ゲート
// ========================================

function HistoryAuthGate({
  onFullAccess,
  onPersonalAccess,
}: {
  onFullAccess: (authKey: AuthKey) => void;
  onPersonalAccess: (cardUid: string, staffName: string) => void;
}) {
  const [mode, setMode] = useState<"select" | "password" | "nfc">("select");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handlePasswordLogin = async () => {
    if (!password.trim()) return;
    setIsValidating(true);
    setError("");
    try {
      const key = password.trim();
      const result = await validateHistoryKey(key);
      if (result) {
        onFullAccess({ type: result, key });
      } else {
        setError("パスワードが正しくありません");
      }
    } catch {
      setError("認証に失敗しました");
    } finally {
      setIsValidating(false);
    }
  };

  const handleCardRead = useCallback(
    async (uid: string) => {
      try {
        const result = await fetchMyHistory(uid, getCurrentMonth());
        onPersonalAccess(uid, result.staff_name);
      } catch {
        setError("未登録のカードです");
        setMode("select");
        setTimeout(() => setError(""), 3000);
      }
    },
    [onPersonalAccess]
  );

  const nfc = useNfc();

  useEffect(() => {
    return nfc.subscribe(handleCardRead);
  }, [nfc, handleCardRead]);

  if (mode === "password") {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              パスワード認証
            </CardTitle>
            <CardDescription>管理パスワードを入力してください</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                  placeholder="パスワード"
                  className="w-full px-3 py-2 pr-10 border rounded-md text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  onClick={handlePasswordLogin}
                  disabled={!password.trim() || isValidating}
                  className="flex-1"
                >
                  {isValidating ? "確認中..." : "ログイン"}
                </Button>
                <Button variant="outline" onClick={() => { setMode("select"); setError(""); }}>
                  戻る
                </Button>
              </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "nfc") {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Nfc className="h-5 w-5" />
              NFC カード認証
            </CardTitle>
            <CardDescription>NFC カードをタッチして自分の履歴を閲覧</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {nfc.isConnected ? (
              <div className="text-center space-y-3 py-4">
                <Nfc className="h-12 w-12 mx-auto text-green-600 animate-pulse" />
                <p className="font-medium text-green-600">リーダー接続中</p>
                <p className="text-sm text-muted-foreground">カードをタッチしてください</p>
              </div>
            ) : (
              <div className="text-center space-y-3 py-4">
                {nfc.isSupported ? (
                  <Button size="lg" onClick={nfc.connect} className="text-base px-8 py-6">
                    <Nfc className="h-5 w-5 mr-2" />
                    NFC リーダーに接続
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    WebUSB 非対応ブラウザです。Chrome を使用してください。
                  </p>
                )}
              </div>
            )}
            {nfc.error && <p className="text-sm text-destructive text-center">{nfc.error}</p>}
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                nfc.disconnect();
                setMode("select");
                setError("");
              }}
            >
              戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // mode === "select"
  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            出退勤履歴
          </CardTitle>
          <CardDescription>閲覧方法を選択してください</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-4 px-4"
            onClick={() => setMode("password")}
          >
            <LogIn className="h-5 w-5 mr-3 shrink-0" />
            <div className="text-left">
              <div className="font-medium">パスワードでログイン</div>
              <div className="text-xs text-muted-foreground">全スタッフの履歴 + CSV エクスポート</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-4 px-4"
            onClick={() => setMode("nfc")}
          >
            <Nfc className="h-5 w-5 mr-3 shrink-0" />
            <div className="text-left">
              <div className="font-medium">NFC カードで自分の履歴</div>
              <div className="text-xs text-muted-foreground">カードをタッチして本人の記録のみ閲覧</div>
            </div>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ========================================
// 全スタッフ履歴表示
// ========================================

function FullHistoryView({ authKey, onLogout }: { authKey: AuthKey; onLogout: () => void }) {
  const [month, setMonth] = useState(getCurrentMonth);
  const [staffFilter, setStaffFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newStaffId, setNewStaffId] = useState<number | "">("");
  const [newType, setNewType] = useState<"in" | "out">("in");
  const queryClient = useQueryClient();
  const isAdmin = authKey.type === "admin";

  const { data: records, isLoading, error } = useQuery({
    queryKey: ["monthly-records", month],
    queryFn: () => fetchMonthlyRecords(month, authKey),
    retry: false,
  });

  const { data: staffList } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => fetchStaff(authKey.key),
    enabled: isAdmin,
  });

  // 401 の場合はキーが無効 → 認証ゲートに戻す
  if (error?.message?.includes("認証に失敗しました")) {
    onLogout();
    return null;
  }

  const staffNames = records
    ? [...new Set(records.map((r) => r.staff_name))].sort()
    : [];

  const filtered = records?.filter(
    (r) => !staffFilter || r.staff_name === staffFilter
  );

  const grouped = groupByDate(filtered);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadExport(month, authKey);
    } catch (e) {
      alert(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setIsExporting(false);
    }
  };

  const invalidateRecords = () => {
    queryClient.invalidateQueries({ queryKey: ["monthly-records", month] });
    queryClient.invalidateQueries({ queryKey: ["edit-log"] });
  };

  const handleNewRecord = async () => {
    if (!newDate || !newTime || !newStaffId) return;
    try {
      await createRecord(authKey.key, {
        staff_id: Number(newStaffId),
        type: newType,
        timestamp: `${newDate} ${newTime}:00`,
      });
      setShowNewRecord(false);
      setNewDate("");
      setNewTime("");
      setNewStaffId("");
      setNewType("in");
      invalidateRecords();
    } catch (e) {
      alert(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              出退勤履歴
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              ログアウト
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-sm font-medium block mb-1">月</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">スタッフ</label>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="">全員</option>
                {staffNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-1" />
              {isExporting ? "出力中..." : "CSV"}
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewRecord(!showNewRecord)}
              >
                <Plus className="h-4 w-4 mr-1" />
                新規記録
              </Button>
            )}
          </div>

          {isAdmin && showNewRecord && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-md">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="px-2 py-1.5 border rounded text-sm"
              />
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="px-2 py-1.5 border rounded text-sm font-mono"
              />
              <select
                value={newStaffId}
                onChange={(e) => setNewStaffId(e.target.value ? Number(e.target.value) : "")}
                className="px-2 py-1.5 border rounded text-sm"
              >
                <option value="">スタッフ</option>
                {staffList?.filter(s => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "in" | "out")}
                className="px-2 py-1.5 border rounded text-sm"
              >
                <option value="in">出勤</option>
                <option value="out">退勤</option>
              </select>
              <Button
                size="sm"
                disabled={!newDate || !newTime || !newStaffId}
                onClick={handleNewRecord}
              >
                <Check className="h-4 w-4 mr-1" />
                作成
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewRecord(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <RecordsTable
            records={filtered}
            isLoading={isLoading}
            grouped={grouped}
            month={month}
            isAdmin={isAdmin}
            authKey={authKey}
            staffList={staffList}
            onMutate={invalidateRecords}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ========================================
// 個人履歴表示
// ========================================

function MyHistoryView({
  cardUid,
  staffName,
  onLogout,
}: {
  cardUid: string;
  staffName: string;
  onLogout: () => void;
}) {
  const [month, setMonth] = useState(getCurrentMonth);

  const { data, isLoading } = useQuery({
    queryKey: ["my-history", cardUid, month],
    queryFn: () => fetchMyHistory(cardUid, month),
  });

  const records = data?.records;
  const grouped = groupByDate(records);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {staffName}さんの出退勤履歴
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              戻る
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">月</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm"
            />
          </div>

          <RecordsTable records={records} isLoading={isLoading} grouped={grouped} month={month} />
        </CardContent>
      </Card>
    </div>
  );
}

// ========================================
// 共通: 記録テーブル
// ========================================

function groupByDate(records: TimecardRecord[] | undefined) {
  const grouped = new Map<string, TimecardRecord[]>();
  for (const r of records || []) {
    const date = r.timestamp.slice(0, 10);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(r);
  }
  return grouped;
}

function RecordsTable({
  records,
  isLoading,
  grouped,
  month,
  isAdmin,
  authKey,
  staffList,
  onMutate,
}: {
  records: TimecardRecord[] | undefined;
  isLoading: boolean;
  grouped: Map<string, TimecardRecord[]>;
  month: string;
  isAdmin?: boolean;
  authKey?: AuthKey;
  staffList?: Staff[];
  onMutate?: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editType, setEditType] = useState<"in" | "out">("in");
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [addStaffId, setAddStaffId] = useState<number | "">("");
  const [addTime, setAddTime] = useState("");
  const [addType, setAddType] = useState<"in" | "out">("in");
  const [logRecordId, setLogRecordId] = useState<number | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">読み込み中...</p>;
  }

  if (!records || records.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {month} の記録はありません
      </p>
    );
  }

  const startEdit = (r: TimecardRecord) => {
    setEditingId(r.id);
    setEditTime(r.timestamp.slice(11, 16));
    setEditType(r.type);
  };

  const saveEdit = async (r: TimecardRecord) => {
    if (!authKey || authKey.type !== "admin") return;
    const newTimestamp = r.timestamp.slice(0, 11) + editTime + r.timestamp.slice(16);
    try {
      await updateRecord(authKey.key, r.id, {
        timestamp: newTimestamp !== r.timestamp ? newTimestamp : undefined,
        type: editType !== r.type ? editType : undefined,
      });
      setEditingId(null);
      onMutate?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const handleDelete = async (r: TimecardRecord) => {
    if (!authKey || authKey.type !== "admin") return;
    if (!confirm(`${r.staff_name} の ${r.timestamp.slice(11, 16)} ${r.type === "in" ? "出勤" : "退勤"} を削除しますか？`)) return;
    try {
      await deleteRecord(authKey.key, r.id);
      onMutate?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const handleAdd = async (date: string) => {
    if (!authKey || authKey.type !== "admin" || !addStaffId || !addTime) return;
    const timestamp = `${date} ${addTime}:00`;
    try {
      await createRecord(authKey.key, {
        staff_id: Number(addStaffId),
        type: addType,
        timestamp,
      });
      setAddingDate(null);
      setAddStaffId("");
      setAddTime("");
      setAddType("in");
      onMutate?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  return (
    <>
      {[...grouped.entries()].map(([date, dayRecords]) => (
        <div key={date}>
          <div className="flex items-center gap-2 mt-4 mb-1">
            <h3 className="font-medium text-sm text-muted-foreground">
              {date}
            </h3>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setAddingDate(addingDate === date ? null : date)}
              >
                <Plus className="h-3 w-3 mr-1" />
                記録追加
              </Button>
            )}
          </div>
          {isAdmin && addingDate === date && (
            <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-purple-50 border border-purple-200 rounded-md">
              <select
                value={addStaffId}
                onChange={(e) => setAddStaffId(e.target.value ? Number(e.target.value) : "")}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="">スタッフ</option>
                {staffList?.filter(s => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="time"
                value={addTime}
                onChange={(e) => setAddTime(e.target.value)}
                className="px-2 py-1 border rounded text-sm font-mono"
              />
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as "in" | "out")}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="in">出勤</option>
                <option value="out">退勤</option>
              </select>
              <Button
                size="sm"
                className="h-7 px-2"
                disabled={!addStaffId || !addTime}
                onClick={() => handleAdd(date)}
              >
                <Check className="h-3 w-3 mr-1" />
                追加
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setAddingDate(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時刻</TableHead>
                <TableHead>スタッフ</TableHead>
                <TableHead>種別</TableHead>
                <TableHead>方法</TableHead>
                {isAdmin && <TableHead className="w-20"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dayRecords.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">
                    {editingId === r.id ? (
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="px-1 py-0.5 border rounded text-sm font-mono w-24"
                      />
                    ) : (
                      r.timestamp.slice(11, 16)
                    )}
                  </TableCell>
                  <TableCell>{r.staff_name}</TableCell>
                  <TableCell>
                    {editingId === r.id ? (
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as "in" | "out")}
                        className="px-1 py-0.5 border rounded text-sm"
                      >
                        <option value="in">出勤</option>
                        <option value="out">退勤</option>
                      </select>
                    ) : (
                      <Badge
                        variant={r.type === "in" ? "default" : "secondary"}
                        className={r.type === "in"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-orange-100 text-orange-800 border-orange-200"
                        }
                      >
                        {r.type === "in" ? "出勤" : "退勤"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      <MethodBadge method={r.method} />
                      {r.is_modified ? (
                        <ModifiedBadge recordId={r.id} authKey={authKey} logRecordId={logRecordId} setLogRecordId={setLogRecordId} />
                      ) : null}
                    </div>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {editingId === r.id ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => saveEdit(r)}>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5 text-gray-500" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(r)}>
                            <Pencil className="h-3.5 w-3.5 text-gray-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(r)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </>
  );
}

// ========================================
// 方法バッジ
// ========================================

function MethodBadge({ method }: { method: TimecardRecord["method"] }) {
  if (method === "admin") {
    return (
      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
        <ShieldCheck className="h-3 w-3 mr-1" />管理者
      </Badge>
    );
  }
  if (method === "manual") {
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
        <Keyboard className="h-3 w-3 mr-1" />手動
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
      <Nfc className="h-3 w-3 mr-1" />NFC
    </Badge>
  );
}

// ========================================
// 修正済みバッジ + 変更履歴ポップオーバー
// ========================================

function ModifiedBadge({
  recordId,
  authKey,
  logRecordId,
  setLogRecordId,
}: {
  recordId: number;
  authKey?: AuthKey;
  logRecordId: number | null;
  setLogRecordId: (id: number | null) => void;
}) {
  const isOpen = logRecordId === recordId;
  const popoverRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const { data: logs } = useQuery({
    queryKey: ["edit-log", recordId],
    queryFn: () => fetchEditLog(authKey!, recordId),
    enabled: isOpen && !!authKey,
  });

  const handleOpen = () => {
    if (isOpen) {
      setLogRecordId(null);
      return;
    }
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setLogRecordId(recordId);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        badgeRef.current && !badgeRef.current.contains(e.target as Node)
      ) {
        setLogRecordId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setLogRecordId]);

  return (
    <>
      <div ref={badgeRef} className="inline-block">
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 border-purple-200 cursor-pointer hover:bg-purple-100"
          onClick={handleOpen}
        >
          <History className="h-3 w-3 mr-1" />修正済
        </Badge>
      </div>
      {isOpen && pos && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-72 bg-white border rounded-lg shadow-lg p-3"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">変更履歴</h4>
            <button onClick={() => setLogRecordId(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          {!logs ? (
            <p className="text-xs text-muted-foreground">読み込み中...</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">変更履歴なし</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {logs.map((log) => (
                <EditLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function EditLogItem({ log }: { log: EditLogEntry }) {
  const actionLabel = { create: "作成", update: "更新", delete: "削除" }[log.action];
  const actionColor = { create: "text-green-600", update: "text-blue-600", delete: "text-red-600" }[log.action];

  let changes: Record<string, any>;
  try {
    changes = JSON.parse(log.changes);
  } catch {
    changes = {};
  }

  return (
    <div className="text-xs border-b border-gray-100 pb-2 last:border-0">
      <div className="flex items-center justify-between">
        <span className={`font-medium ${actionColor}`}>{actionLabel}</span>
        <span className="text-muted-foreground">{log.edited_at.replace("T", " ").slice(0, 16)}</span>
      </div>
      <div className="mt-1 text-muted-foreground">
        {log.action === "update" && Object.entries(changes).map(([key, val]) => {
          const v = val as { old: string; new: string };
          const label = key === "timestamp" ? "時刻" : key === "type" ? "種別" : key;
          const fmt = (s: string) => key === "type" ? (s === "in" ? "出勤" : "退勤") : key === "timestamp" ? s.slice(11, 16) : s;
          return <div key={key}>{label}: {fmt(v.old)} → {fmt(v.new)}</div>;
        })}
        {log.action === "create" && (
          <div>{changes.staff_name} {changes.type === "in" ? "出勤" : "退勤"} {String(changes.timestamp).slice(11, 16)}</div>
        )}
        {log.action === "delete" && (
          <div>{changes.staff_name} {changes.type === "in" ? "出勤" : "退勤"} {String(changes.timestamp).slice(11, 16)}</div>
        )}
      </div>
    </div>
  );
}
