import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { whatsappUrl } from "@/lib/rentals";
import { buildReceiptPdf, downloadReceiptPdf, type ReceiptPdf } from "@/lib/receipt-pdf";

export interface WhatsAppPreview {
  /** Customer phone number the message goes to. */
  phone: string;
  /** The message text (staff can still edit it before sending). */
  message: string;
  /** Customer name, shown in the description. */
  name?: string;
  /** Dialog heading. Defaults to "Send WhatsApp message". */
  title?: string;
  /**
   * Any rental id of the receipt being shared. When set, the dialog also offers
   * "Send PDF + link" — the receipt is attached as a PDF along with the message.
   */
  receiptId?: string;
}

/**
 * Shows the WhatsApp message first, so staff can read / edit it, and only
 * opens WhatsApp when a send button is pressed.
 *
 * With `receiptId`, the receipt PDF is prepared in the background:
 *  - Phones (Web Share API with files): opens the share sheet with the PDF and
 *    the message (which contains the link) — pick WhatsApp and the customer.
 *  - Desktop / unsupported browsers: the PDF is downloaded and WhatsApp opens
 *    with the message + link, so the PDF just needs to be attached (📎).
 */
export function WhatsAppPreviewDialog({
  preview,
  onClose,
}: {
  preview: WhatsAppPreview | null;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [pdf, setPdf] = useState<ReceiptPdf | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Load the message each time a new preview is opened.
  useEffect(() => {
    if (preview) setMessage(preview.message);
  }, [preview]);

  // Prepare the PDF ahead of time so the share sheet can open straight from the
  // click (browsers only allow sharing right after a user gesture).
  useEffect(() => {
    setPdf(null);
    if (!preview?.receiptId) {
      setPdfState("idle");
      return;
    }
    let cancelled = false;
    setPdfState("loading");
    buildReceiptPdf(preview.receiptId)
      .then((p) => {
        if (cancelled) return;
        setPdf(p);
        setPdfState("ready");
      })
      .catch(() => {
        if (!cancelled) setPdfState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [preview?.receiptId]);

  if (!preview) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually");
    }
  };

  const sendTextOnly = () => {
    // Open inside the click handler so the browser doesn't block the popup.
    window.open(whatsappUrl(preview.phone, message), "_blank", "noopener");
    onClose();
  };

  const sendPdf = async () => {
    if (!pdf) return;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const shareData: ShareData = { files: [pdf.file], text: message };

    if (nav.canShare?.(shareData) && nav.share) {
      try {
        await nav.share(shareData);
        onClose();
      } catch (err) {
        // AbortError = the user closed the share sheet; nothing to do.
        if ((err as Error)?.name !== "AbortError") {
          toast.error("Couldn't open the share sheet — try again");
        }
      }
      return;
    }

    // Fallback (desktop): download the PDF, open WhatsApp with the message + link.
    downloadReceiptPdf(pdf);
    window.open(whatsappUrl(preview.phone, message), "_blank", "noopener");
    toast.success("PDF downloaded — attach it in WhatsApp with the 📎 button", { duration: 8000 });
    onClose();
  };

  const showPdf = !!preview.receiptId;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{preview.title ?? "Send WhatsApp message"}</DialogTitle>
          <DialogDescription>
            {showPdf
              ? `The receipt PDF and this message (with the link) go to ${preview.name ? `${preview.name} ` : ""}(${preview.phone}). Check it, then press send.`
              : `WhatsApp opens with this message ready for ${preview.name ? `${preview.name} ` : ""}(${preview.phone}). Check it, then press send there.`}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={11}
          className="text-sm"
        />

        {showPdf && pdfState === "error" && (
          <p className="text-xs text-destructive">
            Couldn't prepare the PDF — you can still send the link only.
          </p>
        )}

        <DialogFooter className="gap-2 sm:flex-wrap">
          <Button variant="outline" onClick={copy}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          {showPdf ? (
            <>
              <Button variant="outline" onClick={sendTextOnly}>
                <MessageCircle className="mr-1.5 h-4 w-4" /> Link only
              </Button>
              <Button
                onClick={sendPdf}
                disabled={pdfState !== "ready"}
                className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              >
                {pdfState === "loading" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                {pdfState === "loading" ? "Preparing PDF…" : "Send PDF + link"}
              </Button>
            </>
          ) : (
            <Button onClick={sendTextOnly} className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
              <MessageCircle className="mr-1.5 h-4 w-4" /> Send on WhatsApp
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}