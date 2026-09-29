import type { RentalGroup } from "@/lib/rentals";
import { downloadCsv } from "@/lib/export";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const stamp = () => new Date().toISOString().slice(0, 10);

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const money = (n: number | string | null | undefined, symbol: string) =>
  `${symbol}${Number(n || 0).toLocaleString("en-IN")}`;

const escapeHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Line {
  no: number;
  customer: string;
  phone: string;
  place: string;
  materials: string[];
  amount: number;
  issue: string;
  ret: string;
  status: string;
  payment: string;
}

function toLines(groups: RentalGroup[]): Line[] {
  return groups.map((g, i) => ({
    no: i + 1,
    customer: g.customer_name,
    phone: g.customer_phone,
    place: g.customer_address ?? "",
    materials: g.rows.map(
      (r) =>
        `${r.material_name} - ${r.quantity} ${r.unit}${
          g.rows.length > 1 && r.status === "returned" ? " (returned)" : ""
        }`,
    ),
    amount: g.total_amount,
    issue: g.issue_date,
    ret: g.return_date ?? "Not set",
    status: cap(g.status),
    payment: cap(g.payment_status),
  }));
}

function summarize(groups: RentalGroup[]) {
  const total = groups.reduce((s, g) => s + Number(g.total_amount || 0), 0);
  const unpaid = groups
    .filter((g) => g.payment_status !== "paid")
    .reduce((s, g) => s + Number(g.total_amount || 0), 0);
  return { count: groups.length, total, unpaid };
}

/* ------------------------------------------------------------------ */
/* CSV — one row per material line (best for Excel / Sheets)          */
/* ------------------------------------------------------------------ */

export function exportRentalsCsv(groups: RentalGroup[]) {
  const headers = [
    "S.No", "Customer", "Phone", "Place", "Material", "Quantity", "Unit",
    "Rate", "Amount", "Security Deposit", "Issue Date", "Return Date",
    "Item Status", "Payment", "Notes",
  ];
  const rows: Record<string, unknown>[] = [];
  groups.forEach((g, i) => {
    g.rows.forEach((r) => {
      rows.push({
        "S.No": i + 1,
        Customer: g.customer_name,
        Phone: g.customer_phone,
        Place: g.customer_address ?? "",
        Material: r.material_name,
        Quantity: r.quantity,
        Unit: r.unit,
        Rate: r.rate_per_unit,
        Amount: r.total_amount,
        "Security Deposit": r.security_deposit ?? 0,
        "Issue Date": r.issue_date,
        "Return Date": r.return_date ?? "",
        "Item Status": cap(r.status),
        Payment: cap(r.payment_status),
        Notes: r.notes ?? "",
      });
    });
  });
  downloadCsv(`rentals-${stamp()}`, rows, headers);
}

/* ------------------------------------------------------------------ */
/* PDF — one row per rental, landscape A4, repeating header, paging   */
/* ------------------------------------------------------------------ */

export async function exportRentalsPdf(groups: RentalGroup[], filterNote?: string) {
  // Loaded on demand so jsPDF isn't part of the initial bundle (and never runs on the server).
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 10;
  const LH = 3.6; // line height inside a cell
  const PAD = 1.5;

  const cols: { h: string; w: number; align?: "right" }[] = [
    { h: "#", w: 10 },
    { h: "Customer", w: 36 },
    { h: "Phone", w: 28 },
    { h: "Place", w: 36 },
    { h: "Materials", w: 64 },
    { h: "Amount", w: 24, align: "right" },
    { h: "Issue Date", w: 24 },
    { h: "Return Date", w: 24 },
    { h: "Status", w: 16 },
    { h: "Payment", w: 15 },
  ]; // widths add up to 277mm = A4 landscape minus margins

  const lines = toLines(groups);
  const { count, total, unpaid } = summarize(groups);

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Rentals Report", M, M + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` +
      (filterNote ? `  |  ${filterNote}` : ""),
    M,
    M + 10,
  );
  doc.text(
    `${count} records  |  Total: ${money(total, "Rs. ")}  |  Unpaid: ${money(unpaid, "Rs. ")}`,
    M,
    M + 14.5,
  );
  doc.setTextColor(0);

  let y = M + 19;

  const drawHeader = () => {
    const h = 7;
    doc.setFillColor(22, 101, 52);
    doc.rect(M, y, pageW - 2 * M, h, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
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

  drawHeader();
  doc.setFontSize(8);

  lines.forEach((l, idx) => {
    const values: string[][] = [
      [String(l.no)],
      doc.splitTextToSize(l.customer, cols[1].w - 2 * PAD),
      doc.splitTextToSize(l.phone, cols[2].w - 2 * PAD),
      doc.splitTextToSize(l.place || "-", cols[3].w - 2 * PAD),
      l.materials.flatMap((m) => doc.splitTextToSize(m, cols[4].w - 2 * PAD) as string[]),
      [money(l.amount, "Rs. ")],
      [l.issue],
      [l.ret],
      [l.status],
      [l.payment],
    ];
    const rowLines = Math.max(...values.map((v) => v.length));
    const rowH = rowLines * LH + 2 * PAD - 0.5;

    if (y + rowH > pageH - 14) {
      doc.addPage();
      y = M;
      drawHeader();
      doc.setFontSize(8);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(243, 247, 244);
      doc.rect(M, y, pageW - 2 * M, rowH, "F");
    }

    let x = M;
    cols.forEach((c, i) => {
      values[i].forEach((t, k) => {
        const ty = y + PAD + 2.6 + k * LH;
        if (c.align === "right") doc.text(t, x + c.w - PAD, ty, { align: "right" });
        else doc.text(t, x + PAD, ty);
      });
      x += c.w;
    });

    doc.setDrawColor(220);
    doc.line(M, y + rowH, pageW - M, y + rowH);
    y += rowH;
  });

  // Page numbers
  const pages = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`Page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: "center" });
  }

  doc.save(`rentals-${stamp()}.pdf`);
}

/* ------------------------------------------------------------------ */
/* Print — opens the browser print dialog with a clean table           */
/* ------------------------------------------------------------------ */

export function printRentals(groups: RentalGroup[], filterNote?: string) {
  const lines = toLines(groups);
  const { count, total, unpaid } = summarize(groups);

  const body = lines
    .map(
      (l) => `<tr>
        <td>${l.no}</td>
        <td>${escapeHtml(l.customer)}</td>
        <td>${escapeHtml(l.phone)}</td>
        <td>${escapeHtml(l.place || "-")}</td>
        <td>${l.materials.map(escapeHtml).join("<br/>")}</td>
        <td class="r">${escapeHtml(money(l.amount, "₹"))}</td>
        <td>${escapeHtml(l.issue)}</td>
        <td>${escapeHtml(l.ret)}</td>
        <td>${escapeHtml(l.status)}</td>
        <td>${escapeHtml(l.payment)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Rentals Report</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #555; margin-bottom: 10px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #166534; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f3f7f4; }
  .r { text-align: right; white-space: nowrap; }
  th.r { text-align: right; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
  <h1>Rentals Report</h1>
  <div class="meta">
    Generated ${escapeHtml(new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}
    ${filterNote ? ` | ${escapeHtml(filterNote)}` : ""}<br/>
    ${count} records | Total: ${escapeHtml(money(total, "₹"))} | Unpaid: ${escapeHtml(money(unpaid, "₹"))}
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Customer</th><th>Phone</th><th>Place</th><th>Materials</th>
      <th class="r">Amount</th><th>Issue Date</th><th>Return Date</th><th>Status</th><th>Payment</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow!;
  const d = win.document;
  d.open();
  d.write(html);
  d.close();

  const cleanup = () => iframe.remove();
  win.onafterprint = cleanup;
  setTimeout(() => {
    win.focus();
    win.print();
  }, 250);
  setTimeout(cleanup, 60_000); // fallback if afterprint never fires
}