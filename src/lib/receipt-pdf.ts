import { getPublicReceiptFn } from "@/lib/api/receipts.functions";
import { computeStatus, groupRentals, type Rental } from "@/lib/rentals";

export interface ReceiptPdf {
  blob: Blob;
  file: File;
  filename: string;
}

// jsPDF's built-in Helvetica has no ₹ glyph, so amounts are printed as "Rs.".
const money = (n: number) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/**
 * Builds the same receipt the public /receipt/:id page shows, as a real A4 PDF.
 * Uses the public server function, so it works for any rental id (single or group).
 */
export async function buildReceiptPdf(rentalId: string): Promise<ReceiptPdf> {
  const data = await getPublicReceiptFn({ data: { id: rentalId } });
  if (!data) throw new Error("Receipt not found");

  const business = data.business;
  const rows = (data.rows as unknown as Rental[]).map((r) => ({ ...r, status: computeStatus(r) }));
  const receipt = groupRentals(rows)[0];
  const receiptNumber = (rows.length > 1 ? rows[0].group_id || rows[0].id : rows[0].id).slice(0, 8).toUpperCase();

  // Loaded on demand so jsPDF isn't in the initial bundle.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const R = W - M;
  let y = M;

  const text = (s: string, x: number, yy: number, opts?: { align?: "left" | "right" | "center"; maxWidth?: number }) =>
    doc.text(s, x, yy, opts as never);
  const font = (style: "normal" | "bold", size: number, gray = 60) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(gray);
  };

  // Title + business (right aligned)
  font("normal", 24, 40);
  text("RECEIPT", R, y + 6, { align: "right" });
  y += 13;
  font("bold", 11, 100);
  text(business?.name ?? "", R, y, { align: "right" });
  font("normal", 9, 120);
  if (business?.location) { y += 5; text(business.location, R, y, { align: "right" }); }
  if (business?.owner_line || business?.phone) {
    y += 5;
    text(business?.owner_line || `Ph.no: ${business?.phone}`, R, y, { align: "right" });
  }

  // Bill To (left) + details (right)
  y += 14;
  const blockTop = y;
  font("bold", 8, 120);
  text("BILL TO", M, y);
  y += 5;
  font("bold", 11, 40);
  text(receipt.customer_name, M, y);
  font("normal", 10, 70);
  if (receipt.customer_address) {
    const addr = doc.splitTextToSize(receipt.customer_address, 85) as string[];
    y += 5;
    text(addr, M, y);
    y += (addr.length - 1) * 4.5;
  }
  if (receipt.customer_phone) { y += 5; text(receipt.customer_phone, M, y); }
  const leftEnd = y;

  const details: [string, string][] = [
    ["Receipt No.:", receiptNumber],
    ["Issue date:", receipt.issue_date],
    ...(receipt.return_date ? [["Return date:", receipt.return_date] as [string, string]] : []),
    ["Status:", receipt.status === "partial" ? "Partially Returned" : receipt.status.charAt(0).toUpperCase() + receipt.status.slice(1)],
    ["Payment:", receipt.payment_status === "paid" ? "Paid" : "Not Paid"],
  ];
  let dy = blockTop;
  details.forEach(([k, v]) => {
    font("normal", 9, 120);
    text(k, R - 62, dy);
    font("bold", 9, 40);
    text(v, R, dy, { align: "right" });
    dy += 5.5;
  });
  y = Math.max(leftEnd, dy) + 10;

  // Table
  const colX = { desc: M + 3, qty: M + 108, rate: M + 143, amt: R - 3 };
  const drawHead = () => {
    doc.setFillColor(169, 196, 240);
    doc.rect(M, y, R - M, 9, "F");
    font("bold", 8.5, 40);
    text("DESCRIPTION", colX.desc, y + 6);
    text("QUANTITY", colX.qty, y + 6, { align: "right" });
    text("UNIT PRICE (Rs.)", colX.rate, y + 6, { align: "right" });
    text("AMOUNT (Rs.)", colX.amt, y + 6, { align: "right" });
    y += 9;
  };
  drawHead();
  const num = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  receipt.rows.forEach((row) => {
    const desc = doc.splitTextToSize(row.material_name, 95) as string[];
    const h = Math.max(10, desc.length * 4.5 + 5);
    if (y + h > H - 60) {
      doc.addPage();
      y = M;
      drawHead();
    }
    font("normal", 9, 70);
    text(desc, colX.desc, y + 6.5);
    text(`${row.quantity} ${row.unit}`, colX.qty, y + 6.5, { align: "right" });
    text(num(row.rate_per_unit), colX.rate, y + 6.5, { align: "right" });
    text(num(row.total_amount), colX.amt, y + 6.5, { align: "right" });
    y += h;
    doc.setDrawColor(220);
    doc.line(M, y, R, y);
  });

  // Totals
  if (y + 40 > H - 40) { doc.addPage(); y = M; }
  y += 8;
  const tx = R - 95;
  font("normal", 9, 90);
  text("SUBTOTAL:", tx + 3, y);
  text(money(receipt.total_amount), R - 3, y, { align: "right" });
  if (receipt.security_deposit) {
    y += 7;
    text("ADVANCE RECEIVED:", tx + 3, y);
    text(`- ${money(receipt.security_deposit)}`, R - 3, y, { align: "right" });
  }
  y += 5;
  doc.setDrawColor(127, 168, 224);
  doc.setLineWidth(0.6);
  doc.line(tx, y, R, y);
  y += 8;
  font("bold", 12, 40);
  text("TOTAL DUE:", tx + 3, y);
  text(money(Number(receipt.total_amount) - Number(receipt.security_deposit ?? 0)), R - 3, y, { align: "right" });

  // Signature line
  y += 26;
  doc.setDrawColor(190);
  doc.setLineWidth(0.3);
  doc.line(R - 52, y, R, y);
  font("normal", 8.5, 120);
  text("Authorized Signature", R - 26, y + 5, { align: "center" });

  // Terms
  if (receipt.notes) {
    y += 16;
    if (y > H - 35) { doc.addPage(); y = M; }
    doc.setDrawColor(220);
    doc.line(M, y, R, y);
    y += 7;
    font("bold", 8, 120);
    text("TERMS & CONDITIONS", M, y);
    font("normal", 9.5, 90);
    const notes = doc.splitTextToSize(receipt.notes, R - M) as string[];
    text(notes, M, y + 5);
  }

  // Footer on last page
  font("bold", 9, 120);
  text(
    `Thank you for choosing ${business?.name ?? ""}${business?.location ? `, ${business.location}` : ""}.`,
    W / 2,
    H - 12,
    { align: "center" },
  );

  const safeName = receipt.customer_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "customer";
  const filename = `Receipt-${receiptNumber}-${safeName}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  return { blob, file, filename };
}

export function downloadReceiptPdf({ blob, filename }: ReceiptPdf) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}