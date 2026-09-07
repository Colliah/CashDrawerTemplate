"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { jsPDF } from "jspdf";
import {
  createCashCount,
  deleteCashCount,
  exportCashCounts,
  getCashCountForExport,
  type CashCountInput,
} from "@/actions/cash-count";
import { authClient } from "@/lib/auth-client";

type HistoryEntry = {
  id: string;
  date: string;
  time: string;
  drawer: string | null;
  manager: string | null;
  cashier: string | null;
  coins: unknown;
  bills: unknown;
  total: number;
  createdAt: string;
};
type Props = {
  user: { email: string; image?: string | null; name?: string | null };
  initialHistory: HistoryEntry[];
};
type Coin = "quarters" | "dimes" | "nickels" | "pennies";
type Bill = "100" | "50" | "20" | "10" | "5" | "2" | "1";

const coinInfo: {
  key: Coin;
  label: string;
  rollValue: number;
  looseValue: number;
}[] = [
  { key: "quarters", label: "Quarters", rollValue: 10, looseValue: 0.25 },
  { key: "dimes", label: "Dimes", rollValue: 5, looseValue: 0.1 },
  { key: "nickels", label: "Nickels", rollValue: 2, looseValue: 0.05 },
  { key: "pennies", label: "Pennies", rollValue: 0.5, looseValue: 0.01 },
];
const billInfo: { key: Bill; value: number }[] = [
  { key: "100", value: 100 },
  { key: "50", value: 50 },
  { key: "20", value: 20 },
  { key: "10", value: 10 },
  { key: "5", value: 5 },
  { key: "2", value: 2 },
  { key: "1", value: 1 },
];

function blankCount(): CashCountInput {
  const now = new Date();
  return {
    date: `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`,
    time: now.toTimeString().slice(0, 5),
    drawer: "",
    manager: "",
    cashier: "",
    total: 0,
    coins: {
      quarters: { rolled: 0, loose: 0 },
      dimes: { rolled: 0, loose: 0 },
      nickels: { rolled: 0, loose: 0 },
      pennies: { rolled: 0, loose: 0 },
    },
    bills: { "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "2": 0, "1": 0 },
  };
}
const money = (number: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    number,
  );
const escapeCsv = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
const displayDate = (value: string) =>
  value.includes("/")
    ? value
    : value
        .split("-")
        .reverse()
        .map((item) => Number(item))
        .join("/");
const xmlEscape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function CashDrawerDashboard({ user, initialHistory }: Props) {
  const [form, setForm] = useState<CashCountInput>(blankCount);
  const [history, setHistory] = useState(initialHistory);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = useMemo(() => {
    const coins = coinInfo.reduce(
      (sum, c) =>
        sum +
        form.coins[c.key].rolled * c.rollValue +
        form.coins[c.key].loose * c.looseValue,
      0,
    );
    return (
      coins + billInfo.reduce((sum, b) => sum + form.bills[b.key] * b.value, 0)
    );
  }, [form.coins, form.bills]);

  function number(value: string) {
    return Math.max(0, Number(value) || 0);
  }
  function updateCoin(coin: Coin, part: "rolled" | "loose", value: string) {
    setForm((previous) => ({
      ...previous,
      coins: {
        ...previous.coins,
        [coin]: { ...previous.coins[coin], [part]: number(value) },
      },
    }));
  }
  function updateBill(bill: Bill, value: string) {
    setForm((previous) => ({
      ...previous,
      bills: { ...previous.bills, [bill]: number(value) },
    }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        const saved = await createCashCount({ ...form, total });
        setHistory((old) => [
          {
            id: saved.id,
            date: saved.date,
            time: saved.time,
            drawer: form.drawer || null,
            manager: form.manager || null,
            cashier: form.cashier || null,
            coins: form.coins,
            bills: form.bills,
            total: saved.total,
            createdAt: saved.createdAt.toISOString(),
          },
          ...old,
        ]);
        setForm(blankCount());
        setMessage("Cash count saved.");
        window.setTimeout(() => setMessage(null), 3500);
      } catch {
        setMessage("Could not save this count. Please try again.");
      }
    });
  }
  function remove(id: string) {
    if (
      !window.confirm(
        "Delete this cash-count record? This action cannot be undone.",
      )
    )
      return;
    const prior = history;
    setHistory((old) => old.filter((row) => row.id !== id));
    startTransition(async () => {
      try {
        await deleteCashCount(id);
      } catch {
        setHistory(prior);
        setMessage("Could not delete that record.");
      }
    });
  }
  function exportCsv() {
    startTransition(async () => {
      try {
        const rows = await exportCashCounts();
        const heading = [
          "Date",
          "Time",
          "Drawer",
          "Manager",
          "Cashier",
          "Total",
          "Coins",
          "Bills",
          "Created at",
        ];
        const csv = [
          heading,
          ...rows.map((row) => [
            row.date,
            row.time,
            row.drawer,
            row.manager,
            row.cashier,
            row.total,
            JSON.stringify(row.coins),
            JSON.stringify(row.bills),
            row.createdAt,
          ]),
        ]
          .map((row) => row.map(escapeCsv).join(","))
          .join("\n");
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "cash-drawer-history.csv";
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        setMessage("Could not export your history.");
      }
    });
  }
  function exportRecord(
    id: string,
    kind: "preview" | "pdf" | "image" | "excel",
  ) {
    const popup = null as Window | null;
    startTransition(async () => {
      try {
        const row = await getCashCountForExport(id);
        const coins = row.coins as Record<
          string,
          { rolled: number; loose: number }
        >;
        const bills = row.bills as Record<string, number>;

        // ==================== 1. PREVIEW & PDF ====================
        if (kind === "preview" || kind === "pdf") {
          const pdf = new jsPDF({ unit: "mm", format: "a4" });
          
          // Viền bao ngoài thẻ cash-slip
          pdf.setDrawColor(23, 50, 82);
          pdf.setLineWidth(0.6);
          pdf.roundedRect(10, 10, 190, 277, 2, 2);

          // Header - Cột trái: Manager on Duty & Cashier
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(51, 65, 85);
          pdf.text("Manager on Duty", 15, 18);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9.5);
          pdf.setTextColor(15, 23, 42);
          pdf.text(row.manager || "", 15, 23);
          pdf.setDrawColor(148, 163, 184);
          pdf.setLineWidth(0.2);
          pdf.line(15, 24.5, 95, 24.5);

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(51, 65, 85);
          pdf.text("Cashier", 15, 29.5);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9.5);
          pdf.setTextColor(15, 23, 42);
          pdf.text(row.cashier || "", 15, 34.5);
          pdf.line(15, 36, 95, 36);

          // Header - Cột phải: Box TOTAL màu vàng
          pdf.setFillColor(253, 224, 71); // bg-yellow-300
          pdf.setDrawColor(23, 50, 82);
          pdf.setLineWidth(0.3);
          pdf.roundedRect(155, 15, 35, 21, 1.5, 1.5, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(30, 41, 59);
          pdf.text("TOTAL", 172.5, 21, { align: "center" });
          pdf.setFontSize(13);
          pdf.setTextColor(2, 6, 23);
          pdf.text(money(row.total), 172.5, 30, { align: "center" });

          // Đường kẻ ngang ngăn cách header
          pdf.setLineWidth(0.5);
          pdf.setDrawColor(23, 50, 82);
          pdf.line(15, 41, 195, 41);

          // Section 3 CỘT: Date | Time | Drawer
          pdf.setLineWidth(0.25);
          pdf.setDrawColor(100, 116, 139); // border-slate-500
          const threeCols = [
            { label: "Date", val: displayDate(row.date) },
            { label: "Time", val: row.time },
            { label: "Drawer", val: row.drawer || "" },
          ];

          const startX = 15;
          const colW = 180 / 3; // 60mm mỗi cột
          const secY = 46;
          const secH = 14;

          threeCols.forEach((col, idx) => {
            const x = startX + idx * colW;
            pdf.rect(x, secY, colW, secH);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(8);
            pdf.setTextColor(15, 23, 42);
            pdf.text(col.label, x + 3, secY + 4.5);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9.5);
            pdf.text(col.val, x + 3, secY + 10.5);
          });

          // Bảng COINS & BILLS
          const draw = (
            x: number,
            title: string,
            heads: string[],
            rows: string[][],
          ) => {
            let yy = 67;
            const width = 85;
            const cw = width / heads.length;

            pdf.setFillColor(226, 232, 240); // bg-slate-200
            pdf.rect(x, yy, width, 8, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.text(title, x + 3, yy + 5.5);
            yy += 8;

            pdf.setFontSize(7);
            heads.forEach((head, i) => {
              pdf.rect(x + i * cw, yy, cw, 7);
              pdf.text(head, x + i * cw + 1.5, yy + 4.5);
            });
            yy += 7;

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(8);
            rows.forEach((cells) => {
              cells.forEach((cell, i) => {
                pdf.rect(x + i * cw, yy, cw, 9.5);
                pdf.text(cell, x + i * cw + 1.5, yy + 6);
              });
              yy += 9.5;
            });
          };

          draw(
            15,
            "COINS",
            ["DENOMINATION", "ROLLS", "LOOSE", "LINE TOTAL"],
            coinInfo.map((c) => [
              c.label,
              String(coins[c.key]?.rolled ?? 0),
              String(coins[c.key]?.loose ?? 0),
              money(
                (coins[c.key]?.rolled ?? 0) * c.rollValue +
                  (coins[c.key]?.loose ?? 0) * c.looseValue,
              ),
            ]),
          );

          draw(
            110,
            "BILLS",
            ["DENOMINATION", "QUANTITY", "LINE TOTAL"],
            billInfo.map((b) => [
              `$${b.value}`,
              String(bills[b.key] ?? 0),
              money((bills[b.key] ?? 0) * b.value),
            ]),
          );

          if (kind === "preview") {
            window.open(pdf.output("bloburl"), "_blank", "noopener,noreferrer");
          } else {
            pdf.save(`cash-drawer-${row.id}.pdf`);
          }
        }

        // ==================== 2. IMAGE (CANVAS) ====================
        if (kind === "image") {
          const canvas = document.createElement("canvas");
          canvas.width = 1200;
          canvas.height = 1450;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");

          // Nền trắng và khung bao
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 1200, 1450);
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 3;
          ctx.strokeRect(25, 25, 1150, 1400);

          // Header - Trái: Manager on Duty & Cashier
          ctx.fillStyle = "#334155";
          ctx.font = "bold 15px Arial";
          ctx.fillText("Manager on Duty", 65, 75);
          ctx.fillStyle = "#0f172a";
          ctx.font = "19px Arial";
          ctx.fillText(row.manager || "", 65, 105);
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(65, 115);
          ctx.lineTo(600, 115);
          ctx.stroke();

          ctx.fillStyle = "#334155";
          ctx.font = "bold 15px Arial";
          ctx.fillText("Cashier", 65, 150);
          ctx.fillStyle = "#0f172a";
          ctx.font = "19px Arial";
          ctx.fillText(row.cashier || "", 65, 180);
          ctx.beginPath();
          ctx.moveTo(65, 190);
          ctx.lineTo(600, 190);
          ctx.stroke();

          // Header - Phải: TOTAL
          ctx.fillStyle = "#fde047";
          ctx.fillRect(920, 60, 215, 125);
          ctx.fillStyle = "#1e293b";
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "center";
          ctx.fillText("TOTAL", 1027, 95);
          ctx.fillStyle = "#020617";
          ctx.font = "bold 32px Arial";
          ctx.fillText(money(row.total), 1027, 145);
          ctx.textAlign = "left";

          // Đường kẻ header
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(65, 220);
          ctx.lineTo(1135, 220);
          ctx.stroke();

          // Lưới 3 CỘT: Date | Time | Drawer
          const boxX = 65;
          const boxY = 245;
          const boxW = 1070;
          const colW = boxW / 3;
          const boxH = 80;

          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 2;
          ctx.strokeRect(boxX, boxY, boxW, boxH);

          // Kẻ dọc phân 3 cột
          ctx.beginPath();
          ctx.moveTo(boxX + colW, boxY);
          ctx.lineTo(boxX + colW, boxY + boxH);
          ctx.moveTo(boxX + colW * 2, boxY);
          ctx.lineTo(boxX + colW * 2, boxY + boxH);
          ctx.stroke();

          const threeCols = [
            { label: "Date", val: displayDate(row.date) },
            { label: "Time", val: row.time },
            { label: "Drawer", val: row.drawer || "" },
          ];

          threeCols.forEach((col, idx) => {
            const startColX = boxX + idx * colW + 18;
            ctx.fillStyle = "#0f172a";
            ctx.font = "bold 16px Arial";
            ctx.fillText(col.label, startColX, boxY + 30);
            ctx.font = "18px Arial";
            ctx.fillText(col.val, startColX, boxY + 62);
          });

          // Tiêu đề bảng tiền
          ctx.font = "bold 24px Arial";
          ctx.fillText("COINS", 65, 380);
          ctx.fillText("BILLS", 650, 380);

          ctx.font = "18px Arial";
          coinInfo.forEach((c, index) => {
            const lineTotal =
              (coins[c.key]?.rolled ?? 0) * c.rollValue +
              (coins[c.key]?.loose ?? 0) * c.looseValue;
            ctx.fillText(
              `${c.label}   Rolls: ${coins[c.key]?.rolled ?? 0}   Loose: ${coins[c.key]?.loose ?? 0}   ${money(lineTotal)}`,
              65,
              430 + index * 55,
            );
          });

          billInfo.forEach((b, index) => {
            const lineTotal = (bills[b.key] ?? 0) * b.value;
            ctx.fillText(
              `$${b.value}   Qty: ${bills[b.key] ?? 0}   ${money(lineTotal)}`,
              650,
              430 + index * 55,
            );
          });

          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `cash-drawer-${row.id}.png`;
            link.click();
            URL.revokeObjectURL(url);
          }, "image/png");
        }

        // ==================== 3. EXCEL ====================
        if (kind === "excel") {
          const cell = (v: unknown) =>
            `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
          const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Cash Count"><Table><Row>${cell("Manager on Duty")}${cell(row.manager)}${cell("")}${cell("TOTAL")}${cell(money(row.total))}</Row><Row>${cell("Cashier")}${cell(row.cashier)}</Row><Row>${cell("Date")}${cell(displayDate(row.date))}${cell("Time")}${cell(row.time)}${cell("Drawer")}${cell(row.drawer)}</Row><Row>${cell("COINS")}</Row><Row>${cell("Denomination")}${cell("Rolls")}${cell("Loose")}${cell("Line Total")}</Row>${coinInfo.map((c) => `<Row>${cell(c.label)}${cell(coins[c.key]?.rolled ?? 0)}${cell(coins[c.key]?.loose ?? 0)}${cell(money((coins[c.key]?.rolled ?? 0) * c.rollValue + (coins[c.key]?.loose ?? 0) * c.looseValue))}</Row>`).join("")}<Row>${cell("BILLS")}</Row><Row>${cell("Denomination")}${cell("Quantity")}${cell("Line Total")}</Row>${billInfo.map((b) => `<Row>${cell(`$${b.value}`)}${cell(bills[b.key] ?? 0)}${cell(money((bills[b.key] ?? 0) * b.value))}</Row>`).join("")}</Table></Worksheet></Workbook>`;
          const url = URL.createObjectURL(
            new Blob([xml], { type: "application/vnd.ms-excel" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `cash-drawer-${row.id}.xls`;
          link.click();
          URL.revokeObjectURL(url);
        }
      } catch {
        popup?.close();
        setMessage("Could not export that record.");
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex items-center gap-3 text-sm justify-end sm:p-4">
        <span className="hidden sm:block">{user.email}</span>
        <button
          className="rounded border px-3 py-1.5 hover:bg-slate-100"
          onClick={async () => {
            await authClient.signOut();
            window.location.assign("/login");
          }}
        >
          Sign Out
        </button>
      </div>
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <form
          onSubmit={save}
          className="cash-slip rounded-lg border-2 border-slate-800 bg-white p-4 shadow-sm sm:p-7"
        >
          <div className="mb-6 flex items-stretch justify-between gap-3 border-b-2 border-slate-800 pb-3">
            <div className="flex flex-1 flex-col justify-between gap-2.5 min-w-0">
              <label className="flex flex-col text-xs sm:text-sm">
                <span className="font-bold text-slate-700">
                  Manager on Duty
                </span>
                <input
                  value={form.manager}
                  onChange={(e) =>
                    setForm({ ...form, manager: e.target.value })
                  }
                  className="mt-0.5 w-full border-b border-slate-400 bg-transparent px-1 py-1 font-medium focus:border-slate-800 focus:outline-none"
                  placeholder="Name..."
                />
              </label>

              <label className="flex flex-col text-xs sm:text-sm">
                <span className="font-bold text-slate-700">Cashier</span>
                <input
                  value={form.cashier}
                  onChange={(e) =>
                    setForm({ ...form, cashier: e.target.value })
                  }
                  className="mt-0.5 w-full border-b border-slate-400 bg-transparent px-1 py-1 font-medium focus:border-slate-800 focus:outline-none"
                  placeholder="Name..."
                />
              </label>
            </div>
            <div className="flex shrink-0 flex-col justify-center rounded-lg bg-yellow-300 px-3 py-2 text-right shadow-xs sm:px-5 sm:py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                Total
              </p>
              <output className="text-xl font-black leading-tight text-slate-950 sm:text-2xl">
                {money(total)}
              </output>
            </div>
          </div>
          <section className="grid grid-cols-3 border border-slate-500 text-sm">
            <label className="border-b border-r border-slate-500 p-2">
              <span className="font-bold">Date</span>
              <input
                required
                inputMode="numeric"
                pattern="\d{1,2}/\d{1,2}/\d{4}"
                placeholder="M/D/YYYY"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 w-full border-b border-slate-300 bg-transparent px-1 py-1"
              />
            </label>
            <label className="border-b border-r border-slate-500 p-2">
              <span className="font-bold">Time</span>
              <input
                required
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="mt-1 w-full border-b border-slate-300 bg-transparent px-1 py-1"
              />
            </label>
            <label className="border-b border-slate-500 p-2">
              <span className="font-bold">Drawer</span>
              <input
                value={form.drawer}
                onChange={(e) => setForm({ ...form, drawer: e.target.value })}
                className="mt-1 w-full border-b border-slate-300 bg-transparent px-1 py-1"
              />
            </label>
          </section>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <DenominationTable
              title="Coins"
              headers={["Denomination", "Rolls", "Loose", "Line total"]}
            >
              {coinInfo.map((coin) => (
                <tr key={coin.key}>
                  <th scope="row" className="text-left font-medium">
                    {coin.label}
                  </th>
                  <td>
                    <Qty
                      value={form.coins[coin.key].rolled}
                      onChange={(v) => updateCoin(coin.key, "rolled", v)}
                    />
                  </td>
                  <td>
                    <Qty
                      value={form.coins[coin.key].loose}
                      onChange={(v) => updateCoin(coin.key, "loose", v)}
                    />
                  </td>
                  <td className="text-right font-semibold">
                    {money(
                      form.coins[coin.key].rolled * coin.rollValue +
                        form.coins[coin.key].loose * coin.looseValue,
                    )}
                  </td>
                </tr>
              ))}
            </DenominationTable>
            <DenominationTable
              title="Bills"
              headers={["Denomination", "Quantity", "", "Line total"]}
            >
              {billInfo.map((bill) => (
                <tr key={bill.key}>
                  <th scope="row" className="text-left font-medium">
                    ${bill.value}
                  </th>
                  <td>
                    <Qty
                      value={form.bills[bill.key]}
                      onChange={(v) => updateBill(bill.key, v)}
                    />
                  </td>
                  <td></td>
                  <td className="text-right font-semibold">
                    {money(form.bills[bill.key] * bill.value)}
                  </td>
                </tr>
              ))}
            </DenominationTable>
          </div>
          <div className="no-print mt-6 flex flex-wrap justify-end gap-3">
            {" "}
            <button
              disabled={pending}
              className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save Record"}
            </button>
          </div>
          {message && (
            <div
              className="fixed bottom-5 right-5 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl"
              role="status"
            >
              {message}
            </div>
          )}
        </form>
        <section className="no-print mt-8 rounded-lg bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Your History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Date / time</th>
                  <th className="p-3">Drawer</th>
                  <th className="p-3">Manager</th>
                  <th className="p-3">Cashier</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr className="border-b" key={row.id}>
                    <td className="p-3">
                      {displayDate(row.date)}{" "}
                      <span className="text-slate-500">{row.time}</span>
                    </td>
                    <td className="p-3">{row.drawer || "—"}</td>
                    <td className="p-3">{row.manager || "—"}</td>
                    <td className="p-3">{row.cashier || "—"}</td>
                    <td className="p-3 text-right font-semibold">
                      {money(row.total)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => exportRecord(row.id, "preview")}
                        className="mr-3 text-blue-700 hover:underline"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => exportRecord(row.id, "pdf")}
                        className="mr-3 text-blue-700 hover:underline"
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => exportRecord(row.id, "image")}
                        className="mr-3 text-blue-700 hover:underline"
                      >
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        className="text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-slate-500" colSpan={6}>
                      No saved counts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Qty({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label="Quantity"
      type="number"
      min="0"
      step="1"
      value={value || ""}
      placeholder="0"
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
    />
  );
}
function DenominationTable({
  title,
  headers,
  children,
}: {
  title: string;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="border border-b-0 border-slate-700 bg-slate-200 px-3 py-2 font-bold uppercase tracking-wide">
        {title}
      </h3>
      <table className="w-full border border-collapse border-slate-700 text-sm">
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th
                className="border border-slate-500 px-2 py-1 text-left text-xs uppercase"
                key={`${header}-${i}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr>th]:border [&>tr>th]:border-slate-400 [&>tr>th]:px-2 [&>tr>th]:py-2 [&>tr>td]:border [&>tr>td]:border-slate-400 [&>tr>td]:px-2 [&>tr>td]:py-2">
          {children}
        </tbody>
      </table>
    </section>
  );
}
