/**
 * Labour Charges export
 *
 * - Excel (.xlsx): a "Summary" sheet + ONE SHEET PER LABOUR. Each labour sheet lists,
 *   date by date, the attendance and the payment made on that date.
 * - PDF (portrait A4): same content, each labour starts on a new page.
 */

export type LabourWorker = {
  id: string;
  name: string;
  phone: string | null;
  daily_wage: number;
};

type AttStatus = "present" | "absent" | "holiday";
type DayType = "full" | "half" | "ot";

export type AttendanceRecord = {
  work_date: string; // YYYY-MM-DD
  status: AttStatus;
  day_type: DayType | null;
  note: string | null;
};

export type PaymentRecord = {
  amount: number;
  note: string | null;
  paid_at: string; // ISO timestamp
};

export type LabourData = {
  worker: LabourWorker;
  attendance: AttendanceRecord[];
  payments: PaymentRecord[];
};

/** One line of a labour's ledger = one calendar date. */
export type LedgerRow = {
  date: string; // YYYY-MM-DD
  day: string; // Mon, Tue...
  attendance: string; // Present / Absent / Holiday / "-"
  dayType: string; // Full day / Half day / Overtime / ""
  earned: number;
  paid: number;
  note: string;
  balance: number; // running: earned - paid (positive = still to pay)
};

export type LedgerSummary = {
  present: number;
  absent: number;
  holiday: number;
  workUnits: number;
  earned: number;
  paid: number;
  balance: number;
};

export type Ledger = { rows: LedgerRow[]; summary: LedgerSummary };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_LABEL: Record<AttStatus, string> = {
  present: "Present",
  absent: "Absent",
  holiday: "Holiday",
};
const DAY_TYPE_LABEL: Record<DayType, string> = {
  full: "Full day",
  half: "Half day",
  ot: "Overtime (OT)",
};
// Same factors as the worker page (labour/$id.tsx)
const DAY_TYPE_FACTOR: Record<DayType, number> = { full: 1, half: 0.5, ot: 0.25 };

const stamp = () => new Date().toISOString().slice(0, 10);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
};

const fmtDate = (s: string) => {
  const { y, m, d } = parseYmd(s);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${String(d).padStart(2, "0")} ${mon} ${y}`;
};

const rs = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

const slug = (s: string) => s.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();

/** Excel sheet names: max 31 chars, none of  \ / ? * [ ] :  and must be unique. */
function uniqueSheetNames(names: string[]): string[] {
  const used = new Set<string>(["summary"]);
  return names.map((raw) => {
    const base = (raw.replace(/[\\/?*[\]:]/g, " ").trim() || "Labour").slice(0, 31);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${n++})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/* ------------------------------------------------------------------ */
/* Ledger builder — merges attendance + payments per date              */
/* ------------------------------------------------------------------ */

export function buildLedger({ worker, attendance, payments }: LabourData): Ledger {
  const wage = Number(worker.daily_wage || 0);
  const attByDate = new Map<string, AttendanceRecord>();
  attendance.forEach((a) => attByDate.set(a.work_date, a));

  const payByDate = new Map<string, { total: number; notes: string[] }>();
  payments.forEach((p) => {
    const k = ymd(new Date(p.paid_at));
    const cur = payByDate.get(k) ?? { total: 0, notes: [] };
    cur.total += Number(p.amount || 0);
    if (p.note?.trim()) cur.notes.push(p.note.trim());
    payByDate.set(k, cur);
  });

  const dates = Array.from(new Set([...attByDate.keys(), ...payByDate.keys()])).sort();

  let balance = 0;
  const summary: LedgerSummary = {
    present: 0,
    absent: 0,
    holiday: 0,
    workUnits: 0,
    earned: 0,
    paid: 0,
    balance: 0,
  };

  const rows: LedgerRow[] = dates.map((date) => {
    const att = attByDate.get(date);
    const pay = payByDate.get(date);
    const { y, m, d } = parseYmd(date);

    let earned = 0;
    let dayType = "";
    if (att) {
      if (att.status === "present") {
        const dt = (att.day_type ?? "full") as DayType;
        const factor = DAY_TYPE_FACTOR[dt] ?? 1;
        earned = factor * wage;
        dayType = DAY_TYPE_LABEL[dt] ?? "";
        summary.present += 1;
        summary.workUnits += factor;
      } else if (att.status === "absent") summary.absent += 1;
      else if (att.status === "holiday") summary.holiday += 1;
    }
    const paid = pay?.total ?? 0;
    balance += earned - paid;
    summary.earned += earned;
    summary.paid += paid;

    const notes = [att?.note?.trim(), ...(pay?.notes ?? [])].filter(Boolean).join(" | ");

    return {
      date,
      day: DAY_NAMES[new Date(y, m - 1, d).getDay()],
      attendance: att ? STATUS_LABEL[att.status] ?? att.status : "-",
      dayType,
      earned,
      paid,
      note: notes,
      balance,
    };
  });

  summary.balance = summary.earned - summary.paid;
  return { rows, summary };
}

/* ------------------------------------------------------------------ */
/* Data fetching (pages past the 1000-row API limit)                   */
/* ------------------------------------------------------------------ */

async function fetchAll<T>(
  table: "worker_attendance" | "worker_payments",
  columns: string,
  workerIds: string[],
): Promise<(T & { worker_id: string })[]> {
  const { supabase } = await import("@/integrations/supabase/client");
  const PAGE = 1000;
  const out: (T & { worker_id: string })[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(`worker_id, ${columns}`)
      .in("worker_id", workerIds)
      .order("worker_id")
      .order(table === "worker_attendance" ? "work_date" : "paid_at")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as (T & { worker_id: string })[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function fetchLabourData(workers: LabourWorker[]): Promise<LabourData[]> {
  if (workers.length === 0) return [];
  const ids = workers.map((w) => w.id);
  const [att, pay] = await Promise.all([
    fetchAll<AttendanceRecord>("worker_attendance", "work_date, status, day_type, note", ids),
    fetchAll<PaymentRecord>("worker_payments", "amount, note, paid_at", ids),
  ]);
  return workers.map((worker) => ({
    worker,
    attendance: att.filter((a) => a.worker_id === worker.id),
    payments: pay.filter((p) => p.worker_id === worker.id),
  }));
}

/* ------------------------------------------------------------------ */
/* Excel — Summary sheet + one sheet per labour                        */
/* ------------------------------------------------------------------ */

const GREEN = "FF166534";
const LIGHT = "FFF3F7F4";

export async function buildLabourXlsx(data: LabourData[]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ledgers = data.map((d) => buildLedger(d));
  const names = uniqueSheetNames(data.map((d) => d.worker.name));

  const headStyle = (row: import("exceljs").Row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { vertical: "middle", horizontal: "center" };
    row.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      c.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
    });
    row.height = 20;
  };

  /* ---------- Summary ---------- */
  const sum = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3 }] });
  sum.mergeCells("A1:H1");
  sum.getCell("A1").value = "Labour Charges — Summary";
  sum.getCell("A1").font = { bold: true, size: 14 };
  sum.getCell("A2").value = `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
  sum.getCell("A2").font = { color: { argb: "FF666666" } };
  sum.columns = [
    { key: "name", width: 26 },
    { key: "sheet", width: 26 },
    { key: "phone", width: 16 },
    { key: "wage", width: 14 },
    { key: "present", width: 14 },
    { key: "earned", width: 16 },
    { key: "paid", width: 16 },
    { key: "balance", width: 16 },
  ];
  const sHead = sum.getRow(3);
  sHead.values = ["Labour", "Sheet", "Mobile", "Daily wage (₹)", "Days present", "Earned (₹)", "Paid (₹)", "Balance (₹)"];
  headStyle(sHead);

  data.forEach((d, i) => {
    const s = ledgers[i].summary;
    const r = sum.addRow([
      d.worker.name,
      names[i],
      d.worker.phone ?? "",
      Number(d.worker.daily_wage || 0),
      s.workUnits,
      s.earned,
      s.paid,
      s.balance,
    ]);
    r.getCell(2).value = { text: names[i], hyperlink: `#'${names[i].replace(/'/g, "''")}'!A1` };
    r.getCell(2).font = { color: { argb: "FF1D4ED8" }, underline: true };
    [4, 6, 7, 8].forEach((c) => (r.getCell(c).numFmt = "#,##0"));
    r.getCell(5).numFmt = "0.##";
  });
  const tot = sum.addRow([
    "Total",
    "",
    "",
    "",
    ledgers.reduce((a, l) => a + l.summary.workUnits, 0),
    ledgers.reduce((a, l) => a + l.summary.earned, 0),
    ledgers.reduce((a, l) => a + l.summary.paid, 0),
    ledgers.reduce((a, l) => a + l.summary.balance, 0),
  ]);
  tot.font = { bold: true };
  [6, 7, 8].forEach((c) => (tot.getCell(c).numFmt = "#,##0"));
  tot.getCell(5).numFmt = "0.##";
  tot.eachCell((c) => (c.border = { top: { style: "thin" } }));

  /* ---------- One sheet per labour ---------- */
  data.forEach((d, i) => {
    const { rows, summary } = ledgers[i];
    const ws = wb.addWorksheet(names[i], { views: [{ state: "frozen", ySplit: 5 }] });
    ws.columns = [
      { key: "date", width: 14 },
      { key: "day", width: 8 },
      { key: "att", width: 13 },
      { key: "type", width: 16 },
      { key: "earned", width: 15 },
      { key: "paid", width: 15 },
      { key: "note", width: 36 },
      { key: "balance", width: 15 },
    ];

    ws.mergeCells("A1:H1");
    ws.getCell("A1").value = d.worker.name;
    ws.getCell("A1").font = { bold: true, size: 14 };

    ws.mergeCells("A2:H2");
    ws.getCell("A2").value =
      `${d.worker.phone ? `Mobile: ${d.worker.phone}   |   ` : ""}Daily wage: ₹${Number(d.worker.daily_wage || 0).toLocaleString("en-IN")}`;
    ws.getCell("A2").font = { color: { argb: "FF444444" } };

    ws.mergeCells("A3:H3");
    ws.getCell("A3").value =
      `Present: ${summary.present}   Absent: ${summary.absent}   Holiday: ${summary.holiday}   |   ` +
      `Earned: ₹${summary.earned.toLocaleString("en-IN")}   Paid: ₹${summary.paid.toLocaleString("en-IN")}   Balance: ₹${summary.balance.toLocaleString("en-IN")}`;
    ws.getCell("A3").font = { color: { argb: "FF444444" } };

    const head = ws.getRow(5);
    head.values = ["Date", "Day", "Attendance", "Day type", "Wage earned (₹)", "Payment paid (₹)", "Note", "Balance (₹)"];
    headStyle(head);

    if (rows.length === 0) {
      ws.mergeCells("A6:H6");
      ws.getCell("A6").value = "No attendance or payment records yet.";
      ws.getCell("A6").font = { italic: true, color: { argb: "FF888888" } };
      return;
    }

    rows.forEach((r, k) => {
      const { y, m, d: dd } = parseYmd(r.date);
      const row = ws.addRow([
        new Date(Date.UTC(y, m - 1, dd)), // UTC so the date never shifts with timezone
        r.day,
        r.attendance,
        r.dayType,
        r.earned || null,
        r.paid || null,
        r.note,
        r.balance,
      ]);
      row.getCell(1).numFmt = "dd-mmm-yyyy";
      row.getCell(1).alignment = { horizontal: "left" };
      [5, 6, 8].forEach((c) => (row.getCell(c).numFmt = "#,##0"));
      row.getCell(7).alignment = { wrapText: true, vertical: "top" };

      const att = row.getCell(3);
      if (r.attendance === "Present") att.font = { color: { argb: "FF15803D" } };
      else if (r.attendance === "Absent") att.font = { color: { argb: "FFB91C1C" } };
      else if (r.attendance === "Holiday") att.font = { color: { argb: "FFB45309" } };
      if (r.paid) row.getCell(6).font = { bold: true };

      if (k % 2 === 1) {
        row.eachCell({ includeEmpty: true }, (c) => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
        });
      }
    });

    const total = ws.addRow(["Total", "", `${summary.present} present`, "", summary.earned, summary.paid, "", summary.balance]);
    total.font = { bold: true };
    [5, 6, 8].forEach((c) => (total.getCell(c).numFmt = "#,##0"));
    total.eachCell({ includeEmpty: true }, (c) => (c.border = { top: { style: "medium" } }));

    ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.autoFilter = { from: "A5", to: `H${5 + rows.length}` };
  });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/* ------------------------------------------------------------------ */
/* PDF — portrait A4, each labour starts on a new page                 */
/* ------------------------------------------------------------------ */

export async function buildLabourPdf(data: LabourData[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const M = 10;
  const LH = 3.8;
  const PAD = 1.6;

  // widths add up to 190mm = A4 portrait minus 10mm margins
  const cols: { h: string; w: number; align?: "right" }[] = [
    { h: "Date", w: 24 },
    { h: "Day", w: 11 },
    { h: "Attendance", w: 22 },
    { h: "Day type", w: 22 },
    { h: "Earned", w: 22, align: "right" },
    { h: "Paid", w: 22, align: "right" },
    { h: "Note", w: 39 },
    { h: "Balance", w: 28, align: "right" },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);

  let y = M;

  const drawHeader = () => {
    const h = 7;
    doc.setFillColor(22, 101, 52);
    doc.rect(M, y, tableW, h, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255);
    let x = M;
    for (const c of cols) {
      if (c.align === "right") doc.text(c.h, x + c.w - PAD, y + 4.7, { align: "right" });
      else doc.text(c.h, x + PAD, y + 4.7);
      x += c.w;
    }
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    y += h;
  };

  data.forEach((d, idx) => {
    if (idx > 0) doc.addPage();
    y = M;
    const { rows, summary } = buildLedger(d);

    // ----- Labour title block -----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text(d.worker.name, M, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      `${d.worker.phone ? `Mobile: ${d.worker.phone}  |  ` : ""}Daily wage: ${rs(d.worker.daily_wage)}`,
      M,
      y + 10.5,
    );
    doc.text(
      `Present: ${summary.present}   Absent: ${summary.absent}   Holiday: ${summary.holiday}   |   Generated ${new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}`,
      M,
      y + 15,
    );

    // ----- Totals boxes -----
    const boxY = y + 19;
    const boxW = (tableW - 8) / 3;
    const boxes = [
      { l: "Wage earned", v: rs(summary.earned) },
      { l: "Total paid", v: rs(summary.paid) },
      { l: summary.balance >= 0 ? "Balance to pay" : "Advance / overpaid", v: rs(Math.abs(summary.balance)) },
    ];
    boxes.forEach((b, i) => {
      const bx = M + i * (boxW + 4);
      doc.setFillColor(243, 247, 244);
      doc.setDrawColor(200, 215, 205);
      doc.roundedRect(bx, boxY, boxW, 12, 1.5, 1.5, "FD");
      doc.setFontSize(7.5);
      doc.setTextColor(100);
      doc.text(b.l, bx + 3, boxY + 4.6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(0);
      doc.text(b.v, bx + 3, boxY + 9.6);
      doc.setFont("helvetica", "normal");
    });

    y = boxY + 17;

    if (rows.length === 0) {
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("No attendance or payment records yet.", M, y + 4);
      doc.setTextColor(0);
      return;
    }

    drawHeader();
    doc.setFontSize(8);

    const drawRow = (vals: string[][], zebra: boolean, bold = false, boldCols: number[] = []) => {
      const nLines = Math.max(...vals.map((v) => v.length));
      const rowH = nLines * LH + 2 * PAD - 0.6;
      if (y + rowH > pageH - 14) {
        doc.addPage();
        y = M;
        drawHeader();
        doc.setFontSize(8);
      }
      if (zebra) {
        doc.setFillColor(243, 247, 244);
        doc.rect(M, y, tableW, rowH, "F");
      }
      let x = M;
      cols.forEach((c, i) => {
        doc.setFont("helvetica", bold || boldCols.includes(i) ? "bold" : "normal");
        vals[i].forEach((t, k) => {
          const ty = y + PAD + 2.7 + k * LH;
          if (c.align === "right") doc.text(t, x + c.w - PAD, ty, { align: "right" });
          else doc.text(t, x + PAD, ty);
        });
        x += c.w;
      });
      doc.setFont("helvetica", "normal");
      doc.setDrawColor(220);
      doc.line(M, y + rowH, M + tableW, y + rowH);
      y += rowH;
    };

    const num = (n: number) => (n ? Number(n).toLocaleString("en-IN") : "-");

    rows.forEach((r, k) => {
      doc.setFontSize(8);
      drawRow(
        [
          [fmtDate(r.date)],
          [r.day],
          [r.attendance],
          [r.dayType || "-"],
          [num(r.earned)],
          [num(r.paid)],
          r.note ? (doc.splitTextToSize(r.note, cols[6].w - 2 * PAD) as string[]) : ["-"],
          [Number(r.balance).toLocaleString("en-IN")],
        ],
        k % 2 === 1,
        false,
        r.paid ? [5] : [],
      );
    });

    // ----- Totals row -----
    drawRow(
      [
        ["Total"],
        [""],
        [`${summary.present} present`],
        [""],
        [Number(summary.earned).toLocaleString("en-IN")],
        [Number(summary.paid).toLocaleString("en-IN")],
        [""],
        [Number(summary.balance).toLocaleString("en-IN")],
      ],
      false,
      true,
    );
    doc.setDrawColor(60);
    doc.line(M, y, M + tableW, y);
  });

  // ----- Page numbers -----
  const pages = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: "center" });
  }

  return doc;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const fileBase = (workers: LabourWorker[]) =>
  workers.length === 1 ? `${slug(workers[0].name) || "labour"}-records` : `labour-charges-${stamp()}`;

/** Excel: Summary sheet + one sheet per labour (date, attendance, payment that day). */
export async function exportLabourXlsx(workers: LabourWorker[]) {
  const data = await fetchLabourData(workers);
  const buf = await buildLabourXlsx(data);
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(workers)}.xlsx`,
  );
}

/** PDF (portrait A4): each labour on its own page(s). */
export async function exportLabourPdf(workers: LabourWorker[]) {
  const data = await fetchLabourData(workers);
  const doc = await buildLabourPdf(data);
  doc.save(`${fileBase(workers)}.pdf`);
}