import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRentals, groupRentals, buildGroupReceiptMessage } from "@/lib/rentals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, Layers, MessageCircle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { WhatsAppPreviewDialog, type WhatsAppPreview } from "@/components/WhatsAppPreviewDialog";

export const Route = createFileRoute("/_authenticated/receipts/")({
  component: ReceiptsList,
});

function ReceiptsList() {
  const { data: rentals = [] } = useQuery({ queryKey: ["rentals"], queryFn: listRentals });
  // Materials added together (same group_id) show up as one card, with one
  // combined receipt — the receipt page itself still lets you switch to a
  // single-material receipt if that's all you need.
  const groups = useMemo(() => groupRentals(rentals), [rentals]);
  const [wa, setWa] = useState<WhatsAppPreview | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Receipts</h2>
        <p className="text-sm text-muted-foreground">Print professional rental receipts — combined or single</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.group_id} className="hover:shadow-md transition-shadow">
            <div className="space-y-2 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{g.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{g.customer_phone}</div>
                </div>
                <StatusBadge status={g.status} />
              </div>

              {g.rows.length > 1 ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Layers className="h-3 w-3" /> {g.rows.length} materials
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {g.rows.map((r) => r.material_name).join(", ")}
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  {g.rows[0].material_name} · {g.rows[0].quantity} {g.rows[0].unit}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-lg">₹{Number(g.total_amount).toLocaleString("en-IN")}</div>
                <div className="flex items-center gap-1.5">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/receipts/$id" params={{ id: g.rows[0].id }}>
                      <Printer className="h-3.5 w-3.5 mr-1" />
                      {g.rows.length > 1 ? "View combined" : "View"}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      setWa({
                        phone: g.customer_phone,
                        name: g.customer_name,
                        title: "Send receipt",
                        receiptId: g.rows[0].id,
                        message: buildGroupReceiptMessage(g.rows),
                      })
                    }
                    className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" />
                    Send on WhatsApp
                  </Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                #{g.group_id.slice(0, 8).toUpperCase()} · {g.issue_date} → {g.return_date ?? "open"}
              </div>
            </div>
          </Card>
        ))}
        {groups.length === 0 && <div className="col-span-full text-center py-10 text-muted-foreground">No rentals yet</div>}
      </div>
      <WhatsAppPreviewDialog preview={wa} onClose={() => setWa(null)} />
    </div>
  );
}