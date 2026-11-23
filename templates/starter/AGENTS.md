# AGENTS.md

This folder is a Quorum talk: a presentation where the audience answers from their phones. If you are an AI agent asked to write or change this talk, read this first.

## Files

- `talk.md`: the whole talk, in Markdown. This is the file you edit.
- `components/`: custom slide pieces, one JavaScript file each (`components/counter.js` is an example).
- `.quorum/`: votes, questions and the presenter key of live sessions. **Never read, edit or delete it.**

## Check your work

After every change, run:

```bash
quorum check --json
```

It prints `{ ok, title, slides, interactions, warnings }` and exits with a non-zero code while there are warnings. Fix every warning before you say the talk is done. The speaker sees it with `quorum preview` (a simulated audience votes, and the slides update as you edit) and gives it with `quorum live`: those are theirs to run.

## The format in short

```markdown
---
title: The talk title
duration: 20          # minutes
---

<!-- layout: center -->
# A title slide

::: join Scan to join
:::

---

## A normal slide

Markdown as usual.

--

Two dashes: this part appears on the next click.

::: notes
Speaker notes, only for the speaker.
:::
```

- `---` on its own line starts a new slide. `--` starts the next step of the same slide.
- Branding goes in the front matter: `accent:`, `primary:` (titles), `secondary:` (details), `background:`, `text:`, `logo: images/logo.svg`, `font:` and `text-font:` (a CSS font-family or a font file), `footer: {title} | {n} / {total}` (or `off`), `style: brand.css`. Use the speaker's brand when they give one.
- `<!-- background: images/photo.jpg, dim -->` puts an image (or a `#colour`) behind one slide. `<!-- logo: off -->` and `<!-- footer: off -->` hide the logo and the footer there.
- `<!-- layout: center -->` centres a slide. `<!-- section: Warm-up, 5 -->` starts a section planned for 5 minutes.
- Layout blocks: `::: columns` (columns split by `+++`), `::: stat 88` (a big number), `::: callout Title`, `::: center`.

One interaction per slide, each with a stable id in `{#name}`:

```markdown
::: poll {#coffee} Coffee or tea?
- Coffee
- [x] Tea              # [x] marks a right answer, revealed later

Optional text shown with the answer.
:::

::: multi {#uses} Pick several
- A
- B
:::

::: estimate {#keys} How many keys does a piano have?
answer: 88
min: 1
max: 1000
:::

::: rounds {#would} Would you let an AI do it?
options: Yes | No | Maybe
- Write your emails
- Pick your holiday
:::

::: sentence {#story} Once upon a time
max: 6
start: there | a | in
there: was | lived
*: and | the | .
:::

::: questions
:::
```

(Remove the `# ...` comments when you copy these.) The full reference is in the Quorum docs: https://jboixcampos.github.io/quorum/llms-full.txt

## Writing a component

A component is `components/<name>.js`, used as `::: component <name>`. The `key: value` lines become `ctx.params`. Add `audience:` (`text`, `number`, `choice` or `choices`) and phones get an input; the answers arrive in `ctx.answers.values` (and `ctx.answers.counts` for choices).

```markdown
::: component word-list {#words}
audience: text
prompt: One word for this topic?
examples: fast | simple | fun
:::
```

```js
// components/word-list.js
export default {
  mount(el, ctx) {
    const paint = (c) => {
      const values = (c.answers && c.answers.values) || [];
      el.textContent = values.join(', ') || 'Press the right arrow to open it.';
    };
    paint(ctx);
    return { update: paint };
  },
};
```

Keep anything that must look the same on the shared screen and the speaker's panel in `ctx.state` and change it with `ctx.setState({...})`. Start slow work (network calls, models) only when `ctx.where === 'screen'`. No dependencies and no build step: plain JavaScript modules.

## Rules

- **Never touch `.quorum/`**, and never show or share the presenter key or the presentation and panel links that contain it.
- **Do not invent facts or statistics.** An estimate with a reveal uses a well-known, verifiable fact, with its source in the reveal text.
- **One idea per slide, few words.** People read the screen and answer on their phones.
- Keep every interaction id unique and stable: renaming an id loses its votes.
- Run `quorum check --json` until `ok` is `true`.
