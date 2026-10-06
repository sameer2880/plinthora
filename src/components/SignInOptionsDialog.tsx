import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, ClipboardPaste, Link2, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "h-12 rounded-full border-border bg-background px-5 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Ask your admin" — opens the request form for forgotten credentials. */
  onAskAdmin?: () => void;
}

type View = "options" | "link";

/** Pulls token_hash + type out of whatever was pasted (a bare link or the whole WhatsApp message). */
function parseLink(text: string): { tokenHash: string; type: "magiclink" | "recovery" } | null {
  const candidate = text.match(/https?:\/\/\S+/)?.[0] ?? text.trim();
  let tokenHash: string | null = null;
  let type: string | null = null;
  try {
    const u = new URL(candidate);
    tokenHash = u.searchParams.get("token_hash");
    type = u.searchParams.get("type");
  } catch {
    const t = text.match(/token_hash=([^&\s]+)/);
    const k = text.match(/type=(magiclink|recovery)/);
    tokenHash = t ? decodeURIComponent(t[1]) : null;
    type = k ? k[1] : null;
  }
  if (!tokenHash || (type !== "magiclink" && type !== "recovery")) return null;
  return { tokenHash, type };
}

/**
 * "Sign in with more options" on the sign-in screen. Lists the other ways in:
 *  - Login with link: paste the sign-in / password-reset link the admin sent (e.g. on WhatsApp).
 *    We hand it to /auth/link, which signs them in (and asks for a new password after a reset link).
 *  - Ask your admin: opens the request form.
 */
export function SignInOptionsDialog({ open, onOpenChange, onAskAdmin }: Props) {
  const [view, setView] = useState<View>("options");
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setView("options");
    setValue("");
    setErr("");
  }, [open]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text);
        setErr("");
      }
    } catch {
      setErr("Couldn't read the clipboard — long-press in the box and choose Paste.");
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLink(value);
    if (!parsed) return setErr("That doesn't look like a sign-in link. Copy the full link your admin sent and paste it here.");
    window.location.assign(
      `/auth/link?token_hash=${encodeURIComponent(parsed.tokenHash)}&type=${parsed.type}`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-[1.5rem] sm:p-7">
        {view === "options" && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>More ways to sign in</DialogTitle>
              <DialogDescription>Choose how you want to get in.</DialogDescription>
            </DialogHeader>

            <button
              type="button"
              onClick={() => setView("link")}
              className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left transition-colors hover:bg-muted/60"
            >
              <Link2 className="h-5 w-5 text-primary" />
              <span className="flex-1">
                <span className="block text-sm font-semibold">Login with link</span>
                <span className="block text-xs text-muted-foreground">Paste the link your admin sent you</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            {onAskAdmin && (
              <button
                type="button"
                onClick={onAskAdmin}
                className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left transition-colors hover:bg-muted/60"
              >
                <LifeBuoy className="h-5 w-5 text-primary" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Ask your admin</span>
                  <span className="block text-xs text-muted-foreground">Forgot your password or username?</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}

            <Button type="button" variant="ghost" className="h-10 w-full rounded-full text-sm" onClick={() => onOpenChange(false)}>
              Back to sign in
            </Button>
          </div>
        )}

        {view === "link" && (
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Login with link</DialogTitle>
            <DialogDescription>
              Paste the sign-in link your admin sent you (for example on WhatsApp). No password needed.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            placeholder="Paste the link here"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setErr("");
            }}
            className={inputClass}
          />

          <Button type="button" variant="outline" className="h-10 w-full rounded-full text-sm" onClick={paste}>
            <ClipboardPaste className="mr-2 h-4 w-4" /> Paste from clipboard
          </Button>

          {err && <p className="text-xs font-medium text-destructive">{err}</p>}

          <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
            <Button type="submit" className="h-11 w-full rounded-full font-semibold">
              Continue
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full rounded-full text-sm"
              onClick={() => setView("options")}
            >
              Back
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}