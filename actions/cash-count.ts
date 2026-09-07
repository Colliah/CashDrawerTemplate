"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const quantity = z.coerce.number().finite().nonnegative();
const coinsSchema = z.object({
  quarters: z.object({ rolled: quantity, loose: quantity }),
  dimes: z.object({ rolled: quantity, loose: quantity }),
  nickels: z.object({ rolled: quantity, loose: quantity }),
  pennies: z.object({ rolled: quantity, loose: quantity }),
});
const billsSchema = z.object({
  "100": quantity, "50": quantity, "20": quantity, "10": quantity,
  "5": quantity, "2": quantity, "1": quantity,
});
const cashCountSchema = z.object({
  date: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/, "Use M/D/YYYY for the date."),
  time: z.string().min(1).max(32),
  drawer: z.string().max(120).optional(),
  manager: z.string().max(120).optional(),
  cashier: z.string().max(120).optional(),
  coins: coinsSchema,
  bills: billsSchema,
  total: z.coerce.number().finite().nonnegative(),
});

export type CashCountInput = z.infer<typeof cashCountSchema>;

async function currentUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createCashCount(input: CashCountInput) {
  const userId = await currentUserId();
  const data = cashCountSchema.parse(input);
  const record = await prisma.cashCount.create({
    data: {
      ...data,
      drawer: data.drawer || null,
      manager: data.manager || null,
      cashier: data.cashier || null,
      userId,
    },
    select: { id: true, date: true, time: true, total: true, createdAt: true },
  });
  revalidatePath("/");
  return record;
}

export async function deleteCashCount(id: string) {
  const userId = await currentUserId();
  // userId is deliberately included in the unique-looking delete filter.
  // This makes another user's id a harmless no-op rather than a deletion.
  await prisma.cashCount.deleteMany({ where: { id, userId } });
  revalidatePath("/");
}

export async function exportCashCounts() {
  const userId = await currentUserId();
  const rows = await prisma.cashCount.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, date: true, time: true, drawer: true, manager: true, cashier: true,
      coins: true, bills: true, total: true, createdAt: true,
    },
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Reads one record only after proving it belongs to the signed-in user. */
export async function getCashCountForExport(id: string) {
  const userId = await currentUserId();
  const row = await prisma.cashCount.findFirst({
    where: { id, userId },
    select: {
      id: true, date: true, time: true, drawer: true, manager: true, cashier: true,
      coins: true, bills: true, total: true, createdAt: true,
    },
  });
  if (!row) throw new Error("Record not found");
  return { ...row, createdAt: row.createdAt.toISOString() };
}
