// The hero animation: one loop that tells the whole story, so nothing ever cuts
// or blinks. The agent writes a talk, a poll is dragged onto a slide in Studio,
// the talk is presented and phones vote, and then it all returns to the start.
//
// Every movement is a Web Animation on the same 20 second timeline, written
// below in seconds. The three buttons under it do not switch scenes: they move
// to a point on the timeline (and show which part is playing). Nothing talks
// to a server. With reduced motion it shows one still frame and only changes
// when a button is clicked.

const root = document.querySelector('[data-demo]');
if (root) {
  const view = root.querySelector('[data-view]');
  const steps = root.querySelector('[data-steps]');
  const scene = root.querySelector('[data-scene]');
  const counter = root.querySelector('[data-count]');
  const buttons = [...steps.querySelectorAll('[data-go]')];
  const STILL = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const T = 20; // seconds in one loop
  // Where each part starts, and the frame to show when motion is off.
  const PARTS = [
    { n: 1, from: 0, to: 6, still: 3.3 },
    { n: 2, from: 6, to: 11.6, still: 11 },
    { n: 3, from: 11.6, to: 19.1, still: 16.5 },
  ];
  const COUNT_FROM = 13.3;
  const COUNT_TO = 15.1;
  const VOTES = 23;
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

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

  // --- the timeline --------------------------------------------------------

  const anims = [];

  // stops: [seconds, properties, easing to the next stop]. The loop must end
  // as it began, so what the last stop says is also how the loop starts.
  function track(el, stops, options = {}) {
    if (!el) return;
    const list = stops.slice();
    const last = list[list.length - 1];
    if (list[0][0] > 0) list.unshift([0, last[1], 'linear']);
    if (last[0] < T) list.push([T, last[1], 'linear']);
    const keyframes = list.map(([t, props, easing]) => ({ offset: t / T, ...props, easing: easing || 'linear' }));
    anims.push(el.animate(keyframes, {
      duration: T * 1000, iterations: Infinity, fill: 'both', ...options,
    }));
  }

  const q = (selector, from = scene) => from.querySelector(selector);
  const all = (selector, from = scene) => [...from.querySelectorAll(selector)];
  const mix = (hex, base, amount) => {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.trim().replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16));
    const a = rgb(hex);
    const b = rgb(base);
    return `rgb(${a.map((v, i) => Math.round(b[i] + (v - b[i]) * amount)).join(', ')})`;
  };

  // 0 to 6: the agent writes the talk and the slides appear in Studio.
  const term = q('.term');
  track(term, [
    [3.5, { opacity: 1, transform: 'translateY(0px) scale(1)' }, EASE],
    [3.95, { opacity: 0, transform: 'translateY(-12px) scale(0.98)' }],
    [19.1, { opacity: 0, transform: 'translateY(10px) scale(1)' }, EASE],
    [20, { opacity: 1, transform: 'translateY(0px) scale(1)' }],
  ]);
  const typed = q('.you span', term);
  const chars = typed.style.getPropertyValue('--n').trim() || '44';
  track(typed, [
    [0.4, { width: '0ch' }, `steps(${chars}, end)`],
    [1.8, { width: `${chars}ch` }],
    [19.05, { width: `${chars}ch` }],
    [19.06, { width: '0ch' }],
  ]);
  all('.ok', term).forEach((line, i) => track(line, [
    [2.2 + i * 0.6, { opacity: 0, transform: 'translateY(12px)' }, EASE],
    [2.65 + i * 0.6, { opacity: 1, transform: 'translateY(0px)' }],
    [19.05, { opacity: 1, transform: 'translateY(0px)' }],
    [19.06, { opacity: 0, transform: 'translateY(12px)' }],
  ]));
  all('.th').forEach((thumb, i) => track(thumb, [
    [3.7 + i * 0.18, { opacity: 0, transform: 'translateX(-10px) scale(0.94)' }, EASE],
    [4.15 + i * 0.18, { opacity: 1, transform: 'translateX(0px) scale(1)' }],
    [19.1, { opacity: 1, transform: 'translateX(0px) scale(1)' }],
    [19.6, { opacity: 0, transform: 'translateX(0px) scale(1)' }],
  ]));

  // The slide: appears, sits in the canvas, grows to fill the screen while
  // presenting, and goes back to the canvas at the end.
  const edit = '0 30px 60px -30px rgba(0, 0, 0, 0.7)';
  const present = '0 40px 90px -30px rgba(0, 0, 0, 0.8)';
  const inCanvas = `translate(0px, 0px) scale(1)`;
  track(q('.slide'), [
    [4.3, { opacity: 0, transform: 'translate(0px, 12px) scale(1)', boxShadow: edit }, EASE],
    [4.9, { opacity: 1, transform: inCanvas, boxShadow: edit }],
    [11.6, { opacity: 1, transform: inCanvas, boxShadow: edit }, EASE],
    [12.3, { opacity: 1, transform: 'translate(-170px, -36px) scale(1.2308)', boxShadow: present }],
    [18.4, { opacity: 1, transform: 'translate(-170px, -36px) scale(1.2308)', boxShadow: present }, EASE],
    [19, { opacity: 1, transform: inCanvas, boxShadow: edit }],
    [19.1, { opacity: 1, transform: inCanvas, boxShadow: edit }],
    [19.6, { opacity: 0, transform: inCanvas, boxShadow: edit }],
  ]);

  // 6 to 11.6: the Poll block is dragged from the Insert panel onto the slide.
  const within = (from, frames) => frames.map(([f, props, easing]) => [from + 3 * f, props, easing]);
  track(q('.cursor'), within(6.5, [
    [0, { opacity: 0, transform: 'translate(950px, 330px) scale(1)' }, 'ease'],
    [0.1, { opacity: 1, transform: 'translate(950px, 330px) scale(1)' }, 'ease'],
    [0.34, { opacity: 1, transform: 'translate(880px, 164px) scale(1)' }, 'ease'],
    [0.4, { opacity: 1, transform: 'translate(880px, 164px) scale(0.82)' }, 'ease'],
    [0.46, { opacity: 1, transform: 'translate(880px, 164px) scale(1)' }, 'ease'],
    [0.76, { opacity: 1, transform: 'translate(452px, 348px) scale(1)' }],
    [0.86, { opacity: 1, transform: 'translate(452px, 348px) scale(1)' }, 'ease'],
    [1, { opacity: 0, transform: 'translate(480px, 380px) scale(1)' }],
  ]));
  track(q('.ghost'), within(6.5, [
    [0.4, { opacity: 0, transform: 'translate(838px, 145px) scale(1) rotate(0deg)' }, 'ease'],
    [0.46, { opacity: 1, transform: 'translate(838px, 145px) scale(1.04) rotate(0deg)' }, 'ease'],
    [0.76, { opacity: 1, transform: 'translate(410px, 329px) scale(1.04) rotate(-2deg)' }],
    [0.8, { opacity: 0, transform: 'translate(410px, 329px) scale(0.9) rotate(0deg)' }],
  ]));
  track(q('.drop'), within(6.5, [
    [0.3, { opacity: 0 }],
    [0.45, { opacity: 1 }],
    [0.85, { opacity: 1 }],
    [1, { opacity: 0 }],
  ]));
  const pick = q('.it.pick');
  const picked = { borderColor: '#f26e4e', backgroundColor: 'rgba(242, 110, 78, 0.14)' };
  const plain = { borderColor: '#363a42', backgroundColor: '#1e2025' };
  track(pick, [
    [7.5, { ...plain, boxShadow: '0 0 0 0px rgba(242, 110, 78, 0)' }, 'ease'],
    [7.75, { ...picked, boxShadow: '0 0 0 5px rgba(242, 110, 78, 0.35)' }, 'ease'],
    [8, { ...picked, boxShadow: '0 0 0 0px rgba(242, 110, 78, 0)' }],
    [19.55, { ...picked, boxShadow: '0 0 0 0px rgba(242, 110, 78, 0)' }],
    [19.6, { ...plain, boxShadow: '0 0 0 0px rgba(242, 110, 78, 0)' }],
  ]);
  const drops = (el, from) => track(el, [
    [from, { opacity: 0, transform: 'translateY(-14px) scale(0.97)' }, EASE],
    [from + 0.55, { opacity: 1, transform: 'translateY(0px) scale(1)' }],
    [19.5, { opacity: 1, transform: 'translateY(0px) scale(1)' }],
    [19.6, { opacity: 0, transform: 'translateY(-14px) scale(0.97)' }],
  ]);
  drops(q('.poll'), 8.85);
  drops(q('.ring'), 9.05);

  // 11.6 to 19.1: present. Studio's panels leave, the slide fills the screen,
  // phones come in and vote. Then it all goes back.
  const slideOut = (el, x) => track(el, [
    [11.6, { opacity: 1, transform: 'translateX(0px)' }, EASE],
    [12.1, { opacity: 0, transform: `translateX(${x}px)` }],
    [18.4, { opacity: 0, transform: `translateX(${x}px)` }, EASE],
    [18.9, { opacity: 1, transform: 'translateX(0px)' }],
  ]);
  slideOut(q('.rail'), -30);
  slideOut(q('.panel'), 30);
  track(q('.canvas'), [
    [11.6, { left: '170px', right: '230px' }, EASE],
    [12.2, { left: '0px', right: '0px' }],
    [18.4, { left: '0px', right: '0px' }, EASE],
    [19, { left: '170px', right: '230px' }],
  ]);
  track(q('.onair'), [
    [12.1, { opacity: 0, transform: 'translateX(8px)' }, EASE],
    [12.5, { opacity: 1, transform: 'translateX(0px)' }],
    [18.2, { opacity: 1, transform: 'translateX(0px)' }, EASE],
    [18.6, { opacity: 0, transform: 'translateX(8px)' }],
  ]);
  track(q('.phones'), [
    [11.95, { opacity: 0, transform: 'translateY(40px)' }, EASE],
    [12.55, { opacity: 1, transform: 'translateY(0px)' }],
    [18.2, { opacity: 1, transform: 'translateY(0px)' }, EASE],
    [18.7, { opacity: 0, transform: 'translateY(40px)' }],
  ]);
  all('.opt').forEach((opt, k) => {
    const fill = q('.bar i', opt);
    const width = fill.style.getPropertyValue('--w').trim() || '50%';
    track(fill, [
      [COUNT_FROM + k * 0.25, { width: '0%' }, 'cubic-bezier(0.2, 0.8, 0.2, 1)'],
      [COUNT_FROM + 1.4 + k * 0.25, { width }],
      [19.5, { width }],
      [19.6, { width: '0%' }],
    ]);
    track(q('b', opt), [
      [COUNT_FROM, { opacity: 0 }],
      [COUNT_FROM + 0.4, { opacity: 1 }],
      [19.5, { opacity: 1 }],
      [19.6, { opacity: 0 }],
    ]);
  });
  track(q('.ring .arc'), [
    [COUNT_FROM, { strokeDashoffset: '213.6' }, 'cubic-bezier(0.33, 1, 0.68, 1)'],
    [COUNT_TO, { strokeDashoffset: '8.9' }],
    [19.5, { strokeDashoffset: '8.9' }],
    [19.6, { strokeDashoffset: '213.6' }],
  ]);
  all('.phone').forEach((phone, p) => {
    const tap = q('.btn.t', phone);
    if (!tap) return;
    const at = 13.1 + p * 0.5;
    const color = getComputedStyle(tap).getPropertyValue('--c');
    const idle = { borderColor: 'rgba(42, 36, 29, 0.16)', backgroundColor: 'rgb(239, 233, 220)' };
    const chosen = { borderColor: color.trim(), backgroundColor: mix(color, '#efe9dc', 0.18) };
    track(tap, [
      [at, { transform: 'scale(1)' }, 'ease'],
      [at + 0.18, { transform: 'scale(0.93)' }, 'ease'],
      [at + 0.45, { transform: 'scale(1)' }],
    ]);
    track(tap, [
      [at, idle],
      [at + 0.2, chosen],
      [19.5, chosen],
      [19.6, idle],
    ]);
    track(tap, [
      [at, { opacity: 0.6, transform: 'scale(0.3)' }, 'ease'],
      [at + 0.6, { opacity: 0, transform: 'scale(2.4)' }],
    ], { pseudoElement: '::after' });
  });

  // --- playing and seeking ---------------------------------------------------

  const clock = () => ((anims[0].currentTime || 0) / 1000) % T;
  function seek(seconds) {
    anims.forEach((a) => { a.currentTime = seconds * 1000; });
  }

  let step = 0;
  function partAt(t) {
    return (PARTS.find((p) => t >= p.from && t < p.to) || PARTS[t >= 19.1 ? 0 : 2]).n;
  }

  // The number in the ring, the step shown and how far along it is.
  let frame = null;
  function paint() {
    const t = clock();
    const u = Math.min(1, Math.max(0, (t - COUNT_FROM) / (COUNT_TO - COUNT_FROM)));
    const n = t >= COUNT_FROM && t < 19.6 ? Math.round(VOTES * (1 - (1 - u) ** 2)) : 0;
    if (counter.textContent !== String(n)) counter.textContent = String(n);
    const now = partAt(t);
    if (now !== step) {
      step = now;
      scene.dataset.step = String(now);
    }
    buttons.forEach((b) => {
      const part = PARTS[Number(b.dataset.go) - 1];
      const on = part.n === now;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.style.setProperty('--p', on && !STILL ? String(Math.min(1, Math.max(0, (t - part.from) / (part.to - part.from)))) : '0');
    });
    if (!STILL) frame = requestAnimationFrame(paint);
  }

  buttons.forEach((b) => b.addEventListener('click', () => {
    const part = PARTS[Number(b.dataset.go) - 1];
    seek(STILL ? part.still : part.from);
    if (STILL) paint();
  }));

  if (STILL) {
    anims.forEach((a) => a.pause());
    seek(PARTS[2].still);
    counter.textContent = String(VOTES);
    paint();
    buttons[2].style.setProperty('--p', '1');
  } else {
    paint();
    // Stop while it cannot be seen (another tab, scrolled away).
    let visible = true;
    const run = (yes) => {
      anims.forEach((a) => (yes ? a.play() : a.pause()));
      if (yes && !frame) frame = requestAnimationFrame(paint);
      if (!yes && frame) { cancelAnimationFrame(frame); frame = null; }
    };
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      run(visible && !document.hidden);
    }, { threshold: 0.15 }).observe(root);
    document.addEventListener('visibilitychange', () => run(visible && !document.hidden));
  }
}
