import { env } from "@libra-ai/env/server";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../prisma/generated/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
	});

globalForPrisma.prisma = prisma;

export default prisma;
