import assert from "node:assert/strict";
import test from "node:test";
import { arkResearchDate } from "../lib/ark-date.ts";

test("assigns overnight ARKER uploads to the previous Taiwan research date", () => {
  assert.equal(arkResearchDate("2026-08-15T00:30:00+08:00"), "2026-08-14");
  assert.equal(arkResearchDate("2026-08-15T05:59:59+08:00"), "2026-08-14");
});

test("starts the new Taiwan research date at 06:00", () => {
  assert.equal(arkResearchDate("2026-08-15T06:00:00+08:00"), "2026-08-15");
  assert.equal(arkResearchDate("2026-08-15T18:00:00+08:00"), "2026-08-15");
});

test("rejects invalid upload timestamps", () => {
  assert.equal(arkResearchDate("not-a-date"), null);
});
