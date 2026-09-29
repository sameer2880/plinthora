import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";
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

export interface WhatsAppPreview {
  /** Customer phone number the message goes to. */
  phone: string;
  /** The message text (staff can still edit it before sending). */
  message: string;
  /** Customer name, shown in the description. */
  name?: string;
  /** Dialog heading. Defaults to "Send WhatsApp message". */
  title?: string;
}

/**
 * Shows the WhatsApp message first, so staff can read / edit it, and only
 * opens WhatsApp when "Send on WhatsApp" is pressed.
 *
 * Usage:
 *   const [wa, setWa] = useState<WhatsAppPreview | null>(null);
 *   ...
 *   <Button onClick={() => setWa({ phone, name, message })}>Send on WhatsApp</Button>
 *   <WhatsAppPreviewDialog preview={wa} onClose={() => setWa(null)} />
 */
export function WhatsAppPreviewDialog({
  preview,
  onClose,
}: {
  preview: WhatsAppPreview | null;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");

  // Load the message each time a new preview is opened.
  useEffect(() => {
    if (preview) setMessage(preview.message);
  }, [preview]);

  if (!preview) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually");
    }
  };

  const send = () => {
    // Open inside the click handler so the browser doesn't block the popup.
    window.open(whatsappUrl(preview.phone, message), "_blank", "noopener");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{preview.title ?? "Send WhatsApp message"}</DialogTitle>
          <DialogDescription>
            WhatsApp opens with this message ready for {preview.name ? `${preview.name} ` : ""}({preview.phone}).
            Check it, then press send there.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={11}
          className="text-sm"
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={copy}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          <Button onClick={send} className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
            <MessageCircle className="mr-1.5 h-4 w-4" /> Send on WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}