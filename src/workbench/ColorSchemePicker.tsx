import { cx } from "./_cx.js";
import {
  CATEGORICAL_PALETTE_LABELS,
  CATEGORICAL_PALETTES,
  RAMP_LABELS,
  RAMP_STOPS,
  rampStops,
  type CategoricalPalette,
  type ColorScheme,
  type ColumnKind,
  type ContinuousRamp,
} from "./colorBy.js";
import { Popover, Segmented, Toggle } from "./controls.js";
import { resolveIcons, type WorkbenchIcons } from "./icons.js";

export interface ColorSchemePickerStrings {
  title: string;
  categorical: string;
  continuous: string;
  reverse: string;
  range: string;
  robust: string;
  full: string;
}

export const COLOR_SCHEME_PICKER_STRINGS_EN: ColorSchemePickerStrings = {
  title: "Palettes",
  categorical: "Categories",
  continuous: "Continuous scale",
  reverse: "Reverse scale",
  range: "Scale range",
  robust: "Robust (2–98 %)",
  full: "Min–max",
};

export const COLOR_SCHEME_PICKER_STRINGS_FR: ColorSchemePickerStrings = {
  title: "Palettes",
  categorical: "Catégories",
  continuous: "Échelle continue",
  reverse: "Inverser l'échelle",
  range: "Étendue de l'échelle",
  robust: "Robuste (2–98 %)",
  full: "Min–max",
};

/**
 * Palette chooser for the active color-by: categorical palettes as swatch
 * rows, continuous ramps as gradient bars, plus reverse and range clipping.
 * The section matching `activeKind` is listed first.
 */
export function ColorSchemePicker({
  value,
  onChange,
  activeKind,
  strings = COLOR_SCHEME_PICKER_STRINGS_EN,
  icons,
}: {
  value: ColorScheme;
  onChange: (next: ColorScheme) => void;
  /** Kind of the column currently colored by (`null` = none). */
  activeKind?: ColumnKind | null | undefined;
  strings?: ColorSchemePickerStrings | undefined;
  icons?: WorkbenchIcons | undefined;
}) {
  const icon = resolveIcons(icons);
  const preview =
    activeKind === "continuous"
      ? `linear-gradient(90deg, ${rampStops(value.continuous, value.reverse).join(", ")})`
      : `linear-gradient(90deg, ${CATEGORICAL_PALETTES[value.categorical]
          .slice(0, 5)
          .map((c, i) => `${c} ${i * 20}% ${(i + 1) * 20}%`)
          .join(", ")})`;

  const categorical = (
    <section key="cat" className="n4wb-palette-section">
      <span className="n4wb-options-title">{strings.categorical}</span>
      <ul className="n4wb-palette-list" role="radiogroup" aria-label={strings.categorical}>
        {(Object.keys(CATEGORICAL_PALETTES) as CategoricalPalette[]).map((id) => (
          <li key={id}>
            <button
              type="button"
              role="radio"
              aria-checked={value.categorical === id}
              className={cx("n4wb-palette-item", value.categorical === id && "is-active")}
              onClick={() => onChange({ ...value, categorical: id })}
            >
              <span className="n4wb-palette-swatches" aria-hidden="true">
                {CATEGORICAL_PALETTES[id].slice(0, 8).map((color, i) => (
                  <i key={i} style={{ background: color }} />
                ))}
              </span>
              <span className="n4wb-palette-name">{CATEGORICAL_PALETTE_LABELS[id]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  const continuous = (
    <section key="cont" className="n4wb-palette-section">
      <span className="n4wb-options-title">{strings.continuous}</span>
      <ul className="n4wb-palette-list" role="radiogroup" aria-label={strings.continuous}>
        {(Object.keys(RAMP_STOPS) as ContinuousRamp[]).map((id) => (
          <li key={id}>
            <button
              type="button"
              role="radio"
              aria-checked={value.continuous === id}
              className={cx("n4wb-palette-item", value.continuous === id && "is-active")}
              onClick={() => onChange({ ...value, continuous: id })}
            >
              <span className="n4wb-palette-ramp" style={{ background: `linear-gradient(90deg, ${rampStops(id, value.reverse).join(", ")})` }} aria-hidden="true" />
              <span className="n4wb-palette-name">{RAMP_LABELS[id]}</span>
            </button>
          </li>
        ))}
      </ul>
      <Toggle checked={value.reverse} onChange={(reverse) => onChange({ ...value, reverse })} label={strings.reverse} />
      <div className="n4wb-options-row">
        <span className="n4wb-field-label">{strings.range}</span>
        <Segmented
          size="xs"
          ariaLabel={strings.range}
          value={value.clip}
          onChange={(clip) => onChange({ ...value, clip })}
          options={[
            { value: "robust", label: strings.robust },
            { value: "full", label: strings.full },
          ]}
        />
      </div>
    </section>
  );

  return (
    <Popover
      label={strings.title}
      triggerClassName="n4wb-palette-trigger"
      popoverClassName="n4wb-palette-popover"
      trigger={
        <>
          {icon.palette}
          <span className="n4wb-palette-preview" style={{ background: preview }} aria-hidden="true" />
        </>
      }
    >
      <div className="n4wb-options n4wb-palette-body">{activeKind === "continuous" ? [continuous, categorical] : [categorical, continuous]}</div>
    </Popover>
  );
}
