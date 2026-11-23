---
title: My talk
author: Your name
accent: "#ff6a00"
theme: light
duration: 20
---

<!-- layout: center -->
<!-- section: Welcome, 3 -->

# My talk

A subtitle, or your name.

::: join Scan to join from your phone
:::

::: notes
These are speaker notes: press N on the presentation, or look at the panel.
Slides are separated by a line with three dashes.
:::

---

## A normal slide

Write Markdown as usual: **bold**, *highlighted*, `code`, [links](https://example.com) and images.

- Lists work
- Two dashes on their own line make the next part appear on the next click

--

Like this.

---

<!-- section: Interactions, 10 -->

::: poll {#warmup} One option. Which one do you prefer?
- Coffee
- Tea
- Neither
:::

::: notes
Press → to open voting, → to close it, → to move on.
:::

---

::: poll {#quiz} A quiz: mark the right answer with [x]
- Paris is the capital of Italy
- [x] Rome is the capital of Italy
- Rome is the capital of France

The answer appears after "Reveal".
:::

---

::: multi {#have} Several options: what do you have with you?
- A phone
- A laptop
- Something to drink
:::

---

::: estimate {#guess} A number: how many keys does a piano have?
answer: 88
min: 1
max: 1000

Everyone guesses, the screen shows the average, then the real answer.
:::

---

::: rounds {#would} The same question, several times
options: Yes | No | Maybe
- Would you let an AI write your emails?
- Would you let an AI pick your holiday?
:::

---

::: sentence {#story} Once upon a time
max: 5
start: there | a | in
there: was | lived | were
a: dragon | robot | cat
in: a | the
*: and | . | that
:::

::: notes
The audience writes a sentence word by word, picking from the options you prepare.
"start:" lists the first options; "word:" the options after that word; "*:" the default.
:::

---

<!-- layout: center -->

::: stat 88
keys on a standard piano.
:::

---

::: columns
### Left
Anything goes here.

+++

### Right
Separate columns with a line of three pluses.
:::

---

## Your own components

::: component counter
label: Claps
:::

::: notes
"counter" lives in components/counter.js next to this file. Copy it to build your own.
:::

---

<!-- section: Questions, 5 -->

::: questions
:::

::: notes
People can ask at any time with the button on their phone. You approve questions in the panel.
Click a question to highlight it; click it again to mark it as answered.
:::

---

<!-- layout: center -->

# Thank you
