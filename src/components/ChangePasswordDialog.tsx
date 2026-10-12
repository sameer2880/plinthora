import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserCog, Shield, Crown, KeyRound, LogOut, ChevronRight, Building2 } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { lock } from "@/lib/auth/lock";
import { passwordProblem } from "@/lib/auth/password";

const ROLE_DISPLAY = {
  manager: { label: "Manager", icon: Shield, className: "bg-primary/10 text-primary" },
  admin: { label: "Admin", icon: Crown, className: "bg-amber-500/10 text-amber-600" },
  super_admin: { label: "Platform admin", icon: Crown, className: "bg-amber-500/10 text-amber-600" },
} as const;

/**
 * "Manage my account" for the signed-in admin / manager / platform admin:
 * shows who they are and lets them change their own password (a real
 * Supabase Auth password — nothing is stored in the app's tables).
 */
export function ChangePasswordDialog({
  className,
  iconOnly = false,
  renderTrigger,
}: {
  className?: string;
  iconOnly?: boolean;
  /** Use your own element as the opener instead of the default button. */
  renderTrigger?: (openDialog: () => void) => ReactNode;
} = {}) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const { me, business } = useSession();

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error("No account found for this session");
      const problem = passwordProblem(next);
      if (problem) throw new Error(problem);
      if (next !== confirm) {
        throw new Error("New passwords do not match");
      }
      // Prove they know the current password before changing it.
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyError) throw new Error("Current password is incorrect");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setOpen(false);
      setShowForm(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      setErr("");
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (!me || me.role === "worker") return null;

  const roleInfo = ROLE_DISPLAY[me.role as keyof typeof ROLE_DISPLAY] ?? null;
  const RoleIcon = roleInfo?.icon;

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <Button
          variant="outline"
          size="sm"
          className={cn("w-full justify-center gap-2 font-semibold", iconOnly && "gap-0 px-0", className)}
          onClick={() => setOpen(true)}
          aria-label="Manage my account"
          title={iconOnly ? "Manage my account" : undefined}
        >
          <UserCog className="h-4 w-4 shrink-0" />
          {!iconOnly && "Manage my account"}
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setShowForm(false);
            setErr("");
            setCurrent("");
            setNext("");
            setConfirm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <DialogHeader className="border-b border-border px-6 py-4 text-left">
            <DialogTitle className="text-base font-semibold">Manage my account</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {/* Profile */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                {(me.name || "?")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold leading-tight">{me.name}</div>
                {business?.name && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{business.name}</span>
                  </div>
                )}
                {roleInfo && RoleIcon && (
                  <span
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${roleInfo.className}`}
                  >
                    <RoleIcon className="h-3 w-3" /> {roleInfo.label}
                  </span>
                )}
              </div>
            </div>

            {!showForm ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Security
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">Change password</span>
                      <span className="block text-xs text-muted-foreground">Update the password you sign in with</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </div>

                <div className="border-t border-border pt-4">
                  <ConfirmDelete
                    onConfirm={lock}
                    title="Sign out of this account?"
                    description="You will need to sign in again to access the dashboard."
                    confirmLabel="Sign out"
                  >
                    <Button
                      variant="outline"
                      className="w-full justify-center gap-2 border-destructive/40 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </ConfirmDelete>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Change password</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Enter your current password and the new password you want to use.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Current password</Label>
                  <Input
                    type="password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>New password</Label>
                  <Input
                    type="password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm new password</Label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                {err && <p className="text-xs text-destructive">{err}</p>}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border bg-muted/30 px-6 py-3">
            {!showForm ? (
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setErr("");
                    setCurrent("");
                    setNext("");
                    setConfirm("");
                  }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    setErr("");
                    save.mutate();
                  }}
                  disabled={save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}