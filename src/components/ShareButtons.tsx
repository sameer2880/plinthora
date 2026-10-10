import { Copy, Link2, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText, extractLink, mailtoUrl } from "@/lib/share";
import { whatsappUrl } from "@/lib/rentals";
import { cn } from "@/lib/utils";

/**
 * One row of share actions used everywhere a message with a link can be sent:
 *   Copy link · Copy message · WhatsApp · Email
 * "Copy link" appears only when the message actually contains a link. Email opens the
 * person's own email app with `subject` and the message as the body, so nothing is sent
 * from our side. `email` is optional; without it the sender types the address themselves.
 */
export function ShareButtons({
  message,
  subject,
  phone,
  email,
  link,
  onShared,
  className,
}: {
  message: string;
  subject: string;
  phone?: string | null;
  email?: string | null;
  /** Defaults to the first link found in `message`. */
  link?: string | null;
  onShared?: () => void;
  className?: string;
}) {
  const url = link ?? extractLink(message);

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {url && (
        <Button type="button" variant="outline" className="min-w-0" onClick={() => copyText(url, "Link copied")}>
          <Link2 className="mr-1.5 h-4 w-4 shrink-0" />
          <span className="truncate">Copy link</span>
        </Button>
      )}
      <Button type="button" variant="outline" className="min-w-0" onClick={() => copyText(message, "Message copied")}>
        <Copy className="mr-1.5 h-4 w-4 shrink-0" />
        <span className="truncate">Copy message</span>
      </Button>
      {phone && (
        <Button
          asChild
          className="min-w-0 bg-[#25D366] text-white hover:bg-[#1ebe5b]"
        >
          <a href={whatsappUrl(phone, message)} target="_blank" rel="noreferrer" onClick={onShared}>
            <MessageCircle className="mr-1.5 h-4 w-4 shrink-0" />
            <span className="truncate">WhatsApp</span>
          </a>
        </Button>
      )}
      <Button asChild variant="secondary" className="min-w-0">
        <a href={mailtoUrl(email, subject, message)} onClick={onShared}>
          <Mail className="mr-1.5 h-4 w-4 shrink-0" />
          <span className="truncate">Email</span>
        </a>
      </Button>
    </div>
  );
}