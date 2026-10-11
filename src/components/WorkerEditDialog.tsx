import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardHat, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { LoginLinkDialog } from "@/components/LoginLinkDialog";
import { MOBILE_REGEX } from "@/lib/auth/identity";
import { resetPasswordFn, updateUserFn } from "@/lib/api/users.functions";
import type { Worker } from "@/routes/_authenticated/labour";

const toForm = (w: Worker) => ({
  name: w.name,
  username: w.username ?? "",
  email: w.email ?? "",
  phone: w.phone ?? "",
  wage_full_ot: (w.wage_full_ot ?? "") as string | number,
  wage_day: (w.wage_day ?? "") as string | number,
  wage_half: (w.wage_half ?? "") as string | number,
  wage_ot: (w.wage_ot ?? "") as string | number,
  notes: w.notes ?? "",
});

/**
 * Edit one worker's account details in place (used by the pencil on the Labour page).
 * Same fields and actions as Manage Workers: details, wages, send reset link, deactivate / enable login.
 */
export function WorkerEditDialog({ worker, onClose }: { worker: Worker | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => (worker ? toForm(worker) : toForm({} as Worker)));
  const [active, setActive] = useState(true);
  const [handover, setHandover] = useState<{
    user: { id: string; name: string; phone: string | null; email?: string | null };
    tokenHash: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    if (worker) {
      setForm(toForm(worker));
      setActive(worker.active);
    }
  }, [worker]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workers"] });
    qc.invalidateQueries({ queryKey: ["worker"] });
  };

  const payloadFor = (w: Worker, isActive: boolean) => ({
    id: w.id,
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    username: form.username.trim(),
    role: "worker" as const,
    daily_wage: Number(form.wage_day) || 0,
    wage_day: Number(form.wage_day) || 0,
    wage_half: Number(form.wage_half) || 0,
    wage_full_ot: Number(form.wage_full_ot) || 0,
    wage_ot: Number(form.wage_ot) || 0,
    notes: form.notes.trim() || null,
    active: isActive,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!worker) return;
      const p = payloadFor(worker, active);
      if (!p.name) throw new Error("Name is required");
      if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) throw new Error("Enter a valid email address");
      if (!p.phone) throw new Error("Mobile number is required — it's the login id");
      if (!MOBILE_REGEX.test(p.phone)) throw new Error("Mobile number must be 10 digits and start with 6, 7, 8 or 9");
      await updateUserFn({ data: p });
    },
    onSuccess: () => {
      refresh();
      toast.success("Worker updated");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLogin = useMutation({
    mutationFn: async (next: boolean) => {
      if (!worker) return next;
      if (next && !form.phone.trim()) throw new Error("Add a mobile number before enabling login");
      await updateUserFn({ data: payloadFor(worker, next) });
      return next;
    },
    onSuccess: (next) => {
      setActive(next);
      refresh();
      toast.success(next ? "Login enabled. Use “Send reset link” if they need a new password." : "Account deactivated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error("No worker selected");
      return resetPasswordFn({ data: { id: worker.id } });
    },
    onSuccess: (link) => {
      if (!worker) return;
      refresh();
      setHandover({
        user: { id: worker.id, name: form.name || worker.name, phone: worker.phone, email: worker.email },
        tokenHash: link.tokenHash,
        type: link.type,
      });
      toast.success("Old password cancelled. Send them the reset link.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (k: "wage_full_ot" | "wage_day" | "wage_half" | "wage_ot", label: string) => (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        placeholder="0"
      />
    </div>
  );

  return (
    <>
      <Dialog open={!!worker} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-primary" /> Edit worker
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Username (optional)</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                They can sign in with their mobile number, email or username — plus their password.
              </p>
            </div>
            <div>
              <Label>Email (optional, for contact)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </div>
            <div>
              <Label>Mobile number</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                inputMode="numeric"
                maxLength={10}
              />
              {form.phone.length > 0 && !MOBILE_REGEX.test(form.phone) && (
                <p className="mt-1 text-xs text-destructive">Must be 10 digits, starting with 6, 7, 8 or 9</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Wage per attendance type (₹)</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {num("wage_full_ot", "Full day + OT")}
                {num("wage_day", "Day")}
                {num("wage_half", "Half day")}
                {num("wage_ot", "OT")}
              </div>
              <p className="text-xs text-muted-foreground">
                Changing a rate only affects attendance marked from now on.
              </p>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            {worker && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <ConfirmDelete
                  onConfirm={() => reset.mutate()}
                  title={`Reset ${worker.name}'s password?`}
                  description="Their current password stops working right away and their signed-in devices are signed out. You get a one-time link to send them; they open it and choose a new password."
                  confirmLabel="Make reset link"
                >
                  <Button type="button" variant="outline" disabled={reset.isPending}>
                    <KeyRound className="h-4 w-4 mr-1.5" /> Send reset link
                  </Button>
                </ConfirmDelete>
                {!active ? (
                  <Button type="button" variant="outline" onClick={() => setLogin.mutate(true)} disabled={setLogin.isPending}>
                    <UserPlus className="h-4 w-4 mr-1.5" /> Enable login
                  </Button>
                ) : (
                  <ConfirmDelete
                    onConfirm={() => setLogin.mutate(false)}
                    title={`Deactivate ${worker.name}'s account?`}
                    description="This user will no longer be able to log in. Their records will remain available to staff."
                    confirmLabel="Deactivate account"
                  >
                    <Button type="button" variant="destructive">
                      Deactivate account
                    </Button>
                  </ConfirmDelete>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoginLinkDialog
        user={handover?.user ?? null}
        allowMagic={false}
        ready={handover ? { kind: "reset", tokenHash: handover.tokenHash, type: handover.type } : null}
        onClose={() => setHandover(null)}
      />
    </>
  );
}