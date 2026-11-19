import { useId } from 'react';

export interface N4aExportOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface N4aExportSelectionProps {
  options: readonly N4aExportOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  legend?: string;
  disabled?: boolean;
  className?: string;
  optionClassName?: string;
}

/** Controlled content selection; the host resolves files and writes the archive. */
export function N4aExportSelection({ options, value, onChange, legend = 'Include in the .n4a export', disabled, className, optionClassName }: N4aExportSelectionProps) {
  const prefix = useId();
  return <fieldset disabled={disabled} className={className}>
    <legend>{legend}</legend>
    {options.map(option => {
      const id = `${prefix}-${option.id}`;
      return <label key={option.id} htmlFor={id} className={optionClassName}>
        <input id={id} type="checkbox" disabled={option.disabled} checked={value.includes(option.id)}
          onChange={event => onChange(event.target.checked ? [...value, option.id] : value.filter(item => item !== option.id))} />
        <span><strong>{option.label}</strong>{option.description && <span style={{ display: 'block' }}>{option.description}</span>}</span>
      </label>;
    })}
  </fieldset>;
}
