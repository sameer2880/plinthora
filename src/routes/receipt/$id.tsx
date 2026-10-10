import { createFileRoute } from "@tanstack/react-router";
import { LoadingScreen } from "@/components/LoadingScreen";
import { A4Sheet } from "@/components/A4Sheet";
import { ReceiptWatermark } from "@/components/Watermark";
import { useQuery } from "@tanstack/react-query";
import { getPublicReceiptFn } from "@/lib/api/receipts.functions";
import type { Rental } from "@/lib/rentals";
import { computeStatus, groupRentals } from "@/lib/rentals";
import { PLATFORM_NAME } from "@/lib/brand";

// Public on purpose — this is the page "Share Receipt" WhatsApp links open,
// so the customer can view it without ever signing in. It fetches
// through a server function backed by the service role, not the logged-in
// user's session, so it works the same whether or not anyone is signed in.
export const Route = createFileRoute("/receipt/$id")({
  head: () => ({
    meta: [
      { title: `Rental Receipt | ${PLATFORM_NAME}` },
      { name: "description", content: "View and print a construction material rental receipt." },
      { property: "og:title", content: `Rental Receipt | ${PLATFORM_NAME}` },
      { property: "og:description", content: "A printable construction material rental receipt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      // Always render the desktop layout, even on a phone — a customer opening
      // a shared receipt link shouldn't get the mobile-shrunk version. Overrides
      // the app-wide "width=device-width" viewport set in __root.tsx for this
      // route only; the page stays pinch-zoomable and horizontally scrollable.
      { name: "viewport", content: "width=1024, initial-scale=1" },
    ],
  }),
  component: PublicReceiptPage,
});

function PublicReceiptPage() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["public-receipt", id],
    queryFn: async () => getPublicReceiptFn({ data: { id } }),
  });

  if (isLoading) {
    return <LoadingScreen title="Loading receipt…" subtitle="Please wait a moment" />;
  }
  if (!data) return <div className="p-8 text-center text-muted-foreground">Receipt not found</div>;

  const business = data.business;
  const rows = (data.rows as unknown as Rental[]).map((row) => ({ ...row, status: computeStatus(row) }));
  const receipt = groupRentals(rows)[0];
  const receiptNumber = rows.length > 1 ? rows[0].group_id || rows[0].id : rows[0].id;

  return (
    <div className="min-h-screen bg-gray-200 py-4 px-2 sm:py-10 sm:px-6 print:min-h-0 print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 0; }`}</style>
      <A4Sheet>
      <article
        className="receipt-sheet relative w-full bg-white p-[15mm] text-gray-700 shadow-xl print:max-w-none print:p-[15mm] print:shadow-none"
        style={{ minHeight: "297mm" }}
      >
        {/* Title + business details (right aligned, no logo) */}
        <div className="mb-10 text-right">
          <h1 className="text-3xl font-normal tracking-wide text-gray-800">RECEIPT</h1>
          <div className="mt-3 space-y-0.5 text-xs text-gray-500">
            <div className="text-sm font-bold text-gray-500">{business?.name ?? ""}</div>
            {business?.location && <div>{business.location}</div>}
            {(business?.owner_line || business?.phone) && (
              <div>{business?.owner_line || `Ph.no: ${business?.phone}`}</div>
            )}
          </div>
        </div>

        {/* Bill To (left) + receipt details (right) */}
        <div className="mb-8 flex flex-row items-start justify-between gap-6">
          <div className="text-sm text-gray-700">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Bill To</div>
            <div className="font-semibold text-gray-800">{receipt.customer_name}</div>
            {receipt.customer_address && <div>{receipt.customer_address}</div>}
            {receipt.customer_phone && <div>{receipt.customer_phone}</div>}
          </div>
          <div className="w-64 space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Receipt No.:</span>
              <span className="font-bold text-gray-800">{receiptNumber.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Issue date:</span>
              <span className="font-bold text-gray-800">{receipt.issue_date}</span>
            </div>
            {receipt.return_date && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Return date:</span>
                <span className="font-bold text-gray-800">{receipt.return_date}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Status:</span>
              <span className="font-bold capitalize text-gray-800">
                {receipt.status === "partial" ? "Partially Returned" : receipt.status}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Payment:</span>
              <span className="font-bold text-gray-800">
                {receipt.payment_status === "paid" ? "Paid" : "Not Paid"}
              </span>
            </div>
          </div>
        </div>

        {/* Materials table */}
        <table className="mb-4 w-full border-collapse">
          <thead>
            <tr className="bg-[#a9c4f0] text-xs font-bold uppercase text-gray-800">
              <th className="px-3 py-2.5 text-left">Description</th>
              <th className="px-3 py-2.5 text-right">Quantity</th>
              <th className="px-3 py-2.5 text-right">Unit price (₹)</th>
              <th className="px-3 py-2.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {receipt.rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-200 text-xs text-gray-700">
                <td className="px-3 py-3">{row.material_name}</td>
                <td className="px-3 py-3 text-right">
                  {row.quantity} {row.unit}
                </td>
                <td className="px-3 py-3 text-right">
                  {Number(row.rate_per_unit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-3 text-right">
                  {Number(row.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mb-12 flex justify-end">
          <div className="w-[55%]">
            <div className="flex justify-between border-b border-gray-200 px-3 py-2 text-xs text-gray-600">
              <span>SUBTOTAL (₹):</span>
              <span>{Number(receipt.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {receipt.security_deposit ? (
              <div className="flex justify-between border-b border-gray-200 px-3 py-2 text-xs text-gray-600">
                <span>ADVANCE RECEIVED (₹):</span>
                <span>
                  - {Number(receipt.security_deposit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t-2 border-[#7fa8e0] px-3 pt-3 text-gray-800">
              <span className="text-lg font-bold uppercase">Total due (₹)</span>
              <span className="text-lg font-medium">
                ₹
                {(Number(receipt.total_amount) - Number(receipt.security_deposit ?? 0)).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Signature */}
        <div className="mb-10 flex justify-end">
          <div className="w-52 pt-14 text-center">
            <div className="border-t border-gray-300 pt-1 text-xs font-medium text-gray-500">
              Authorized Signature
            </div>
          </div>
        </div>

        {/* Terms & notes */}
        {receipt.notes && (
          <div className="border-t border-gray-200 pt-6">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              Terms &amp; Conditions
            </div>
            <div className="text-sm text-gray-600">{receipt.notes}</div>
          </div>
        )}

        <div className="mt-8 text-center text-xs font-medium text-gray-500">
          Thank you for choosing {business?.name}
          {business?.location ? `, ${business.location}` : ""}.
        </div>
        <ReceiptWatermark />
      </article>
      </A4Sheet>
    </div>
  );
}