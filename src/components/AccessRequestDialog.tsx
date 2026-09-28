import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, KeyRound, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitAccessRequestFn } from "@/lib/api/access-requests.functions";
import { MOBILE_REGEX } from "@/lib/auth/identity";
import {
  REQUEST_TYPES,
  REQUEST_TYPE_HINT,
  REQUEST_TYPE_LABEL,
  type RequestType,
} from "@/lib/access-requests";

const inputClass =
  "h-12 rounded-full border-border bg-background px-5 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";

const TYPE_ICON = {
  new_business: Building2,
  app_access: UserPlus,
  forgot_credentials: KeyRound,
} as const;

const BUSINESS_LABEL: Record<RequestType, string> = {
  new_business: "Business name",
  app_access: "Business you work for (optional)",
  forgot_credentials: "Business you work for (optional)",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which option is selected when the dialog opens. */
  defaultType?: RequestType;
}

export function AccessRequestDialog({ open, onOpenChange, defaultType = "app_access" }: Props) {
  const [type, setType] = useState<RequestType>(defaultType);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real people never see or fill this
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setName("");
    setPhone("");
    setBusinessName("");
    setMessage("");
    setWebsite("");
    setErr("");
    setBusy(false);
    setSentTo(null);
  }, [open, defaultType]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");

    const cleanName = name.trim();
    if (cleanName.length < 2) return setErr("Enter your name");
    if (!MOBILE_REGEX.test(phone)) {
      return setErr("Enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9)");
    }
    if (type === "new_business" && !businessName.trim()) return setErr("Enter your business name");

    setBusy(true);
    try {
      await submitAccessRequestFn({
        data: {
          request_type: type,
          name: cleanName,
          phone,
          business_name: businessName.trim() || undefined,
          message: message.trim() || undefined,
          website,
        },
      });
      setSentTo(phone);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[420px] overflow-y-auto rounded-[1.5rem] sm:p-7">
        {sentTo ? (
          <div className="space-y-4 text-center">
            <DialogHeader className="items-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <DialogTitle>Request sent</DialogTitle>
              <DialogDescription>
                We'll contact you on <span className="font-semibold text-foreground">{sentTo}</span> (WhatsApp) with
                your login details.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              className="h-11 w-full rounded-full font-semibold"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Need access?</DialogTitle>
              <DialogDescription>
                Tell us what you need and how to reach you. The platform admin will get in touch.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2" role="radiogroup" aria-label="What do you need?">
              {REQUEST_TYPES.map((t) => {
                const Icon = TYPE_ICON[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setType(t)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50 dark:border-white/15"
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{REQUEST_TYPE_LABEL[t]}</span>
                      <span className="block text-xs text-muted-foreground">{REQUEST_TYPE_HINT[t]}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Input
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={inputClass}
            />

            <div className="space-y-1">
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="Mobile number (10 digits)"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                maxLength={10}
                className={inputClass}
              />
              <p className="px-2 text-xs text-muted-foreground">
                Required. We'll send your login details to this number on WhatsApp.
              </p>
            </div>

            <Input
              placeholder={BUSINESS_LABEL[type]}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={120}
              className={inputClass}
            />

            <Textarea
              placeholder="Anything else we should know? (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
              className="rounded-2xl border-border bg-background px-5 py-3 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04]"
            />

            {/* Honeypot: off-screen, skipped by keyboards and screen readers. */}
            <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

            {err && <p className="text-xs font-medium text-destructive">{err}</p>}

            <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-full font-semibold">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send request"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full rounded-full text-sm"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}