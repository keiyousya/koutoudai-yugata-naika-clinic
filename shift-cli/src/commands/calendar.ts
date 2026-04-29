import { Command } from "commander";
import Table from "cli-table3";
import { apiRequest, formatJson } from "../api.js";

interface CalendarDay {
  date: string;
  is_open: boolean;
  reason: "weekly" | "override";
  note?: string;
}

interface CalendarResponse {
  month: string;
  days: CalendarDay[];
}

interface Override {
  date: string;
  is_open: number;
  note?: string;
  created_at: string;
}

export const calendarCommands = new Command("calendar")
  .description("営業日カレンダー管理");

calendarCommands
  .command("show")
  .description("指定月の営業日カレンダーを表示")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .option("--pretty", "表形式で表示")
  .action(async (options) => {
    try {
      const data = await apiRequest<CalendarResponse>(
        "GET",
        `/api/shift/calendar?month=${options.month}`
      );

      if (options.pretty) {
        const table = new Table({
          head: ["日付", "曜日", "営業", "理由", "備考"],
        });
        const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
        for (const day of data.days) {
          const date = new Date(day.date);
          const weekday = weekdays[date.getDay()];
          table.push([
            day.date,
            weekday,
            day.is_open ? "営業" : "休診",
            day.reason === "override" ? "例外" : "通常",
            day.note || "",
          ]);
        }
        console.log(table.toString());
      } else {
        console.log(formatJson(data));
      }
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

const overrideCommands = calendarCommands
  .command("override")
  .description("例外日管理");

overrideCommands
  .command("list")
  .description("例外日一覧を表示")
  .option("--pretty", "表形式で表示")
  .action(async (options) => {
    try {
      const data = await apiRequest<Override[]>(
        "GET",
        "/api/shift/admin/calendar/overrides"
      );

      if (options.pretty) {
        const table = new Table({
          head: ["日付", "状態", "備考"],
        });
        for (const o of data) {
          table.push([
            o.date,
            o.is_open ? "臨時診療" : "臨時休診",
            o.note || "",
          ]);
        }
        console.log(table.toString());
      } else {
        console.log(formatJson(data));
      }
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

overrideCommands
  .command("add")
  .description("例外日を追加")
  .requiredOption("--date <date>", "日付 (YYYY-MM-DD)")
  .option("--open", "臨時診療")
  .option("--closed", "臨時休診")
  .option("--note <note>", "備考")
  .action(async (options) => {
    try {
      if (!options.open && !options.closed) {
        console.error("エラー: --open または --closed を指定してください");
        process.exit(1);
      }

      const result = await apiRequest<{ success: boolean; message: string }>(
        "POST",
        "/api/shift/admin/calendar/overrides",
        {
          date: options.date,
          is_open: options.open ? true : false,
          note: options.note,
        }
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

overrideCommands
  .command("remove")
  .description("例外日を削除")
  .requiredOption("--date <date>", "日付 (YYYY-MM-DD)")
  .action(async (options) => {
    try {
      const result = await apiRequest<{ success: boolean; message: string }>(
        "DELETE",
        `/api/shift/admin/calendar/overrides/${options.date}`
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });
