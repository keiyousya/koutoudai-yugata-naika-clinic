import { Command } from "commander";
import Table from "cli-table3";
import { apiRequest, formatJson } from "../api.js";

interface Staff {
  id: number;
  name: string;
  role: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const staffCommands = new Command("staff")
  .description("スタッフ管理");

staffCommands
  .command("list")
  .description("スタッフ一覧を表示")
  .option("--pretty", "表形式で表示")
  .action(async (options) => {
    try {
      const data = await apiRequest<Staff[]>("GET", "/api/shift/admin/staff");

      if (options.pretty) {
        const table = new Table({
          head: ["ID", "名前", "職種", "有効", "表示順"],
        });
        for (const s of data) {
          table.push([
            s.id,
            s.name,
            s.role === "nurse" ? "看護師" : "事務",
            s.is_active ? "有効" : "無効",
            s.sort_order,
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

staffCommands
  .command("add")
  .description("スタッフを登録")
  .requiredOption("--name <name>", "名前")
  .requiredOption("--role <role>", "職種 (nurse または clerk)")
  .requiredOption("--passcode <passcode>", "パスコード (4桁)")
  .option("--sort-order <order>", "表示順", "0")
  .action(async (options) => {
    try {
      const result = await apiRequest<{ success: boolean; id: number; message: string }>(
        "POST",
        "/api/shift/admin/staff",
        {
          name: options.name,
          role: options.role,
          passcode: options.passcode,
          sort_order: parseInt(options.sortOrder, 10),
        }
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });

staffCommands
  .command("update <id>")
  .description("スタッフ情報を更新")
  .option("--name <name>", "名前")
  .option("--role <role>", "職種")
  .option("--passcode <passcode>", "パスコード")
  .option("--active <active>", "有効 (true または false)")
  .option("--sort-order <order>", "表示順")
  .action(async (id, options) => {
    try {
      const body: Record<string, unknown> = {};
      if (options.name) body.name = options.name;
      if (options.role) body.role = options.role;
      if (options.passcode) body.passcode = options.passcode;
      if (options.active !== undefined) body.is_active = options.active === "true";
      if (options.sortOrder !== undefined) body.sort_order = parseInt(options.sortOrder, 10);

      const result = await apiRequest<{ success: boolean; message: string }>(
        "PUT",
        `/api/shift/admin/staff/${id}`,
        body
      );
      console.log(formatJson(result));
    } catch (e) {
      console.error(`エラー: ${(e as Error).message}`);
      process.exit(1);
    }
  });
