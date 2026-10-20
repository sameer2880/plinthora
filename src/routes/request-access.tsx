import { useState, type FormEvent } from "react";
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
  "h-12 rounded-full border-border bg-background px-5 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40";

const textareaClass =
  "min-h-[72px] rounded-2xl border-border bg-background px-5 py-3 text-sm shadow-none dark:border-white/15 dark:bg-white/[0.04]";

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
  "flex w-full items-center gap-3.5 rounded-2xl border border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 dark:border-white/15 dark:bg-white/[0.04]";

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
        <span className="block text-xs text-muted-foreground">{option.hint}</span>
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

/** The three request-type tiles, shared by the in-app form and the email form. */
function TypePicker({ type, onChange }: { type: RequestType; onChange: (t: RequestType) => void }) {
  return (
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
            onClick={() => onChange(t)}
            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
              active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50 dark:border-white/15"
            }`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-xs font-semibold leading-tight">{REQUEST_TYPE_LABEL[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

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
  const sharedFields = (
    <>
      <TypePicker type={type} onChange={setType} />
      <p className="-mt-1 px-1 text-center text-xs text-muted-foreground">{REQUEST_TYPE_HINT[type]}</p>

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
    </>
  );

  const messageField = (
    <Textarea
      placeholder="Anything else we should know? (optional)"
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      maxLength={500}
      rows={2}
      className={textareaClass}
    />
  );

  return (
    <AuthPageLayout
      onBack={goBackOneScreen}
      backLabel={view === "choose" || sentTo ? "Back to sign in" : "Back"}
    >
      {view === "choose" ? (
        <div className="space-y-4">
          <AuthPageHeading
            title="Need access?"
            description="Choose how you'd like to reach us. We'll get back to you soon."
          />
          <div className="grid gap-2.5">
            {options.map((o) => (
              <OptionRow key={o.key} option={o} />
            ))}
          </div>
          <Button type="button" variant="ghost" className="h-11 w-full rounded-full text-sm" onClick={leave}>
            Cancel
          </Button>
        </div>
      ) : view === "email" ? (
        <form onSubmit={sendEmail} className="space-y-4">
          <AuthPageHeading
            title="Request by email"
            description="Fill in your details and tap Send email. Your email app will open with the message ready to send."
          />

          {sharedFields}

          {type === "new_business" && (
            <Input
              placeholder="Business location (town / city)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={120}
              className={inputClass}
            />
          )}

          {type === "forgot_credentials" && (
            <Input
              autoComplete="username"
              placeholder="Your username or email (if you remember it)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={120}
              className={inputClass}
            />
          )}

          {messageField}

          <p className="px-2 text-center text-xs text-muted-foreground">Please don't share your password.</p>

          {err && <p className="text-xs font-medium text-destructive">{err}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1 rounded-full text-sm" onClick={leave}>
              Cancel
            </Button>
            <Button type="submit" className="h-12 flex-[2] rounded-full font-semibold">
              <Send className="mr-2 h-4 w-4" /> Send email
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
        <div className="space-y-5 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Request sent</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll contact you on <span className="font-semibold text-foreground">{sentTo}</span> (WhatsApp) with your
              login details.
            </p>
          </div>
          <Button type="button" className="h-12 w-full rounded-full font-semibold" onClick={leave}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthPageHeading
            title="Request in the app"
            description="Tell us what you need and how to reach you. We'll get in touch."
          />

          {sharedFields}
          {messageField}

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

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 rounded-full text-sm"
              disabled={busy}
              onClick={leave}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="h-12 flex-[2] rounded-full font-semibold">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                "Send request"
              )}
            </Button>
          </div>
        </form>
      )}
    </AuthPageLayout>
  );
}