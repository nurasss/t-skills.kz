import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const config = "dist/server/wrangler.json";
if (!existsSync(config)) throw new Error("BACKUP_SMOKE_BUILD_REQUIRED");

function wrangler(args) {
  return execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const working = mkdtempSync(join(tmpdir(), "orbita-30-backup-"));
const restoreState = join(working, "restore-state");
const backupFile = join(working, "d1-backup.sql");
const localState = join(root, "dist", "server", ".wrangler", "state");
try {
  // `wrangler d1 export` uses the standard local state path (unlike d1 execute,
  // it has no --persist-to flag). This path is generated and disposable.
  rmSync(localState, { recursive: true, force: true });
  for (const migration of ["0000_tired_satana.sql", "0001_futuristic_zeigeist.sql", "0002_brown_vargas.sql", "0003_petite_jasper_sitwell.sql", "0004_clean_calypso.sql", "0005_charming_devos.sql", "0006_common_rick_jones.sql", "0007_tough_gorgon.sql"]) {
    wrangler(["d1", "execute", "DB", "--local", "--config", config, "--file", `drizzle/${migration}`]);
  }
  wrangler(["d1", "execute", "DB", "--local", "--config", config, "--command", "INSERT OR REPLACE INTO users (id,email,locale,created_at,updated_at) VALUES ('backup_smoke','backup@local.invalid','ru',1,1)"]);
  wrangler(["d1", "export", "DB", "--local", "--config", config, "--output", backupFile, "--skip-confirmation"]);
  if (!existsSync(backupFile) || readFileSync(backupFile, "utf8").length < 100) throw new Error("BACKUP_EXPORT_EMPTY");
  wrangler(["d1", "execute", "DB", "--local", "--config", config, "--persist-to", restoreState, "--file", backupFile]);
  const result = wrangler(["d1", "execute", "DB", "--local", "--config", config, "--persist-to", restoreState, "--command", "SELECT id,locale FROM users WHERE id = 'backup_smoke'"]);
  if (!result.includes("backup_smoke") || !result.includes("ru")) throw new Error("BACKUP_RESTORE_ROW_MISSING");
  console.log("BACKUP_RESTORE_SMOKE=PASS");
} finally {
  rmSync(localState, { recursive: true, force: true });
  rmSync(working, { recursive: true, force: true });
}
