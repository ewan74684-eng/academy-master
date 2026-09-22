// Pure unit tests — no database, no network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ValidationError, parseAmount, parseNonNegativeInt, parseDate, parseMonth, parseEnum, parseText, safeErrorMessage,
} from "./validation";

const throwsValidation = (fn: () => unknown) => assert.throws(fn, ValidationError);

test("parseAmount accepts valid amounts and rounds to cents", () => {
  assert.equal(parseAmount("100", "amount"), 100);
  assert.equal(parseAmount(12.345, "amount"), 12.35);
  assert.equal(parseAmount(" 50.5 ", "amount"), 50.5);
  assert.equal(parseAmount(0, "amount"), 0);
});

test("parseAmount rejects bad input", () => {
  for (const bad of ["abc", "NaN", "Infinity", -1, "-0.01", 1e12, {}, [], true]) {
    throwsValidation(() => parseAmount(bad as any, "amount"));
  }
  throwsValidation(() => parseAmount(undefined, "amount"));
  throwsValidation(() => parseAmount("", "amount"));
  throwsValidation(() => parseAmount(0, "amount", { allowZero: false }));
  assert.equal(parseAmount(undefined, "amount", { required: false }), undefined);
});

test("parseNonNegativeInt", () => {
  assert.equal(parseNonNegativeInt("8", "sessions"), 8);
  assert.equal(parseNonNegativeInt(0, "sessions"), 0);
  for (const bad of ["-1", "1.5", "abc", "", null, 1e9]) throwsValidation(() => parseNonNegativeInt(bad, "sessions"));
});

test("parseDate rejects invalid dates", () => {
  assert.ok(parseDate("2026-01-31", "d") instanceof Date);
  for (const bad of ["not a date", "", null, undefined, "2026-13-45"]) throwsValidation(() => parseDate(bad, "d"));
});

test("parseMonth only accepts YYYY-MM", () => {
  assert.equal(parseMonth("2026-09"), "2026-09");
  for (const bad of ["2026-9", "2026-13", "2026-00", "abc", "", 202609, "2026-09-01"]) throwsValidation(() => parseMonth(bad));
});

test("parseEnum", () => {
  assert.equal(parseEnum("cash", ["cash", "visa"] as const, "method"), "cash");
  for (const bad of ["CASH", "", null, 1, "bitcoin"]) throwsValidation(() => parseEnum(bad, ["cash", "visa"] as const, "method"));
});

test("parseText trims, enforces required and max length", () => {
  assert.equal(parseText("  hi  ", "t"), "hi");
  assert.equal(parseText("   ", "t"), null);
  throwsValidation(() => parseText("   ", "t", { required: true }));
  throwsValidation(() => parseText("x".repeat(11), "t", { max: 10 }));
  throwsValidation(() => parseText(123, "t"));
});

test("safeErrorMessage hides database errors but keeps business errors", () => {
  assert.equal(safeErrorMessage(new ValidationError("amount is required"), "fallback"), "amount is required");
  assert.equal(safeErrorMessage(new Error("Payment exceeds net payable"), "fallback"), "Payment exceeds net payable");
  const dbErr = Object.assign(new Error("Duplicate entry 'x' for key 'PRIMARY'"), { code: "ER_DUP_ENTRY" });
  assert.equal(safeErrorMessage(dbErr, "fallback"), "fallback");
  assert.equal(safeErrorMessage(new Error("Failed query: insert into `players` ... params: secret"), "fallback"), "fallback");
  assert.equal(safeErrorMessage("string thrown", "fallback"), "fallback");
});
