# PowerPoint and PDF

A Quorum talk is Markdown that an agent can write, so Quorum is also a way to make a PowerPoint deck with an agent, with or without an audience. `quorum export --pptx` turns the talk into a `.pptx` file you can open, edit and send.

```bash
quorum export my-talk --pptx          # my-talk/export/<title>.pptx
quorum export my-talk --pdf           # one page per slide
quorum export my-talk --pptx --out deck.pptx
```

It needs [Playwright](https://playwright.dev), like `quorum snapshot`: `npm install --no-save playwright && npx playwright install chromium`.

## What you get

Quorum draws every slide in a browser, reads where each piece ended up, and writes a native PowerPoint object in the same place. So the file looks like the talk, and you can still edit it.

| In the talk | In PowerPoint |
| --- | --- |
| Titles, paragraphs, lists | Text boxes you can edit, with bold, italics, colours and links |
| Colours and fonts | The theme's colour scheme and font scheme, so new slides you add stay on brand |
| Backgrounds and gradients | Slide backgrounds |
| Cards, key figures, timelines, steps, comparisons | Shapes and text boxes |
| Images | Pictures, cropped like in the talk, with their alt text |
| Tables | Tables |
| Bar, column, donut and line charts | Real charts with their numbers (right click, Edit data) |
| Code | A text box with the highlight colours |
| Speaker notes | Notes |
| Transitions | Fade, push and zoom, and PowerPoint's own Morph for `transition: morph` |
| Steps (`--`) | One click per step |
| Icons, drawings, videos, components | Pictures (SVG pictures where PowerPoint supports them) |

The command says which parts became pictures, so nothing changes silently.

## Slides where the audience answers

A poll cannot vote inside PowerPoint. Each of those slides becomes a panel in the slide's own design with the question, the options and a line that says PowerPoint cannot run this part and that you can run your own Quorum to use it live, with a link. The join QR code is left out, since it would point at your laptop.

So one talk can be given two ways: live with Quorum, or as a PowerPoint file for people who need one. Leave the panels out with `--no-audience`.

### After the talk: a report with the votes

```bash
quorum export my-talk --pptx --results
```

Shows what the room answered in the last session (it reads `.quorum/` in a copy, and changes nothing): the poll bars, the estimate with every guess, the questions that were approved. It stops with a message when there are no votes yet.

## Fonts

PowerPoint shows a font only when the computer that opens the file has it. Quorum's themes use bundled fonts (they are in `app/fonts/` of Quorum), so the command tells you which ones the file needs. For a file going to people whose computers you do not know:

```bash
quorum export my-talk --pptx --safe-fonts
```

This swaps them for fonts every Office install has (Georgia for Fraunces, Arial for Inter, and so on).

## Making a deck with an agent

You do not need an audience to use Quorum for this. The loop is the same as for a live talk:

```text
Write me a 12 slide deck for the board about our Q3 results, in the editorial
theme. Use a chart for the revenue numbers. Run `quorum check` until it is
clean, look at it with `quorum snapshot`, then run
`quorum export --pptx --safe-fonts`.
```

The agent writes `talk.md`, checks it with `quorum check --json` (contrast, density, slides that do not fit), looks at the pictures from `quorum snapshot`, and exports. You open the file in PowerPoint and change what you want. When the deck should also work live, add a poll in Studio and press **Present**.

## How it works, and what to expect

The export is checked after it is written: every part is well formed, has a content type, and every relationship points at something that exists. That catches what makes PowerPoint ask to "repair" a file. It does not prove how PowerPoint will draw every slide. Quorum's tests open the files in LibreOffice, and you should look at a deck once in PowerPoint (and Keynote or Google Slides if people use them) before sending it.

Things to know:

- Text is laid out by PowerPoint, with its own font metrics, so a line can wrap differently from the talk. Text boxes have a little room for it.
- Blurs, glass surfaces and other effects PowerPoint does not have become flat colours or pictures.
- Animated or live parts (components, videos) become a still picture.
- The PDF is a picture of every slide: the text in it cannot be selected.
