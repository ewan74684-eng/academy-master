import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const DEFAULT_COUNTRY_CODE = "+971";

// Used to split numbers saved without a space between the code and the number (e.g. "+971501234567").
const KNOWN_CODES = [
  "+971", "+966", "+965", "+974", "+973", "+968", "+967", "+970", "+962", "+961", "+963", "+964",
  "+20", "+212", "+213", "+216", "+218", "+249", "+44", "+91", "+92", "+63", "+1",
];

function parsePhone(value: string | undefined | null): { code: string; number: string } {
  const v = (value || "").trim();
  if (!v) return { code: DEFAULT_COUNTRY_CODE, number: "" };
  const spaced = v.match(/^(\+\d{1,4})[\s-]+(.*)$/);
  if (spaced) return { code: spaced[1], number: spaced[2] };
  if (v.startsWith("+")) {
    const code = [...KNOWN_CODES].sort((a, b) => b.length - a.length).find((c) => v.startsWith(c));
    if (code) return { code, number: v.slice(code.length) };
  }
  // Legacy value without a country code: keep it exactly as saved
  return { code: "", number: v };
}

function composePhone(code: string, number: string): string {
  const n = number.trim();
  if (!n) return "";
  return code.trim() ? `${code.trim()} ${n}` : n;
}

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string | null;
  onChange: (value: string) => void;
}

/** Phone number with an editable country code (defaults to +971). Emits "<code> <number>". */
const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, className, placeholder = "5X XXX XXXX", ...props }, ref) => {
    const [parts, setParts] = React.useState(() => parsePhone(value));

    // Re-sync when the form value is changed from outside (e.g. form.reset with a player's data)
    React.useEffect(() => {
      if ((value || "") !== composePhone(parts.code, parts.number)) {
        setParts(parsePhone(value));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const update = (next: { code: string; number: string }) => {
      setParts(next);
      onChange(composePhone(next.code, next.number));
    };

    return (
      <div className={cn("flex gap-2", className)}>
        <Input
          aria-label="Country code"
          className="w-24 shrink-0"
          inputMode="tel"
          value={parts.code}
          onChange={(e) => update({ ...parts, code: e.target.value.replace(/[^\d+]/g, "") })}
          placeholder={DEFAULT_COUNTRY_CODE}
        />
        <Input
          ref={ref}
          type="tel"
          inputMode="tel"
          value={parts.number}
          onChange={(e) => update({ ...parts, number: e.target.value })}
          placeholder={placeholder}
          {...props}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
