import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  Instagram,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Send,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AuthPageHeading, AuthPageLayout } from "@/components/AuthPageLayout";
import { submitAccessRequestFn } from "@/lib/api/access-requests.functions";
import { MOBILE_REGEX } from "@/lib/auth/identity";
import { CONTACT_EMAIL, CONTACT_INSTAGRAM_URL, CONTACT_WHATSAPP, PLATFORM_NAME } from "@/lib/brand";
import { REQUEST_TYPES, REQUEST_TYPE_HINT, REQUEST_TYPE_LABEL, type RequestType } from "@/lib/access-requests";

type View = "choose" | "form" | "email";

/**
 * "Need access?" as a full page (it used to be a pop-up card). The three screens —
 * choose how to reach us, the in-app request form, the email form — are kept in the
 * address (?view=) so the phone's back button steps back one screen instead of leaving.
 */
export const Route = createFileRoute("/request-access")({
  validateSearch: (search: Record<string, unknown>): { type?: RequestType; view?: View } => ({
    type: REQUEST_TYPES.includes(search.type as RequestType) ? (search.type as RequestType) : undefined,
    view: search.view === "form" || search.view === "email" ? search.view : undefined,
  }),
  head: () => ({
    meta: [{ title: `Need access — ${PLATFORM_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: RequestAccessPage,
});

const inputClass =
  "h-14 rounded-2xl border-border bg-background px-5 text-base shadow-none sm:h-12 sm:rounded-full sm:text-sm dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";

const textareaClass =
  "min-h-[96px] rounded-2xl border-border bg-background px-5 py-3.5 text-base shadow-none sm:min-h-[72px] sm:text-sm dark:border-white/15 dark:bg-white/[0.04]";

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

type ContactOption = {
  key: string;
  label: string;
  hint: string;
  icon: typeof Mail;
  href?: string;
  onClick?: () => void;
};

const tileClass =
  "group flex min-w-0 flex-col items-center gap-2 rounded-3xl border border-border bg-background/80 px-2 py-4 text-center shadow-sm transition active:scale-[0.97] hover:border-primary/50 hover:bg-primary/10 dark:border-white/15 dark:bg-white/[0.04]";

/** Wraps an option as a link or a button. */
function OptionShell({ option, className, children }: { option: ContactOption; className: string; children: ReactNode }) {
  if (option.href) {
    return (
      <a
        href={option.href}
        target={option.href.startsWith("http") ? "_blank" : undefined}
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={option.onClick} className={className}>
      {children}
    </button>
  );
}

/** The main way in: a big filled card. */
function PrimaryOption({ option }: { option: ContactOption }) {
  const Icon = option.icon;
  return (
    <OptionShell
      option={option}
      className="flex w-full items-center gap-4 rounded-3xl bg-primary p-5 text-left text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.98]"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <Icon className="h-7 w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold leading-tight">{option.label}</span>
        <span className="mt-1 block text-xs leading-snug text-primary-foreground/80">{option.hint}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 opacity-80" />
    </OptionShell>
  );
}

/** Secondary ways to reach us: compact square tiles. */
function TileOption({ option }: { option: ContactOption }) {
  const Icon = option.icon;
  return (
    <OptionShell option={option} className={tileClass}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold">{option.label}</span>
    </OptionShell>
  );
}

/** A rounded card that groups part of a form. */
function FormCard({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
      <h2 className="flex items-center gap-2.5 text-sm font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The three request-type tiles, shared by the in-app form and the email form. */
function TypePicker({ type, onChange }: { type: RequestType; onChange: (t: RequestType) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What do you need?">
      {REQUEST_TYPES.map((t) => {
        const Icon = TYPE_ICON[t];
        const active = type === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t)}
            className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors sm:flex-col sm:gap-1.5 sm:px-2 sm:py-3 sm:text-center ${
              active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted/50 dark:border-white/15"
            }`}
          >
            <Icon className={`h-6 w-6 shrink-0 sm:h-5 sm:w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
            <span className="min-w-0 flex-1 sm:flex-none">
              <span className="block text-sm font-semibold leading-tight">{REQUEST_TYPE_LABEL[t]}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground sm:hidden">{REQUEST_TYPE_HINT[t]}</span>
            </span>
            <span
              aria-hidden
              className={`h-5 w-5 shrink-0 rounded-full border-2 sm:hidden ${active ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]" : "border-border"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** A visible label above a field (placeholders alone vanish while typing, which is hard on a phone). */
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="px-1 text-sm font-semibold">
        {label}
      </Label>
      {children}
    </div>
  );
}

const actionsClass = "flex flex-col gap-2 pt-1";

type EmailDetails = {
  name: string;
  phone: string;
  businessName: string;
  location: string;
  username: string;
  message: string;
};

/** Builds the email from the details the person filled in. Nothing is sent from the app. */
function buildEmail(type: RequestType, d: EmailDetails) {
  const subject = `${PLATFORM_NAME} — ${REQUEST_TYPE_LABEL[type]} request`;
  const lines = [
    "Hello,",
    "",
    `Request: ${REQUEST_TYPE_LABEL[type]} — ${REQUEST_TYPE_HINT[type]}`,
    "",
    `Full name: ${d.name.trim()}`,
    `Mobile number (WhatsApp): ${d.phone}`,
    `${type === "new_business" ? "Business name" : "Business I work for"}: ${d.businessName.trim()}`,
    ...(type === "new_business" ? [`Business location (town / city): ${d.location.trim()}`] : []),
    ...(type === "forgot_credentials" ? [`My username or email: ${d.username.trim()}`] : []),
    ...(d.message.trim() ? [`Anything else: ${d.message.trim()}`] : []),
    "",
    "Thank you.",
  ];
  return { subject, body: lines.join("\r\n") };
}

function RequestAccessPage() {
  const navigate = useNavigate();
  const { type: searchType, view: searchView } = Route.useSearch();
  const view: View = searchView ?? "choose";

  const [type, setType] = useState<RequestType>(searchType ?? "app_access");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real people never see or fill this
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const goTo = (next: View) => {
    setErr("");
    void navigate({
      to: "/request-access" as never,
      search: { type, view: next === "choose" ? undefined : next } as never,
    });
  };

  // Back inside the page: form/email -> choose -> sign-in.
  const goBackOneScreen = () => {
    if (view === "choose" || sentTo) {
      void navigate({ to: "/dashboard" as never, replace: true });
    } else {
      goTo("choose");
    }
  };

  const leave = () => void navigate({ to: "/dashboard" as never, replace: true });

  /** Shared checks for both the in-app form and the email form. Returns an error message or "". */
  const validate = (): string => {
    if (name.trim().length < 2) return "Enter your name";
    if (!MOBILE_REGEX.test(phone)) return "Enter a valid 10-digit mobile number (starts with 6, 7, 8 or 9)";
    if (type === "new_business" && !businessName.trim()) return "Enter your business name";
    if (type === "new_business" && !location.trim()) return "Enter your business location";
    return "";
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return setErr(problem);
    setErr("");

    setBusy(true);
    try {
      await submitAccessRequestFn({
        data: {
          request_type: type,
          name: name.trim(),
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

  /** Validates, then opens the person's email app with the message already written. */
  const sendEmail = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return setErr(problem);
    setErr("");

    const { subject, body } = buildEmail(type, { name, phone, businessName, location, username, message });
    const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    toast.success("Opening your email app…");
  };

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy — select the text and copy it by hand");
    }
  };

  const options: ContactOption[] = [
    {
      key: "app",
      label: "Request in the app",
      hint: "Fill a short form — we'll send your login on WhatsApp",
      icon: ClipboardList,
      onClick: () => goTo("form"),
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
          hint: "Fill your details — we'll open your email app",
          icon: Mail,
          onClick: () => goTo("email"),
        }
      : null,
  ].filter(Boolean) as ContactOption[];

  /** Fields shared by the in-app form and the email form. */
  const typeCard = (
    <FormCard step={1} title="What do you need?">
      <TypePicker type={type} onChange={setType} />
      <p className="hidden px-1 text-center text-xs text-muted-foreground sm:block">{REQUEST_TYPE_HINT[type]}</p>
    </FormCard>
  );

  /** Card 2: the person's details. `extra` adds the fields only the email form needs. */
  const detailsCard = (extra?: ReactNode) => (
    <FormCard step={2} title="Your details">
      <Field label="Your name" htmlFor="ra-name">
        <Input
          id="ra-name"
          autoComplete="name"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className={inputClass}
        />
      </Field>
      <Field label="Mobile number" htmlFor="ra-phone">
        <Input
          id="ra-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10 digits"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          maxLength={10}
          className={inputClass}
        />
        <p className="px-1 pt-1 text-xs text-muted-foreground">We'll send your login details to this number on WhatsApp.</p>
      </Field>
      <Field label={BUSINESS_LABEL[type]} htmlFor="ra-business">
        <Input
          id="ra-business"
          placeholder={type === "new_business" ? "e.g. Sri Sai Rentals" : "Business name"}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          maxLength={120}
          className={inputClass}
        />
      </Field>
      {extra}
      <Field label="Anything else? (optional)" htmlFor="ra-message">
        <Textarea
          id="ra-message"
          placeholder="Anything else we should know?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          className={textareaClass}
        />
      </Field>
    </FormCard>
  );

  const errorBox = err ? (
    <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-center text-sm font-medium text-destructive">
      {err}
    </p>
  ) : null;

  const primarySize = "h-14 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20 sm:h-12 sm:rounded-full sm:text-sm";
  const ghostSize = "h-12 w-full rounded-2xl text-base sm:h-11 sm:rounded-full sm:text-sm";

  const [primaryOption, ...otherOptions] = options;

  return (
    <AuthPageLayout
      onBack={goBackOneScreen}
      backLabel={view === "choose" || sentTo ? "Back to sign in" : "Back"}
    >
      {view === "choose" ? (
        <div className="space-y-6">
          <AuthPageHeading
            icon={<KeyRound className="h-6 w-6" />}
            title="Need access?"
            description="Pick the easiest way to reach us. We'll get back to you soon."
          />
          {primaryOption && <PrimaryOption option={primaryOption} />}
          {otherOptions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or reach us directly
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${otherOptions.length}, minmax(0, 1fr))` }}>
                {otherOptions.map((o) => (
                  <TileOption key={o.key} option={o} />
                ))}
              </div>
            </div>
          )}
          <Button type="button" variant="ghost" className={ghostSize} onClick={leave}>
            Cancel
          </Button>
        </div>
      ) : view === "email" ? (
        <form onSubmit={sendEmail} className="space-y-4">
          <AuthPageHeading
            icon={<Mail className="h-6 w-6" />}
            title="Request by email"
            description="Fill in your details and tap Send email. Your email app will open with the message ready to send."
          />

          {typeCard}
          {detailsCard(
            <>
              {type === "new_business" && (
                <Field label="Business location" htmlFor="ra-location">
                  <Input
                    id="ra-location"
                    placeholder="Town / city"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={120}
                    className={inputClass}
                  />
                </Field>
              )}
              {type === "forgot_credentials" && (
                <Field label="Username or email (if you remember it)" htmlFor="ra-username">
                  <Input
                    id="ra-username"
                    autoComplete="username"
                    autoCapitalize="none"
                    placeholder="Username or email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={120}
                    className={inputClass}
                  />
                </Field>
              )}
            </>,
          )}

          <p className="px-2 text-center text-xs text-muted-foreground">Please don't share your password.</p>
          {errorBox}

          <div className={actionsClass}>
            <Button type="submit" className={primarySize}>
              <Send className="mr-2 h-4 w-4" /> Send email
            </Button>
            <Button type="button" variant="ghost" className={ghostSize} onClick={leave}>
              Cancel
            </Button>
          </div>

          {/* Fallback if no email app is set up on the device. */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2 text-xs dark:border-white/15">
            <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">
              Email app didn't open? Write to <span className="font-semibold text-foreground">{CONTACT_EMAIL}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => copyText(CONTACT_EMAIL, "Email address")}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </form>
      ) : sentTo ? (
        <div className="space-y-6 text-center">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-12 w-12 text-primary" />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Request sent</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll contact you on <span className="font-semibold text-foreground">{sentTo}</span> (WhatsApp) with your
              login details.
            </p>
          </div>
          <Button type="button" className={primarySize} onClick={leave}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthPageHeading
            icon={<ClipboardList className="h-6 w-6" />}
            title="Request in the app"
            description="Tell us what you need and how to reach you. We'll get in touch."
          />

          {typeCard}
          {detailsCard()}

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

          {errorBox}

          <div className={actionsClass}>
            <Button type="submit" disabled={busy} className={primarySize}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                "Send request"
              )}
            </Button>
            <Button type="button" variant="ghost" className={ghostSize} disabled={busy} onClick={leave}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </AuthPageLayout>
  );
}