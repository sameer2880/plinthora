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