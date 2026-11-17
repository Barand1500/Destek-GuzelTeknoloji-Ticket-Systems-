import { useState } from "react";
import { normalizeMoneyEntry, formatMoneyEntry } from "./number-format";
export function MoneyInput({
  value,
  onChange,
  required,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      required={required}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? value.replace(".", ",") : formatMoneyEntry(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        const normalized = normalizeMoneyEntry(event.target.value);
        if (normalized !== null) onChange(normalized);
      }}
    />
  );
}
