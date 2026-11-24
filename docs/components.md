# Components

Polls, estimates and questions cover a lot, but the best moments in a talk are often something nobody has built yet. A component is how you build it: one JavaScript file, no build step, no framework.

## What comes with Quorum

Before you write a component, look at what is already built in. Almost everything an audience does in a talk is a block you write in `talk.md`, with no JavaScript:

| Block | What the audience does |
| --- | --- |
| `::: poll` | Pick one answer from a list. `[x]` marks the right one, which makes it a quiz |
| `::: multi` | Pick several answers |
| `::: estimate` | Guess a number |
| `::: rounds` | Answer the same question for several cases in a row |
| `::: sentence` | Write a sentence together, one word at a time |
| `::: questions` | Send questions, and vote for the ones they want answered |
| `::: join` | Scan a QR code to join |

Each can draw its results in several ways with `chart=` (bars, columns, donut, pictogram, race, bubbles, strip, histogram, beeswarm, thermometer, tree, wall, spotlight). For the slides where nobody answers there are cards, timelines, steps, key figures, comparisons, charts, callouts, icons, badges and highlighted code, and 13 layouts. [The talk format](format.md) and [design and themes](design.md) describe them, and `quorum schema --json` lists every name.

The [examples page](https://jboixcampos.github.io/quorum/examples/) shows every one of them running live, with the Markdown that makes it, ready to copy.

## Components that come with Quorum

Three more need no file, because they are not about the audience's answers. Use them with `::: component <name>`; `quorum schema --json` lists them too.

| Component | What it does | Settings |
| --- | --- | --- |
| `countdown` | A countdown on the slide. Click it, or press the right arrow, to start and pause it. The time is shared, so your panel shows the same. | `seconds` (60 when left out) |
| `qr` | A QR code for any link, drawn in the browser. | `url`, and `label` (a caption, optional) |
| `embed` | Another web page inside the slide: an `https://` link (the site must allow being shown in a frame), or an HTML file in your talk folder, which works without internet. `quorum check` warns if that file is missing. | `url`, and `title` (optional) |

```markdown
::: component countdown
seconds: 90
:::

::: component qr
url: https://example.com/slides
label: The slides
:::

::: component embed
url: pages/chart.html
:::
```

Each one runs live on the [examples page](https://jboixcampos.github.io/quorum/examples/#built-in). That page also has the components you can copy and change: [word-cloud.js](../examples/components/word-cloud.js), [next-word-explorer.js](../examples/components/next-word-explorer.js) and [counter.js](../templates/starter/components/counter.js), which every new talk includes. The rest of this page is about writing your own.

## The smallest component

Create `components/hello.js` next to `talk.md`:

```js
export default {
  mount(el, ctx) {
    el.innerHTML = `<p style="font-size: 80px">Hello, ${ctx.params.name}!</p>`;
  },
};
```

Use it in a slide:

```markdown
::: component hello
name: everyone
:::
```

`el` is an empty element inside the slide. The slide is a 1920 × 1080 stage scaled to fit the screen, so use sizes that work at that size (body text is around 36px).

The page caches components: after editing one, reload the presentation.

## Keeping in sync

During a live talk the same slide is open in two places: the window you share and the preview in your panel. If a component keeps its state in a variable, the two drift apart. Keep it in **shared state** instead:

```js
export default {
  mount(el, ctx) {
    el.innerHTML = '<button type="button" data-no-advance style="font-size: 120px">0</button>';
    const button = el.querySelector('button');
    let current = ctx;

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const count = (current.state && current.state.count) || 0;
      current.setState({ count: count + 1 });
    });

    const paint = () => {
      button.textContent = (current.state && current.state.count) || 0;
    };
    paint();

    return {
      update(next) {
        current = next;
        paint();
      },
    };
  },
};
```

`setState()` merges what you pass into the state, sends it to the server and back to every window, which then call `update()` with a new `ctx`. Keep shared state small (it travels with every update) and JSON-friendly.

Clicking a slide moves to the next one. Mark your own interactive elements with `data-no-advance` (buttons, links and inputs already are) and stop the click from bubbling up.

## What mount returns

```js
return {
  update(ctx) {},   // something changed: new answers, a new step, shared state
  primary() {},     // the presenter pressed →. Return true if you handled it
  destroy() {},     // the slide is going away: stop timers, close connections
};
```

All three are optional. `primary()` lets a component take over the right arrow, for example to start a countdown before moving on; return `false` to let the talk move on.

## The context

| Field | What it is |
| --- | --- |
| `params` | The `key: value` lines of the block, as strings |
| `text` | Any other text inside the block |
| `state`, `setState(partial)` | Shared state, described above (`state` is `undefined` until first set) |
| `answers` | What the audience answered, if the block has `audience:` (see below) |
| `step` | The current step of the slide, from 0 |
| `view` | The live session: `people` (how many are in), `questions`, `publicUrl`, `interaction` and more |
| `act(action)` | Send an action to the session, as the presenter |
| `talk` | The whole parsed talk: `meta` and `slides` |
| `where` | `'screen'` (the window you share), `'preview'` (your panel) or `'thumbnail'` (the next slides in the panel). Start slow or costly work only on `'screen'` |
| `preview` | `true` with a simulated audience: `quorum preview`, static builds, the playground. (`rehearse` is the older name, still set.) |
| `publicUrl` | The link people use to join |
| `assets` | Where the talk folder is served, for files in it: `ctx.assets + 'images/chart.png'` |
| `theme` | The talk's look: `preset`, `mode`, `tokens`, `colors` (accent, primary, background, text, muted, surface...), `palette` (eight colours), `fonts` and `radius` |
| `ui` | Helpers to look like the rest of the talk: `chart()`, `icon()`, `color()`, `countUp()`, `format()` (see below) |

## Looking like the talk

A component should look like it belongs to the talk, whatever its theme. Use the theme's CSS variables in your styles (`var(--accent)`, `var(--fg)`, `var(--surface)`, `var(--radius)`, `var(--font-display)`, `var(--series-1)` to `var(--series-8)`), or read the resolved values from `ctx.theme` for a canvas or an SVG you draw yourself.

`ctx.ui` draws the same pieces Quorum uses:

| Helper | What it does |
| --- | --- |
| `ui.chart(type, rows, options)` | A chart as HTML: `bars`, `columns`, `donut`, `pictogram`, `race`, `bubbles` or `line`. `rows` is `[{ label, value }]`; `options` takes `total` (to show percentages), `unit`, `max`, `icon` and `title` |
| `ui.icon(name)` | An icon as inline SVG (`quorum schema --icons` lists them) |
| `ui.color(n)` | The colour of answer `n`, from the palette, as a CSS value |
| `ui.countUp(el, to)` | Counts the number in `el` up to `to` |
| `ui.format(value, { unit })` | A number as Quorum shows it |

```js
export default {
  mount(el, ctx) {
    const paint = (c) => {
      const counts = (c.answers && c.answers.counts) || {};
      const rows = Object.entries(counts).map(([label, value]) => ({ label, value }));
      el.innerHTML = c.ui.chart('donut', rows, { total: c.answers ? c.answers.total : 0 });
    };
    paint(ctx);
    return { update: paint };
  },
};
```

## Asking the audience

Add `audience:` to the block and phones show an input for this slide:

| `audience:` | Phones show | Extra settings |
| --- | --- | --- |
| `text` | A text box | `length: 40` (maximum characters, up to 140), `examples: a \| b \| c` |
| `number` | A number field | `min:`, `max:` |
| `choice` | One option to pick | `options: A \| B \| C` |
| `choices` | Several options | `options: A \| B \| C` |

`prompt:` is the question phones show. Add `{#name}` after the component name to give the answers a stable id.

```markdown
::: component word-cloud {#feeling}
audience: text
prompt: One word: how do you feel about AI?
length: 24
examples: curious | worried | excited | tired
:::
```

Quorum then does the rest: an Open / Close bar under your component (the right arrow drives it too), the corner QR code, validation, one answer per phone (people can change it while it is open), and simulated answers in a preview (picked from `examples:`).

Your component reads `ctx.answers`:

```js
{
  phase: 1,                 // 0 not open yet, 1 open, 2 closed
  total: 31,                // how many answered
  values: ['curious', ...], // every answer (the latest 500)
  counts: { A: 12, B: 19 }, // for choice and choices
}
```

The full example is [examples/components/word-cloud.js](../examples/components/word-cloud.js).

## Example: a language model on your laptop

[examples/components/next-word-explorer.js](../examples/components/next-word-explorer.js) puts a real language model on a slide. It shows a sentence and the ten words the model thinks are most likely to come next, with their probabilities. You (or the audience, if you combine it with `audience: choice`) pick a word, the model is asked again, and the sentence grows. A temperature slider shows how sampling flattens or sharpens the odds.

It talks to [llama.cpp](https://github.com/ggml-org/llama.cpp)'s server, which runs small open models on an ordinary laptop:

```bash
llama-server -hf bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M --port 8081
```

```markdown
::: component next-word-explorer
text: Photosynthesis turns light
model: http://127.0.0.1:8081
:::
```

No model at hand? `model: sample` uses a small table of made-up probabilities instead, and says so on the slide. That is how it runs on the [examples page](https://jboixcampos.github.io/quorum/examples/#next-word-explorer).

A few things it shows that apply to any component that calls an outside service:

- **Only the presentation calls the model.** Phones never do, so the model never needs to be reachable from the internet.
- **The result goes into shared state.** Only the shared screen (`ctx.where === 'screen'`) asks for the first words, or whichever window you clicked in; it writes the answer with `setState()` and every other copy of the slide just draws it. Your panel's preview and thumbnails never ask the model a second time.
- **Errors are shown on the slide**, so if the model is not running you find out in the preview, not on stage.

The presentation page may call any `http://` or `https://` address, but the service must allow it with [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers. If the browser console says a request was blocked by CORS, that is the setting to change in the service.

## Ideas

- A live chart of an API, a sensor or a game
- A drawing board that the audience votes on
- A map where people drop a pin (`audience: number` twice, or a `text` answer with a place name)
- A model, a simulation or a tool you are explaining, running live instead of in screenshots

If you build something good, open a pull request to add it to `examples/components`.
