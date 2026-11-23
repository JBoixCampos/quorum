---
title: How does an AI write?
author: Quorum demo
accent: "#ff6a00"
theme: light
duration: 15
---

<!-- layout: center -->
<!-- section: Welcome, 2 -->

# How does an AI write?

A 15-minute talk where **you** do part of the work.

::: join Scan to join
:::

::: notes
Leave this slide on while people arrive. The QR code and link update on their own.
:::

---

<!-- section: Warm-up, 3 -->

::: poll {#warmup} Pineapple on pizza?
- Yes, always
- Only if nobody is watching
- Never
:::

::: notes
A warm-up to show how voting works. Press → to open, → to close.
:::

---

## One word: how do you feel about AI?

::: component word-cloud {#feeling}
audience: text
prompt: One word: how do you feel about AI?
length: 24
examples: curious | curious | curious | excited | excited | worried | sceptical | hopeful | tired | amazed
:::

::: notes
A component from components/word-cloud.js. "audience: text" gives every phone a text box;
the component draws the answers. Copy it and change it to build your own.
:::

---

::: multi {#uses} What have you used an AI for this month?
- Searching for information
- Writing or translating
- Studying
- Coding
- Images or music
- Nothing yet
:::

---

::: estimate {#chatgpt} In which year did ChatGPT come out?
answer: 2022
min: 1990
max: 2030
format: year

November 30, 2022.
:::

::: notes
The screen shows the audience average first, then the actual answer.
:::

---

<!-- section: Be the model, 5 -->

## A language model does one thing

--

It reads what has been written so far…

--

…and picks **the next word**. Then it does it again.

--

::: callout For the next few minutes
**You** are the language model.
:::

---

::: sentence {#sentence} Photosynthesis turns light
max: 7
start: into | energy | green | slowly
into: energy | sugar | food | life
energy: into | for | and | .
into energy: for | and | that | .
into sugar: for | and | that | .
into food: for | and | that | .
into life: . | and | for
for: plants | life | us | everything
and: oxygen | sugar | life | energy
that: plants | feeds | keeps | .
*: . | and | for
:::

::: notes
Open the vote, close it, and the most voted word is added. "Draw by votes" picks at random, weighted by the votes: that is what temperature does.
:::

---

<!-- layout: center -->

::: stat 0.3 Wh
is roughly what a typical question to a chatbot uses.
:::

::: notes
Source: Our World in Data, "How much energy do data centers and AI use?" (2026).
:::

---

::: estimate {#shower} One minute of electric shower uses as much energy as… how many questions to an AI?
answer: 530
max: 10000000
scale: log
label: about 530

Up to about 160 Wh per minute of shower, at about 0.3 Wh per question (Our World in Data).
:::

---

<!-- section: Would you?, 3 -->

::: rounds {#delegate} Would you hand this to an AI?
options: Yes | No | It depends
- Writing the first draft of an essay
- Summarising 40 research papers
- Deciding where to invest your savings
:::

---

::: columns
### Use it

- Ask, read, copy
- Fast and easy
- You get what it gives you

+++

### Understand it

- Know how it picks words
- Know when it guesses
- Build things nobody has built yet
:::

---

<!-- section: Questions, 2 -->

::: questions
:::

::: notes
Click a question to highlight it while you answer. Click again to mark it as answered.
:::

---

<!-- layout: center -->

# Thank you

::: component countdown
seconds: 60
:::

Made with Quorum.
