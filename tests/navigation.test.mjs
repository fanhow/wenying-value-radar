import assert from "node:assert/strict";
import test from "node:test";
import { stockDetailHref } from "../lib/navigation.ts";

test("builds a direct link to a stock valuation detail", () => {
  assert.equal(stockDetailHref(" nvda "), "/?ticker=NVDA#valuation-detail");
});
