import { useId, useState, type ReactNode } from "react";
import { t } from "../copy.js";
import { validateAmount } from "../validation.js";

export function AmountField({
  label, value, onChange, decimals, unit, disabled = false,
  balanceRaw, maximumRaw, action, hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  decimals: number;
  unit: string;
  disabled?: boolean;
  balanceRaw?: string;
  maximumRaw?: string;
  action?: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const issue = validateAmount(value, decimals, { balanceRaw, maximumRaw }).issue;
  const invalid = touched && !!issue;
  return (
    <div className="amount-field">
      <span><label htmlFor={id}>{label}</label>{action}</span>
      <div>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          maxLength={80}
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={invalid || undefined}
          aria-describedby={[hint ? id + "-hint" : "", invalid ? id + "-error" : ""].filter(Boolean).join(" ") || undefined}
        />
        <b>{unit}</b>
      </div>
      {hint && <small id={id + "-hint"}>{hint}</small>}
      {invalid && <p id={id + "-error"} className="field-error" role="alert">{t(issue!, { decimals })}</p>}
    </div>
  );
}
