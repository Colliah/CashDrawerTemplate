import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CashDrawerDashboard } from "@/components/cash-drawer-dashboard";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const history = await prisma.cashCount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, date: true, time: true, drawer: true, manager: true, cashier: true, coins: true, bills: true, total: true, createdAt: true },
  });
  return <CashDrawerDashboard user={session.user} initialHistory={history.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />;
}
