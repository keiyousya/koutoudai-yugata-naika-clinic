import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useRef } from "react";
import { Settings, UserPlus, Nfc, Ban, RotateCcw, LogOut, Check, Copy, Eye, EyeOff, Pencil, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fetchStaff, createStaff, deleteStaff, updateStaff } from "@/api/timecard";
import type { Staff } from "@/api/timecard";
import { useNfc } from "@/hooks/NfcContext";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8789";

/** 全角英数記号を半角に変換し、変換不能な全角文字は除去 */
function toAscii(s: string): string {
  // 全角英数記号 (U+FF01〜U+FF5E) → 半角 (U+0021〜U+007E)
  const converted = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
  // 全角スペース → 半角スペース、残った非ASCII文字を除去
  return converted.replace(/\u3000/g, " ").replace(/[^\x20-\x7E]/g, "");
}

function AdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [initialStaff, setInitialStaff] = useState<Staff[] | null>(null);
  const composingRef = useRef(false);

  const handleLogin = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setIsValidating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/timecard/staff`, {
        headers: { "Content-Type": "application/json", "X-Admin-API-Key": key },
      });
      if (res.ok) {
        const data = await res.json();
        setInitialStaff(data);
        setIsAuthenticated(true);
      } else {
        setError("パスワードが正しくありません");
      }
    } catch {
      setError("サーバーに接続できません");
    } finally {
      setIsValidating(false);
    }
  };

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    setApiKey("");
  }, []);

  // 3分で自動ログアウト
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      handleLogout();
    }, 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, handleLogout]);

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              管理画面
            </CardTitle>
            <CardDescription>Admin API Key を入力してください</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => {
                    if (composingRef.current) {
                      setApiKey(e.target.value);
                    } else {
                      setApiKey(toAscii(e.target.value));
                    }
                  }}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={(e) => {
                    composingRef.current = false;
                    setApiKey(toAscii((e.target as HTMLInputElement).value));
                  }}
                  onKeyDown={(e) => { if (!composingRef.current && e.key === "Enter") handleLogin(); }}
                  placeholder="API Key"
                  className="w-full px-3 py-2 pr-10 border rounded-md text-sm"
                  style={{ WebkitTextSecurity: showPassword ? "none" : "disc" } as React.CSSProperties}
                  autoComplete="off"
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
              <Button onClick={handleLogin} className="w-full" disabled={isValidating}>
                {isValidating ? "確認中..." : "ログイン"}
              </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminDashboard adminKey={apiKey} initialStaff={initialStaff} onLogout={handleLogout} />;
}

function AdminDashboard({ adminKey, initialStaff, onLogout }: { adminKey: string; initialStaff: Staff[] | null; onLogout: () => void }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [scannedUid, setScannedUid] = useState("");
  const [registerMessage, setRegisterMessage] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingUid, setEditingUid] = useState("");

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchStaff(adminKey),
    ...(initialStaff ? { initialData: initialStaff } : {}),
  });

  const createMutation = useMutation({
    mutationFn: () => createStaff(adminKey, newName.trim(), scannedUid),
    onSuccess: (result) => {
      setRegisterMessage(result.message);
      setRegisterError("");
      setNewName("");
      setScannedUid("");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setTimeout(() => setRegisterMessage(""), 5000);
    },
    onError: (err: Error) => {
      setRegisterError(err.message);
      setRegisterMessage("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteStaff(adminKey, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => updateStaff(adminKey, id, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, card_uid }: { id: number; card_uid: string }) =>
      updateStaff(adminKey, id, { card_uid }),
    onSuccess: () => {
      setEditingId(null);
      setEditingUid("");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  const handleCardRead = useCallback((uid: string) => {
    if (editingId !== null) {
      setEditingUid(uid);
    } else {
      setScannedUid(uid);
    }
  }, [editingId]);

  const nfc = useNfc();

  useEffect(() => {
    return nfc.subscribe(handleCardRead);
  }, [nfc, handleCardRead]);

  const handleRegister = () => {
    if (!newName.trim() || !scannedUid) return;
    createMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* スタッフ登録 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              スタッフ登録
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              ログアウト
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">名前</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="スタッフ名"
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">カード UID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scannedUid}
                  onChange={(e) => setScannedUid(e.target.value.toUpperCase())}
                  placeholder="NFC で読取 or 手入力"
                  className="flex-1 px-3 py-2 border rounded-md text-sm font-mono"
                />
                {nfc.isSupported && !nfc.isConnected && (
                  <Button variant="outline" size="sm" onClick={nfc.connect} title="NFC リーダー接続">
                    <Nfc className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {nfc.isConnected && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Nfc className="h-4 w-4 animate-pulse" />
              NFC リーダー接続中 — カードをタッチして UID を読み取ります
              <Button variant="ghost" size="sm" onClick={nfc.disconnect} className="ml-2">切断</Button>
            </p>
          )}

          {nfc.error && (
            <p className="text-sm text-destructive">{nfc.error}</p>
          )}

          <Button
            onClick={handleRegister}
            disabled={!newName.trim() || !scannedUid || createMutation.isPending}
          >
            登録
          </Button>

          {registerMessage && (
            <p className="text-sm text-green-600">{registerMessage}</p>
          )}
          {registerError && (
            <p className="text-sm text-destructive">{registerError}</p>
          )}
        </CardContent>
      </Card>

      {/* スタッフ一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">スタッフ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">読み込み中...</p>
          ) : !staff || staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              スタッフが登録されていません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>名前</TableHead>
                  <TableHead>カード UID</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.id}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {editingId === s.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingUid}
                            onChange={(e) => setEditingUid(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingUid.trim()) {
                                updateCardMutation.mutate({ id: s.id, card_uid: editingUid.trim() });
                              }
                              if (e.key === "Escape") {
                                setEditingId(null);
                                setEditingUid("");
                              }
                            }}
                            placeholder="NFC で読取 or 手入力"
                            className="w-32 px-2 py-1 border rounded text-xs font-mono"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="保存"
                            disabled={!editingUid.trim() || updateCardMutation.isPending}
                            onClick={() => updateCardMutation.mutate({ id: s.id, card_uid: editingUid.trim() })}
                          >
                            <Save className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="キャンセル"
                            onClick={() => { setEditingId(null); setEditingUid(""); }}
                          >
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                          title="クリックでコピー"
                          onClick={() => {
                            navigator.clipboard.writeText(s.card_uid);
                            setCopiedId(s.id);
                            setTimeout(() => setCopiedId((v) => v === s.id ? null : v), 2000);
                          }}
                        >
                          {s.card_uid}
                          {copiedId === s.id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          )}
                          {copiedId === s.id && (
                            <span className="ml-1 text-[10px] text-green-600 font-sans">コピー済み</span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? "default" : "secondary"}>
                        {s.is_active ? "有効" : "無効"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {editingId !== s.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="カード変更"
                            onClick={() => {
                              setEditingId(s.id);
                              setEditingUid(s.card_uid);
                            }}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                        {s.is_active ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="無効化"
                            onClick={() => {
                              if (confirm(`「${s.name}」さんを無効化しますか？`)) {
                                deleteMutation.mutate(s.id);
                              }
                            }}
                          >
                            <Ban className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="有効化"
                            onClick={() => {
                              if (confirm(`「${s.name}」さんを再度有効化しますか？`)) {
                                reactivateMutation.mutate(s.id);
                              }
                            }}
                          >
                            <RotateCcw className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
