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

        if (kind === "preview" || kind === "pdf") {
          const pdf = new jsPDF({ unit: "mm", format: "a4" });
          pdf.setDrawColor(23, 50, 82);
          pdf.roundedRect(10, 10, 190, 277, 2, 2);

          // Header: Manager on Duty bên trái
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.text("Manager on Duty", 15, 20);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11);
          pdf.text(row.manager || "", 15, 27);
          pdf.setDrawColor(203, 213, 225);
          pdf.line(15, 29, 75, 29); // Đường gạch chân dưới manager

          // Header: Box TOTAL bên phải
          pdf.setFillColor(253, 224, 71); // bg-yellow-300
          pdf.setDrawColor(23, 50, 82);
          pdf.roundedRect(162, 16, 28, 16, 1, 1, "F");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.text("TOTAL", 176, 21, { align: "center" });
          pdf.setFontSize(13);
          pdf.text(money(row.total), 176, 28, { align: "center" });

          // Đường kẻ ngang phân cách header
          pdf.setLineWidth(0.5);
          pdf.setDrawColor(23, 50, 82);
          pdf.line(15, 36, 195, 36);

          // Grid 2x2: Hàng 1 (Date, Time) | Hàng 2 (Drawer, Cashier)
          pdf.setLineWidth(0.2);
          pdf.setDrawColor(100, 116, 139); // border-slate-500
          const metaGrid = [
            [
              { label: "Date", val: displayDate(row.date) },
              { label: "Time", val: row.time },
            ],
            [
              { label: "Drawer", val: row.drawer || "" },
              { label: "Cashier", val: row.cashier || "" },
            ],
          ];

          let curY = 41;
          metaGrid.forEach((rowCells) => {
            rowCells.forEach((cell, idx) => {
              const xPos = idx === 0 ? 15 : 105;
              pdf.rect(xPos, curY, 90, 13);
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(8);
              pdf.text(cell.label, xPos + 3, curY + 4.5);
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(9.5);
              pdf.text(cell.val, xPos + 3, curY + 10);
            });
            curY += 13;
          });

          // Bảng chi tiết Tiền xu và Tiền giấy
          const draw = (
            x: number,
            title: string,
            heads: string[],
            rows: string[][],
          ) => {
            let yy = 74;
            const width = 85;
            const cw = width / heads.length;
            pdf.setFillColor(220, 229, 240);
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

          if (kind === "preview")
            window.open(pdf.output("bloburl"), "_blank", "noopener,noreferrer");
          else pdf.save(`cash-drawer-${row.id}.pdf`);
        }

        if (kind === "image") {
          const canvas = document.createElement("canvas");
          canvas.width = 1200;
          canvas.height = 1450;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");

          // Nền và khung bao
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 1200, 1450);
          ctx.strokeStyle = "#173252";
          ctx.lineWidth = 3;
          ctx.strokeRect(25, 25, 1150, 1400);

          // Header: Manager on Duty bên trái
          ctx.fillStyle = "#071933";
          ctx.font = "bold 22px Arial";
          ctx.fillText("Manager on Duty", 65, 80);
          ctx.font = "24px Arial";
          ctx.fillText(row.manager || "", 65, 120);
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(65, 130);
          ctx.lineTo(350, 130);
          ctx.stroke();

          // Header: TOTAL vàng bên phải
          ctx.fillStyle = "#fde047"; // bg-yellow-300
          ctx.fillRect(940, 50, 190, 95);
          ctx.fillStyle = "#071933";
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "center";
          ctx.fillText("TOTAL", 1035, 80);
          ctx.font = "bold 32px Arial";
          ctx.fillText(money(row.total), 1035, 122);
          ctx.textAlign = "left";

          // Đường kẻ phân cách Header
          ctx.strokeStyle = "#173252";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(65, 175);
          ctx.lineTo(1135, 175);
          ctx.stroke();

          // Khung Grid 2x2 (Date, Time, Drawer, Cashier)
          const boxX = 65;
          const boxY = 205;
          const boxW = 1070;
          const colW = boxW / 2;
          const rowH = 75;

          ctx.strokeStyle = "#64748b"; // border-slate-500
          ctx.lineWidth = 2;
          ctx.strokeRect(boxX, boxY, boxW, rowH * 2);

          // Kẻ dọc chia 2 cột & kẻ ngang chia 2 hàng
          ctx.beginPath();
          ctx.moveTo(boxX + colW, boxY);
          ctx.lineTo(boxX + colW, boxY + rowH * 2);
          ctx.moveTo(boxX, boxY + rowH);
          ctx.lineTo(boxX + boxW, boxY + rowH);
          ctx.stroke();

          const gridFields = [
            { label: "Date", val: displayDate(row.date), col: 0, r: 0 },
            { label: "Time", val: row.time, col: 1, r: 0 },
            { label: "Drawer", val: row.drawer || "", col: 0, r: 1 },
            { label: "Cashier", val: row.cashier || "", col: 1, r: 1 },
          ];

          gridFields.forEach(({ label, val, col, r }) => {
            const startX = boxX + col * colW + 20;
            const startY = boxY + r * rowH;
            ctx.fillStyle = "#071933";
            ctx.font = "bold 16px Arial";
            ctx.fillText(label, startX, startY + 28);
            ctx.font = "20px Arial";
            ctx.fillText(val, startX, startY + 58);
          });

          // Tiêu đề bảng tiền
          ctx.font = "bold 24px Arial";
          ctx.fillText("COINS", 65, 410);
          ctx.fillText("BILLS", 650, 410);

          ctx.font = "18px Arial";
          coinInfo.forEach((c, index) => {
            const lineTotal =
              (coins[c.key]?.rolled ?? 0) * c.rollValue +
              (coins[c.key]?.loose ?? 0) * c.looseValue;
            ctx.fillText(
              `${c.label}   Rolls: ${coins[c.key]?.rolled ?? 0}   Loose: ${coins[c.key]?.loose ?? 0}   ${money(lineTotal)}`,
              65,
              460 + index * 55,
            );
          });

          billInfo.forEach((b, index) => {
            const lineTotal = (bills[b.key] ?? 0) * b.value;
            ctx.fillText(
              `$${b.value}   Qty: ${bills[b.key] ?? 0}   ${money(lineTotal)}`,
              650,
              460 + index * 55,
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

        if (kind === "excel") {
          const cell = (v: unknown) =>
            `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
          const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Cash Count"><Table><Row>${cell("Manager on Duty")}${cell(row.manager)}${cell("")}${cell("TOTAL")}${cell(money(row.total))}</Row><Row>${cell("Date")}${cell(displayDate(row.date))}${cell("Time")}${cell(row.time)}</Row><Row>${cell("Drawer")}${cell(row.drawer)}${cell("Cashier")}${cell(row.cashier)}</Row><Row>${cell("COINS")}</Row><Row>${cell("Denomination")}${cell("Rolls")}${cell("Loose")}${cell("Line Total")}</Row>${coinInfo.map((c) => `<Row>${cell(c.label)}${cell(coins[c.key]?.rolled ?? 0)}${cell(coins[c.key]?.loose ?? 0)}${cell(money((coins[c.key]?.rolled ?? 0) * c.rollValue + (coins[c.key]?.loose ?? 0) * c.looseValue))}</Row>`).join("")}<Row>${cell("BILLS")}</Row><Row>${cell("Denomination")}${cell("Quantity")}${cell("Line Total")}</Row>${billInfo.map((b) => `<Row>${cell(`$${b.value}`)}${cell(bills[b.key] ?? 0)}${cell(money((bills[b.key] ?? 0) * b.value))}</Row>`).join("")}</Table></Worksheet></Workbook>`;
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
          <div className="mb-6 flex items-start justify-between border-b-2 border-slate-800 pb-3">
            <div>
              {" "}
              <label className="border-b border-slate-500 p-2">
                <span className="font-bold">Manager on Duty</span>
                <input
                  value={form.manager}
                  onChange={(e) =>
                    setForm({ ...form, manager: e.target.value })
                  }
                  className="mt-1 w-fit border-b border-slate-300 bg-transparent px-1 py-1"
                />
              </label>
            </div>

            <div className="rounded bg-yellow-300 px-4 py-2 text-right">
              <p className="text-xs font-bold uppercase">Total</p>
              <output className="text-2xl font-black">{money(total)}</output>
            </div>
          </div>
          <section className="grid grid-cols-2 border border-slate-500 text-sm">
            {/* Hàng 1: Date & Time */}
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
            <label className="border-b border-slate-500 p-2">
              <span className="font-bold">Time</span>
              <input
                required
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="mt-1 w-full border-b border-slate-300 bg-transparent px-1 py-1"
              />
            </label>

            {/* Hàng 2: Drawer & Cashier */}
            <label className="border-r border-slate-500 p-2">
              <span className="font-bold">Drawer</span>
              <input
                value={form.drawer}
                onChange={(e) => setForm({ ...form, drawer: e.target.value })}
                className="mt-1 w-full border-b border-slate-300 bg-transparent px-1 py-1"
              />
            </label>
            <label className="p-2">
              <span className="font-bold">Cashier</span>
              <input
                value={form.cashier}
                onChange={(e) => setForm({ ...form, cashier: e.target.value })}
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
                    <span className="block text-xs font-normal text-slate-500">
                      ${coin.rollValue}/roll · ${coin.looseValue}/each
                    </span>
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
