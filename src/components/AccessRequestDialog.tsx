import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Instagram,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  UserPlus,
} from "lucide-react";
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
import { CONTACT_EMAIL, CONTACT_INSTAGRAM_URL, CONTACT_WHATSAPP } from "@/lib/brand";
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

const optionRowClass =
  "flex w-full items-center gap-3.5 rounded-2xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 dark:border-white/15 dark:bg-white/[0.04]";

type ContactOption = {
  key: string;
  label: string;
  hint: string;
  icon: typeof Mail;
  href?: string;
  onClick?: () => void;
};

function OptionRow({ option }: { option: ContactOption }) {
  const Icon = option.icon;
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{option.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{option.hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );

  if (option.href) {
    return (
      <a
        href={option.href}
        target={option.href.startsWith("http") ? "_blank" : undefined}
        rel="noopener noreferrer"
        className={optionRowClass}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={option.onClick} className={optionRowClass}>
      {inner}
    </button>
  );
}

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
  // First screen = pick how to reach us; the form only opens for "In the app".
  const [view, setView] = useState<"choose" | "form">("choose");

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
    setView("choose");
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

  const options: ContactOption[] = [
    {
      key: "app",
      label: "Request in the app",
      hint: "Fill a short form — we'll send your login on WhatsApp",
      icon: ClipboardList,
      onClick: () => setView("form"),
    },
    CONTACT_WHATSAPP
      ? {
          key: "whatsapp",
          label: "WhatsApp",
          hint: "Chat with us directly",
          icon: MessageCircle,
          href: `https://wa.me/${CONTACT_WHATSAPP}`,
        }
      : null,
    CONTACT_INSTAGRAM_URL
      ? {
          key: "instagram",
          label: "Instagram",
          hint: "Send us a message on Instagram",
          icon: Instagram,
          href: CONTACT_INSTAGRAM_URL,
        }
      : null,
    CONTACT_EMAIL
      ? {
          key: "email",
          label: "Email",
          hint: CONTACT_EMAIL,
          icon: Mail,
          href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Plinthora access request")}`,
        }
      : null,
  ].filter(Boolean) as ContactOption[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] max-w-[540px] overflow-y-auto rounded-[1.5rem] sm:p-7">
        {view === "choose" ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Need access?</DialogTitle>
              <DialogDescription>
                Choose how you'd like to reach us. We'll get back to you soon.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2.5">
              {options.map((o) => (
                <OptionRow key={o.key} option={o} />
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full rounded-full text-sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        ) : sentTo ? (
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
              <button
                type="button"
                onClick={() => setView("choose")}
                disabled={busy}
                className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <DialogTitle>Request in the app</DialogTitle>
              <DialogDescription>
                Tell us what you need and how to reach you. We'll get in touch.
              </DialogDescription>
            </DialogHeader>

            {/* Request type — three compact tiles in one row */}
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What do you need?">
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
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50 dark:border-white/15"
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs font-semibold leading-tight">{REQUEST_TYPE_LABEL[t]}</span>
                  </button>
                );
              })}
            </div>

            {/* Hint for the selected option */}
            <p className="-mt-1 px-1 text-center text-xs text-muted-foreground">{REQUEST_TYPE_HINT[type]}</p>

            {/* Name + mobile side by side */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className={inputClass}
              />

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
            </div>

            <p className="-mt-1 px-2 text-xs text-muted-foreground">
              Mobile is required — we'll send your login details to it on WhatsApp.
            </p>

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
              rows={2}
              className="min-h-[72px] rounded-2xl border-border bg-background px-5 py-3 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04]"
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

            <DialogFooter className="flex-row gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-full text-sm"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="h-11 flex-[2] rounded-full font-semibold">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send request"
                )}
              </Button>
            </DialogFooter>

          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}