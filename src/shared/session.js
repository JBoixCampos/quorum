// The live session: where the talk is, every vote, every question.
// Runs on the server (the real thing) and in the browser (preview, with a
// simulated audience). No dependencies.

import { KINDS, publicSpec } from './kinds.js';

export const LIMITS = {
  chars: 140,
  secondsBetweenQuestions: 5,
  actionsPerSecond: 8,
};

const STATUSES = ['pending', 'approved', 'hidden'];

// Each phone makes up a random id and keeps it in its browser.
export const isDevice = (id) => typeof id === 'string' && /^[a-z0-9-]{8,64}$/i.test(id);
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (error) => ({ ok: false, error });

export function cleanText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.chars);
}

export function initialState() {
  return {
    stage: { slide: 0, step: 0, rev: 0 },
    startedAt: null,
    publicUrl: '',
    counter: 0,
    devices: {},
    interactions: {},
    questions: [],
    questionOnScreen: null,
    // Shared screen state of components (so the shared window and the
    // presenter's preview always show the same thing).
    ui: {},
  };
}

export class Session {
  // talk: the parsed talk (parseTalk). state: saved state, if any.
  constructor(talk, state = null, { moderation = true } = {}) {
    this.talk = talk;
    this.moderation = moderation;
    this.d = { ...initialState(), ...(state || {}) };
    // Saved by older versions, which had a chat mode.
    delete this.d.chatMode;
    delete this.d.chat;
    this.pace = new Map();
    this.specs = new Map();
    talk.slides.forEach((s) => {
      if (s.interaction && KINDS[s.interaction.kind]) this.specs.set(s.interaction.id, s.interaction);
    });
    // Forget the state of interactions the talk no longer has.
    Object.keys(this.d.interactions).forEach((id) => {
      if (!this.specs.has(id)) delete this.d.interactions[id];
    });
    if (this.d.stage.slide >= talk.slides.length) this.d.stage = { slide: 0, step: 0, rev: this.d.stage.rev };
  }

  // One entry point. Returns { ok, error? }.
  apply(action, { presenter = false, device = null, now = Date.now() } = {}) {
    if (!action || typeof action.type !== 'string') return fail('Not a valid action.');
    if (Object.hasOwn(PRESENTER, action.type)) {
      if (!presenter) return fail('Only the presenter can do this.');
      return PRESENTER[action.type].call(this, action, now);
    }
    if (Object.hasOwn(AUDIENCE, action.type)) {
      if (!isDevice(device)) return fail('Device not recognised. Reload the page.');
      if (!this.withinPace(device, now)) return fail('Too fast. Wait a second.');
      const dev = this.register(device, now);
      return AUDIENCE[action.type].call(this, action, dev, device, now);
    }
    return fail('Unknown action.');
  }

  withinPace(device, now) {
    const window = (this.pace.get(device) || []).filter((t) => now - t < 1000);
    if (window.length >= LIMITS.actionsPerSecond) return false;
    window.push(now);
    this.pace.set(device, window);
    return true;
  }

  register(device, now) {
    if (!this.d.devices[device]) this.d.devices[device] = { joined: now, lastQuestion: 0 };
    return this.d.devices[device];
  }

  newId(prefix) {
    this.d.counter += 1;
    return `${prefix}${this.d.counter}`;
  }

  currentSlide() {
    return this.talk.slides[this.d.stage.slide];
  }

  // The interaction on the current slide (only kinds with votes).
  current() {
    const slide = this.currentSlide();
    const spec = slide && slide.interaction;
    return spec && KINDS[spec.kind] ? spec : null;
  }

  stateOf(spec) {
    if (!this.d.interactions[spec.id]) this.d.interactions[spec.id] = KINDS[spec.kind].initial();
    return this.d.interactions[spec.id];
  }

  summaryOf(spec, options) {
    return { id: spec.id, kind: spec.kind, ...KINDS[spec.kind].summary(spec, this.stateOf(spec), options) };
  }

  // Questions as the screen shows them (approved only), most voted first.
  screenQuestions() {
    return this.d.questions
      .filter((q) => q.status === 'approved')
      .map((q) => ({
        id: q.id, text: q.text, votes: q.votes.length, answered: q.answered, created: q.created,
      }))
      .sort((a, b) => b.votes - a.votes || a.created - b.created);
  }

  // What a phone sees: the open interaction (without answers until the
  // reveal), its own vote, and the approved questions.
  audienceView(device) {
    const d = this.d;
    const slide = this.currentSlide();
    const spec = this.current();
    let interaction = null;
    if (spec) {
      const st = this.stateOf(spec);
      const kind = KINDS[spec.kind];
      interaction = {
        spec: publicSpec(spec, st),
        canVote: kind.canVote(spec, st),
        mine: st.votes[device] === undefined ? null : st.votes[device],
      };
      if (spec.kind === 'sentence' || spec.kind === 'rounds') interaction.summary = this.summaryOf(spec);
      else if (st.phase >= 2) interaction.summary = this.summaryOf(spec);
    }
    const visible = d.questions.filter((q) => q.status === 'approved' || q.author === device);
    return {
      stage: { slide: d.stage.slide, step: d.stage.step },
      slideKind: slide && slide.interaction ? slide.interaction.kind : null,
      interaction,
      questions: visible.map((q) => ({
        id: q.id,
        text: q.text,
        votes: q.votes.length,
        mine: q.author === device,
        voted: q.votes.includes(device),
        pending: q.status !== 'approved',
        answered: q.answered,
      })).sort((a, b) => b.votes - a.votes),
    };
  }

  // What the shared screen shows.
  screenView() {
    const d = this.d;
    const spec = this.current();
    return {
      stage: { ...d.stage },
      startedAt: d.startedAt,
      publicUrl: d.publicUrl,
      interaction: spec ? this.summaryOf(spec, { withValues: true }) : null,
      questions: this.screenQuestions(),
      questionOnScreen: d.questionOnScreen,
      pendingQuestions: d.questions.filter((q) => q.status === 'pending').length,
      ui: d.ui,
      people: Object.keys(d.devices).length,
    };
  }

  // What the presenter's panel shows: everything, including moderation.
  panelView() {
    return {
      ...this.screenView(),
      allQuestions: this.d.questions.map((q) => ({
        id: q.id, text: q.text, status: q.status, votes: q.votes.length, answered: q.answered, created: q.created,
      })),
    };
  }

  toJSON() {
    return this.d;
  }
}

// Presenter actions.
const PRESENTER = {
  stage(action) {
    const slide = Number.parseInt(action.slide, 10);
    const step = Number.parseInt(action.step, 10) || 0;
    const s = this.talk.slides[slide];
    if (!s) return fail('No such slide.');
    if (step < 0 || step >= s.steps) return fail('No such step.');
    const rev = Number.parseInt(action.rev, 10);
    // Changes from an older view never win over a newer one.
    if (Number.isFinite(rev) && rev < this.d.stage.rev) return fail('Out of date.');
    this.d.stage = { slide, step, rev: this.d.stage.rev + 1 };
    if (slide > 0 && !this.d.startedAt) this.d.startedAt = Date.now();
    return ok();
  },

  // Generic control of an interaction: { id, action, ... }.
  control(action) {
    const spec = this.specs.get(String(action.id || ''));
    if (!spec) return fail('No such interaction.');
    return KINDS[spec.kind].control(spec, this.stateOf(spec), action);
  },

  moderate(action) {
    const q = this.d.questions.find((x) => x.id === action.id);
    if (!q || !STATUSES.includes(action.status)) return fail('Not a valid change.');
    q.status = action.status;
    return ok();
  },
  approveAll() {
    this.d.questions.forEach((q) => { if (q.status === 'pending') q.status = 'approved'; });
    return ok();
  },
  // Highlights a question on screen; highlighting another (or none) marks
  // the previous one as answered.
  onScreen(action) {
    const before = this.d.questions.find((x) => x.id === this.d.questionOnScreen);
    if (before && before.id !== action.id) before.answered = true;
    const q = action.id ? this.d.questions.find((x) => x.id === action.id) : null;
    this.d.questionOnScreen = q && q.id !== this.d.questionOnScreen ? q.id : null;
    if (!this.d.questionOnScreen && before) before.answered = true;
    return ok();
  },
  answered(action) {
    const q = this.d.questions.find((x) => x.id === action.id);
    if (!q) return fail('No such question.');
    q.answered = !q.answered;
    if (q.answered && this.d.questionOnScreen === q.id) this.d.questionOnScreen = null;
    return ok();
  },

  // Shared screen state of a component: { key, state: { seq, ... } }.
  ui(action) {
    const key = String(action.key || '');
    if (!/^[\w-]{1,60}$/.test(key)) return fail('Not a valid key.');
    const state = action.state;
    if (!state || typeof state !== 'object' || typeof state.seq !== 'number') return fail('Not a valid state.');
    if (JSON.stringify(state).length > 20000) return fail('State too large.');
    const current = this.d.ui[key];
    if (current && current.seq >= state.seq) return fail('Out of date.');
    this.d.ui[key] = state;
    return ok();
  },

  url(action) {
    const url = String(action.url || '').trim();
    if (url && !/^https?:\/\/[^\s"'<>]{3,200}$/.test(url)) return fail('Not a valid URL.');
    this.d.publicUrl = url;
    return ok();
  },

  resetAll() {
    const url = this.d.publicUrl;
    this.d = initialState();
    this.d.publicUrl = url;
    this.pace.clear();
    return ok();
  },
};

// Audience actions.
const AUDIENCE = {
  join() {
    return ok();
  },
  vote(action, dev, device) {
    const spec = this.current();
    if (!spec || spec.id !== action.id) return fail('This vote is not open any more.');
    const st = this.stateOf(spec);
    const kind = KINDS[spec.kind];
    if (!kind.canVote(spec, st)) return fail('Voting is closed.');
    const check = kind.validate(spec, action.value, st);
    if (!check.ok) return check;
    st.votes[device] = check.value;
    return ok();
  },
  ask(action, dev, device, now) {
    const text = cleanText(action.text);
    if (!text) return fail('Write your question.');
    if (now - dev.lastQuestion < LIMITS.secondsBetweenQuestions * 1000) {
      return fail(`Wait ${LIMITS.secondsBetweenQuestions} seconds between questions.`);
    }
    dev.lastQuestion = now;
    this.d.questions.push({
      id: this.newId('q'),
      text,
      author: device,
      status: this.moderation ? 'pending' : 'approved',
      votes: [],
      answered: false,
      created: now,
    });
    return ok({ pending: this.moderation });
  },
  upvote(action, dev, device) {
    const q = this.d.questions.find((x) => x.id === action.id && x.status === 'approved');
    if (!q) return fail('That question is not available.');
    if (q.author === device) return fail('You cannot vote for your own question.');
    const i = q.votes.indexOf(device);
    if (i >= 0) q.votes.splice(i, 1);
    else q.votes.push(device);
    return ok();
  },
};
