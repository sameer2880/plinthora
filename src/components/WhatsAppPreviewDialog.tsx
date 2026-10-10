import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareButtons } from "@/components/ShareButtons";
import { PLATFORM_NAME } from "@/lib/brand";

export interface WhatsAppPreview {
  /** Customer phone number the message goes to. */
  phone: string;
  /** The message text (staff can still edit it before sending). */
  message: string;
  /** Customer name, shown in the description. */
  name?: string;
  /** Dialog heading. Defaults to "Send WhatsApp message". */
  title?: string;
  /** Optional customer email — pre-fills the To: line when sending by email. */
  email?: string | null;
  /** Email subject. Defaults to the dialog heading. */
  subject?: string;
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

        <ShareButtons
          message={message}
          subject={preview.subject ?? `${preview.title ?? "Message"} — ${PLATFORM_NAME}`}
          phone={preview.phone}
          email={preview.email}
          onShared={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}