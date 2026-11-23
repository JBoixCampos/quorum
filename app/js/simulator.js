// A simulated audience for rehearsals: people join over a few seconds,
// vote when something opens and send a question now and then. It uses the
// same session code as the real server, so a rehearsal behaves the same.

import { KINDS } from '../shared/kinds.js';

const SAMPLE_QUESTIONS = [
  'Can you show that again?',
  'Where can I learn more about this?',
  'Does this work in other languages?',
  'What surprised you most when you built it?',
  'How long did this take to prepare?',
];

export class Simulator {
  constructor(session, onChange, { people = 24 } = {}) {
    this.session = session;
    this.onChange = onChange;
    this.people = Array.from({ length: people }, (_, i) => `rehearsal-${String(i).padStart(4, '0')}`);
    this.joined = 0;
    this.paused = false;
    this.timer = setInterval(() => this.tick(), 450);
  }

  act(device, action) {
    return this.session.apply(action, { device, now: Date.now() }).ok;
  }

  tick() {
    if (this.paused) return;
    let changed = false;
    if (this.joined < this.people.length) {
      this.joined = Math.min(this.people.length, this.joined + 2);
      changed = true;
    }
    const present = this.people.slice(0, this.joined);
    present.forEach((d) => this.session.register(d, Date.now()));
    const spec = this.session.current();
    if (spec) {
      const st = this.session.stateOf(spec);
      const kind = KINDS[spec.kind];
      if (kind.canVote(spec, st)) {
        present.filter((d) => !(d in st.votes)).slice(0, 3).forEach((d) => {
          if (Math.random() < 0.7) changed = this.act(d, { type: 'vote', id: spec.id, value: kind.simulate(spec, st) }) || changed;
        });
      }
    }
    const slide = this.session.currentSlide();
    if (slide && slide.interaction && slide.interaction.kind === 'questions' && Math.random() < 0.08) {
      const d = present[Math.floor(Math.random() * present.length)];
      const text = SAMPLE_QUESTIONS[Math.floor(Math.random() * SAMPLE_QUESTIONS.length)];
      if (d && this.act(d, { type: 'ask', text })) changed = true;
      const approved = this.session.d.questions.filter((q) => q.status === 'approved');
      if (approved.length && d) changed = this.act(d, { type: 'upvote', id: approved[0].id }) || changed;
    }
    if (changed) this.onChange();
  }

  stop() {
    clearInterval(this.timer);
  }
}
