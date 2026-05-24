import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log("=== Adding shift_comment column to shift_staff ===\n");

  // カラムが存在するかチェック
  const tableInfo = await db.execute("PRAGMA table_info(shift_staff)");
  const hasColumn = tableInfo.rows.some((row) => row.name === "shift_comment");

  if (hasColumn) {
    console.log("shift_comment column already exists. Skipping.");
  } else {
    console.log("Adding shift_comment column...");
    await db.execute("ALTER TABLE shift_staff ADD COLUMN shift_comment TEXT");
    console.log("Done!");
  }

  console.log("\n=== Migration complete! ===");
}

migrate().catch(console.error);
