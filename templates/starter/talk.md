---
title: My talk
author: Your name
accent: "#ff6a00"     # your brand: also primary, secondary, background,
theme: light          # text, logo, font, text-font, footer and style (see the docs)
duration: 20
---

<!-- layout: center -->
<!-- section: Welcome, 3 -->

# My talk

Your name, or a subtitle.

::: join Scan to join
:::

::: notes
Speaker notes: press N on the presentation, or read them in the panel.
Three dashes on their own line start a new slide.
:::

---

## A normal slide

Markdown as usual: **bold**, *emphasis*, `code`, [links](https://example.com), images.

--

Two dashes on their own line: this part appears on the next click.

---

<!-- section: Interactions, 10 -->

::: poll {#warmup} Coffee or tea?
- Coffee
- Tea
- Neither
:::

::: notes
A poll. → opens voting, → closes it, → moves on.
:::

---

::: poll {#quiz} Which one is true?
- Paris is the capital of Italy
- [x] Rome is the capital of Italy
- Rome is the capital of France

Marked with [x], shown after "Reveal".
:::

::: notes
A quiz: mark the right answer with [x]. The text below the list is the explanation.
:::

---

::: multi {#have} What do you have with you?
- A phone
- A laptop
- Something to drink
:::

::: notes
"multi": people pick several options.
:::

---

::: estimate {#guess} How many keys does a piano have?
answer: 88
min: 1
max: 1000

A standard piano has 88 keys.
:::

::: notes
An estimate: every guess, then the average, then the answer.
:::

---

::: rounds {#would} Would you let an AI do it?
options: Yes | No | Maybe
- Write your emails
- Pick your holiday
:::

::: notes
"rounds": the same question for each item in the list.
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
The room writes a sentence word by word. "start:" lists the first options,
"word:" the options after that word, "*:" the fallback. A "." ends it.
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
A line with three pluses starts a column.
:::

---

## Your own component

::: component counter
label: Claps
:::

::: notes
components/counter.js, next to this file. Copy it to build your own.
:::

---

<!-- section: Questions, 5 -->

::: questions
:::

::: notes
People ask from the button on their phone. Approve questions in the panel,
click one to highlight it, click again to mark it as answered.
:::

---

<!-- layout: center -->

# Thank you
