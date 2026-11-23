# Components

Polls and questions cover a lot, but the best moments in a talk are often something nobody has built yet. A component is how you build it: one JavaScript file, no build step, no framework.

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
| `chatMode` | `true` when the audience is answering through the chat |
| `where` | `'screen'` (the window you share), `'preview'` (your panel) or `'thumbnail'` (the next slides in the panel). Start slow or costly work only on `'screen'` |
| `rehearse` | `true` in rehearsal mode and in static demos |
| `publicUrl` | The link people use to join |

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

Quorum then does the rest: an Open / Close bar under your component (the right arrow drives it too), the corner QR code, validation, one answer per phone (people can change it while it is open), simulated answers in rehearsal mode (picked from `examples:`), and a box to type answers in chat mode.

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

A few things it shows that apply to any component that calls an outside service:

- **Only the presentation calls the model.** Phones never do, so the model never needs to be reachable from the internet.
- **The result goes into shared state.** Only the shared screen (`ctx.where === 'screen'`) asks for the first words, or whichever window you clicked in; it writes the answer with `setState()` and every other copy of the slide just draws it. Your panel's preview and thumbnails never ask the model a second time.
- **Errors are shown on the slide**, so if the model is not running you find out in rehearsal, not on stage.

The presentation page may call any `http://` or `https://` address, but the service must allow it with [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers. If the browser console says a request was blocked by CORS, that is the setting to change in the service.

## Ideas

- A live chart of an API, a sensor or a game
- A drawing board that the audience votes on
- A map where people drop a pin (`audience: number` twice, or a `text` answer with a place name)
- A model, a simulation or a tool you are explaining, running live instead of in screenshots

If you build something good, open a pull request to add it to `examples/components`.
