import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

export function PaymentBadge({ status }: { status: "paid" | "unpaid" }) {
  const { t } = useI18n();
  const map = {
    paid: "bg-success/10 text-success border-success/40",
    unpaid: "bg-destructive/10 text-destructive border-destructive/40",
  } as const;
  return (
    <Badge variant="outline" className={`${map[status]} capitalize font-semibold`}>
      {status === "paid" ? t("Paid") : t("Not Paid")}
    </Badge>
  );
}