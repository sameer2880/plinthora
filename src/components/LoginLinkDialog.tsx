import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ShareButtons } from "@/components/ShareButtons";
import { copyText } from "@/lib/share";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createLoginLinkFn } from "@/lib/api/users.functions";
import { loginLinkUrl } from "@/lib/access-requests";
import { PLATFORM_NAME } from "@/lib/brand";

type Kind = "magic" | "reset";
type Ready = { kind: Kind | "invite"; tokenHash: string; type: string };

/**
 * Creates a one-time link for a user, then copies it or sends it on WhatsApp.
 *  - Platform admin: a "magic" sign-in link or a password-reset link.
 *  - Business admin / manager (allowMagic = false): the password-reset link only.
 *  - `ready` skips the choice and shows a link that was just made (new account invite or reset).
 */
export function LoginLinkDialog({
  user,
  onClose,
  allowMagic = true,
  ready = null,
}: {
  user: { id: string; name: string; phone: string | null; email?: string | null } | null;
  onClose: () => void;
  allowMagic?: boolean;
  ready?: Ready | null;
}) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [made, setMade] = useState<{ kind: Kind | "invite"; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const result =
    made ?? (ready ? { kind: ready.kind, url: loginLinkUrl(window.location.origin, ready) } : null);
  const setResult = (v: { kind: Kind | "invite"; url: string } | null) => setMade(v);

  const close = () => {
    setMade(null);
    setCopied(false);
    onClose();
  };

  const generate = async (kind: Kind) => {
    if (!user) return;
    setBusy(kind);
    setCopied(false);
    try {
      const r = await createLoginLinkFn({ data: { id: user.id, kind } });
      setResult({ kind, url: loginLinkUrl(window.location.origin, r) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to create the link");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!result) return;
    if (await copyText(result.url, "Link copied")) setCopied(true);
  };

  const message = result
    ? result.kind === "invite"
      ? `Hi ${user?.name}, your ${PLATFORM_NAME} account is ready. Open this link to choose your password and sign in. It works once and expires soon, so don't share it:\n${result.url}`
      : result.kind === "reset"
      ? `Hi ${user?.name}, use this link to reset your ${PLATFORM_NAME} password. It works once and expires soon:\n${result.url}`
      : `Hi ${user?.name}, use this link to sign in to ${PLATFORM_NAME}. It works once and expires soon:\n${result.url}`
    : "";

  const subject = result
    ? result.kind === "invite"
      ? `Your ${PLATFORM_NAME} account is ready`
      : result.kind === "reset"
        ? `Reset your ${PLATFORM_NAME} password`
        : `Your ${PLATFORM_NAME} sign-in link`
    : "";

  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ready ? `Link for ${user?.name}` : `Sign-in link for ${user?.name}`}</DialogTitle>
          <DialogDescription>
            Creates a one-time link. Anyone who opens it gets into this account, so send it only to {user?.name}.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="grid gap-2">
            {allowMagic && (
            <Button variant="outline" className="h-auto justify-start gap-3 py-3 text-left" disabled={busy !== null} onClick={() => generate("magic")}>
              {busy === "magic" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 shrink-0" />}
              <span>
                <span className="block font-semibold">Magic sign-in link</span>
                <span className="block text-xs font-normal text-muted-foreground">Signs them in without a password. Their password stays as it is.</span>
              </span>
            </Button>
            )}
            <Button variant="outline" className="h-auto justify-start gap-3 py-3 text-left" disabled={busy !== null} onClick={() => generate("reset")}>
              {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 shrink-0" />}
              <span>
                <span className="block font-semibold">Password reset link</span>
                <span className="block text-xs font-normal text-muted-foreground">Cancels their old password, signs out their devices, and asks them to choose a new password.</span>
              </span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{result.kind === "invite" ? "Invite link ready" : result.kind === "reset" ? "Password reset link ready" : "Magic sign-in link ready"}</p>
            <div className="flex gap-2">
              <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
              <Button size="icon" variant="outline" className="shrink-0" aria-label="Copy link" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <ShareButtons message={message} subject={subject} phone={user?.phone} email={user?.email} link={result.url} />
            <div className="flex flex-wrap gap-2">
              {!ready && (
                <Button variant="outline" onClick={() => setResult(null)}>
                  Make a different link
                </Button>
              )}
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