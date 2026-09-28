import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPublicReceiptFn } from "@/lib/api/receipts.functions";
import type { Rental } from "@/lib/rentals";
import { computeStatus, groupRentals } from "@/lib/rentals";
import { PLATFORM_NAME } from "@/lib/brand";
import { Loader2 } from "lucide-react";

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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-200 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        <span>Loading receipt…</span>
      </div>
    );
  }
  if (!data) return <div className="p-8 text-center text-muted-foreground">Receipt not found</div>;

  const business = data.business;
  const rows = (data.rows as unknown as Rental[]).map((row) => ({ ...row, status: computeStatus(row) }));
  const receipt = groupRentals(rows)[0];
  const receiptNumber = rows.length > 1 ? rows[0].group_id || rows[0].id : rows[0].id;
  const logo = business?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-gray-200 py-6 px-3 sm:py-10 sm:px-6 print:min-h-0 print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 0; }`}</style>
      <article
        className="receipt-sheet mx-auto w-full max-w-[210mm] bg-white p-6 text-gray-700 shadow-xl sm:p-[15mm] print:max-w-none print:p-[15mm] print:shadow-none"
        style={{ minHeight: "297mm" }}
      >
        {/* Title + From */}
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-400">RECEIPT</h1>
            <div className="mt-6">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">From</div>
              <div className="font-semibold text-gray-800">{business?.name ?? ""}</div>
              {business?.location && <div className="text-sm text-gray-600">{business.location}</div>}
              {(business?.owner_line || business?.phone) && (
                <div className="text-sm text-gray-600">{business?.owner_line || `Ph.no: ${business?.phone}`}</div>
              )}
            </div>
          </div>
          {logo && (
            <img
              src={logo}
              alt={`${business?.name ?? ""} logo`}
              className="block h-20 w-20 shrink-0 overflow-hidden rounded-full object-cover grayscale"
            />
          )}
        </div>

        {/* Bill To / Rental Period / Receipt meta */}
        <div className="mb-8 grid grid-cols-1 gap-6 border-t border-gray-200 pt-6 sm:grid-cols-3">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Bill To</div>
            <div className="font-semibold text-gray-800">{receipt.customer_name}</div>
            <div className="text-sm text-gray-600">{receipt.customer_address}</div>
            <div className="text-sm text-gray-600">{receipt.customer_phone}</div>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Rental Period</div>
            <div className="text-sm text-gray-600">
              Issue: <span className="font-medium text-gray-800">{receipt.issue_date}</span>
            </div>
            <div className="text-sm text-gray-600">
              Return: <span className="font-medium text-gray-800">{receipt.return_date}</span>
            </div>
            <div className="text-sm text-gray-600">
              Status:{" "}
              <span className="font-medium capitalize text-gray-800">
                {receipt.status === "partial" ? "Partially Returned" : receipt.status}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Payment: <span className="font-medium text-gray-800">{receipt.payment_status === "paid" ? "Paid" : "Not Paid"}</span>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="flex justify-between gap-4 text-sm sm:justify-end">
              <span className="text-gray-500">Receipt #</span>
              <span className="font-semibold text-gray-800">{receiptNumber.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm sm:justify-end">
              <span className="text-gray-500">Receipt Date</span>
              <span className="font-semibold text-gray-800">
                {new Date(receipt.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </span>
            </div>
          </div>
        </div>

        {/* Materials table */}
        <table className="mb-8 w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-400 text-xs uppercase tracking-wide text-gray-500">
              {receipt.rows.length > 1 && <th className="py-2 text-left font-semibold">#</th>}
              <th className="py-2 text-left font-semibold">Material</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Unit Price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {receipt.rows.map((row, i) => (
              <tr key={row.id} className="border-b border-gray-200">
                {receipt.rows.length > 1 && <td className="py-2.5 text-sm text-gray-700">{i + 1}</td>}
                <td className="py-2.5 text-sm font-medium text-gray-800">{row.material_name}</td>
                <td className="py-2.5 text-right text-sm text-gray-700">
                  {row.quantity} {row.unit}
                </td>
                <td className="py-2.5 text-right text-sm text-gray-700">₹{Number(row.rate_per_unit).toLocaleString("en-IN")}</td>
                <td className="py-2.5 text-right text-sm font-medium text-gray-800">
                  ₹{Number(row.total_amount).toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mb-10 flex justify-end">
          <div className="w-64 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>₹{Number(receipt.total_amount).toLocaleString("en-IN")}</span>
            </div>
            {receipt.security_deposit ? (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Advance Received</span>
                <span>- ₹{Number(receipt.security_deposit).toLocaleString("en-IN")}</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between border-t border-gray-300 pt-2 text-lg font-bold text-gray-800">
              <span>Total</span>
              <span>₹{(Number(receipt.total_amount) - Number(receipt.security_deposit ?? 0)).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        {/* Signature */}
        <div className="mb-10 flex justify-end">
          <div className="w-52 pt-14 text-center">
            <div className="border-t border-gray-300 pt-1 text-xs font-medium text-gray-500">Authorized Signature</div>
          </div>
        </div>

        {/* Terms & notes */}
        {receipt.notes && (
          <div className="border-t border-gray-200 pt-6">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Terms &amp; Conditions</div>
            <div className="text-sm text-gray-600">{receipt.notes}</div>
          </div>
        )}

        <div className="mt-8 text-center text-xs font-medium text-gray-500">
          Thank you for choosing {business?.name}
          {business?.location ? `, ${business.location}` : ""}.
        </div>
      </article>
    </div>
  );
}