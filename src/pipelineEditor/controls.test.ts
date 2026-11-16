import { describe, expect, it } from "vitest";

import { INVALID, controlKind, looseText, parseLoose, parseNumber, parseValueList, valueListText } from "./controls.js";

describe("inspector value parsing", () => {
  it("reads loose values as JSON when possible, text otherwise", () => {
    expect(parseLoose("12")).toBe(12);
    expect(parseLoose("true")).toBe(true);
    expect(parseLoose("auto")).toBe("auto");
    expect(parseLoose('"12"')).toBe("12");
    expect(parseLoose("[1, 2]")).toEqual([1, 2]);
    expect(parseNumber("3.5", false)).toBe(3.5);
    expect(parseNumber("3.5", true)).toBe(INVALID);
    expect(parseNumber("", false)).toBe(INVALID);
  });

  it("round-trips value lists without changing the type of their items", () => {
    for (const values of [[11, 21, 31], ["auto", "svd"], ["1", "2"], [true, false, null], ["a,b", " padded", ""], [[1, 2], { class: "x.Y" }]]) {
      expect(parseValueList(valueListText(values))).toEqual(values);
    }
    expect(valueListText(["auto", 2, "3"])).toBe('auto, 2, "3"');
    expect(parseValueList("")).toEqual([]);
    expect(parseValueList("auto, 1e-3, svd")).toEqual(["auto", 0.001, "svd"]);
    for (const value of ["auto", "12", "true", "null", 12, null, [1]]) expect(parseLoose(looseText(value))).toEqual(value);
  });

  it("falls back to a JSON control when the stored value does not fit the declared type", () => {
    expect(controlKind({ name: "n", type: "int" }, 5)).toBe("int");
    expect(controlKind({ name: "n", type: "int" }, undefined)).toBe("int");
    expect(controlKind({ name: "n", type: "int" }, { _range_: [1, 5] })).toBe("json");
    expect(controlKind({ name: "n", type: "int" }, null)).toBe("json");
    expect(controlKind({ name: "s", type: "select", options: [{ value: "a", label: "a" }] }, "b")).toBe("json");
    expect(controlKind({ name: "s", type: "select" }, undefined)).toBe("string");
    expect(controlKind({ name: "x", type: "metadata_column" }, undefined)).toBe("json");
  });
});
