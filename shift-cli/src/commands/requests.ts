import { Command } from "commander";
import Table from "cli-table3";
import { apiRequest, formatJson } from "../api.js";

interface Staff {
  id: number;
  name: string;
  role: string;
}

interface RequestsResponse {
  month: string;
  staff: Staff[];
  days: string[];
  matrix: Record<string, Record<number, { availability: string; note?: string }>>;
}

export const requestsCommands = new Command("requests")
  .description("希望提出管理");

requestsCommands
  .command("show")
  .description("全スタッフの希望を表示")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .option("--pretty", "表形式で表示")
  .action(async (options) => {
    try {
      const data = await apiRequest<RequestsResponse>(
        "GET",
        `/api/shift/admin/requests?month=${options.month}`
      );

      if (options.pretty) {
        const headers = ["日付", ...data.staff.map((s) => s.name)];
        const table = new Table({ head: headers });

        for (const day of data.days) {
          const row: string[] = [day];
          for (const staff of data.staff) {
            const req = data.matrix[day]?.[staff.id];
            if (req) {
              row.push(req.availability === "available" ? "○" : "×");
            } else {
              row.push("-");
            }
          }
          table.push(row);
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

requestsCommands
  .command("export")
  .description("希望をCSVでエクスポート")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .requiredOption("--format <format>", "フォーマット (csv)")
  .action(async (options) => {
    try {
      if (options.format !== "csv") {
        console.error("エラー: 現在 csv フォーマットのみ対応しています");
        process.exit(1);
      }

      const data = await apiRequest<RequestsResponse>(
        "GET",
        `/api/shift/admin/requests?month=${options.month}`
      );

      // CSV 生成
      const headers = ["日付", ...data.staff.map((s) => s.name)];
      const lines: string[] = [headers.join(",")];

      for (const day of data.days) {
        const row: string[] = [day];
        for (const staff of data.staff) {
          const req = data.matrix[day]?.[staff.id];
          if (req) {
            row.push(req.availability === "available" ? "○" : "×");
          } else {
            row.push("");
          }
        }
        lines.push(row.join(","));
      }

      console.log(lines.join("\n"));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });
