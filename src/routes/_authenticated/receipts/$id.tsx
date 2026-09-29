import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Rental } from "@/lib/rentals";
import { computeStatus, groupRentals } from "@/lib/rentals";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Printer, ArrowLeft, SlidersHorizontal } from "lucide-react";
import { isMasterAdmin, isManager } from "@/lib/auth/access";
import { useSession } from "@/lib/auth/session";
import { PLATFORM_NAME } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/receipts/$id")({
  head: () => ({
    meta: [
      { title: `Rental Receipt | ${PLATFORM_NAME}` },
      {
        name: "description",
        content: "View and print a construction material rental receipt.",
      },
      { property: "og:title", content: `Rental Receipt | ${PLATFORM_NAME}` },
      { property: "og:description", content: "A printable construction material rental receipt." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { id } = Route.useParams();
  const canUseSignature = isMasterAdmin() || isManager();
  const [showStamp, setShowStamp] = useState(true);
  const [showSignature, setShowSignature] = useState(isMasterAdmin());

  // Everything on the receipt that belongs to the business (name, logo, stamp,
  // signature, contact line) comes from the business's own record; a signed-in
  // user's personal signature, when they have one, takes priority.
  const { me, business } = useSession();
  const signature = me?.signatureUrl ?? business?.signature_url ?? null;
  const stamp = business?.stamp_url ?? null;

  const { data: r, isLoading } = useQuery({
    queryKey: ["rental", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rentals").select("*").eq("id", id).single();
      if (error) throw error;
      return { ...(data as any), status: computeStatus(data as any) } as Rental;
    },
  });

  // Every other material added together with this one (same group_id) — lets us
  // print all materials for the customer on a single combined receipt.
  const { data: groupRows } = useQuery({
    queryKey: ["rental-group", r?.group_id ?? id],
    queryFn: async () => {
      const gid = r!.group_id;
      if (!gid) return [r as Rental];
      const { data, error } = await supabase.from("rentals").select("*").eq("group_id", gid);
      if (error) throw error;
      return (data as any[]).map((row) => ({ ...row, status: computeStatus(row) })) as Rental[];
    },
    enabled: !!r,
  });

  const hasMultipleMaterials = (groupRows?.length ?? 0) > 1;

  // Which materials (by id) are ticked in the checklist below. null = not yet
  // initialized — defaults to "everything" once the group finishes loading.
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (groupRows && selectedIds === null) {
      setSelectedIds(groupRows.map((row) => row.id));
    }
  }, [groupRows, selectedIds]);


  if (isLoading) return <div className="text-muted-foreground">Loading receipt…</div>;
  if (!r) return <div>Not found</div>;

  const effectiveSelectedIds = selectedIds ?? (groupRows ?? []).map((row) => row.id);
  const checkedRows = hasMultipleMaterials
    ? (groupRows as Rental[]).filter((row) => effectiveSelectedIds.includes(row.id))
    : [r];
  // Never render an empty receipt — fall back to the material that was opened.
  const rowsForReceipt = checkedRows.length > 0 ? checkedRows : [r];
  const isCombined = rowsForReceipt.length > 1;
  const allSelected = hasMultipleMaterials && effectiveSelectedIds.length === (groupRows?.length ?? 0);

  const toggleMaterial = (materialId: string, checked: boolean) => {
    const base = selectedIds ?? (groupRows ?? []).map((row) => row.id);
    const next = checked
      ? Array.from(new Set([...base, materialId]))
      : base.filter((rowId) => rowId !== materialId);
    // Keep at least one material selected so the receipt is never empty.
    setSelectedIds(next.length > 0 ? next : base);
  };

  const selectAllMaterials = () => setSelectedIds((groupRows ?? []).map((row) => row.id));
  const selectOnlyThisMaterial = () => setSelectedIds([r.id]);

  // Reuses the same aggregation used on the Rentals list, so totals, status
  // and payment status are computed identically whether combined or single.
  const receipt = groupRentals(rowsForReceipt)[0];
  const receiptNumber = isCombined ? (r.group_id || r.id) : r.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/receipts">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4">
              {hasMultipleMaterials && (
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>
                      Materials to combine ({rowsForReceipt.length}/{groupRows?.length ?? 0})
                    </span>
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={allSelected ? selectOnlyThisMaterial : selectAllMaterials}
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {(groupRows as Rental[]).map((row, i) => (
                      <label
                        key={row.id}
                        className="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={effectiveSelectedIds.includes(row.id)}
                          onCheckedChange={(checked) => toggleMaterial(row.id, !!checked)}
                        />
                        <span>
                          <span className="font-medium">Material {i + 1}</span>{" "}
                          <span className="text-muted-foreground">
                            — {row.material_name} ({row.quantity} {row.unit})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Print with</div>
                {canUseSignature ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={!showStamp && !showSignature ? "default" : "outline"}
                      onClick={() => {
                        setShowStamp(false);
                        setShowSignature(false);
                      }}
                    >
                      Without stamp & signature
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!showStamp && showSignature ? "default" : "outline"}
                      onClick={() => {
                        setShowStamp(false);
                        setShowSignature(true);
                      }}
                    >
                      Signature only
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={showStamp && !showSignature ? "default" : "outline"}
                      onClick={() => {
                        setShowStamp(true);
                        setShowSignature(false);
                      }}
                    >
                      Stamp only
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={showStamp && showSignature ? "default" : "outline"}
                      onClick={() => {
                        setShowStamp(true);
                        setShowSignature(true);
                      }}
                    >
                      Stamp & signature
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={!showStamp ? "default" : "outline"}
                      onClick={() => setShowStamp(false)}
                    >
                      Without stamp
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={showStamp ? "default" : "outline"}
                      onClick={() => setShowStamp(true)}
                    >
                      With stamp
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Print Receipt
          </Button>
        </div>
      </div>

      <article
        className="receipt-sheet mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 text-gray-700 shadow-sm transition-shadow duration-200 sm:p-10 print:rounded-none print:border-0 print:shadow-none"
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
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-sm text-gray-700">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Bill To</div>
            <div className="font-semibold text-gray-800">{receipt.customer_name}</div>
            {receipt.customer_address && <div>{receipt.customer_address}</div>}
            {receipt.customer_phone && <div>{receipt.customer_phone}</div>}
          </div>
          <div className="w-full space-y-1 text-xs sm:w-64">
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
          <div className="w-full sm:w-[55%]">
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

        {/* Signature & stamp */}
        <div className="mb-10 flex justify-end">
          <div className="relative w-52 pt-14 text-center">
            {showSignature && canUseSignature && signature && (
              <img
                src={signature}
                alt="Authorized signature"
                className="pointer-events-none absolute left-1/2 top-2 h-16 w-40 -translate-x-1/2 object-contain opacity-90 grayscale print:opacity-90"
              />
            )}
            {showStamp && stamp && (
              <img
                src={stamp}
                alt={`${business?.name ?? ""} official stamp`}
                className="pointer-events-none absolute left-1/2 top-0 z-10 h-24 w-24 -translate-x-1/2 -rotate-6 opacity-90 grayscale print:opacity-90"
              />
            )}
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
      </article>
    </div>
  );
}