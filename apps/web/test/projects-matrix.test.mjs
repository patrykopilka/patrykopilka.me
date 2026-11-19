import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
const output = ts.transpileModule(readFileSync(new URL("../src/scripts/projects-matrix.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness({reduced = false, width = 1440, height = 1000} = {}) {
  const renders = [];
  const symbols = new Set();
  const ctx = { fillRect(){renders.push(this.fillStyle)}, setTransform(){},
    fillText(symbol){assert.ok(typeof symbol === 'string'); symbols.add(symbol);} };
  let bounds = {width,height};
  const handlers = {};
  const preference = { matches: reduced, addEventListener(_, callback){handlers.preference = callback} };
  const document = { hidden:false, addEventListener(_, callback){handlers.visibility = callback} };
  const canvas = { getContext(){return ctx}, getBoundingClientRect(){return bounds} };
  const toggle = { hidden:true, addEventListener(_, callback){handlers.toggle = callback} };
  const root = { dataset:{}, querySelector(selector){return selector.includes('toggle')?toggle:canvas} };
  const frames = new Map();
  let serial = 0;
  const context = { exports:{}, document, matchMedia:()=>preference,
    window:{devicePixelRatio:2, addEventListener(_, callback){handlers.resize = callback}},
    requestAnimationFrame(fn){ frames.set(++serial,fn); return serial; },
    cancelAnimationFrame(id){frames.delete(id)}
  };
  vm.runInNewContext(output, context);
  function step(time){
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(fn=>fn(time));
  }
  return {api:context.exports, document, preference, root, toggle, canvas, symbols, renders, frames, step, handlers,
    resize(newWidth,newHeight){bounds={width:newWidth,height:newHeight};handlers.resize()}};
}

test("matrix streams and memory are bounded on phones, retina laptops and 8K", () => {
  const {api} = harness();
  for (const [width,height,dpr] of [[320,740,3],[390,844,2],[1440,1000,2],[3840,2160,1.25],[7680,4320,2]]) {
    const state = api.matrixLayout(width,height,dpr);
    assert.ok(state.columns > 0 && state.columns <= 150);
    assert.ok(state.ratio <= 1.5);
    assert.ok(state.pixelsWide * state.pixelsHigh <= api.matrixMaxPixels);
    assert.equal(state.narrow, width < 580);
    const streams = api.matrixDrops(width,height,state.gap,state.glyphSize+2,state.narrow,()=>.5);
    assert.equal(streams.length,state.columns);
    assert.ok(streams.every(drop=>drop.x>=0 && drop.x<width && drop.tail>0 && drop.speed>0));
  }
});

test("reduced motion paints a static first frame, with explicit resume and pause", () => {
  const h = harness({reduced:true});
  h.api.setupProjectsMatrix(h.root);
  assert.equal(h.toggle.hidden,false);
  assert.equal(h.toggle.textContent,'Resume background');
  assert.equal(h.renders.length,1);
  assert.ok(h.symbols.size>3);
  assert.equal(h.frames.size,0);
  h.handlers.toggle();
  assert.equal(h.toggle.textContent,'Pause background');
  assert.equal(h.frames.size,1);
  h.step(100);
  assert.ok(h.renders.length>1);
  h.handlers.toggle();
  assert.equal(h.toggle.textContent,'Resume background');
  assert.equal(h.frames.size,0);
});

test("background stops off-tab or paused and resumes a single frame loop", () => {
  const h = harness();
  h.api.setupProjectsMatrix(h.root);
  assert.equal(h.frames.size,1);
  h.step(100);
  h.step(104);
  assert.equal(h.renders.length,2, "time step below frame limit does not redraw");
  h.document.hidden = true;
  h.handlers.visibility();
  assert.equal(h.frames.size,0);
  h.document.hidden = false;
  h.handlers.visibility();
  h.handlers.visibility();
  assert.equal(h.frames.size,1);
  h.handlers.toggle();
  h.handlers.visibility();
  assert.equal(h.frames.size,0);
  h.resize(390,844);
  assert.equal(h.frames.size,0);
  assert.equal(h.renders.length,3, "resize updates the paused static composition");
});
