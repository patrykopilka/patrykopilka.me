const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function carouselGeometry(offset: number) {
  const distance = Math.abs(offset);
  return {
    x: 87 * offset,
    y: 20 * offset,
    rotation: 12.5 * offset,
    size: Math.max(.68, 1 - .085 * distance),
    alpha: Math.max(.27, 1 - .29 * distance),
    layer: 500 - Math.round(distance * 100),
  };
}

export function carouselWheel(
  position: number, delta: number, count: number,
) {
  const next = clamp(position + delta, 0, count - 1);
  return { next, consume: next !== position };
}

export function setupProjectCarousel(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-carousel-stage]');
  const controls = root.querySelector<HTMLElement>('[data-carousel-controls]');
  const previous = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]');
  const count = root.querySelector<HTMLElement>('[data-carousel-count]');
  const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-carousel-card]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-carousel-panel]'));
  if (!stage || !controls || !previous || !next || !count || !cards.length || cards.length !== panels.length) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const final = cards.length - 1;
  const initial = Number(root.dataset.initialIndex);
  let selected = Number.isInteger(initial) ? clamp(initial, 0, final) : 0;
  let position = selected;
  let target = selected;
  let wheelTarget = selected;
  let frame = 0;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let wheelPending = false;
  let skipClickUntil = 0;
  let pointer: { id: number; startX: number; startY: number; base: number; width: number; dragging: boolean } | undefined;

  const render = () => {
    cards.forEach((card, index) => {
      const g = carouselGeometry(index - position);
      card.style.setProperty('--shift-x', `${g.x}%`);
      card.style.setProperty('--shift-y', `${g.y}%`);
      card.style.setProperty('--tilt', `${g.rotation}deg`);
      card.style.setProperty('--size', String(g.size));
      card.style.setProperty('--shade', String(g.alpha));
      card.style.setProperty('--layer', String(g.layer));
    });
  };
  const draw = () => {
    frame = 0;
    if (motion.matches || Math.abs(target - position) < .0015) {
      position = target;
    } else {
      position += (target - position) * (pointer?.dragging ? .34 : .20);
      frame = requestAnimationFrame(draw);
    }
    render();
  };
  const move = (value: number) => {
    target = clamp(value, 0, final);
    if (motion.matches) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      position = target;
      render();
    } else if (!frame) {
      frame = requestAnimationFrame(draw);
    }
  };
  const updateSelected = (index: number, focus = false) => {
    const nextIndex = clamp(index, 0, final);
    const active = document.activeElement;
    const restoreFocus = nextIndex !== selected && active && panels[selected].contains(active);
    selected = nextIndex;
    cards.forEach((card, i) => {
      card.setAttribute('aria-pressed', String(i === selected));
      panels[i].hidden = i !== selected;
    });
    previous.disabled = selected === 0;
    next.disabled = selected === final;
    const label = `${String(selected + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
    if (count.textContent !== label) count.textContent = label;
    if (focus || restoreFocus) cards[selected].focus({ preventScroll: true });
  };
  const cancelWheel = () => {
    clearTimeout(wheelTimer);
    wheelPending = false;
  };
  const pick = (index: number, focus = false) => {
    cancelWheel();
    updateSelected(index, focus);
    wheelTarget = selected;
    move(selected);
  };

  cards.forEach((card, index) => card.addEventListener('click', () => {
    if (performance.now() >= skipClickUntil) pick(index);
  }));
  previous.addEventListener('click', () => pick(selected - 1, selected === 1 && document.activeElement === previous));
  next.addEventListener('click', () => pick(selected + 1, selected === final - 1 && document.activeElement === next));
  root.addEventListener('keydown', (event) => {
    if (!(event.target instanceof Element) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!event.target.closest('[data-carousel-stage], [data-carousel-controls]')) return;
    const index = event.key === 'ArrowLeft' ? selected - 1
      : event.key === 'ArrowRight' ? selected + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? final : null;
    if (index === null) return;
    event.preventDefault();
    pick(index, true);
  });

  stage.addEventListener('wheel', (event) => {
    if (pointer?.dragging || event.ctrlKey || event.metaKey || event.shiftKey || !event.cancelable) return;
    const dx = event.deltaX;
    const dy = event.deltaY;
    const largest = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
    const start = wheelPending ? wheelTarget : target;
    const result = carouselWheel(start, clamp(largest * unit / 290, -.9, .9), cards.length);
    if (!result.consume) return; // let page scroll naturally at either end
    event.preventDefault();
    wheelPending = true;
    wheelTarget = result.next;
    if (!motion.matches) move(wheelTarget);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      const step = wheelTarget - selected;
      // A short mouse-wheel notch still selects a neighbor. Continuous touchpad
      // and precision-wheel gestures can travel more than one card.
      const destination = Math.abs(step) > .065
        ? selected + Math.sign(step) * Math.max(1, Math.round(Math.abs(step))) : selected;
      pick(destination);
    }, 125);
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    if (pointer || !event.isPrimary || event.button !== 0) return;
    pointer = {
      id: event.pointerId, startX: event.clientX, startY: event.clientY,
      base: target, width: Math.max(120, cards[selected].offsetWidth * .81), dragging: false,
    };
  });
  stage.addEventListener('pointermove', (event) => {
    const p = pointer;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.startX;
    const dy = event.clientY - p.startY;
    if (!p.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { pointer = undefined; return; }
      if (Math.abs(dx) < 8) return;
      cancelWheel();
      p.dragging = true;
      stage.setPointerCapture(event.pointerId);
      root.dataset.dragging = '';
    }
    if (!motion.matches) move(p.base - dx / p.width);
  });
  const finish = (event: PointerEvent, canceled: boolean) => {
    const p = pointer;
    if (!p || p.id !== event.pointerId) return;
    pointer = undefined;
    if (!p.dragging) return;
    delete root.dataset.dragging;
    skipClickUntil = performance.now() + 200;
    const displacement = (p.startX - event.clientX) / p.width;
    const index = canceled || Math.abs(displacement) < .14 ? selected
      : selected + Math.sign(displacement) * Math.max(1, Math.round(Math.abs(displacement)));
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    pick(index);
  };
  stage.addEventListener('pointerup', event => finish(event, false));
  stage.addEventListener('pointercancel', event => finish(event, true));
  stage.addEventListener('lostpointercapture', event => finish(event, true));
  stage.addEventListener('pointerleave', event => {
    if (pointer && pointer.id === event.pointerId && !pointer.dragging) pointer = undefined;
  });
  stage.addEventListener('dragstart', event => event.preventDefault());
  motion.addEventListener('change', () => move(target));

  render();
  updateSelected(selected);
  controls.hidden = false;
  root.dataset.ready = '';
}
