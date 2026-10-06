import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBusiness } from "@/lib/auth/session";
import type { Rental, RentalGroup } from "@/lib/rentals";
import { buildConfirmMessage, buildGroupConfirmMessage, buildGroupReceiptMessage } from "@/lib/rentals";
import { WhatsAppPreviewDialog, type WhatsAppPreview } from "@/components/WhatsAppPreviewDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

import { Check, MessageCircle, Pencil, Plus, Trash2, Undo2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingGroup?: RentalGroup | null;
}

type Item = {
  /** Present when this row already exists in the DB (editing an existing material). */
  id?: string;
  material_name: string;
  quantity: number | string;
  unit: string;
  rate_per_unit: number | string;
  /** "rate" = Quantity × Rate / Unit, "total" = enter the line total directly. */
  mode: "rate" | "total";
  /** Line total typed directly (only used when mode === "total"). */
  direct_total: number | string;
  /** True when the unit dropdown is set to "Custom" (free-text unit). */
  customUnit: boolean;
};

const UNIT_PRESETS = ["pcs", "sheets", "pipes", "boxes"] as const;
const CUSTOM_UNIT = "__custom__";

const emptyItem = (): Item => ({
  material_name: "",
  quantity: 1,
  unit: "pcs",
  rate_per_unit: 0,
  mode: "rate",
  direct_total: 0,
  customUnit: false,
});

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const MOBILE_REGEX = /^[6789]\d{9}$/;

const emptyForm = () => ({
  customer_name: "",
  customer_phone: "",
  customer_address: getBusiness()?.location ?? "",
  security_deposit: 0 as number | string,
  issue_date: new Date().toISOString().slice(0, 10),
  return_date: "", // optional
  status: "active" as "active" | "returned",
  payment_status: "unpaid" as "paid" | "unpaid",
  notes: "",
  items: [emptyItem()] as Item[],
});

export function RentalForm({ open, onOpenChange, editingGroup }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  // Grand total typed by hand (null = auto-add the line totals).
  const [grandOverride, setGrandOverride] = useState<string | null>(null);
  const [editingTotal, setEditingTotal] = useState(false);
  const [wa, setWa] = useState<WhatsAppPreview | null>(null);
  // Status shown when the edit form opened, so we only touch existing materials if it was changed.
  const initialStatus = useRef<"active" | "returned">("active");

  useEffect(() => {
    setGrandOverride(null);
    setEditingTotal(false);
    if (editingGroup) {
      const primary = editingGroup.rows[0];
      initialStatus.current = primary.status === "returned" ? "returned" : "active";
      setForm({
        customer_name: primary.customer_name,
        customer_phone: primary.customer_phone,
        customer_address: primary.customer_address ?? "",
        security_deposit: editingGroup.security_deposit ?? 0,
        issue_date: primary.issue_date,
        return_date: primary.return_date ?? "",
        status: primary.status === "overdue" ? "active" : (primary.status as "active" | "returned"),
        payment_status: editingGroup.payment_status ?? "unpaid",
        notes: primary.notes ?? "",
        items: editingGroup.rows.map((r) => ({
          id: r.id,
          material_name: r.material_name,
          quantity: r.quantity,
          unit: r.unit,
          rate_per_unit: r.rate_per_unit,
          mode: "rate" as const,
          direct_total: r.total_amount ?? 0,
          customUnit: !(UNIT_PRESETS as readonly string[]).includes(String(r.unit ?? "").toLowerCase()),
        })),
      });
    } else {
      setForm(emptyForm());
    }
  }, [editingGroup, open]);

  const itemTotal = (it: Item) =>
    it.mode === "total"
      ? Number(it.direct_total || 0)
      : Number(it.quantity || 0) * Number(it.rate_per_unit || 0);
  // Rate saved with the row. In "line total" mode it is derived (total ÷ quantity) so receipts still show a sensible rate.
  const itemRate = (it: Item) => {
    if (it.mode !== "total") return Number(it.rate_per_unit || 0);
    const q = Number(it.quantity || 0);
    return q > 0 ? roundMoney(Number(it.direct_total || 0) / q) : 0;
  };
  const linesSum = form.items.reduce((s, it) => s + itemTotal(it), 0);
  const grandTotal = grandOverride !== null ? Number(grandOverride || 0) : linesSum;
  const balanceDue = grandTotal - Number(form.security_deposit || 0);

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  };
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx: number) =>
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items }));

  const save = useMutation({
    mutationFn: async () => {
      if (!MOBILE_REGEX.test(form.customer_phone)) throw new Error("Mobile number must be 10 digits and start with 6, 7, 8 or 9");
      if (!form.customer_name) throw new Error("Customer name is required");
      if (form.items.some((it) => !it.material_name)) throw new Error("Every material row needs a name");
      if (form.items.some((it) => !it.unit.trim())) throw new Error("Every material row needs a unit (or pick one from the list)");

      // When the grand total was typed by hand, the first material carries whatever the other
      // lines don't, so the rows always add up to exactly the total shown.
      let finalItems = form.items;
      if (grandOverride !== null) {
        const others = form.items.slice(1).reduce((s, it) => s + itemTotal(it), 0);
        const first = roundMoney(Number(grandOverride || 0) - others);
        if (first < 0) throw new Error("Total is less than the other materials' line totals");
        finalItems = form.items.map((it, i) =>
          i === 0 ? { ...it, mode: "total" as const, direct_total: first } : it,
        );
      }

      const { data: authUser } = await supabase.auth.getUser();
      const createdBy = authUser.user?.id ?? null;

      if (editingGroup) {
        const existingItems = finalItems.filter((it) => it.id);
        const newItems = finalItems.filter((it) => !it.id);
        const results: Rental[] = [];

        // Existing materials: update details. Their return status is only changed when the
        // Status dropdown was actually changed (e.g. Returned -> Active); otherwise each
        // material keeps its own status (managed from the "Mark returned" checklist).
        const statusChanged = form.status !== initialStatus.current;
        for (const it of existingItems) {
          const payload = {
            ...(statusChanged ? { status: form.status } : {}),
            customer_name: form.customer_name,
            customer_phone: form.customer_phone,
            customer_address: form.customer_address,
            material_name: it.material_name,
            quantity: Number(it.quantity),
            unit: it.unit.trim(),
            rate_per_unit: itemRate(it),
            total_amount: itemTotal(it),
            issue_date: form.issue_date,
            return_date: form.return_date || null,
            payment_status: form.payment_status,
            notes: form.notes,
          };
          const { data, error } = await supabase.from("rentals").update(payload).eq("id", it.id!).select().single();
          if (error) throw error;
          results.push(data as Rental);
        }

        // New materials added while editing join the same rental group.
        if (newItems.length > 0) {
          const newRows = newItems.map((it) => ({
            customer_name: form.customer_name,
            customer_phone: form.customer_phone,
            customer_address: form.customer_address,
            material_name: it.material_name,
            quantity: Number(it.quantity),
            unit: it.unit.trim(),
            rate_per_unit: itemRate(it),
            total_amount: itemTotal(it),
            security_deposit: 0,
            issue_date: form.issue_date,
            return_date: form.return_date || null,
            status: form.status,
            payment_status: form.payment_status,
            notes: form.notes,
            group_id: editingGroup.group_id,
            created_by: createdBy,
          }));
          const { data, error } = await supabase.from("rentals").insert(newRows).select();
          if (error) throw error;
          results.push(...(data as Rental[]));
        }

        // Materials removed from the form are deleted from this group.
        const remainingIds = new Set(existingItems.map((it) => it.id));
        const removedIds = editingGroup.rows.map((r) => r.id).filter((id) => !remainingIds.has(id));
        if (removedIds.length > 0) {
          const { error } = await supabase.from("rentals").delete().in("id", removedIds);
          if (error) throw error;
        }

        return results;
      }

      // New rental: every material shares one group_id so they render as one card.
      const group_id = crypto.randomUUID();
      const rows = finalItems.map((it, idx) => ({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_address: form.customer_address,
        material_name: it.material_name,
        quantity: Number(it.quantity),
        unit: it.unit.trim(),
        rate_per_unit: itemRate(it),
        total_amount: itemTotal(it),
        // Split security deposit only on the first row to avoid double counting
        security_deposit: idx === 0 ? Number(form.security_deposit || 0) : 0,
        issue_date: form.issue_date,
        return_date: form.return_date || null,
        status: form.status,
        payment_status: form.payment_status,
        notes: form.notes,
        group_id,
        created_by: createdBy,
      }));
      const { data, error } = await supabase.from("rentals").insert(rows).select();
      if (error) throw error;
      return data as Rental[];
    },
    onSuccess: async (rows) => {
      qc.invalidateQueries({ queryKey: ["rentals"] });
      const first = rows[0];
      const message = rows.length > 1 ? buildGroupConfirmMessage(rows) : buildConfirmMessage(first);
      const preview = (title: string, msg: string): WhatsAppPreview | null =>
        first ? { phone: first.customer_phone, name: first.customer_name, title, message: msg } : null;
      const confirmPreview = preview("Send confirmation", message);
      const receiptPreview = preview("Send receipt", buildGroupReceiptMessage(rows));

      toast.success(
        editingGroup
          ? rows.length > 1
            ? `Rental updated · ${rows.length} materials`
            : "Rental updated"
          : `Saved ${rows.length} material${rows.length > 1 ? "s" : ""}`,
        {
          action: confirmPreview
            ? { label: "Send WhatsApp", onClick: () => setWa(confirmPreview) }
            : undefined,
          cancel: receiptPreview
            ? { label: "Send Receipt", onClick: () => setWa(receiptPreview) }
            : undefined,
        },
      );
      onOpenChange(false);
    },

    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingGroup ? "Edit Rental" : "New Rental"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer Name *">
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
            </Field>
            <Field label="Mobile Number *">
              <Input
                maxLength={10}
                inputMode="numeric"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                required
              />
              {form.customer_phone.length > 0 && !MOBILE_REGEX.test(form.customer_phone) && (
                <p className="text-xs text-destructive">Must be 10 digits, starting with 6, 7, 8 or 9</p>
              )}
            </Field>
          </div>
          <Field label="Village / Address">
            <Input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} />
          </Field>

          <div className="space-y-3">
            <Label>Materials</Label>
            {form.items.map((it, idx) => (
              <div
                key={it.id ?? idx}
                className="rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 to-muted/20 p-4 space-y-4 shadow-sm"
              >
                {/* header: number badge + mode pills + remove */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">material</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => updateItem(idx, { mode: "rate" })}
                        className={`rounded-full px-3 py-1 transition-colors ${it.mode === "rate" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
                      >
                        qty × rate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(idx, {
                            mode: "total",
                            // carry over the current amount so nothing is lost when switching
                            direct_total: it.mode === "rate" ? itemTotal(it) : it.direct_total,
                          })
                        }
                        className={`rounded-full px-3 py-1 transition-colors ${it.mode === "total" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
                      >
                        line total
                      </button>
                    </div>
                    {form.items.length > 1 && (!editingGroup || idx > 0) && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(idx)}
                        className="h-7 w-7 rounded-full text-destructive hover:bg-destructive/10"
                        aria-label="Remove material"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* name + unit */}
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <Field label="Material Name *">
                    <Input
                      className="rounded-xl"
                      value={it.material_name}
                      onChange={(e) => updateItem(idx, { material_name: e.target.value })}
                      placeholder="e.g. steel sheets"
                      required
                    />
                  </Field>
                  <Field label="Unit">
                    <Select
                      value={it.customUnit ? CUSTOM_UNIT : it.unit.toLowerCase()}
                      onValueChange={(v) => {
                        if (v === CUSTOM_UNIT) updateItem(idx, { customUnit: true, unit: "" });
                        else updateItem(idx, { customUnit: false, unit: v });
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-background">
                        <SelectValue placeholder="unit" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {UNIT_PRESETS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_UNIT}>custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {it.customUnit && (
                  <Input
                    className="rounded-xl"
                    value={it.unit}
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    placeholder="type your unit (kg, bag, set…)"
                    required
                  />
                )}

                {/* amounts */}
                <div className="grid gap-3 grid-cols-2">
                  <Field label={it.mode === "rate" ? "Quantity *" : "Quantity"}>
                    <Input
                      className="rounded-xl"
                      type="number"
                      min="0"
                      step="1"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    />
                  </Field>
                  {it.mode === "rate" ? (
                    <Field label="Rate / Unit ₹ *">
                      <Input
                        className="rounded-xl"
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.rate_per_unit}
                        onChange={(e) => updateItem(idx, { rate_per_unit: e.target.value })}
                      />
                    </Field>
                  ) : (
                    <Field label="Line total ₹ *">
                      <Input
                        className="rounded-xl"
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.direct_total}
                        onChange={(e) => updateItem(idx, { direct_total: e.target.value })}
                      />
                    </Field>
                  )}
                </div>

                {it.mode === "rate" && (
                  <div className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">line total</span>
                    <span className="text-base font-semibold">₹{itemTotal(it).toLocaleString("en-IN")}</span>
                  </div>
                )}
              </div>
            ))}
            {editingGroup && (
              <p className="text-[11px] text-muted-foreground">
                Materials added here join this same rental — they'll all show on one card.
              </p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={addItem} className="w-full rounded-full border-dashed border-primary/40 text-primary hover:bg-primary/5">
              <Plus className="h-4 w-4 mr-1" /> Add more
            </Button>
          </div>

          <Field label="Advance Received ₹">
            <Input type="number" min="0" step="0.01" value={form.security_deposit} onChange={(e) => setForm({ ...form, security_deposit: e.target.value })} placeholder="Advance money given by the customer" />
          </Field>

          <div className="rounded-2xl bg-primary/10 border-2 border-primary/30 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Materials Total</span>
              {editingTotal ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">₹</span>
                  <Input
                    autoFocus
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-8 w-32 rounded-full text-right"
                    value={grandOverride ?? ""}
                    onChange={(e) => setGrandOverride(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setEditingTotal(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-full text-primary hover:bg-primary/10"
                    onClick={() => setEditingTotal(false)}
                    aria-label="Done"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="font-medium">₹{grandTotal.toLocaleString("en-IN")}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full text-primary hover:bg-primary/10"
                    onClick={() => {
                      if (grandOverride === null) setGrandOverride(String(linesSum || ""));
                      setEditingTotal(true);
                    }}
                    aria-label="Edit total"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {grandOverride !== null && !editingTotal && (
              <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                <span>entered by hand</span>
                <button
                  type="button"
                  onClick={() => setGrandOverride(null)}
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-primary hover:bg-primary/10"
                >
                  <Undo2 className="h-3 w-3" /> use line totals
                </button>
              </div>
            )}
            {Number(form.security_deposit || 0) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Advance Received</span>
                <span className="font-medium text-success">- ₹{Number(form.security_deposit || 0).toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-primary/20 pt-1.5">
              <span className="text-sm font-medium">Balance Due</span>
              <span className="text-2xl font-bold text-primary">₹{balanceDue.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Issue Date *">
              <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} required />
            </Field>
            <Field label="Expected Return Date (optional)">
              <Input type="date" value={form.return_date} min={form.issue_date || undefined} onChange={(e) => setForm({ ...form, return_date: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "returned" })}
              >
                <option value="active">Active</option>
                <option value="returned">Returned</option>
              </select>
            </Field>
            <Field label="Payment">
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.payment_status}
                onChange={(e) => setForm({ ...form, payment_status: e.target.value as "paid" | "unpaid" })}
              >
                <option value="unpaid">Not Paid</option>
                <option value="paid">Paid</option>
              </select>
            </Field>
          </div>
          {editingGroup && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Changing Status applies to all materials in this rental. Leave it as is to keep each material's own return status (or use "Mark returned" on the card).
            </p>
          )}
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingGroup ? "Update Rental" : "Create Rental"}
            </Button>
          </DialogFooter>
          {!editingGroup && form.customer_phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MessageCircle className="h-3 w-3 text-success" /> "Send WhatsApp" and "Send Receipt" options will be offered after saving — neither opens automatically.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
    <WhatsAppPreviewDialog preview={wa} onClose={() => setWa(null)} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}