#!/usr/bin/env node

import { createClient } from "@libsql/client";

const TURSO_URL = process.env.TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
  console.error("環境変数 TURSO_URL と TURSO_AUTH_TOKEN を設定してください");
  process.exit(1);
}

const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN,
});

const month = process.argv[2] || "2026-06";

const result = await db.execute({
  sql: "SELECT month, submission_locked_at, submission_unlocked, published_at, created_at FROM shift_periods WHERE month = ?",
  args: [month],
});

console.log(`shift_periods for ${month}:`);
if (result.rows.length === 0) {
  console.log("❌ No records found - period not locked or unlocked yet");
} else {
  const row = result.rows[0];
  console.log(JSON.stringify(row, null, 2));
  console.log("\n📊 Interpretation:");
  console.log("- submission_locked_at:", row.submission_locked_at || "NULL (not manually locked)");
  console.log("- submission_unlocked:", row.submission_unlocked === 1 ? "✅ YES (unlocked - can submit)" : "❌ NO (not unlocked)");
  console.log("- published_at:", row.published_at || "NULL (not published)");

  // Check default deadline
  const [year, mon] = month.split("-").map(Number);
  const deadlineDate = new Date(year, mon - 2, 1, 0, 0, 0);
  const now = new Date();
  const isPastDeadline = now >= deadlineDate;

  console.log("\n⏰ Default deadline status:");
  console.log("- Default deadline:", deadlineDate.toISOString());
  console.log("- Current time:", now.toISOString());
  console.log("- Past deadline:", isPastDeadline ? "YES" : "NO");

  console.log("\n🔒 Final lock status:");
  if (row.submission_unlocked === 1) {
    console.log("✅ UNLOCKED - Staff can submit requests (regardless of deadline)");
  } else if (row.submission_locked_at) {
    console.log("🔒 LOCKED - Manually locked");
  } else if (isPastDeadline) {
    console.log("🔒 LOCKED - Past default deadline");
  } else {
    console.log("✅ UNLOCKED - Before deadline");
  }
}

process.exit(0);
