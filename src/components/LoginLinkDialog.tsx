import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, MessageCircle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createLoginLinkFn } from "@/lib/api/users.functions";
import { PLATFORM_NAME } from "@/lib/brand";
import { whatsappUrl } from "@/lib/rentals";

type Kind = "magic" | "reset";

/**
 * Platform admin: create a one-time sign-in link ("magic link") or a
 * password-reset link for a user, then copy it or send it on WhatsApp.
 */
export function LoginLinkDialog({
  user,
  onClose,
}: {
  user: { id: string; name: string; phone: string | null } | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [result, setResult] = useState<{ kind: Kind; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    setResult(null);
    setCopied(false);
    onClose();
  };

  const generate = async (kind: Kind) => {
    if (!user) return;
    setBusy(kind);
    setCopied(false);
    try {
      const r = await createLoginLinkFn({ data: { id: user.id, kind } });
      const url = `${window.location.origin}/auth/link?token_hash=${encodeURIComponent(r.tokenHash)}&type=${r.type}`;
      setResult({ kind, url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to create the link");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand");
    }
  };

  const message = result
    ? result.kind === "reset"
      ? `Hi ${user?.name}, use this link to reset your ${PLATFORM_NAME} password. It works once and expires soon:\n${result.url}`
      : `Hi ${user?.name}, use this link to sign in to ${PLATFORM_NAME}. It works once and expires soon:\n${result.url}`
    : "";

  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign-in link for {user?.name}</DialogTitle>
          <DialogDescription>
            Creates a one-time link. Anyone who opens it gets into this account, so send it only to {user?.name}.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="grid gap-2">
            <Button variant="outline" className="h-auto justify-start gap-3 py-3 text-left" disabled={busy !== null} onClick={() => generate("magic")}>
              {busy === "magic" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 shrink-0" />}
              <span>
                <span className="block font-semibold">Magic sign-in link</span>
                <span className="block text-xs font-normal text-muted-foreground">Signs them in without a password. Their password stays as it is.</span>
              </span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 py-3 text-left" disabled={busy !== null} onClick={() => generate("reset")}>
              {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 shrink-0" />}
              <span>
                <span className="block font-semibold">Password reset link</span>
                <span className="block text-xs font-normal text-muted-foreground">Signs them in and asks for a new password. Their other device is signed out.</span>
              </span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{result.kind === "reset" ? "Password reset link ready" : "Magic sign-in link ready"}</p>
            <div className="flex gap-2">
              <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button size="icon" variant="outline" aria-label="Copy link" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {user?.phone && (
                <Button asChild>
                  <a href={whatsappUrl(user.phone, message)} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1.5 h-4 w-4" /> Send on WhatsApp
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={() => setResult(null)}>
                Make a different link
              </Button>
              <Button variant="ghost" onClick={close}>
                Done
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Works once and expires soon. Creating a new link doesn't cancel an unused one, but each can be used only once.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}