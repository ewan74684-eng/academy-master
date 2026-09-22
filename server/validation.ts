// Small request-validation helpers shared by the API routes.
// They throw ValidationError, which routes turn into a 400 with a safe message.

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const MAX_AMOUNT = 10_000_000;

/** Parse a money amount. Rejects NaN/Infinity/huge values and values below `min`. */
export function parseAmount(
  value: unknown,
  field: string,
  { min = 0, allowZero = true, required = true }: { min?: number; allowZero?: boolean; required?: boolean } = {},
): number | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ValidationError(`${field} must be a number`);
  }
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a valid number`);
  if (n > MAX_AMOUNT) throw new ValidationError(`${field} is too large`);
  if (n < min) throw new ValidationError(`${field} cannot be less than ${min}`);
  if (!allowZero && n === 0) throw new ValidationError(`${field} must be greater than zero`);
  return Math.round(n * 100) / 100;
}

/** Parse a non-negative integer (sessions, quantities). */
export function parseNonNegativeInt(value: unknown, field: string, { max = 100_000 } = {}): number {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    throw new ValidationError(`${field} is required`);
  }
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < 0) throw new ValidationError(`${field} must be a whole number of 0 or more`);
  if (n > max) throw new ValidationError(`${field} is too large`);
  return n;
}

/** Parse a date; rejects "Invalid Date". */
export function parseDate(value: unknown, field: string): Date {
  if (value === undefined || value === null || value === "") throw new ValidationError(`${field} is required`);
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`);
  return d;
}

/** Validate a YYYY-MM month string. */
export function parseMonth(value: unknown, field = "month"): string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new ValidationError(`${field} must be in YYYY-MM format`);
  }
  return value;
}

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function parseText(value: unknown, field: string, { required = false, max = 2000 } = {}): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (required) throw new ValidationError(`${field} is required`);
    return null;
  }
  if (typeof value !== "string") throw new ValidationError(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${field} is too long (max ${max} characters)`);
  return trimmed;
}

/**
 * Turn any thrown error into a message that is safe to show to users.
 * Our own business-rule errors are passed through; raw database/driver errors
 * (which contain SQL text and parameters) are replaced with a generic message.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError) return error.message;
  if (!(error instanceof Error)) return fallback;
  const e = error as Error & { code?: string; sqlMessage?: string; issues?: unknown };
  // Zod validation errors
  if (e.name === "ZodError") return "Invalid input: " + formatZod(e);
  // mysql2 / drizzle errors carry a code or embed the failed SQL
  if (e.code || e.sqlMessage || /failed query|sql|ER_|ECONN|ETIMEDOUT|PROTOCOL_/i.test(e.message)) return fallback;
  return e.message;
}

function formatZod(e: any): string {
  try {
    return (e.issues as any[]).map((i) => `${(i.path || []).join(".") || "value"}: ${i.message}`).join("; ");
  } catch {
    return "validation failed";
  }
}
