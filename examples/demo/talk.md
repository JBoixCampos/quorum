---
title: How does an AI write?
author: Quorum demo
accent: "#ff6a00"
theme: light
duration: 5
---

<!-- layout: center -->
<!-- section: Join, 1 -->

# How does an AI write?

Scan the code. You are part of this talk.

::: join Scan to join
:::

::: notes
The join block: a big QR code, the link and a live head count.
Leave it up while people arrive. Press → when the room is in.
:::

---

<!-- section: Warm-up, 1 -->

::: poll {#warmup} Pineapple on pizza?
- Yes, always
- Only if nobody is watching
- Never
:::

::: notes
A poll. Press → to open voting, → again to close it and show the bars.
It is a warm-up: the point is that everyone has voted once.
:::

---

## One word for AI

::: component word-cloud {#feeling}
audience: text
prompt: One word: how do you feel about AI?
length: 24
examples: curious | curious | curious | excited | excited | worried | sceptical | hopeful | tired | amazed
:::

::: notes
A component: components/word-cloud.js. "audience: text" gives every phone a text box
and the component draws the answers. Press → to open, → to close.
:::

---

::: estimate {#chatgpt} When did ChatGPT come out?
answer: 2022
min: 1990
max: 2030
format: year

November 30, 2022, in OpenAI's post "Introducing ChatGPT".
:::

::: notes
An estimate. → opens it, → closes it and shows every guess and the average,
→ reveals the real answer with its source.
:::

---

<!-- section: Be the model, 2 -->

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
The sentence block: the room is the language model. Open the vote, close it,
and the most voted word is added. "Draw by votes" samples a word weighted by
the votes, which is what a model does. Keep going until the sentence ends.
:::

---

<!-- section: Questions, 1 -->

::: questions
:::

::: notes
Questions arrive at any time from the button on every phone.
Click one to highlight it, click again to mark it as answered.
:::

---

<!-- layout: center -->

# Thank you

Made with Quorum. Write yours in Markdown.

::: notes
The closing slide. Press ← to go back to any slide during questions.
:::
