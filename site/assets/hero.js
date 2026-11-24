// The hero animation: a small scene that replays the three steps (the agent
// writes, a poll goes into Studio, phones vote). CSS does the movement; this
// only picks the step, scales the scene to its box and counts the votes.
// Nothing here talks to a server. With reduced motion it shows the last step
// and only changes when a step is clicked.

const root = document.querySelector('[data-demo]');
if (root) {
  const view = root.querySelector('[data-view]');
  const steps = root.querySelector('[data-steps]');
  const scene = root.querySelector('[data-scene]');
  const counter = root.querySelector('[data-count]');
  const buttons = [...steps.querySelectorAll('[data-go]')];
  const DURATIONS = [6000, 5600, 6600];
  const STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VOTES = 23;
  let step = STILL ? 3 : 1;
  let timer = null;
  let counting = null;
  let visible = true;

  view.hidden = false;
  steps.hidden = false;

  // The scene is drawn at 1000 by 560 and scaled to the width it has.
  function fit() {
    const scale = view.clientWidth / 1000;
    scene.style.transform = `scale(${scale})`;
    view.style.height = `${560 * scale}px`;
  }
  new ResizeObserver(fit).observe(view);
  fit();

  function count() {
    clearInterval(counting);
    if (step !== 3 || STILL) {
      counter.textContent = step === 3 ? String(VOTES) : '0';
      return;
    }
    counter.textContent = '0';
    const start = performance.now() + 1700;
    counting = setInterval(() => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / 1800));
      counter.textContent = String(Math.round(VOTES * (1 - (1 - t) ** 2)));
      if (t >= 1) clearInterval(counting);
    }, 50);
  }

  function show(n) {
    step = n;
    scene.dataset.step = String(n);
    buttons.forEach((b) => {
      const on = Number(b.dataset.go) === n;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    count();
  }

  // The scene is hidden while it changes step, and while hidden it jumps to the
  // new step with every transition and animation switched off. Otherwise the
  // new step would play its transitions from the old step's layout (panels
  // sliding back, the slide shrinking) as it fades in, which looks like a blink.
  function go(n, quick = false) {
    clearTimeout(timer);
    if (STILL || quick) {
      show(n);
    } else {
      view.classList.add('fade');
      setTimeout(() => {
        scene.classList.add('reset');
        show(n);
        void scene.offsetWidth; // apply the new step with no transitions
        scene.classList.remove('reset');
        view.classList.remove('fade');
      }, 260);
    }
    if (!STILL) {
      timer = setTimeout(() => go(n === 3 ? 1 : n + 1), DURATIONS[n - 1] + 260);
    }
  }

  buttons.forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));

  // Do not run while it cannot be seen (another tab, scrolled away).
  function pause() {
    clearTimeout(timer);
    clearInterval(counting);
  }
  if (STILL) {
    show(3);
  } else {
    show(1);
    go(1, true);
    new IntersectionObserver((entries) => {
      const now = entries.some((e) => e.isIntersecting);
      if (now && !visible) go(step, true);
      if (!now && visible) pause();
      visible = now;
    }, { threshold: 0.15 }).observe(root);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else if (visible) go(step, true);
    });
  }
}
