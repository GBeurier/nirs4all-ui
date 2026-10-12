import type { RowColumn } from "../workbench/colorBy.js";
import { NumberField, SelectField, Toggle } from "../workbench/controls.js";
import type { OperatorParam } from "./types.js";

/** One operator parameter as a form control (shared by step cards and the operator browser). */
export function ParamEditor({
  param,
  value,
  onChange,
  columns,
}: {
  param: OperatorParam;
  value: unknown;
  onChange: (value: unknown) => void;
  columns: readonly RowColumn[];
}) {
  const label = param.label ?? param.name;
  switch (param.type) {
    case "bool":
      return <Toggle checked={Boolean(value)} onChange={onChange} label={label} {...(param.help ? { hint: param.help } : {})} />;
    case "select":
      return (
        <SelectField
          label={label}
          value={String(value ?? "")}
          options={(param.options ?? []).map((o) => ({ value: String(o.value), label: o.label ?? String(o.value) }))}
          onChange={(raw) => {
            const option = param.options?.find((o) => String(o.value) === raw);
            onChange(option ? option.value : raw);
          }}
        />
      );
    case "column":
      return (
        <SelectField
          label={label}
          value={String(value ?? "")}
          placeholder="—"
          options={columns.map((c) => ({ value: c.key, label: c.label }))}
          onChange={onChange}
        />
      );
    case "range": {
      const pair = Array.isArray(value) ? (value as number[]) : [param.min ?? 0, param.max ?? 1];
      return (
        <div className="n4pg-param-range">
          <span className="n4wb-field-label">{label}</span>
          <NumberField label="min" value={pair[0] ?? 0} onChange={(v) => onChange([v, pair[1]])} {...(param.unit ? { unit: param.unit } : {})} />
          <NumberField label="max" value={pair[1] ?? 0} onChange={(v) => onChange([pair[0], v])} {...(param.unit ? { unit: param.unit } : {})} />
        </div>
      );
    }
    case "int":
    case "float": {
      const numeric = typeof value === "number" ? value : Number(param.default ?? 0);
      const step = param.step ?? (param.type === "int" ? 1 : 0.01);
      const bounded = param.min !== undefined && param.max !== undefined;
      return (
        <div className="n4pg-param-num">
          <NumberField
            label={label}
            value={numeric}
            onChange={(v) => onChange(param.type === "int" ? Math.round(v) : v)}
            {...(param.min !== undefined ? { min: param.min } : {})}
            {...(param.max !== undefined ? { max: param.max } : {})}
            step={step}
            {...(param.unit ? { unit: param.unit } : {})}
          />
          {bounded ? (
            <input
              type="range"
              className="n4pg-slider"
              min={param.min}
              max={param.max}
              step={step}
              value={numeric}
              aria-label={label}
              onChange={(event) => onChange(param.type === "int" ? Math.round(Number(event.target.value)) : Number(event.target.value))}
            />
          ) : null}
        </div>
      );
    }
    default:
      return (
        <label className="n4wb-field">
          <span className="n4wb-field-label">{label}</span>
          <input className="n4wb-input" defaultValue={String(value ?? "")} onBlur={(event) => onChange(event.target.value)} />
        </label>
      );
  }
}
