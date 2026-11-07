/** Shared English vocabulary for NIRS applications. Wire identifiers stay unchanged. */
export const NIRS_TERMS = {
  calibration: "Calibration",
  retained_test: "Retained test",
  prediction: "Prediction",
  unassigned: "Outside candidate groups",
} as const;

const REASONS: Record<string, string> = {
  FEWER_THAN_20_RESAMPLING_UNITS: "Fewer than 20 independent units: this profile does not report a bootstrap interval for this sample size.",
  PERMUTATION_PLAN_NOT_QUALIFIED: "This permutation procedure has not passed scientific qualification; the descriptive result remains available.",
  EXCHANGEABILITY_NOT_DECLARED: "Permutation tests require confirmation that independent units can be exchanged under the null hypothesis. Review this assumption in Settings.",
  INDEPENDENCE_UNIT_UNKNOWN: "Declare which samples or groups can be treated as independent in Settings.",
  QUASI_DUPLICATE_TOLERANCE_NOT_DECLARED: "Set a spectral similarity tolerance in Settings. No universal threshold is assumed.",
  REFERENCE_CONTRADICTION_TOLERANCE_NOT_DECLARED: "Declare an acceptable reference difference before comparing references.",
  REPETITION_TYPE_NOT_DECLARED: "Declare technical repeats in Settings to estimate repeatability.",
  SINGLE_FACTOR_LEVEL: "Only one level is present, so this factor cannot be compared.",
  FEWER_THAN_THREE_TECHNICAL_REPEAT_GROUPS: "At least three physical samples with declared technical repeats are needed to estimate a spectral tolerance. Set a manual tolerance in Settings when acquisition precision is known.",
  TECHNICAL_REPEATS_REQUIRED_FOR_TOLERANCE: "No technical repeats are declared for estimating a spectral tolerance. Declare repeats or set a manual tolerance in Settings.",
  FAMILY_DISABLED: "This analysis family is turned off in Settings.",
};

/** Keep stable machine codes in exports and tooltips, with readable prose on screen. */
export function reasonLabel(code: string): string {
  return REASONS[code] ?? code.toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}
