import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Power, ShieldAlert, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { createBusinessFn, deleteBusinessFn } from "@/lib/api/businesses.functions";
import { LoginLinkDialog } from "@/components/LoginLinkDialog";
import { isSuperAdmin } from "@/lib/auth/access";
import { MOBILE_REGEX } from "@/lib/auth/identity";
import { PLATFORM_NAME } from "@/lib/brand";
import { ALL_FEATURE_KEYS, FEATURE_PAGES, type FeatureKey } from "@/lib/features";
import type { Business } from "@/lib/auth/session";

export const Route = createFileRoute("/_authenticated/platform/businesses")({
  head: () => ({
    meta: [{ title: `Businesses — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: PlatformBusinesses,
});

const emptyCreate = () => ({
  name: "",
  short_name: "",
  location: "",
  owner_line: "",
  phone: "",
  adminName: "",
  adminPhone: "",
  adminEmail: "",
  adminUsername: "",
  enabledPages: [...ALL_FEATURE_KEYS] as FeatureKey[],
});

/** Checkbox grid used in both the Add and Edit business dialogs. */
function PageAssignment({
  value,
  onChange,
}: {
  value: FeatureKey[];
  onChange: (next: FeatureKey[]) => void;
}) {
  const toggle = (key: FeatureKey, checked: boolean) => {
    onChange(checked ? [...value, key] : value.filter((k) => k !== key));
  };

  return (
    <div>
      <Label>Pages for this business</Label>
      <p className="mb-2 text-xs text-muted-foreground">
        Only the pages you turn on here appear for this business's admin, managers and workers.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
        {FEATURE_PAGES.map((f) => (
          <label key={f.key} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={value.includes(f.key)}
              onCheckedChange={(checked) => toggle(f.key, checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">{f.label}</span>
              <span className="block text-xs text-muted-foreground">{f.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

type UserCounts = Record<string, { users: number; admins: number }>;

function PlatformBusinesses() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyCreate());
  const [editing, setEditing] = useState<Business | null>(null);
  const [deleting, setDeleting] = useState<Business | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const allowed = isSuperAdmin();

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ["platform", "businesses"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").order("name");
      if (error) throw error;
      return data as Business[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["platform", "user-counts"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("business_id, role");
      if (error) throw error;
      const result: UserCounts = {};
      for (const row of data ?? []) {
        const entry = (result[row.business_id] ??= { users: 0, admins: 0 });
        entry.users += 1;
        if (row.role === "admin") entry.admins += 1;
      }
      return result;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["platform"] });
  };

  // One-time link for the new business's first admin.
  const [inviteFor, setInviteFor] = useState<{ name: string; phone: string; tokenHash: string; type: string } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const adminPhone = form.adminPhone.trim();
      if (form.name.trim().length < 2) throw new Error("Business name is required");
      if (!form.adminName.trim()) throw new Error("Admin name is required");
      if (!MOBILE_REGEX.test(adminPhone)) {
        throw new Error("Admin mobile must be 10 digits and start with 6, 7, 8 or 9");
      }
      const created = await createBusinessFn({
        data: {
          name: form.name.trim(),
          short_name: form.short_name.trim() || undefined,
          location: form.location.trim() || undefined,
          owner_line: form.owner_line.trim() || undefined,
          phone: form.phone.trim() || undefined,
          adminName: form.adminName.trim(),
          adminPhone,
          adminEmail: form.adminEmail.trim() || undefined,
          adminUsername: form.adminUsername.trim() || undefined,
          enabledPages: form.enabledPages,
        },
      });
      return { adminPhone, adminName: form.adminName.trim(), invite: created.invite };
    },
    onSuccess: ({ adminPhone, adminName, invite }) => {
      refresh();
      if (invite) {
        setInviteFor({ name: adminName, phone: adminPhone, tokenHash: invite.tokenHash, type: invite.type });
        toast.success("Business created. Send its admin the one-time link.");
      } else {
        toast.success("Business created. Make the admin's link from Users → Sign-in link.");
      }
      setCreateOpen(false);
      setForm(emptyCreate());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async (b: Business) => {
      if (b.name.trim().length < 2) throw new Error("Business name is required");
      const nullable = (v: string | null) => v?.trim() || null;
      const { error } = await supabase
        .from("businesses")
        .update({
          name: b.name.trim(),
          short_name: nullable(b.short_name),
          location: nullable(b.location),
          owner_line: nullable(b.owner_line),
          phone: nullable(b.phone),
          enabled_pages: b.enabled_pages,
        })
        .eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Business updated");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("businesses").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { active }) => {
      refresh();
      toast.success(active ? "Business activated" : "Business deactivated — its users can no longer sign in");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      await deleteBusinessFn({ data: { businessId: deleting.id, confirmName: confirmName.trim() } });
    },
    onSuccess: () => {
      refresh();
      toast.success("Business deleted");
      setDeleting(null);
      setConfirmName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <div className="font-semibold">Platform admin only</div>
            <p className="text-sm text-muted-foreground">Only the platform admin can manage businesses.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Building2 className="h-6 w-6 text-primary" /> Businesses
          </h2>
          <p className="text-sm text-muted-foreground">
            Add a business with its first admin, edit it, switch it off, or delete it. Each business's admin then adds
            their own managers and workers.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add business
        </Button>
      </div>

      {isLoading && <p className="py-10 text-center text-muted-foreground">Loading…</p>}
      {!isLoading && businesses.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">No businesses yet. Add the first one.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {businesses.map((b) => {
          const c = counts[b.id] ?? { users: 0, admins: 0 };
          return (
            <Card key={b.id}>
              <CardContent className="space-y-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{b.name}</span>
                    {!b.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[b.location, b.phone].filter(Boolean).join(" · ") || "No location or phone yet"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.users} user{c.users === 1 ? "" : "s"} · {c.admins} admin{c.admins === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {FEATURE_PAGES.filter((f) => (b.enabled_pages ?? []).includes(f.key)).map((f) => (
                      <span
                        key={f.key}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                      >
                        {f.label}
                      </span>
                    ))}
                    {(b.enabled_pages ?? []).length === 0 && (
                      <span className="text-[10px] text-muted-foreground">No optional pages assigned yet</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/platform/users" search={{ business: b.id }}>
                      <Users className="mr-1.5 h-4 w-4" /> Users
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...b })}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Edit
                  </Button>
                  <ConfirmDelete
                    onConfirm={() => setActive.mutate({ id: b.id, active: !b.active })}
                    title={b.active ? `Deactivate ${b.name}?` : `Activate ${b.name}?`}
                    description={
                      b.active
                        ? "Everyone in this business (admin, managers, workers) is blocked from signing in until you activate it again. No data is deleted."
                        : "The business and its users can sign in again."
                    }
                    confirmLabel={b.active ? "Deactivate" : "Activate"}
                  >
                    <Button size="sm" variant="outline">
                      <Power className="mr-1.5 h-4 w-4" /> {b.active ? "Deactivate" : "Activate"}
                    </Button>
                  </ConfirmDelete>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleting(b);
                      setConfirmName("");
                    }}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add business */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add business</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div>
              <Label>Business name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ABC Centring Works" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Town / area" />
              </div>
              <div>
                <Label>Short name</Label>
                <Input value={form.short_name} maxLength={12} onChange={(e) => setForm({ ...form, short_name: e.target.value })} placeholder="ABC" />
              </div>
            </div>
            <div>
              <Label>Receipt contact line (optional)</Label>
              <Input value={form.owner_line} onChange={(e) => setForm({ ...form, owner_line: e.target.value })} placeholder="Pro: Owner Name Ph.no: 9876543210" />
            </div>
            <div>
              <Label>Business phone (optional)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
            </div>

            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-sm font-semibold">First admin for this business</p>
              <div>
                <Label>Admin name</Label>
                <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Admin mobile</Label>
                  <Input
                    value={form.adminPhone}
                    onChange={(e) => setForm({ ...form, adminPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digits"
                  />
                </div>
                <div>
                  <Label>Username (optional)</Label>
                  <Input
                    value={form.adminUsername}
                    onChange={(e) => setForm({ ...form, adminUsername: e.target.value.replace(/\s/g, "") })}
                    autoCapitalize="none"
                  />
                </div>
              </div>
              <div>
                <Label>Admin email (optional)</Label>
                <Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                The admin signs in with their mobile number, email or username. After you create the business you
                get a one-time link to send them; they open it and choose their own password.
              </p>
            </div>

            <div className="border-t border-border pt-3">
              <PageAssignment
                value={form.enabledPages}
                onChange={(enabledPages) => setForm({ ...form, enabledPages })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create business"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit business */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit business</DialogTitle>
            <DialogDescription>
              Basic details. The business's own admin sets its logo, stamp, signature and links in Business Settings.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Business name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Location</Label>
                  <Input value={editing.location ?? ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
                </div>
                <div>
                  <Label>Short name</Label>
                  <Input value={editing.short_name ?? ""} maxLength={12} onChange={(e) => setEditing({ ...editing, short_name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Receipt contact line</Label>
                <Input value={editing.owner_line ?? ""} onChange={(e) => setEditing({ ...editing, owner_line: e.target.value })} />
              </div>
              <div>
                <Label>Business phone</Label>
                <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} inputMode="tel" />
              </div>

              <div className="border-t border-border pt-3">
                <PageAssignment
                  value={(editing.enabled_pages ?? []) as FeatureKey[]}
                  onChange={(enabled_pages) => setEditing({ ...editing, enabled_pages })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete business */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDeleting(null);
            setConfirmName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the business and <strong>everything in it</strong>: all rentals, diary notes,
              worker records, attendance and payments, and every login account. It cannot be undone. To keep the data
              and only block sign-in, use Deactivate instead.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Type the business name to confirm</Label>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={deleting?.name} />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
                setConfirmName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending || confirmName.trim() !== (deleting?.name ?? "").trim()}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoginLinkDialog
        user={inviteFor ? { id: "", name: inviteFor.name, phone: inviteFor.phone } : null}
        allowMagic={false}
        ready={inviteFor ? { kind: "invite", tokenHash: inviteFor.tokenHash, type: inviteFor.type } : null}
        onClose={() => setInviteFor(null)}
      />
    </div>
  );
}