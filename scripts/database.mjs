import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const [database, command, ...args] = process.argv.slice(2);

if (
  !["local", "prisma"].includes(database) ||
  !["dev", "check", "migrate"].includes(command)
) {
  console.error(
    "Usage: node scripts/database.mjs <local|prisma> <dev|check|migrate> [args]",
  );
  process.exit(1);
}

// Set this before loading Next's environment so neither the CLI nor the server
// can fall back to a hosted DATABASE_URL from an existing environment file.
process.env.NODE_ENV = "development";
if (database === "local") {
  process.env.DATABASE_URL =
    "postgresql://dayplan:dayplan@127.0.0.1:5433/dayplan?schema=public";
}
nextEnv.loadEnvConfig(root, true);

if (!process.env.DATABASE_URL) {
  console.error(
    "Set DATABASE_URL in .env.development.local for Prisma Postgres.",
  );
  process.exit(1);
}

async function run(executable, commandArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, commandArgs, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);

    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      cleanup();
      if (code === 0) resolve();
      else if (signal) process.exit(signal === "SIGINT" ? 130 : 143);
      else process.exit(code ?? 1);
    });
  });
}

const prisma = (...prismaArgs) =>
  run(process.execPath, [
    require.resolve("prisma/build/index.js"),
    ...prismaArgs,
  ]);

try {
  console.log(
    `Using ${database === "local" ? "local Docker Postgres" : "configured Prisma Postgres"}.`,
  );

  if (database === "local") {
    await run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
  }

  if (command === "dev" || command === "check") {
    await prisma("generate");
  }
  if (command === "migrate" || (database === "local" && command === "dev")) {
    await prisma("migrate", "deploy", ...(command === "migrate" ? args : []));
  }
  if (command === "check") {
    await run(process.execPath, [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/verify-db.ts",
      ...args,
    ]);
  }
  if (command === "dev") {
    await run(process.execPath, [
      require.resolve("next/dist/bin/next"),
      "dev",
      ...args,
    ]);
  }
} catch (error) {
  console.error(`Database command failed: ${error.message}`);
  process.exitCode = 1;
}
