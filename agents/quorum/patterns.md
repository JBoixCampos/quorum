# Slide patterns

Proven slides to build a talk from. Pick a pattern for each slide instead of writing bullets by default. Mix them: no more than three slides in a row should share a pattern.

Every pattern works with every theme. Check the result with `quorum check --json` (and `quorum snapshot` to look at it).

## Opening

The title, a subtitle and the join code, so people get their phones out from the start.

```markdown
<!-- layout: title -->
<!-- footer: off -->

# How bread rises {#title}

Yeast, gas and gluten, in fifteen minutes.

::: join Scan to join
:::
```

## Agenda

Lists the sections of the talk on its own (from `<!-- section: -->`). Repeat it between sections: the next one is highlighted.

```markdown
<!-- layout: agenda -->

## Today {#title}
```

## Section break

```markdown
<!-- layout: section -->
<!-- section: History, 5 -->

# A little history
```

## Warm-up poll

Everyone answers once in the first two minutes.

```markdown
::: poll {#warmup chart=donut} How often do you bake?
- Every week
- A few times a year
- Never
:::
```

## Problem statement

One sentence, very large. Put the key word in *emphasis*.

```markdown
<!-- layout: statement -->

## Most bread fails because of *time*, not skill.
```

## Big number

One figure that surprises. Only real, sourced numbers.

```markdown
<!-- layout: big-number -->

# 1928

The year sliced bread first went on sale, in Chillicothe, Missouri.
```

## Three or four ideas

Cards with icons. `{.steps}` shows one per click. `quorum schema --icons` lists the icons.

```markdown
## What goes in

::: cards {.steps}
### Flour {icon=wheat}
Proteins that become gluten.

+++

### Yeast {icon=sparkles}
A living fungus that makes gas.

+++

### Salt {icon=gem}
Slows the yeast, adds taste.
:::
```

## Story with a picture

Text on one side, a picture edge to edge on the other.

```markdown
<!-- layout: split -->

## Yeast eats sugar

![Dough rising in a bowl](images/dough.jpg)

It turns sugar into gas and alcohol.

--

The gas gets trapped in the *gluten*.
```

## Picture first

```markdown
<!-- layout: full -->

![A wheat field at sunset](images/field.jpg)

## It starts in a field

A grain of wheat is mostly starch.
```

## Process

```markdown
## One loaf, step by step

::: steps {.steps}
- Mix: flour, water, yeast, salt
- Knead: ten minutes
- Prove: until doubled
- Bake: hot oven
:::
```

## History

```markdown
## From Egypt to sliced bread

::: timeline {.steps}
- 1857: Pasteur publishes his work on fermentation
- 1928: sliced bread goes on sale
- 1961: the Chorleywood process
:::
```

## Key figures

```markdown
::: kpis
- 215 min: from flour to bread
- 4: ingredients
- 2: rises
:::
```

## Data

A chart from numbers in the talk, in the theme's colours. Types: bar, column, line, donut, pictogram.

```markdown
## Where the time goes

::: chart column {unit=min title="Minutes for each step of our recipe"}
Mix: 10
Knead: 10
First rise: 90
Bake: 35
:::
```

## Compare

```markdown
## Fresh or sliced?

::: compare {vs="or"}
### Fresh
Crisp crust, best on the day.

+++

### Sliced
Lasts longer, ready for toast.
:::
```

## Quote

```markdown
<!-- layout: quote -->

> Bread is the king of the table, and all else is merely the court.

A saying, often quoted by bakers.
```

## Quiz with a reveal

A right answer marked `[x]` and an explanation shown on reveal.

```markdown
::: poll {#holes chart=bubbles reveal=spotlight} What makes the holes in bread?
- Air you knead in
- [x] Gas from the yeast
- Steam from the water

Yeast gas makes most of them. Steam helps them grow in the oven.
:::
```

## Guess a number

```markdown
::: estimate {#pasteur chart=beeswarm} Pasteur on fermentation: which year?
answer: 1857
min: 1500
max: 2025
format: year

Pasteur, "Mémoire sur la fermentation appelée lactique", 1857.
:::
```

## Code, line by line

````markdown
## Timing the rise

```js {lines=1-2|4-6}
const start = Date.now();
const doubled = (v) => v >= 2 * startVolume;

while (!doubled(volume())) {
  await wait(minutes(10));
}
```
````

## Questions

```markdown
<!-- layout: center -->
<!-- section: Questions, 5 -->

::: questions {chart=wall}
:::
```

## Closing

```markdown
<!-- layout: closing -->

# Thank you {#title}

slides.example.com · :icon[mail] hello@example.com
```

## Choosing a theme

| The talk | Theme |
| --- | --- |
| A keynote, a product launch | `midnight` or `bold` |
| A lecture, a book talk, research | `editorial` |
| A workshop, a classroom | `studio` or `paper` |
| A company all-hands, a client pitch | `signal` (with the brand's `accent` and `logo`) |
| A technical talk, a demo | `terminal` |

A company with a brand: `quorum theme from logo.svg` proposes colours, `quorum theme new acme` saves the look as `themes/acme.yaml` for every talk.
