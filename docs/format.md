# The talk format

A talk is one Markdown file, `talk.md`, in a folder with anything it needs (images, components). Edit it while `quorum preview` or `quorum live` is running and the slides update on their own; votes already cast are kept.

`quorum check` reads the file and lists anything that looks wrong, with the slide number.

## The top of the file

```yaml
---
title: How does an AI write?
author: Your name
theme: light        # light or dark
duration: 20        # minutes, for the pace clock in the panel
---
```

Anything after ` # ` on a line is a comment.

## Your brand

Colours, a logo, fonts, the footer and a stylesheet go in the same place. Every one is optional.

```yaml
---
title: How does an AI write?
accent: "#0b5fff"            # buttons, bars, the frame around audience slides
primary: "#101820"           # titles
secondary: "#00a078"         # list markers, subheadings, table headers, callout titles
background: "#f7f4ee"        # the slide background
text: "#1d1d1b"              # body text
logo: images/logo.svg        # top right of every slide, and on phones
font: fonts/Brand-Bold.woff2 # titles: a font file in the talk folder...
text-font: Georgia, serif    # ...or any CSS font-family
footer: Acme · {section} | {n} / {total}
style: brand.css             # your own CSS, loaded after Quorum's
---
```

- **Colours** are `#hex`, a CSS name (`navy`) or `rgb()`. Without `primary`, titles use the text colour; without `secondary`, details use the accent. Text on buttons turns white or black to stay readable on your accent.
- **A dark `background`** makes the theme dark on its own, unless you set `theme:`.
- **Phones** use the same colours, fonts and logo, so the talk looks like one thing on the screen and in people's hands.
- **Files** (logo, fonts, stylesheet, images) are paths inside the talk folder. `quorum check` warns when one is missing.
- **The footer** runs along the bottom of every slide but the first. A `|` splits it into a left and a right part. It can use `{title}`, `{author}`, `{section}`, `{n}` (the slide number) and `{total}`, plus **bold**, *emphasis* and links. Without `footer:` it is `{title} | {n} / {total}`; `footer: off` removes it. On slides where the audience answers, the right part says how to join, next to the QR code.
- **`style:`** is for anything else. Slides are `.q-slide`, their content `.q-content`, the logo `.q-logo`, the footer `.q-footer`. For example, `.q-content h1 { text-transform: none; }` or `.q-logo img { max-height: 48px; }`.

## Slides and steps

A line with three dashes starts a new slide. A line with two dashes splits a slide into steps: each click shows the next part.

```markdown
## First slide

Hello.

---

## Second slide

This shows first.

--

This shows on the next click.
```

Inside a slide, write Markdown as usual: headings, **bold**, *emphasis*, ~~strike~~, `code`, [links](https://example.com), images (`![A cat](images/cat.jpg)`, relative to the talk folder), lists, `- [ ]` and `- [x]` checklists, tables, quotes and code blocks.

## Slide settings

HTML comments at the start of a slide change how it behaves:

```markdown
<!-- layout: center -->         centre everything (good for titles and closing slides)
<!-- id: intro -->              a stable name for the slide
<!-- section: Warm-up, 5 -->    starts a section planned for 5 minutes (shown in the panel)
<!-- background: images/team.jpg, dim -->   a full-slide image ("dim" darkens it, text turns white)
<!-- background: #101820 -->    or a colour
<!-- logo: off -->              hide the logo on this slide
<!-- footer: off -->            hide the footer on this slide (or "on" to show it on the first)
```

## Blocks

Blocks start with `:::` and a name, and end with `:::`.

### Speaker notes

```markdown
::: notes
Only you see these: in the panel, or by pressing N on the presentation.
:::
```

### Layout

```markdown
::: columns
### Left
Anything.

+++

### Right
A line with three pluses separates columns.
:::

::: stat 88
keys on a standard piano.
:::

::: callout Remember
A highlighted box with an optional title.
:::

::: center
Centred content inside an otherwise normal slide.
:::
```

### The join block

A big QR code with the link and how many people are in. Use it on your first slide.

```markdown
::: join Scan to join
:::
```

On every slide that has something to answer, a small QR code also appears in the corner, so late arrivals can join at any time.

## Interactions

A slide can have one interaction. Give it an id with `{#name}`: that is how Quorum keeps its results if you edit the text later.

Each interaction is driven with the right arrow (or the buttons under it): the first press opens voting, the next closes it and shows the results, the next reveals the answer if there is one, and the next moves on.

### Poll

```markdown
::: poll {#pizza} Pineapple on pizza?
- Yes, always
- Only if nobody is watching
- Never
:::
```

Mark a right answer with `[x]` and add a paragraph to explain it. Both stay hidden, on the screen and on phones, until you reveal them.

```markdown
::: poll {#capital} Which one is true?
- Paris is the capital of Italy
- [x] Rome is the capital of Italy

Rome has been the capital since 1871.
:::
```

### Several answers

```markdown
::: multi {#uses} What have you used an AI for this month?
- Searching
- Writing
- Coding
:::
```

### Guess a number

```markdown
::: estimate {#shower} Litres of water for a 10-minute shower?
answer: 100
min: 1
max: 100000
scale: log        # optional: for guesses that span several orders of magnitude
unit: litres      # optional
label: About 100 litres   # optional: how to show the answer
format: year      # optional: show numbers as years (no thousands separator)

The explanation shown with the answer.
:::
```

People can type `57000`, `57,000`, `57.000` or `57 000`. Every guess appears as a dot, then the average and the median, then the real answer.

### Rounds

The same question over a list of items, one round each.

```markdown
::: rounds {#hand} Would you hand this to an AI?
options: Yes | No | Depends
- Writing a birthday message
- Choosing a medical treatment
- Planning a holiday
:::
```

### Write a sentence together

The audience plays the language model: they pick the next word, the most voted one is added, and the sentence grows. You prepare the options.

```markdown
::: sentence {#story} Photosynthesis turns light
max: 8                   # words at most
start: into | energy | and
into: energy | sugar | food
energy: into | for | .
*: and | the | .         # options after any other word
:::
```

`start:` lists the first options. A line like `into:` lists the options after that word; you can also use the whole sentence so far as the key. `*:` is the fallback. A `.` ends the sentence. Instead of taking the most voted word you can click any option to fix it yourself, or press "Draw by votes" to pick one at random, weighted by the votes: the way a model samples.

### Questions

```markdown
::: questions
:::
```

People can ask at any time from the button on their phone and upvote other questions. By default you approve each question in the panel before it is shown (`quorum live --no-moderation` turns that off). Click a question on screen to highlight it, click again to mark it as answered.

`mode: latest` shows the newest first instead of the most voted.

## Components

Anything else is a component: a JavaScript file in `components/` next to `talk.md`.

```markdown
::: component counter
label: Claps
:::
```

The `key: value` lines become its parameters and any other text is passed along too. Quorum includes three:

```markdown
::: component countdown
seconds: 90
:::

::: component qr
url: https://example.com/slides
label: The slides
:::

::: component embed
url: https://example.com  # or a page in the talk folder: pages/chart.html
:::
```

`embed` shows a web page that allows being shown in a frame, or an HTML file from your talk folder, which works without internet. `quorum check` warns if that file is missing.

A component can also ask the audience something with `audience:`:

```markdown
::: component word-cloud
audience: text            # text, number, choice or choices
prompt: One word: how do you feel about AI?
length: 24                # text: maximum characters (up to 140)
examples: curious | worried | excited   # text: answers for the simulated audience
:::
```

For `number`, add `min:` and `max:`. For `choice` and `choices`, add `options: A | B | C`.

See [components.md](components.md) to write your own.
