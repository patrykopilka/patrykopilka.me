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

function gestureFixture() {
  class Node {
    listeners = new Map();
    attributes = new Map();
    dataset = {};
    style = { setProperty() {} };
    offsetWidth = 200;
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    emit(name, values = {}) { this.listeners.get(name)?.({ target: this, ...values }); }
    contains() { return false; }
  }
  const root = new Node();
  const stage = new Node();
  const count = new Node();
  stage.captured = null;
  stage.setPointerCapture = id => { stage.captured = id; };
  stage.hasPointerCapture = id => stage.captured === id;
  stage.releasePointerCapture = () => { stage.captured = null; };
  const cards = Array.from({ length: 3 }, () => new Node());
  const panels = Array.from({ length: 3 }, () => new Node());
  const nodes = {
    '[data-carousel-stage]': stage, '[data-carousel-count]': count,
    '[data-carousel-controls]': new Node(), '[data-carousel-prev]': new Node(), '[data-carousel-next]': new Node(),
  };
  root.dataset.initialIndex = '1';
  root.querySelector = selector => nodes[selector];
  root.querySelectorAll = selector => selector === '[data-carousel-card]' ? cards : panels;
  let time = 100;
  Object.assign(sandbox, {
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    document: { activeElement: null }, performance: { now: () => time }, clearTimeout,
  });
  sandbox.exports.setupProjectCarousel(root);
  return {
    root, stage, count, cards, nodes, advance: ms => { time += ms; },
    event(type, x, y, target = stage) {
      stage.emit(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, button: 0, target });
    },
  };
}

test("a card losing implicit touch capture to the stage does not cancel a swipe", () => {
  for (const [end, label] of [[82, '03 / 03'], [258, '01 / 03']]) {
    const f = gestureFixture();
    f.event('pointerdown', 170, 100, f.cards[1]);
    f.event('pointermove', end > 170 ? 185 : 155, 103, f.cards[1]);
    assert.equal(f.stage.captured, 7);
    f.event('lostpointercapture', 155, 103, f.cards[1]); // bubbles from the former implicit owner
    f.event('pointermove', end, 104);
    f.event('pointerup', end, 104);
    assert.equal(f.count.textContent, label);
    assert.equal(f.stage.captured, null);
    assert.equal('dragging' in f.root.dataset, false);
    f.cards[1].emit('click'); // trailing click must not undo the swipe
    assert.equal(f.count.textContent, label);
  }
});

test("a true loss of stage capture cancels without changing selection", () => {
  const f = gestureFixture();
  f.event('pointerdown', 170, 100, f.cards[1]);
  f.event('pointermove', 120, 102, f.cards[1]);
  f.stage.captured = null;
  f.event('lostpointercapture', 120, 102);
  f.event('pointerup', 80, 102);
  assert.equal(f.count.textContent, '02 / 03');
  assert.equal('dragging' in f.root.dataset, false);
});

test("vertical touch movement is left to the browser, and a subsequent swipe still works", () => {
  const f = gestureFixture();
  f.event('pointerdown', 170, 100, f.cards[1]);
  f.event('pointermove', 165, 128, f.cards[1]);
  f.event('pointercancel', 165, 128);
  assert.equal(f.stage.captured, null);
  assert.equal(f.count.textContent, '02 / 03');
  f.event('pointerdown', 170, 100, f.cards[1]);
  f.event('pointermove', 80, 101, f.cards[1]);
  f.event('pointerup', 80, 101);
  assert.equal(f.count.textContent, '03 / 03');
});

test("a tap can select by click without switching into drag mode", () => {
  const f = gestureFixture();
  f.event('pointerdown', 170, 100, f.cards[0]);
  f.event('pointerup', 170, 100, f.cards[0]);
  f.cards[0].emit('click');
  assert.equal(f.count.textContent, '01 / 03');
  assert.equal(f.stage.captured, null);
});
