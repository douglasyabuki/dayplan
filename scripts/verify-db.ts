import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function verify() {
  const { getPrisma } = await import("../lib/prisma");
  const prisma = getPrisma();
  try {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    console.log(
      JSON.stringify({ connected: rows[0]?.ok === 1, prismaMajor: 7 }),
    );
  } catch {
    console.error(
      "Database verification failed. Check the server connection settings.",
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void verify();
