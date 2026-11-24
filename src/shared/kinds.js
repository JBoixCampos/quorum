// The interaction kinds a talk can use. Each kind says how its state
// starts, which votes are valid, what the presenter can do, and how its
// results are summarised. The same code runs on the server and in the
// browser (previews), so a preview behaves exactly like the talk.

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (error) => ({ ok: false, error });

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countVotes(options, votes) {
  const counts = Object.fromEntries(options.map((o) => [o, 0]));
  Object.values(votes).forEach((v) => (Array.isArray(v) ? v : [v]).forEach((o) => {
    if (o in counts) counts[o] += 1;
  }));
  return counts;
}

// Parses "1.234,5", "1,234.5", "57000", "57 000" and "2e6" into a number.
export function readNumber(raw) {
  if (typeof raw === 'number') return raw;
  let s = String(raw || '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else if (/,\d{1,2}$/.test(s) && !s.includes('.')) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  return Number(s);
}

function weighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

// Phased kinds: 0 not open yet, 1 open, 2 closed with results, 3 answer revealed.
const phased = {
  initial: () => ({ phase: 0, votes: {} }),
  maxPhase: (spec) => (spec.answer !== undefined ? 3 : 2),
  canVote: (spec, st) => st.phase === 1,
  control(spec, st, action) {
    if (action.action === 'phase') {
      const phase = Number(action.phase);
      if (!(phase >= 0 && phase <= this.maxPhase(spec))) return fail('Not a valid phase.');
      st.phase = phase;
      return ok();
    }
    if (action.action === 'reset') {
      st.phase = 0;
      st.votes = {};
      return ok();
    }
    return fail('Unknown action.');
  },
  // What the right arrow does next, or null to move to the next slide.
  primary(spec, st) {
    return st.phase < this.maxPhase(spec) ? { action: 'phase', phase: st.phase + 1 } : null;
  },
};

const poll = {
  ...phased,
  validate(spec, value) {
    return spec.options.includes(value) ? ok({ value }) : fail('Pick one of the options.');
  },
  summary(spec, st) {
    return { phase: st.phase, total: Object.keys(st.votes).length, counts: countVotes(spec.options, st.votes) };
  },
  simulate(spec) {
    return weighted(spec.options, spec.options.map((_, i) => 1 / (i + 1.4)));
  },
};

const multi = {
  ...phased,
  validate(spec, value) {
    if (!Array.isArray(value)) return fail('Pick at least one option.');
    const picked = spec.options.filter((o) => value.includes(o));
    return picked.length ? ok({ value: picked }) : fail('Pick at least one option.');
  },
  summary: poll.summary,
  simulate(spec) {
    const picked = spec.options.filter((_, i) => Math.random() < 0.6 - i * 0.06);
    return picked.length ? picked : [spec.options[0]];
  },
};

const estimate = {
  ...phased,
  validate(spec, raw) {
    const value = readNumber(raw);
    if (!Number.isFinite(value)) return fail('Type a number.');
    if (value < spec.min || value > spec.max) {
      return fail(`Type a number between ${spec.min.toLocaleString('en')} and ${spec.max.toLocaleString('en')}.`);
    }
    return ok({ value });
  },
  summary(spec, st, { withValues = false } = {}) {
    const nums = Object.values(st.votes).filter((v) => typeof v === 'number');
    const r = {
      phase: st.phase,
      total: nums.length,
      mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
      median: median(nums),
    };
    if (withValues) r.values = nums.slice(0, 400);
    return r;
  },
  simulate(spec) {
    const target = spec.answer !== undefined ? spec.answer : (spec.min + spec.max) / 2;
    if (spec.scale === 'log') {
      const g = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
      return Math.min(spec.max, Math.max(spec.min, Math.round(target * Math.exp(g * 1.5 - 0.4))));
    }
    // About a tenth of the answer, but never more than a twelfth of the range, so
    // the guesses spread out enough to draw but stay believable.
    const spread = Math.max(1, Math.min(Math.abs(target) * 0.1, (spec.max - spec.min) / 12));
    const v = Math.round(target - spread + (Math.random() + Math.random() + Math.random() - 1.5) * spread * 2);
    return Math.min(spec.max, Math.max(spec.min, v));
  },
};

// Rounds: the same question over a list of items, one round at a time.
const rounds = {
  initial: () => ({ index: 0, open: false, votes: {}, results: {} }),
  canVote: (spec, st) => st.open,
  validate: poll.validate,
  control(spec, st, action) {
    const store = () => { st.results[st.index] = { ...st.votes }; };
    switch (action.action) {
      case 'open':
        if (st.results[st.index]) st.votes = { ...st.results[st.index] };
        st.open = true;
        return ok();
      case 'close':
        st.open = false;
        store();
        return ok();
      case 'next':
      case 'previous': {
        const to = st.index + (action.action === 'next' ? 1 : -1);
        if (to < 0 || to >= spec.items.length) return fail('No more rounds.');
        if (st.open) store();
        st.index = to;
        st.open = false;
        st.votes = {};
        return ok();
      }
      case 'reset':
        Object.assign(st, rounds.initial());
        return ok();
      default:
        return fail('Unknown action.');
    }
  },
  primary(spec, st) {
    if (st.open) return { action: 'close' };
    if (!st.results[st.index]) return { action: 'open' };
    return st.index < spec.items.length - 1 ? { action: 'next' } : null;
  },
  summary(spec, st) {
    const source = st.open || !st.results[st.index] ? st.votes : st.results[st.index];
    const counts = countVotes(spec.options, source);
    return {
      index: st.index,
      item: spec.items[st.index],
      rounds: spec.items.length,
      open: st.open,
      done: !!st.results[st.index] && !st.open,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
    };
  },
  simulate: poll.simulate,
};

// Sentence: the audience writes a sentence one word at a time, choosing
// among options written in the talk (like a language model would).
export function sentenceOptions(spec, words) {
  const last = words[words.length - 1];
  if (words.length >= spec.maxWords || (last && /^[.!?]$/.test(last.text))) return [];
  const key = words.map((w) => w.text).join(' ').toLowerCase();
  const routes = spec.routes || {};
  // The full sentence so far, then just its last word, then the default.
  const list = key === ''
    ? routes[''] || routes['*'] || []
    : routes[key] || routes[last.text.toLowerCase()] || routes['*'] || [];
  // Never offer a word just used, so the sentence cannot loop.
  const recent = words.slice(-2).map((w) => w.text.toLowerCase());
  return list.filter((o) => !recent.includes(o.toLowerCase())).slice(0, 6);
}

const sentence = {
  initial: () => ({ words: [], round: 0, open: false, votes: {} }),
  canVote: (spec, st) => st.open && sentenceOptions(spec, st.words).length > 0,
  validate(spec, value, st) {
    return sentenceOptions(spec, st.words).includes(value) ? ok({ value }) : fail('Pick one of the words.');
  },
  control(spec, st, action) {
    const options = sentenceOptions(spec, st.words);
    const counts = countVotes(options, st.votes);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const fix = (text) => {
      // The words not chosen stay, for the "tree" look.
      st.words.push({ text, share: total ? (counts[text] || 0) / total : null, alts: options.filter((o) => o !== text) });
      st.votes = {};
      st.open = false;
      st.round += 1;
    };
    switch (action.action) {
      case 'open':
        if (!options.length) return fail('The sentence is finished.');
        st.open = true;
        return ok();
      case 'close': {
        if (!total) {
          st.open = false;
          return ok();
        }
        const best = options.reduce((a, b) => (counts[b] > counts[a] ? b : a));
        fix(best);
        return ok();
      }
      case 'draw':
        if (!options.length) return fail('The sentence is finished.');
        fix(weighted(options, options.map((o) => (total ? counts[o] : 1))));
        st.words[st.words.length - 1].drawn = true;
        return ok();
      case 'fix':
        if (!options.includes(action.word)) return fail('That word is not an option.');
        fix(action.word);
        return ok();
      case 'undo':
        st.words.pop();
        st.votes = {};
        st.open = false;
        st.round += 1;
        return ok();
      case 'reset':
        Object.assign(st, sentence.initial());
        return ok();
      default:
        return fail('Unknown action.');
    }
  },
  primary(spec, st) {
    if (!sentenceOptions(spec, st.words).length) return null;
    return st.open ? { action: 'close' } : { action: 'open' };
  },
  summary(spec, st) {
    const options = sentenceOptions(spec, st.words);
    const counts = countVotes(options, st.votes);
    return {
      words: st.words.map((w) => ({ ...w })),
      options,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      open: st.open && options.length > 0,
      round: st.round,
      finished: options.length === 0,
    };
  },
  simulate(spec, st) {
    const options = sentenceOptions(spec, st.words);
    return weighted(options, options.map((_, i) => 1 / (i + 1.2)));
  },
};

// Input: what a component asks the audience. The component draws the
// results however it likes; Quorum handles phones, phases and previews.
const SAMPLE_WORDS = ['curious', 'excited', 'tired', 'hopeful', 'sceptical', 'hungry', 'curious', 'excited'];

const input = {
  ...phased,
  maxPhase: () => 2,
  validate(spec, raw) {
    if (spec.input === 'number') {
      const value = readNumber(raw);
      if (!Number.isFinite(value)) return fail('Type a number.');
      if ((spec.min !== null && value < spec.min) || (spec.max !== null && value > spec.max)) {
        return fail(`Type a number between ${spec.min ?? '-∞'} and ${spec.max ?? '∞'}.`);
      }
      return ok({ value });
    }
    if (spec.input === 'choice') return poll.validate(spec, raw);
    if (spec.input === 'choices') return multi.validate(spec, raw);
    const value = String(raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!value) return fail('Write something first.');
    if (value.length > spec.length) return fail(`Keep it under ${spec.length} characters.`);
    return ok({ value });
  },
  summary(spec, st, { withValues = false } = {}) {
    const values = Object.values(st.votes);
    const r = { phase: st.phase, total: values.length };
    if (spec.options) r.counts = countVotes(spec.options, st.votes);
    if (withValues) r.values = values.slice(-500);
    return r;
  },
  simulate(spec) {
    if (spec.input === 'choice') return poll.simulate(spec);
    if (spec.input === 'choices') return multi.simulate(spec);
    if (spec.input === 'number') {
      const lo = spec.min ?? 0;
      const hi = spec.max ?? 100;
      return Math.round(lo + (hi - lo) * (Math.random() + Math.random()) / 2);
    }
    const pool = spec.examples && spec.examples.length ? spec.examples : SAMPLE_WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
  },
};

export const KINDS = { poll, multi, estimate, rounds, sentence, input };

// Hides what the audience should not see yet (the answer before the reveal).
export function publicSpec(spec, st) {
  const out = { ...spec };
  const revealed = st && st.phase === 3;
  if (!revealed) {
    delete out.answer;
    delete out.answerLabel;
    delete out.reveal;
  }
  if (spec.kind === 'sentence') delete out.routes;
  return out;
}
