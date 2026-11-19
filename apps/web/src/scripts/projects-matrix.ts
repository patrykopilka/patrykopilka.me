const glyphs = [...'01ΑΔΗΙΚΛΜΞΠΣΤΦΨΩアカシテナホモリルワ・+×<>∷○∫'];
export const matrixFrameInterval = 1000 / 24;
export const matrixMaxPixels = 2_800_000;

export function matrixLayout(width: number, height: number, deviceDpr: number) {
  const narrow = width < 580;
  const glyphSize = narrow ? 14 : 16;
  const gap = Math.max(narrow ? 24 : 20, Math.ceil(width / 150));
  const columns = Math.min(150, Math.max(1, Math.ceil(width / gap)));
  const ratio = Math.min(1.5, Math.max(.1, deviceDpr || 1), Math.sqrt(matrixMaxPixels / (width * height)));
  return { columns, gap, glyphSize, narrow, ratio,
    pixelsWide: Math.max(1, Math.floor(width * ratio)), pixelsHigh: Math.max(1, Math.floor(height * ratio)) };
}

type Drop = { x: number; row: number; speed: number; tail: number; seed: number; fade: number; head: string };
export function matrixDrops(width: number, height: number, gap: number, rows: number, narrow: boolean, random: () => number) {
  const count = Math.min(150, Math.max(1, Math.ceil(width / gap)));
  return Array.from({length:count}, (_, index): Drop => ({
    x: Math.min(width - 1, (index + .17 + random() * .55) * gap),
    row: -12 + random() * (height / rows + 26),
    speed: 3 + random() * (narrow ? 7 : 12),
    tail: 6 + Math.floor(random() * (narrow ? 11 : 18)),
    seed: Math.floor(random() * 4096),
    fade: .24 + random() * .7,
    head: random() > .88 ? '#e0ffd4' : '#79ff75',
  }));
}

export function setupProjectsMatrix(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-projects-matrix]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-matrix-toggle]');
  if (!canvas || !toggle) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let manualPause: boolean | null = null;
  let frame = 0;
  let last = 0;
  let elapsed = 0;
  let width = 1;
  let height = 1;
  let layout = matrixLayout(width, height, 1);
  let drops: Drop[] = [];
  const paused = () => manualPause ?? preference.matches;
  const sync = () => {
    toggle.textContent = paused() ? 'Resume background' : 'Pause background';
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (!paused() && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const paint = (advance: number) => {
    ctx.fillStyle = '#020704';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `500 ${layout.glyphSize}px ui-monospace, "MS Gothic", monospace`;
    ctx.textBaseline = 'top';
    const rowHeight = layout.glyphSize + 2;
    const maxRow = height / rowHeight;
    const clock = Math.floor(elapsed / 250);
    for (const drop of drops) {
      drop.row += drop.speed * advance;
      if (drop.row - drop.tail > maxRow + 1) {
        drop.row = -2 - Math.random() * 28;
        drop.speed = 3 + Math.random() * (layout.narrow ? 7 : 12);
        drop.seed = (drop.seed + 181) % 4096;
      }
      const base = Math.floor(drop.row);
      const edge = Math.min(1, Math.max(0, (Math.abs(drop.x / width - .5) - .25) / .25));
      for (let lag = drop.tail; lag >= 0; lag--) {
        const row = base - lag;
        if (row < -1 || row > maxRow) continue;
        const symbol = glyphs[(drop.seed + row * 7 + lag * 3 + (lag < 4 ? clock : 0) + 149) % glyphs.length];
        const strength = (1 - lag / (drop.tail + 1)) ** 1.8;
        const perimeter = 1 + edge * (lag < 4 ? .32 : .23);
        ctx.globalAlpha = Math.min(.98, drop.fade * perimeter * (lag === 0 ? 1 : .72 * strength)) * (layout.narrow ? .68 : 1);
        ctx.fillStyle = lag === 0 ? drop.head : lag < 4 ? '#3edb43' : '#29a83a';
        ctx.fillText(symbol, drop.x, row * rowHeight);
      }
    }
    ctx.globalAlpha = 1;
  };
  function tick(time: number) {
    frame = 0;
    if (paused() || document.hidden) return;
    if (!last || time - last >= matrixFrameInterval - 1) {
      const delta = last ? Math.min(90, time - last) : 0;
      last = time;
      elapsed += delta;
      paint(delta / 1000);
    }
    frame = requestAnimationFrame(tick);
  }
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(bounds.width));
    const nextHeight = Math.max(1, Math.floor(bounds.height));
    const next = matrixLayout(nextWidth, nextHeight, window.devicePixelRatio);
    if (drops.length && nextWidth === width && nextHeight === height && next.ratio === layout.ratio) return;
    width = nextWidth;
    height = nextHeight;
    layout = next;
    canvas.width = layout.pixelsWide;
    canvas.height = layout.pixelsHigh;
    ctx.setTransform(layout.pixelsWide / width, 0, 0, layout.pixelsHigh / height, 0, 0);
    drops = matrixDrops(width, height, layout.gap, layout.glyphSize + 2, layout.narrow, Math.random);
    paint(0);
  };
  toggle.addEventListener('click', () => {
    manualPause = !paused();
    sync();
  });
  window.addEventListener('resize', resize, {passive:true});
  document.addEventListener('visibilitychange', sync);
  preference.addEventListener('change', () => {
    manualPause = null;
    sync();
  });
  root.dataset.matrixReady = '';
  toggle.hidden = false;
  resize();
  sync();
}
