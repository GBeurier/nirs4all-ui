import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  OwnerProposalList,
  type OwnerProposalDisplay,
  type OwnerProposalListProps,
} from "./OwnerProposalList.js";

type AnyProps = Record<string, unknown> & { children?: ReactNode };

// The component and its helper are hook-free, so the element tree can be expanded
// without a DOM to reach the real host callbacks wired on buttons and the select.
function collect(node: ReactNode, out: ReactElement<AnyProps>[] = []): ReactElement<AnyProps>[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child as ReactNode, out);
    return out;
  }
  if (!isValidElement<AnyProps>(node)) return out;
  if (typeof node.type === "function") {
    collect((node.type as (props: AnyProps) => ReactNode)(node.props), out);
    return out;
  }
  out.push(node);
  collect(node.props.children, out);
  return out;
}

function elements(props: OwnerProposalListProps) {
  return collect(OwnerProposalList(props));
}

function byClass(els: ReactElement<AnyProps>[], className: string) {
  return els.filter((el) => typeof el.props.className === "string" && el.props.className.split(" ").includes(className));
}

const signal: OwnerProposalDisplay = {
  id: "p-signal",
  kind: "signal_type",
  target: "spectra.csv",
  kindLabel: "Signal type",
  targetLabel: "spectra.csv",
  valueLabel: "Absorbance",
  evidence: ["Header pattern matches wavelength columns"],
  score: 0.8125,
  scoreClassName: "host-score-high",
  status: "inferred",
  alternatives: [
    { choiceId: "alt-0", label: "Reflectance", score: 0.4, scoreClassName: "host-score-mid" },
    { choiceId: "alt-1", label: "Transmittance" },
  ],
  overrideChoices: [
    { choiceId: "ov-0", label: "Absorbance", value: { kind: "absorbance" } },
    { choiceId: "ov-1", label: "Reflectance", value: { kind: "reflectance" } },
  ],
};

const unknownKind: OwnerProposalDisplay = {
  id: "p-future",
  kind: "future_owner_kind",
  target: "meta.csv",
  valueLabel: "opaque owner value",
  score: null,
};

describe("OwnerProposalList", () => {
  it("renders host labels, uncalibrated scores and a dash for missing scores", () => {
    const markup = renderToStaticMarkup(<OwnerProposalList title="Proposals" proposals={[signal, unknownKind]} />);

    expect(markup).toContain("Proposals");
    expect(markup).toContain("Signal type");
    expect(markup).toContain("Absorbance");
    expect(markup).toContain("Header pattern matches wavelength columns");
    expect(markup).toContain("Status: inferred");
    expect(markup).toContain("Score (uncalibrated)</span> 0.81");
    expect(markup).toContain("host-score-high");
    expect(markup).toContain("host-score-mid");
    expect(markup).toContain("Transmittance");
    // Missing scores (null on the proposal, absent on an alternative) are dashes, never 0.
    expect(markup.match(/Score \(uncalibrated\)<\/span> —/g)).toHaveLength(2);
    expect(markup).not.toContain("0.00");
  });

  it("renders every proposal in host order, including unknown kinds", () => {
    const later: OwnerProposalDisplay = { id: "p-target", kind: "target", target: "y.csv", valueLabel: "protein" };
    const markup = renderToStaticMarkup(<OwnerProposalList proposals={[later, unknownKind, signal]} />);

    const order = ["protein", "future_owner_kind", "Signal type"].map((text) => markup.indexOf(text));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(markup).toContain('data-kind="future_owner_kind"');
    expect(markup).toContain("meta.csv");
  });

  it("shows empty, list error and per-proposal error states honestly", () => {
    const empty = renderToStaticMarkup(<OwnerProposalList proposals={[]} emptyMessage="Add a source first." error="Owner refused the spec." />);
    expect(empty).toContain("Add a source first.");
    expect(empty).toContain('role="alert"');
    expect(empty).toContain("Owner refused the spec.");
    expect(renderToStaticMarkup(<OwnerProposalList proposals={[]} />)).toContain("No proposals.");

    const failed = renderToStaticMarkup(<OwnerProposalList proposals={[{ ...unknownKind, error: "Value not accepted by owner." }]} />);
    expect(failed).toContain("Value not accepted by owner.");
    expect(failed).toContain('data-error="true"');
  });

  it("offers no actions without callbacks and follows host canConfirm/canUndo", () => {
    const passive = elements({ proposals: [signal] });
    expect(passive.filter((el) => el.type === "button" || el.type === "select")).toHaveLength(0);

    const noop = () => {};
    const hostControlled = elements({
      proposals: [{ ...signal, canConfirm: false }, unknownKind],
      onConfirm: noop,
      onUndo: noop,
    });
    // canConfirm=false hides one confirm; canUndo defaults to false so no undo appears.
    expect(byClass(hostControlled, "n4ui-proposal-confirm")).toHaveLength(1);
    expect(byClass(hostControlled, "n4ui-proposal-undo")).toHaveLength(0);

    const undoable = elements({ proposals: [{ ...unknownKind, canUndo: true }], onUndo: noop });
    expect(byClass(undoable, "n4ui-proposal-undo")).toHaveLength(1);
  });

  it("disables every action while busy", () => {
    const noop = () => {};
    const els = elements({
      proposals: [{ ...signal, canUndo: true }],
      busy: true,
      onConfirm: noop,
      onAlternative: noop,
      onOverride: noop,
      onUndo: noop,
    });
    const controls = els.filter((el) => el.type === "button" || el.type === "select");
    expect(controls.length).toBe(5);
    expect(controls.every((el) => el.props.disabled === true)).toBe(true);
    expect(renderToStaticMarkup(<OwnerProposalList proposals={[signal]} busy onConfirm={noop} />)).toContain('aria-busy="true"');
  });

  it("passes ids, opaque choice ids and the exact host override value back", () => {
    const onConfirm = vi.fn();
    const onAlternative = vi.fn();
    const onOverride = vi.fn();
    const onUndo = vi.fn();
    const els = elements({
      proposals: [{ ...signal, canUndo: true }],
      onConfirm,
      onAlternative,
      onOverride,
      onUndo,
    });

    (byClass(els, "n4ui-proposal-confirm")[0]!.props.onClick as () => void)();
    expect(onConfirm).toHaveBeenCalledWith("p-signal");

    (byClass(els, "n4ui-proposal-alternative")[1]!.props.onClick as () => void)();
    expect(onAlternative).toHaveBeenCalledWith("p-signal", "alt-1");

    const select = els.find((el) => el.type === "select")!;
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "ov-1" } });
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(onOverride.mock.calls[0]![0]).toBe("p-signal");
    expect(onOverride.mock.calls[0]![1]).toBe(signal.overrideChoices![1]!.value);

    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "" } });
    expect(onOverride).toHaveBeenCalledTimes(1);

    (byClass(els, "n4ui-proposal-undo")[0]!.props.onClick as () => void)();
    expect(onUndo).toHaveBeenCalledWith("signal_type", "spectra.csv");
  });
});
