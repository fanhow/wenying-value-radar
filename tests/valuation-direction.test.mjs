import assert from "node:assert/strict";
import test from "node:test";
import { valuationDirection, valuationDirectionSymbol } from "../lib/valuation-direction.ts";

test("uses a five-percent neutral band for valuation direction", () => {
  assert.equal(valuationDirection(1.263), "up");
  assert.equal(valuationDirection(0.05), "flat");
  assert.equal(valuationDirection(-0.05), "flat");
  assert.equal(valuationDirection(-0.762), "down");
});

test("uses distinct arrows for upward, flat, and downward gaps", () => {
  assert.equal(valuationDirectionSymbol("up"), "↗");
  assert.equal(valuationDirectionSymbol("flat"), "→");
  assert.equal(valuationDirectionSymbol("down"), "↘");
});
