// Database step of the Vercel build: apply migrations and the seed — ONLY for production builds.
// Preview builds (any pushed branch) share the production database settings, so they must never
// change the live database: they build the app and skip this step.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined (not on Vercel)
if (env && env !== "production") {
  console.log(`[db-deploy] ${env} build: skipping migrations and seed (the live database is not touched).`);
  process.exit(0);
}
const run = (cmd, extra = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extra } });
run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts", { SEED_SKIP_ADMIN: "1" });
