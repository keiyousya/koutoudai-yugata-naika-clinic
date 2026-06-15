import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect } from "react";
import { Nfc, Wifi, WifiOff, Keyboard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { punch, fetchTodayRecords, fetchRecentRecords } from "@/api/timecard";
import type { PunchResult } from "@/api/timecard";
import { useNfc } from "@/hooks/NfcContext";
import { groupByDate, collectAnomalies } from "@/lib/anomalies";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: PunchPage,
});

function PunchPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<PunchResult | null>(null);
  const [punchError, setPunchError] = useState<string | null>(null);
  const [manualUid, setManualUid] = useState("");
  const [showManual, setShowManual] = useState(false);

  const nfc = useNfc();

  const { data: records } = useQuery({
    queryKey: ["today-records"],
    queryFn: fetchTodayRecords,
    refetchInterval: 30_000,
  });

  // 直近2週間の打刻漏れ・重複を検出（当日は除外）
  const { data: recentRecords } = useQuery({
    queryKey: ["recent-records"],
    queryFn: () => fetchRecentRecords(14),
    refetchInterval: 60_000,
  });

  const anomalies = collectAnomalies(groupByDate(recentRecords));

  const punchMutation = useMutation({
    mutationFn: ({ uid, method }: { uid: string; method: "nfc" | "manual" }) => punch(uid, method),
    onSuccess: (result) => {
      setLastResult(result);
      setPunchError(null);
      queryClient.invalidateQueries({ queryKey: ["today-records"] });
      setTimeout(() => setLastResult(null), 5000);
    },
    onError: (err: Error) => {
      setPunchError(err.message);
      setLastResult(null);
      setTimeout(() => setPunchError(null), 5000);
    },
  });

  const handleCardRead = useCallback(
    (uid: string) => {
      punchMutation.mutate({ uid, method: "nfc" });
    },
    [punchMutation]
  );

  useEffect(() => {
    return nfc.subscribe(handleCardRead);
  }, [nfc, handleCardRead]);

  const handleManualPunch = () => {
    const uid = manualUid.trim().toUpperCase();
    if (!uid) return;
    punchMutation.mutate({ uid, method: "manual" });
    setManualUid("");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* NFC 接続カード */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Nfc className="h-5 w-5" />
            NFC 打刻
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 接続状態 */}
          {nfc.isConnected ? (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-green-600">
                <Wifi className="h-5 w-5 animate-pulse" />
                <span className="font-medium">カードをタッチしてください</span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <WifiOff className="h-5 w-5" />
                <span>リーダー未接続</span>
              </div>
              {nfc.isSupported && (
                <Button size="lg" onClick={nfc.connect} className="text-base px-8 py-6">
                  <Nfc className="h-5 w-5 mr-2" />
                  NFC リーダーに接続
                </Button>
              )}
            </div>
          )}

          {nfc.error && (
            <p className="text-sm text-destructive text-center">{nfc.error}</p>
          )}

          {/* フォールバック: 手動入力 */}
          <div className="pt-2 border-t">
            <button
              onClick={() => setShowManual(!showManual)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Keyboard className="h-4 w-4" />
              {showManual ? "手動入力を閉じる" : "手動入力（UID）"}
            </button>
            {showManual && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualPunch()}
                  placeholder="カード UID を入力"
                  className="flex-1 px-3 py-2 border rounded-md text-sm"
                />
                <Button onClick={handleManualPunch} disabled={!manualUid.trim()}>
                  打刻
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 打刻漏れアラート */}
      {anomalies.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-red-800">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              打刻漏れの可能性があります（{anomalies.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-red-600 mb-3">
              直近2週間で出勤・退勤の対応が取れていない記録です。該当者は管理者に修正を依頼してください。
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">日付</TableHead>
                  <TableHead className="w-40">スタッフ</TableHead>
                  <TableHead>内容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalies.map((a, i) => (
                  <TableRow key={`${a.date}-${a.staffName}-${i}`}>
                    <TableCell className="font-mono text-red-800">{a.date}</TableCell>
                    <TableCell className="font-medium text-red-800">{a.staffName}</TableCell>
                    <TableCell className="text-red-700">{a.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 打刻結果表示 */}
      {lastResult && (
        <Card className={lastResult.type === "in"
          ? "border-blue-300 bg-blue-50"
          : "border-orange-300 bg-orange-50"
        }>
          <CardContent className="py-6 text-center">
            <p className="text-2xl font-bold">
              {lastResult.message}
            </p>
          </CardContent>
        </Card>
      )}

      {punchError && (
        <Card className="border-destructive bg-red-50">
          <CardContent className="py-4 text-center text-destructive">
            {punchError}
          </CardContent>
        </Card>
      )}

      {/* 今日の記録 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">本日の出退勤</CardTitle>
        </CardHeader>
        <CardContent>
          {!records || records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              本日の記録はありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>時刻</TableHead>
                  <TableHead>スタッフ</TableHead>
                  <TableHead>種別</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">
                      {r.timestamp.slice(11, 16)}
                    </TableCell>
                    <TableCell>{r.staff_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.type === "in" ? "default" : "secondary"}
                        className={r.type === "in"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-orange-100 text-orange-800 border-orange-200"
                        }
                      >
                        {r.type === "in" ? "出勤" : "退勤"}
                      </Badge>
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
