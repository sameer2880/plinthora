/**
 * SERVER-ONLY email sending, used for the "Forgot password?" one-time codes.
 *
 * FREE option (recommended): Brevo — about 300 emails a day on the free plan, and you can send
 * from a single verified address (your Gmail works), no domain needed. Set these where the app is hosted
 * (Vercel → Settings → Environment Variables), then redeploy:
 *   BREVO_API_KEY     the API key from Brevo (SMTP & API → API Keys)
 *   MAIL_FROM_EMAIL   the sender address you verified in Brevo, e.g. yourname@gmail.com
 *   MAIL_FROM_NAME    optional, defaults to "Plinthora"
 *
 * Optional alternative: Resend (needs a verified domain) — RESEND_API_KEY and RESEND_FROM.
 * If both are set, Brevo is used.
 */
const useBrevo = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL);
const useResend = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

export function emailConfigured() {
  return useBrevo() || useResend();
}

/** Sends one email through Brevo (or Resend). Throws if the provider refuses it. */
async function deliver(to: string, subject: string, text: string, html: string) {
  if (useBrevo()) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY as string, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.MAIL_FROM_NAME || "Plinthora", email: process.env.MAIL_FROM_EMAIL },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Brevo error ${res.status}: ${detail.slice(0, 200)}`);
    }
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${detail.slice(0, 200)}`);
  }
}
export async function sendResetCodeEmail(to: string, code: string, minutes: number) {
  const subject = `${code} is your Plinthora password reset code`;
  const text =
    `Your Plinthora password reset code is ${code}.\n\n` +
    `It works for ${minutes} minutes and can only be used once. ` +
    `If you didn't ask to reset your password, you can ignore this email.`;
  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:auto;padding:24px">` +
    `<h2 style="margin:0 0 8px">Reset your password</h2>` +
    `<p style="color:#555;margin:0 0 20px">Enter this code in the app to choose a new password:</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 20px">${code}</p>` +
    `<p style="color:#777;font-size:13px;margin:0">It works for ${minutes} minutes and can only be used once. ` +
    `If you didn't ask for this, you can ignore this email.</p></div>`;
  await deliver(to, subject, text, html);
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Emails a one-time sign-in / password-reset link (the same links the admin can copy or share on WhatsApp).
 *   reset  — "choose a new password"        magic — "sign in"        invite — "your account is ready"
 */
export async function sendLoginLinkEmail(
  to: string,
  input: { name: string; url: string; kind: "reset" | "magic" | "invite" },
) {
  const name = input.name.trim() || "there";
  const copy = {
    reset: {
      subject: "Reset your Plinthora password",
      heading: "Reset your password",
      line: "An admin reset your password. Open the link below to choose a new one and sign in.",
      button: "Choose a new password",
    },
    invite: {
      subject: "Your Plinthora account is ready",
      heading: "Your account is ready",
      line: "Open the link below to choose your password and sign in.",
      button: "Set my password",
    },
    magic: {
      subject: "Your Plinthora sign-in link",
      heading: "Sign in to Plinthora",
      line: "Open the link below to sign in. You don't need your password.",
      button: "Sign in",
    },
  }[input.kind];

  const text =
    `Hi ${name},\n\n${copy.line}\n\n${input.url}\n\n` +
    `The link works once and expires soon. Don't share it with anyone. ` +
    `If you weren't expecting this, you can ignore this email.`;
  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:460px;margin:auto;padding:24px">` +
    `<h2 style="margin:0 0 8px">${copy.heading}</h2>` +
    `<p style="color:#555;margin:0 0 20px">Hi ${escapeHtml(name)}, ${copy.line}</p>` +
    `<p style="margin:0 0 20px"><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#4f7a3d;color:#fff;` +
    `text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${copy.button}</a></p>` +
    `<p style="color:#777;font-size:13px;margin:0 0 8px">Or paste this address into your browser:</p>` +
    `<p style="color:#555;font-size:12px;word-break:break-all;margin:0 0 20px">${escapeHtml(input.url)}</p>` +
    `<p style="color:#777;font-size:13px;margin:0">The link works once and expires soon. Don't share it with anyone. ` +
    `If you weren't expecting this, you can ignore this email.</p></div>`;

  await deliver(to, copy.subject, text, html);
}