/**
 * Password rules shared by every screen that sets a password.
 * These are checked in the browser for quick feedback. The real enforcement is
 * the password policy in Supabase → Authentication (set the minimum length to
 * at least 8 there too), because anyone can bypass browser checks.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "iloveyou", "admin123", "welcome1", "abcd1234", "11111111", "00000000",
]);

/** Returns a message describing what is wrong, or null when the password is acceptable. */
export function passwordProblem(password: string, opts: { phone?: string | null } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return "Password is too long";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers in your password";
  if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) return "That password is too easy to guess";
  const digits = password.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits) && digits.length >= 10 && password.replace(/\d/g, "").length <= 1) {
    return "Don't use a mobile number as your password";
  }
  const phone = opts.phone?.replace(/\D/g, "").slice(-10);
  if (phone && phone.length === 10 && password.includes(phone)) return "Don't use your mobile number in your password";
  return null;
}