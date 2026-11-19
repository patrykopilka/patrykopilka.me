import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const output = ts.transpileModule(readFileSync(new URL("../src/scripts/project-carousel.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(output, sandbox);
const { carouselGeometry, carouselWheel } = sandbox.exports;

test("active portrait stands upright above neighbors that fan from upper left to lower right", () => {
  const center = carouselGeometry(0);
  assert.deepEqual({ ...center }, { x:0, y:0, rotation:0, size:1, alpha:1, layer:500 });
  const left = carouselGeometry(-1);
  const right = carouselGeometry(1);
  assert.deepEqual([left.x, left.y, left.rotation], [-87, -20, -12.5]);
  assert.deepEqual([right.x, right.y, right.rotation], [87, 20, 12.5]);
  assert.ok(left.alpha < center.alpha && right.alpha < center.alpha);
  assert.ok(left.layer < center.layer && right.layer < center.layer);
  assert.ok(carouselGeometry(2).alpha < right.alpha);
});

test("partials shift continuously during horizontal drag or wheel", () => {
  let last = -Infinity;
  for (const offset of [-1, -.87, -.43, 0, .34, .53, .95, 1]) {
    const value = carouselGeometry(offset);
    assert.ok(value.x > last);
    assert.ok(value.x === 87 * offset && value.y === 20 * offset);
    assert.ok(value.size > .68 && value.alpha > .27);
    last = value.x;
  }
});

test("wheel consumes only while moving toward an available slot", () => {
  for (const [position, delta, next, consume] of [
    [0, -.6, 0, false], [2, .6, 2, false], [1, .35, 1.35, true],
    [1, -.3, .7, true], [.6, -1, 0, true], [1.6, 1, 2, true], [1, 0, 1, false],
  ]) {
    assert.deepEqual({ ...carouselWheel(position, delta, 3) }, { next, consume });
  }
});
