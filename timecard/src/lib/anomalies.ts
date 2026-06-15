import type { TimecardRecord } from "@/api/timecard";

// ========================================
// 打刻異常の検出（給与計算ミス防止アラート）
// 履歴画面・打刻画面で共通利用
// ========================================

export interface DayAnomaly {
  staffName: string;
  message: string;
}

export function groupByDate(records: TimecardRecord[] | undefined) {
  const grouped = new Map<string, TimecardRecord[]>();
  for (const r of records || []) {
    const date = r.timestamp.slice(0, 10);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(r);
  }
  return grouped;
}

export function getToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 同一スタッフ・同一日の打刻を時刻順に並べ、出勤→退勤→出勤→退勤… と
// 交互に並んでいるかを検査する。崩れていれば打刻漏れ・重複として返す。
// （連続シフト = in,out,in,out は正常扱い。当日は打刻途中のためアラート対象外）
export function detectDayAnomalies(date: string, dayRecords: TimecardRecord[]): DayAnomaly[] {
  // 当日はまだ打刻が途中の可能性があるため、アラートから除外
  if (date === getToday()) return [];

  const byStaff = new Map<string, TimecardRecord[]>();
  for (const r of dayRecords) {
    if (!byStaff.has(r.staff_name)) byStaff.set(r.staff_name, []);
    byStaff.get(r.staff_name)!.push(r);
  }

  const anomalies: DayAnomaly[] = [];
  for (const [staffName, recs] of byStaff) {
    const sorted = [...recs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let expectIn = true; // 次に来るべき打刻（true=出勤, false=退勤）
    let message = "";
    for (const r of sorted) {
      if (expectIn && r.type === "out") {
        message = "出勤打刻がありません（退勤のみ）";
        break;
      }
      if (!expectIn && r.type === "in") {
        message = "退勤打刻が漏れています（出勤が連続）";
        break;
      }
      expectIn = !expectIn;
    }
    // ループを正常に抜けても expectIn が false なら、最後の出勤に退勤が無い
    if (!message && !expectIn) {
      message = "退勤打刻が漏れています";
    }
    if (message) anomalies.push({ staffName, message });
  }
  return anomalies;
}

// 日付ごとにグループ化済みの記録から、全異常を日付付きで平坦化して取得
export interface AnomalyEntry extends DayAnomaly {
  date: string;
}

export function collectAnomalies(
  grouped: Map<string, TimecardRecord[]>
): AnomalyEntry[] {
  const list: AnomalyEntry[] = [];
  for (const [date, recs] of grouped) {
    for (const a of detectDayAnomalies(date, recs)) {
      list.push({ date, ...a });
    }
  }
  // 新しい日付が上、同日内は名前順
  list.sort((x, y) => y.date.localeCompare(x.date) || x.staffName.localeCompare(y.staffName));
  return list;
}
