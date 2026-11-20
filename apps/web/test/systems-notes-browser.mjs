import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const web = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'systems-notes-'));
const slugs = ['endianness', 's390-linux-kernel'];
const titles = ['Endianness: From Memory Bytes to Device Boundaries', 'The s390x Linux Kernel: From IPL to I/O'];
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'};
const env = { ...process.env, BLOG_CONTENT_DIR: temp, ASTRO_TELEMETRY_DISABLED: '1' };
delete env.CI;
delete env.CF_PAGES;
let chrome;
let sessionId;
const server = createServer(async(req,res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  try {
    const contents = await readFile(join(dist, p));
    res.setHeader('Content-Type', mime[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream');
    res.end(contents);
  } catch { res.writeHead(404); res.end(); }
});
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function poll(fn, label) {
  for(let n=0;n<80;n++){
    try {const value=await fn();if(value) return value;} catch {}
    await wait(100);
  }
  throw Error('Timed out: '+label);
}
let next = 0;
const pending = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, [resolve, reject]);
    chrome.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})+"\0");
  });
}
async function read(expression) {
  const {result, exceptionDetails}=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert.ok(!exceptionDetails, JSON.stringify(exceptionDetails));
  return result.value;
}
async function key(name, code, num, modifiers=0){
  for(const type of ['rawKeyDown','keyUp']){
    await cdp('Input.dispatchKeyEvent',{type,key:name,code,windowsVirtualKeyCode:num,modifiers});
  }
}
async function at(path, selector){
  await poll(() => read('location.pathname==='+JSON.stringify(path)+' && !!document.querySelector('+JSON.stringify(selector)+') && document.readyState==="complete"'), path);
}
try {
  await mkdir(join(temp,'published'));
  const articles = slugs.map(slug=>({slug,file:`published/${slug}.md`}));
  await writeFile(join(temp,'published.json'),JSON.stringify({version:1,articles}));
  for (let i=0;i<articles.length;i++){
    await writeFile(join(temp,articles[i].file),`---\nslug: ${slugs[i]}\ntitle: '${titles[i]}'\ndate: 2026-11-${17+i}\ndraft: false\n---\nSynthetic browser fixture.\n`);
  }
  execFileSync('npm',['run','build'],{cwd:web,env,stdio:'inherit'});
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  const base='http://127.0.0.1:'+server.address().port;
  chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-background-networking','--disable-dev-shm-usage',
    '--remote-debugging-pipe','--user-data-dir='+join(temp,'chrome'),'about:blank'],
    {stdio:['ignore','ignore','inherit','pipe','pipe']});
  chrome.on('error',err=>{for(const cb of pending.values()) cb[1](err);pending.clear();});
  chrome.on('exit',(code)=>{for(const cb of pending.values()) cb[1](Error('Chrome exited: '+code));pending.clear();});
  let buffer='';
  chrome.stdio[4].setEncoding('utf8');
  chrome.stdio[4].on('data',chunk=>{
    buffer+=chunk;
    while(buffer.includes("\0")){
      const i=buffer.indexOf("\0"), msg=JSON.parse(buffer.slice(0,i));
      buffer=buffer.slice(i+1);
      const cb=pending.get(msg.id);if(!cb)continue;
      pending.delete(msg.id);
      if(msg.error) cb[1](Error(JSON.stringify(msg.error)));else cb[0](msg.result);
    }
  });
  const {targetId}=await cdp('Target.createTarget',{url:'about:blank'});
  ({sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true}));
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:base+'/'});
  await at('/','[data-systems-notes]');
  const focusVisible = '(document.activeElement.matches(".note-link:focus-visible") && parseInt(getComputedStyle(document.activeElement).outlineWidth)>=2)';
  for(let i=0;i<35 && !(await read('document.activeElement.pathname==="/blog/endianness/"'));i++) await key('Tab','Tab',9);
  assert.equal(await read(focusVisible+' && document.activeElement.pathname==="/blog/endianness/"'),true);
  await key('Tab','Tab',9);
  assert.equal(await read(focusVisible+' && document.activeElement.pathname==="/blog/s390-linux-kernel/"'),true);
  await key('Enter','Enter',13);
  await at('/blog/s390-linux-kernel/','h1');
  assert.match(await read('document.querySelector("h1").innerText'),/s390x Linux Kernel/);
  await cdp('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:2,mobile:true});
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  for(const slug of slugs){
    await cdp('Page.navigate',{url:base+'/'});
    await at('/','[data-systems-notes]');
    const sel=JSON.stringify(`[data-systems-notes] a[href="/blog/${slug}/"]`);
    const size=await read(`(()=>{const e=document.querySelector(${sel});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,h:r.height,l:r.left,r:r.right,w:innerWidth,full:document.documentElement.scrollWidth}})()`);
    assert.ok(size.h>=44 && size.l>=0 && size.r<=375 && size.w===375 && size.full===375,JSON.stringify(size));
    await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:size.x,y:size.y}]});
    await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await at('/blog/'+slug+'/','h1');
  }
  console.log('Systems Notes browser QA passed: desktop Tab, visible focus and Enter; 375px layout without horizontal scroll, 44px-or-taller rows, both touch routes.');
} finally {
  if(chrome?.pid) chrome.kill('SIGTERM');
  server.close();
  try { await rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100}); } catch {}
}
