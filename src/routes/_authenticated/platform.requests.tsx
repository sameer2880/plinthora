import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check,
  Copy,
  Inbox,
  KeyRound,
  MessageCircle,
  Phone,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import {
  createAccountFromRequestFn,
  deleteAccessRequestFn,
  listAccessRequestsFn,
  updateAccessRequestFn,
} from "@/lib/api/access-requests.functions";
import {
  REQUEST_STATUSES,
  REQUEST_TYPE_LABEL,
  STATUS_LABEL,
  buildAccountMessage,
  loginLinkUrl,
  suggestUsername,
  type AccessRequestRow,
  type AccountResult,
  type RequestStatus,
  type RequestType,
} from "@/lib/access-requests";
import { isSuperAdmin } from "@/lib/auth/access";
import { PLATFORM_NAME } from "@/lib/brand";
import { whatsappUrl } from "@/lib/rentals";

export const Route = createFileRoute("/_authenticated/platform/requests")({
  head: () => ({
    meta: [{ title: `Requests — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: PlatformRequests,
});

const TYPE_BADGE: Record<RequestType, string> = {
  new_business: "bg-amber-500/10 text-amber-600",
  app_access: "bg-primary/10 text-primary",
  forgot_credentials: "bg-destructive/10 text-destructive",
};

const STATUS_BADGE: Record<RequestStatus, string> = {
  new: "bg-primary/10 text-primary",
  account_created: "bg-amber-500/10 text-amber-600",
  notified: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

interface Business {
  id: string;
  name: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* Create account (new business + admin, or a user in a business)      */
/* ------------------------------------------------------------------ */

function CreateAccountDialog({
  row,
  businesses,
  onClose,
  onDone,
}: {
  row: AccessRequestRow;
  businesses: Business[];
  onClose: () => void;
  onDone: (result: AccountResult) => void;
}) {
  const isNewBusiness = row.request_type === "new_business";
  const guess = businesses.find((b) => b.name.trim().toLowerCase() === row.business_name?.trim().toLowerCase());

  const [businessName, setBusinessName] = useState(row.business_name ?? "");
  const [businessId, setBusinessId] = useState(guess?.id ?? "");
  const [role, setRole] = useState<"worker" | "manager" | "admin">("worker");
  const [username, setUsername] = useState(suggestUsername(row.name, row.phone));

  const create = useMutation({
    mutationFn: async () => {
      if (isNewBusiness && businessName.trim().length < 2) throw new Error("Business name is required");
      if (!isNewBusiness && !businessId) throw new Error("Choose a business");
      return createAccountFromRequestFn({
        data: {
          id: row.id,
          resetExisting: false,
          businessName: isNewBusiness ? businessName.trim() : undefined,
          businessId: isNewBusiness ? undefined : businessId,
          role,
          username: username.trim(),
        },
      });
    },
    onSuccess: (result) => onDone(result),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account for {row.name}</DialogTitle>
          <DialogDescription>
            {isNewBusiness
              ? "Creates the business and makes them its admin."
              : "Adds them as a user in the business you choose."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {isNewBusiness ? (
            <div>
              <Label>Business name</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Business</Label>
                <Select value={businessId} onValueChange={setBusinessId}>
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
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
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
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="optional"
              />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input value={row.phone} readOnly disabled />
            </div>
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            The account starts with a random password. Next you get a one-time link to send on WhatsApp; they open it and
            choose their own password.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* WhatsApp message with the login details                             */
/* ------------------------------------------------------------------ */

function WhatsAppDialog({
  row,
  result,
  onClose,
  onSent,
}: {
  row: AccessRequestRow;
  result: AccountResult;
  onClose: () => void;
  onSent: () => void;
}) {
  const [message, setMessage] = useState(() =>
    buildAccountMessage({
      name: row.name,
      phone: result.phone,
      username: result.username,
      businessName: result.businessName,
      kind: result.kind,
      isNewBusiness: row.request_type === "new_business" && result.kind === "created",
      appUrl: window.location.origin,
      linkUrl: result.invite ? loginLinkUrl(window.location.origin, result.invite) : null,
    }),
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually");
    }
  };

  const send = () => {
    // Open first (inside the click) so the browser doesn't block the popup.
    window.open(whatsappUrl(result.phone, message), "_blank", "noopener");
    onSent();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send login details</DialogTitle>
          <DialogDescription>
            WhatsApp opens with this message ready for {row.name} ({result.phone}). Check it, then press send there.
          </DialogDescription>
        </DialogHeader>

        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={11} className="text-sm" />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={copy}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          <Button onClick={send} className="bg-[#25D366] text-white hover:bg-[#1ebe5b]">
            <MessageCircle className="mr-1.5 h-4 w-4" /> Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function PlatformRequests() {
  const qc = useQueryClient();
  const allowed = isSuperAdmin();

  const [filter, setFilter] = useState<"all" | RequestStatus>("new");
  const [search, setSearch] = useState("");
  const [createFor, setCreateFor] = useState<AccessRequestRow | null>(null);
  const [whatsApp, setWhatsApp] = useState<{ row: AccessRequestRow; result: AccountResult } | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["platform", "requests"],
    enabled: allowed,
    queryFn: () => listAccessRequestsFn(),
  });

  const { data: businesses = [] } = useQuery({
    queryKey: ["platform", "businesses"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").order("name");
      if (error) throw error;
      return data as Business[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["platform"] });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.name, r.phone, r.business_name].some((v) => v?.toLowerCase().includes(q));
    });
  }, [requests, filter, search]);

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: RequestStatus }) => updateAccessRequestFn({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAccessRequestFn({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Request deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // The mobile number already has a login: reset its password to the mobile number.
  const reset = useMutation({
    mutationFn: (row: AccessRequestRow) => createAccountFromRequestFn({ data: { id: row.id, resetExisting: true } }),
    onSuccess: (result, row) => {
      refresh();
      toast.success("Old password cancelled — send them the reset link");
      setWhatsApp({ row, result });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** WhatsApp again for a request that already has its account. */
  const reopenWhatsApp = (row: AccessRequestRow) => {
    setWhatsApp({
      row,
      result: {
        kind: row.request_type === "forgot_credentials" ? "reset" : "created",
        username: row.account?.username ?? null,
        email: row.account?.email ?? null,
        phone: row.phone,
        businessName: row.account?.business_name ?? row.business_name,
      },
    });
  };

  if (!allowed) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <div className="font-semibold">Platform admin only</div>
            <p className="text-sm text-muted-foreground">Only the platform admin can view access requests.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Inbox className="h-6 w-6 text-primary" /> Requests
        </h2>
        <p className="text-sm text-muted-foreground">
          People who asked for access from the sign-in page. Create their account, then send their login details on
          WhatsApp.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requests ({counts.all ?? 0})</SelectItem>
            {REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]} ({counts[s] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, mobile or business"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="py-10 text-center text-muted-foreground">Loading…</p>}
      {!isLoading && visible.length === 0 && <p className="py-10 text-center text-muted-foreground">No requests here.</p>}

      <div className="grid gap-3">
        {visible.map((r) => {
          const created = r.status === "account_created" || r.status === "notified";
          return (
            <Card key={r.id} className={r.status === "closed" ? "opacity-70" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold">{r.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[r.request_type]}`}>
                        {REQUEST_TYPE_LABEL[r.request_type]}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                        <Phone className="h-3 w-3" /> {r.phone}
                      </a>
                      {r.business_name && <span>{r.business_name}</span>}
                      <span>{format(new Date(r.created_at), "d MMM yyyy, h:mm a")}</span>
                    </div>
                  </div>
                </div>

                {r.message && <p className="rounded-md bg-muted px-3 py-2 text-sm">{r.message}</p>}

                {r.account && (
                  <p className="text-xs text-muted-foreground">
                    Already has an account: {r.account.business_name ?? "—"} · {r.account.role}
                    {r.account.username ? ` · @${r.account.username}` : ""}
                    {!r.account.active ? " · deactivated" : ""}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {!created &&
                    r.status !== "closed" &&
                    (r.account ? (
                      <ConfirmDelete
                        onConfirm={() => reset.mutate(r)}
                        title={`Reset ${r.name}'s password?`}
                        description="Their old password stops working right away and their signed-in devices are signed out. You then send them a one-time link on WhatsApp to choose a new password."
                        confirmLabel="Reset password"
                      >
                        <Button size="sm" disabled={reset.isPending}>
                          <KeyRound className="mr-1.5 h-4 w-4" /> Reset password
                        </Button>
                      </ConfirmDelete>
                    ) : (
                      <Button size="sm" onClick={() => setCreateFor(r)}>
                        <UserPlus className="mr-1.5 h-4 w-4" /> Create account
                      </Button>
                    ))}

                  {created && (
                    <Button
                      size="sm"
                      className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                      onClick={() => reopenWhatsApp(r)}
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      {r.status === "notified" ? "Send again" : "Send on WhatsApp"}
                    </Button>
                  )}

                  {r.status === "closed" ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "new" })}>
                      Reopen
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "closed" })}>
                      <Check className="mr-1.5 h-4 w-4" /> Mark closed
                    </Button>
                  )}

                  <ConfirmDelete
                    onConfirm={() => remove.mutate(r.id)}
                    title={`Delete ${r.name}'s request?`}
                    description="The request is removed for good. Any account already created stays."
                  >
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </ConfirmDelete>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {createFor && (
        <CreateAccountDialog
          row={createFor}
          businesses={businesses}
          onClose={() => setCreateFor(null)}
          onDone={(result) => {
            const row = createFor;
            setCreateFor(null);
            refresh();
            toast.success("Account created — send them the one-time link");
            setWhatsApp({ row, result });
          }}
        />
      )}

      {whatsApp && (
        <WhatsAppDialog
          row={whatsApp.row}
          result={whatsApp.result}
          onClose={() => setWhatsApp(null)}
          onSent={() => {
            setStatus.mutate({ id: whatsApp.row.id, status: "notified" });
            setWhatsApp(null);
          }}
        />
      )}
    </div>
  );
}