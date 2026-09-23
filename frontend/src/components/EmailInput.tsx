import { useMemo, useState } from "react";

const domains = ["@gmail.com", "@hotmail.com", "@outlook.com", "@yahoo.com", "@icloud.com"];

export function EmailInput({
  name,
  defaultValue = "",
  required,
  autoComplete = "email",
  multiple = false,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
  multiple?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => {
    const current = multiple ? value.split(",").pop()?.trim() ?? "" : value;
    const at = current.indexOf("@");
    const local = at >= 0 ? current.slice(0, at) : current;
    const typedDomain = at >= 0 ? current.slice(at).toLocaleLowerCase("tr-TR") : "";
    return domains
      .filter((domain) => !typedDomain || domain.startsWith(typedDomain))
      .map((domain) => ({ domain, value: `${local}${domain}` }));
  }, [value]);
  return (
    <span className="email-field">
      <input
        name={name}
        required={required}
        type={multiple ? "text" : "email"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && value.trim().length > 0 && suggestions.length > 0 && (
        <span className="email-suggestions" role="listbox" aria-label="E-posta alan adı önerileri">
          {suggestions.map((suggestion) => (
            <button key={suggestion.domain} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setValue(multiple ? `${value.slice(0, value.lastIndexOf(",") + 1)}${value.includes(",") ? " " : ""}${suggestion.value}` : suggestion.value); setOpen(false); }}>
              {suggestion.value}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
