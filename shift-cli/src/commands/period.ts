import { Command } from "commander";
import { apiRequest, formatJson } from "../api.js";

export const periodCommands = new Command("period")
  .description("締切管理");

periodCommands
  .command("lock")
  .description("提出をロック")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .action(async (options) => {
    try {
      const result = await apiRequest<{ success: boolean; message: string }>(
        "POST",
        `/api/shift/admin/periods/${options.month}/lock`
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

periodCommands
  .command("unlock")
  .description("ロックを解除")
  .requiredOption("--month <month>", "対象月 (YYYY-MM)")
  .action(async (options) => {
    try {
      const result = await apiRequest<{ success: boolean; message: string }>(
        "DELETE",
        `/api/shift/admin/periods/${options.month}/lock`
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });
