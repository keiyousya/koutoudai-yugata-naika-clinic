// さくらメール(INBOX)の指定UIDのメールから添付ファイルを outDir に保存する（読み取り専用。既読も付けない）
// 使い方: cd ~/dev/agent-mail/apps/server && pnpm exec tsx <このファイル> <uid> <outDir>
import { ImapFlow } from "/Users/tamurakeito/dev/agent-mail/apps/server/node_modules/imapflow/lib/imap-flow.js";
import { simpleParser } from "/Users/tamurakeito/dev/agent-mail/apps/server/node_modules/mailparser/index.js";
import { account } from "/Users/tamurakeito/dev/agent-mail/apps/server/src/env.ts";
import { writeFileSync } from "fs";

const [uid, outDir] = process.argv.slice(2);
const c = new ImapFlow({
  host: account.imap.host,
  port: account.imap.port,
  secure: true,
  auth: { user: account.imap.user, pass: account.imap.pass },
  logger: false,
});
await c.connect();
const lock = await c.getMailboxLock("INBOX", { readOnly: true });
try {
  const m = await c.fetchOne(uid, { source: true }, { uid: true });
  const p = await simpleParser(m.source);
  for (const a of p.attachments) {
    writeFileSync(`${outDir}/${a.filename}`, a.content);
    console.log(a.filename, a.content.length);
  }
} finally {
  lock.release();
  await c.logout();
}
