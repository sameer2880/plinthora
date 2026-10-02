import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Power, Search, ShieldAlert, Trash2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { createUserFn, deleteUserFn, resetPasswordFn, updateUserFn } from "@/lib/api/users.functions";
import { isSuperAdmin } from "@/lib/auth/access";
import { MOBILE_REGEX } from "@/lib/auth/identity";
import type { UserRole } from "@/lib/auth/roles";
import { PLATFORM_NAME } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/platform/users")({
  validateSearch: (search: Record<string, unknown>): { business?: string } => ({
    business: typeof search.business === "string" ? search.business : undefined,
  }),
  head: () => ({
    meta: [{ title: `Users — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: PlatformUsers,
});

interface UserRow {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  role: UserRole;
  active: boolean;
  daily_wage: number | string | null;
  notes: string | null;
  last_seen_at: string | null;
}

const ROLE_LABEL: Record<UserRole, string> = { admin: "Admin", manager: "Manager", worker: "Worker" };
const ROLE_BADGE: Record<UserRole, string> = {
  admin: "bg-amber-500/10 text-amber-600",
  manager: "bg-primary/10 text-primary",
  worker: "bg-muted text-muted-foreground",
};

const emptyForm = (businessId = "") => ({
  businessId,
  name: "",
  phone: "",
  email: "",
  username: "",
  role: "admin" as UserRole,
  daily_wage: "" as string | number,
  notes: "",
});

function PlatformUsers() {
  const qc = useQueryClient();
  const { business: businessParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const allowed = isSuperAdmin();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(emptyForm());

  const filter = businessParam ?? "all";

  const { data: businesses = [] } = useQuery({
    queryKey: ["platform", "businesses"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").order("name");
      if (error) throw error;
      return data as { id: string; name: string; active: boolean }[];
    },
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["platform", "users"],
    enabled: allowed,
    // Refresh often so "Active now" / "Last seen" stay current while this page is open.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("id, business_id, name, phone, email, username, role, active, daily_wage, notes, last_seen_at")
        .order("name");
      if (error) throw error;
      return data as UserRow[];
    },
  });

  // "Active now" lasts 2.5 minutes after the last heartbeat (the app pings every minute).
  const ACTIVE_WINDOW_MS = 150_000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const lastSeen = (u: UserRow): { active: boolean; label: string } => {
    if (!u.last_seen_at) return { active: false, label: "Not seen yet" };
    const at = new Date(u.last_seen_at);
    if (now - at.getTime() < ACTIVE_WINDOW_MS) return { active: true, label: "Active now" };
    return {
      active: false,
      label: `Last seen ${formatDistanceToNow(at, { addSuffix: true })} · ${at.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
    };
  };

  const businessName = (id: string) => businesses.find((b) => b.id === id)?.name ?? "—";

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.business_id !== filter) return false;
      if (!q) return true;
      return [u.name, u.phone, u.email, u.username].some((v) => v?.toLowerCase().includes(q));
    });
  }, [users, filter, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["platform"] });

  const asPayload = (u: UserRow, active: boolean) => ({
    id: u.id,
    name: u.name,
    phone: u.phone ?? "",
    email: u.email ?? "",
    username: u.username ?? "",
    role: u.role,
    daily_wage: Number(u.daily_wage) || 0,
    notes: u.notes,
    active,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        role: form.role,
        daily_wage: form.role === "worker" ? Number(form.daily_wage) || 0 : 0,
        notes: form.notes.trim() || null,
      };
      if (!payload.name) throw new Error("Name is required");
      if (!MOBILE_REGEX.test(payload.phone)) {
        throw new Error("Mobile number must be 10 digits and start with 6, 7, 8 or 9");
      }
      if (editing) {
        await updateUserFn({ data: { ...payload, id: editing.id, active: editing.active } });
      } else {
        if (!form.businessId) throw new Error("Choose a business");
        await createUserFn({ data: { ...payload, businessId: form.businessId } });
      }
    },
    onSuccess: () => {
      refresh();
      toast.success(editing ? "User updated" : "User added — their mobile number is the first password");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (u: UserRow) => {
      await updateUserFn({ data: asPayload(u, !u.active) });
    },
    onSuccess: (_, u) => {
      refresh();
      toast.success(u.active ? "Account deactivated" : "Account activated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: async (u: UserRow) => {
      await resetPasswordFn({ data: { id: u.id } });
    },
    onSuccess: (_, u) => toast.success(`Password reset to ${u.phone}. They'll be asked to choose a new one at next sign-in.`),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (u: UserRow) => {
      await deleteUserFn({ data: { id: u.id } });
    },
    onSuccess: () => {
      refresh();
      toast.success("User deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(filter !== "all" ? filter : ""));
    setOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setForm({
      businessId: u.business_id,
      name: u.name,
      phone: u.phone ?? "",
      email: u.email ?? "",
      username: u.username ?? "",
      role: u.role,
      daily_wage: u.daily_wage ?? "",
      notes: u.notes ?? "",
    });
    setOpen(true);
  };

  if (!allowed) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <div className="font-semibold">Platform admin only</div>
            <p className="text-sm text-muted-foreground">Only the platform admin can manage users across businesses.</p>
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
            <Users className="h-6 w-6 text-primary" /> Users
          </h2>
          <p className="text-sm text-muted-foreground">
            Admins, managers and workers of every business. You manage their accounts here; you never see a
            business's rentals, diary or labour records.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add user
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={filter}
          onValueChange={(v) => navigate({ search: { business: v === "all" ? undefined : v }, replace: true })}
        >
          <SelectTrigger className="sm:w-64">
            <SelectValue placeholder="All businesses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All businesses</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, mobile, email or username" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading && <p className="py-10 text-center text-muted-foreground">Loading…</p>}
      {!isLoading && visible.length === 0 && <p className="py-10 text-center text-muted-foreground">No users found.</p>}

      <div className="grid gap-3">
        {visible.map((u) => (
          <Card key={u.id} className={u.active ? undefined : "opacity-70"}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-semibold">{u.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[u.role]}`}>
                    {ROLE_LABEL[u.role]}
                  </span>
                  {!u.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Deactivated
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {businessName(u.business_id)}
                  {u.phone ? ` · ${u.phone}` : ""}
                  {u.username ? ` · @${u.username}` : ""}
                  {u.email ? ` · ${u.email}` : ""}
                </div>
                {(() => {
                  const seen = lastSeen(u);
                  return (
                    <div
                      className={`flex items-center gap-1.5 text-xs ${seen.active ? "font-semibold text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {seen.active && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                      {seen.label}
                    </div>
                  );
                })()}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="icon" variant="outline" aria-label="Edit" onClick={() => openEdit(u)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <ConfirmDelete
                  onConfirm={() => reset.mutate(u)}
                  title={`Reset ${u.name}'s password?`}
                  description={`Their password becomes their mobile number (${u.phone ?? "—"}) and they must choose a new one at next sign-in.`}
                  confirmLabel="Reset password"
                >
                  <Button size="icon" variant="outline" aria-label="Reset password">
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </ConfirmDelete>
                <ConfirmDelete
                  onConfirm={() => toggle.mutate(u)}
                  title={u.active ? `Deactivate ${u.name}?` : `Activate ${u.name}?`}
                  description={u.active ? "They can't sign in until you activate the account again." : "They can sign in again."}
                  confirmLabel={u.active ? "Deactivate" : "Activate"}
                >
                  <Button size="icon" variant="outline" aria-label={u.active ? "Deactivate" : "Activate"}>
                    <Power className="h-4 w-4" />
                  </Button>
                </ConfirmDelete>
                <ConfirmDelete
                  onConfirm={() => remove.mutate(u)}
                  title={`Delete ${u.name}?`}
                  description="Their account is removed for good, along with their attendance, payment and feedback records. This can't be undone."
                >
                  <Button size="icon" variant="outline" className="text-destructive hover:text-destructive" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </ConfirmDelete>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <div>
              <Label>Business</Label>
              <Select value={form.businessId} onValueChange={(v) => setForm({ ...form, businessId: v })} disabled={editing !== null}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a business" />
                </SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="worker">Worker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mobile</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 digits"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username (optional)</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
              <div>
                <Label>Email (optional)</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            {form.role === "worker" && (
              <div>
                <Label>Daily wage</Label>
                <Input type="number" min={0} value={form.daily_wage} onChange={(e) => setForm({ ...form, daily_wage: e.target.value })} />
              </div>
            )}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            {!editing && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                They sign in with their mobile number, email or username. Their mobile number is the first-time
                password — they're asked to choose their own straight away.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}