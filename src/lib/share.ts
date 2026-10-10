import { toast } from "sonner";

/** First http(s) link inside a message, or null. Trailing punctuation is not part of the link. */
export function extractLink(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"]+/);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}

/**
 * `mailto:` address that opens the person's email app with the subject and body already written.
 * `to` may be empty — the sender then just types the address in their email app.
 */
export function mailtoUrl(to: string | null | undefined, subject: string, body: string) {
  const address = (to ?? "").trim();
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Copies text and tells the person. Falls back to a hidden textarea where the Clipboard API is blocked. */
export async function copyText(text: string, what = "Copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        toast.success(what);
        return true;
      }
    } catch {
      /* fall through */
    }
    toast.error("Couldn't copy — select the text and copy it by hand");
    return false;
  }
}