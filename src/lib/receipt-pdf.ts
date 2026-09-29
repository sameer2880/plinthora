import type { Rental } from "@/lib/rentals";
import { computeStatus, groupRentals, whatsappUrl } from "@/lib/rentals";
import { getPublicReceiptFn } from "@/lib/api/receipts.functions";

const inr = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

/** Builds the receipt as a PDF (same content as the /receipt/$id page) for the rental `id`'s whole group. */
export async function buildReceiptPdf(id: string): Promise<{ blob: Blob; filename: string; customer: string }> {
  const data = await getPublicReceiptFn({ data: { id } });
  if (!data) throw new Error("Receipt not found");

  const business = data.business;
  const rows = (data.rows as unknown as Rental[]).map((r) => ({ ...r, status: computeStatus(r) }));
  const receipt = groupRentals(rows)[0];
  const receiptNo = (rows.length > 1 ? rows[0].group_id || rows[0].id : rows[0].id).slice(0, 8).toUpperCase();

  const { jsPDF } = await import("jspdf"); // loaded on demand
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const R = W - M;
  const grey = 110;
  let y = M + 6;

  const ensure = (need: number) => {
    if (y + need > H - M) {
      doc.addPage();
      y = M;
    }
  };

  // Title + business (right aligned)
  doc.setTextColor(40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.text("RECEIPT", R, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(grey);
  if (business?.name) { doc.text(business.name, R, y, { align: "right" }); y += 5; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (business?.location) { doc.text(business.location, R, y, { align: "right" }); y += 4.5; }
  const contact = business?.owner_line || (business?.phone ? `Ph.no: ${business.phone}` : "");
  if (contact) { doc.text(contact, R, y, { align: "right" }); y += 4.5; }
  y += 8;

  // Bill To (left) + details (right)
  const top = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(grey);
  doc.text("BILL TO", M, y);
  y += 5;
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(receipt.customer_name, M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70);
  if (receipt.customer_address) {
    const addr = doc.splitTextToSize(receipt.customer_address, 85) as string[];
    doc.text(addr, M, y);
    y += addr.length * 4.6;
  }
  if (receipt.customer_phone) { doc.text(receipt.customer_phone, M, y); y += 4.6; }
  const leftEnd = y;

  const details: [string, string][] = [
    ["Receipt No.:", receiptNo],
    ["Issue date:", receipt.issue_date],
    ...(receipt.return_date ? ([["Return date:", receipt.return_date]] as [string, string][]) : []),
    ["Status:", receipt.status === "partial" ? "Partially Returned" : receipt.status.charAt(0).toUpperCase() + receipt.status.slice(1)],
    ["Payment:", receipt.payment_status === "paid" ? "Paid" : "Not Paid"],
  ];
  let dy = top;
  doc.setFontSize(9);
  for (const [k, v] of details) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    doc.text(k, R - 62, dy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text(v, R, dy, { align: "right" });
    dy += 5;
  }
  y = Math.max(leftEnd, dy) + 8;

  // Materials table
  const colDesc = M + 3, colQty = M + 100, colRate = M + 140, colAmt = R - 3;
  const header = () => {
    doc.setFillColor(169, 196, 240);
    doc.rect(M, y, R - M, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30);
    doc.text("DESCRIPTION", colDesc, y + 5.4);
    doc.text("QUANTITY", colQty, y + 5.4, { align: "right" });
    doc.text("UNIT PRICE (Rs.)", colRate, y + 5.4, { align: "right" });
    doc.text("AMOUNT (Rs.)", colAmt, y + 5.4, { align: "right" });
    y += 8;
  };
  header();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60);
  for (const r of receipt.rows) {
    const nameLines = doc.splitTextToSize(r.material_name, 90) as string[];
    const h = Math.max(9, nameLines.length * 4.6 + 4.5);
    if (y + h > H - M - 10) { doc.addPage(); y = M; header(); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(60); }
    doc.text(nameLines, colDesc, y + 5.6);
    doc.text(`${r.quantity} ${r.unit}`, colQty, y + 5.6, { align: "right" });
    doc.text(inr(r.rate_per_unit), colRate, y + 5.6, { align: "right" });
    doc.text(inr(r.total_amount), colAmt, y + 5.6, { align: "right" });
    y += h;
    doc.setDrawColor(225);
    doc.line(M, y, R, y);
  }
  y += 8;

  // Totals
  ensure(34);
  const tx = R - 100;
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("SUBTOTAL (Rs.):", tx + 3, y);
  doc.text(inr(receipt.total_amount), colAmt, y, { align: "right" });
  y += 6;
  if (receipt.security_deposit) {
    doc.text("ADVANCE RECEIVED (Rs.):", tx + 3, y);
    doc.text(`- ${inr(receipt.security_deposit)}`, colAmt, y, { align: "right" });
    y += 6;
  }
  doc.setDrawColor(127, 168, 224);
  doc.setLineWidth(0.6);
  doc.line(tx, y, R, y);
  doc.setLineWidth(0.2);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text("TOTAL DUE (Rs.)", tx + 3, y);
  doc.text(inr(Number(receipt.total_amount) - Number(receipt.security_deposit ?? 0)), colAmt, y, { align: "right" });
  y += 20;

  // Signature
  ensure(30);
  doc.setDrawColor(170);
  doc.line(R - 52, y + 12, R, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(grey);
  doc.text("Authorized Signature", R - 26, y + 16.5, { align: "center" });
  y += 28;

  // Terms
  if (receipt.notes) {
    ensure(24);
    doc.setDrawColor(225);
    doc.line(M, y, R, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(grey);
    doc.text("TERMS & CONDITIONS", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(70);
    const notes = doc.splitTextToSize(receipt.notes, R - M) as string[];
    for (const line of notes) { ensure(5); doc.text(line, M, y); y += 4.8; }
    y += 4;
  }

  ensure(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(grey);
  doc.text(
    `Thank you for choosing ${business?.name ?? ""}${business?.location ? `, ${business.location}` : ""}.`,
    W / 2, y + 4, { align: "center" },
  );

  const safe = receipt.customer_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "customer";
  return { blob: doc.output("blob"), filename: `receipt-${safe}-${receiptNo}.pdf`, customer: receipt.customer_name };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Shares the receipt as a PDF file.
 *  1. Phones / browsers that support file sharing: opens the share sheet with the PDF attached
 *     (pick WhatsApp -> pick the customer).
 *  2. Otherwise (desktop): downloads the PDF and opens the customer's WhatsApp chat so the
 *     PDF can be attached with the paperclip. WhatsApp's web links cannot attach files themselves.
 * Returns which path was used so the caller can show the right toast.
 */
export async function shareReceiptPdf(
  id: string,
  phone: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const { blob, filename, customer } = await buildReceiptPdf(id);
  const file = new File([blob], filename, { type: "application/pdf" });
  const text = `Hello ${customer}, please find your receipt attached.`;

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Rental receipt", text });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // any other failure -> fall through to download
    }
  }

  download(blob, filename);
  window.open(whatsappUrl(phone, text), "_blank", "noopener");
  return "downloaded";
}