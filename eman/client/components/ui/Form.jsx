import { forwardRef, useId, useState } from 'react';
import { Icon } from './Icon.jsx';

/** Field wrapper: label + control + hint/error, wired with aria attributes. */
export function Field({ label, hint, error, required, children, id: idProp }) {
  const auto = useId();
  const id = idProp ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={id}>
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {hint && !error && <p className="hint" id={hintId}>{hint}</p>}
      {error && (
        <p className="field-error" id={errId} role="alert">
          <Icon name="alert-circle" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ icon, className = '', ...props }, ref) {
  if (!icon) return <input ref={ref} className={`input ${className}`} {...props} />;
  return (
    <div className="input-wrap">
      <Icon name={icon} />
      <input ref={ref} className={`input ${className}`} {...props} />
    </div>
  );
});

export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <Icon name="lock" />
      <input ref={ref} className="input" type={show ? 'text' : 'password'} style={{ paddingRight: 48 }} {...props} />
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon input-action"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        <Icon name={show ? 'eye-off' : 'eye'} />
      </button>
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`textarea ${className}`} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`select ${className}`} {...props}>
      {children}
    </select>
  );
});

export function Checkbox({ label, ...props }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}

export function Switch({ label, checked, onChange, ...props }) {
  return (
    <label className="row" style={{ '--gap': 'var(--space-3)', cursor: 'pointer' }}>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange?.(e.target.checked)} {...props} />
        <span className="track" />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}
