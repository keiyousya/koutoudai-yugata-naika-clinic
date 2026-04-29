import { Command } from "commander";
import { readFileSync } from "fs";
import Table from "cli-table3";
import { apiRequest, formatJson } from "../api.js";

interface Assignment {
  id?: number;
  date: string;
  role: string;
  staff: {
    id: number;
    name: string;
  };
  created_at?: string;
  updated_at?: string;
}

interface AssignmentsResponse {
  month: string;
  published: boolean;
  published_at: string | null;
  assignments: Assignment[];
}

interface AssignmentInput {
  date: string;
  role: string;
  staff_id: number;
}

interface AssignmentsInputFile {
  month: string;
  assignments: AssignmentInput[];
}

export const assignmentsCommands = new Command("assignments")
  .description("確定シフト管理");

assignmentsCommands
  .command("show")
  .description("確定シフトを表示")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .option("--pretty", "表形式で表示")
  .action(async (options) => {
    try {
      const data = await apiRequest<AssignmentsResponse>(
        "GET",
        `/api/shift/admin/assignments?month=${options.month}`
      );

      if (options.pretty) {
        console.log(`月: ${data.month}`);
        console.log(`公開: ${data.published ? "公開済み" : "未公開"}`);
        if (data.published_at) {
          console.log(`公開日時: ${data.published_at}`);
        }
        console.log("");

        const table = new Table({
          head: ["日付", "職種", "スタッフ"],
        });
        for (const a of data.assignments) {
          table.push([
            a.date,
            a.role === "nurse" ? "看護師" : "事務",
            a.staff.name,
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

assignmentsCommands
  .command("validate")
  .description("シフトを検証（保存はしない）")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .option("--file <path>", "JSONファイルのパス（- で標準入力）")
  .action(async (options) => {
    try {
      let input: AssignmentsInputFile;

      if (options.file === "-") {
        // 標準入力から読み取り
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const content = Buffer.concat(chunks).toString("utf8");
        input = JSON.parse(content);
      } else if (options.file) {
        const content = readFileSync(options.file, "utf8");
        input = JSON.parse(content);
      } else {
        console.error("エラー: --file を指定してください");
        process.exit(1);
      }

      // バリデーションのみ実行（force=0）
      const result = await apiRequest<{ success?: boolean; error?: string; warnings?: string[] }>(
        "PUT",
        `/api/shift/admin/assignments?month=${options.month}`,
        input
      );

      // バリデーションエラーがあった場合
      if (result.error && result.warnings) {
        console.log("検証結果: 警告あり");
        for (const w of result.warnings) {
          console.log(`  - ${w}`);
        }
        process.exit(1);
      }

      console.log("検証結果: OK");
    } catch (e) {
      const error = e as Error & { warnings?: string[] };
      console.error(`エラー: ${error.message}`);
      process.exit(1);
    }
  });

assignmentsCommands
  .command("apply")
  .description("シフトを保存")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .requiredOption("--file <path>", "JSONファイルのパス")
  .option("--force", "警告を無視して保存")
  .action(async (options) => {
    try {
      const content = readFileSync(options.file, "utf8");
      const input: AssignmentsInputFile = JSON.parse(content);

      const forceParam = options.force ? "&force=1" : "";
      const result = await apiRequest<{ success: boolean; message: string; count: number; warnings?: string[] }>(
        "PUT",
        `/api/shift/admin/assignments?month=${options.month}${forceParam}`,
        input
      );

      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

assignmentsCommands
  .command("publish")
  .description("シフトを公開")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .action(async (options) => {
    try {
      const result = await apiRequest<{ success: boolean; message: string }>(
        "POST",
        `/api/shift/admin/periods/${options.month}/publish`
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

assignmentsCommands
  .command("unpublish")
  .description("シフト公開を取り下げ")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .action(async (options) => {
    try {
      const result = await apiRequest<{ success: boolean; message: string }>(
        "DELETE",
        `/api/shift/admin/periods/${options.month}/publish`
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });
