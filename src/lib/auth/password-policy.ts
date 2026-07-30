/**
 * Enterprise password policy for hospital accounts.
 * Keep in sync with UI copy and server-side Zod schemas.
 */

import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Human-readable policy summary for forms and errors. */
export const PASSWORD_POLICY_HINT =
  "At least 8 characters, including a letter and a number";

/**
 * Returns null if password is valid; otherwise a user-facing error message.
 */
export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || !password) {
    return "Password is required";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!/[A-Za-z]/.test(password)) {
    return "Password must include at least one letter";
  }
  if (!/\d/.test(password)) {
    return "Password must include at least one number";
  }
  // Reject common weak patterns
  const lower = password.toLowerCase();
  const blocked = ["password", "12345678", "qwerty12", "admin123", "hospital"];
  if (blocked.some((b) => lower === b || lower === `${b}1`)) {
    return "Password is too common; choose a stronger password";
  }
  return null;
}

/** Zod schema for new passwords (register / reset). */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((v) => /[A-Za-z]/.test(v), "Password must include at least one letter")
  .refine((v) => /\d/.test(v), "Password must include at least one number")
  .refine((v) => {
    const lower = v.toLowerCase();
    return !["password", "12345678", "qwerty12", "admin123", "hospital"].includes(
      lower
    );
  }, "Password is too common; choose a stronger password");

/**
 * Ensures password and confirmation match after individual validation.
 */
export function passwordsMatch(
  password: string,
  confirmPassword: string
): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return null;
}
