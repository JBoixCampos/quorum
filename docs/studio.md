# Studio: edit a talk on a canvas

Studio is a small editor for one person at one computer. You see the real slide, click what you want to change, drag things around and look at other layouts. Every change is written to the talk's own files, as if you had typed it in a text editor.

```bash
quorum studio my-talk
```

![Studio: the slides on the left, the real slide in the middle with a paragraph selected, its path and style on the right](images/studio.png)

It opens `http://localhost:8080/studio?key=...` in your browser. Nothing leaves your computer, there is no account, and the page only answers this computer: its address holds a key, so do not share it.

## What you see

| Where | What it is |
| --- | --- |
| Left | Every slide, drawn for real. Click one to edit it. Drag one to move it. Hover to copy or delete it. |
| Middle | The slide, drawn by the same code that presents it, in your theme. What you see is what the room sees. |
| Right | Three tabs: the **Slide** (layout, transition, background, section, notes), the **Element** you selected (its path, style and, on a canvas slide, position) and the **Talk** (theme, tokens, your colours, footer). |
| Top | Undo and redo, **Remix**, **Source** (the slide's Markdown, editable) and **Add slide**. |

## Changing things

- **Click** something on the slide to select it. The path at the top of the Element tab (`Cards / Card / Text`) lets you select what holds it. Shift and click selects the whole card or group around what you point at.
- **Double click** (or press Enter) to edit its text. You edit the Markdown of that element, so bold, links, icons and everything else work. Ctrl+Enter saves.
- **Drag** to move it: a block among the blocks of the slide, an item within its list, a card among its cards. A line shows where it will land.
- **Style** it with the chips in the Element tab: alignment, colour, size, cards, shadows, picture fit. They are the classes of the [talk format](design.md#classes-and-attributes).
- **Delete** removes it. A deleted card takes its separator with it.
- **Drop a picture** from your desktop onto the slide. It is saved in `images/`, put on the slide, and you are asked to describe it for people who cannot see it.
- **Add slide** offers a template for each kind of slide that works well: content, title, section, statement, picture and text, quote, big number, cards, steps, timeline, key figures, chart, compare, poll, questions, closing and canvas.
- **Remix** shows the slide laid out other ways, drawn in your theme, and **Use this** applies one. See [Remixing slides](remix.md).

| Key | What it does |
| --- | --- |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo |
| Enter | Edit the selected element |
| Delete | Delete the selected element |
| Esc | Deselect, or close the editor or a dialog |
| Alt+Up, Alt+Down | Previous and next slide |
| Arrow keys | Nudge the selected element on a canvas slide (Shift for bigger steps) |

## Placing things freely

Flowing layouts keep slides readable on any screen, so they stay the default. When you want something exactly there, choose the **canvas** layout in the Slide tab, or add the Canvas slide. Each element gets a position as a share of the slide:

```markdown
<!-- layout: canvas -->

## Where the gas goes {x=5 y=5 w=60 h=15}

![A loaf cut in half](images/crumb.jpg){x=0 y=30 w=55 h=70}

Bubbles grow where the gluten is strongest. {x=60 y=35 w=35 h=20}
```

`x` and `y` are the top left corner, `w` and `h` the size, from 0 to 100. Drag an element to move it and use the corner handles to resize it. Edges snap to the slide and to the other elements (a pink line shows what it lined up with); hold Alt to turn snapping off. `quorum check` warns about elements that stick out of the slide and about elements that overlap.

## It is only the files

Studio has no data of its own. Each action is an edit to `talk.md`, or to the file of that slide in a [split talk](repository.md#one-file-per-slide): a line replaced, a class added to a heading, a block moved, a slide file renamed. After it, `git diff` shows exactly what happened, and the status in the top right says where it was saved.

- **Undo and redo** remember this session. Git is the real history.
- **Changes from outside show up.** Leave Studio open while an agent, an editor or `git pull` changes the files: the slides update on their own. If you are editing a slide at the same moment, Studio asks before it saves over a change it did not make.
- **Agents and Studio work on the same files.** An agent can write a variant that appears in Remix, or edit a slide that you then adjust by hand.
- **Not everything is editable here.** The questions of a poll, your own components and anything unusual stay in the Markdown: the Source view is one click away.

## Safety

Studio can write files, so it is strict about who may ask. It only listens on this computer, needs the key in every request, and refuses requests that name another host or come from another website. It writes only inside the talk's folder (pictures go in `images/`, and only picture files up to 15 MB). It never runs code from the talk.
