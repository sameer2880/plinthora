import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Forgot password?" on the sign-in page.
 *
 * There is deliberately no self-service reset here any more. The old check (last 4
 * digits of the mobile number) could be guessed, and anyone could lock a real user
 * out by failing on purpose. Passwords are reset by the admin, who sends a
 * one-time link; the person chooses a new password when they open it.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
  onAskAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the "Need access?" request form, pre-set to a password-help request. */
  onAskAdmin?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-[1.5rem] sm:p-7">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Forgot your password?
          </DialogTitle>
          <DialogDescription>
            Ask your admin for a password reset link. They'll send you a one-time link on WhatsApp; open it and choose a
            new password. If you can't reach your admin, send a request and the platform admin will help.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="h-11 rounded-full font-semibold" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onAskAdmin && (
            <Button type="button" className="h-11 rounded-full font-semibold" onClick={onAskAdmin}>
              Send a request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}