import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

const globalPrisma = globalThis as unknown as { dayplanPrisma?: PrismaClient };

/**
 * Returns one PostgreSQL client per server process, including during hot reload.
 * @returns {PrismaClient} The shared adapter-backed client; throws if DATABASE_URL is missing.
 * @example const rows = await getPrisma().$queryRaw`SELECT 1`;
 */
export function getPrisma(): PrismaClient {
  if (globalPrisma.dayplanPrisma) return globalPrisma.dayplanPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  globalPrisma.dayplanPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  return globalPrisma.dayplanPrisma;
}
