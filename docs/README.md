# Quorum documentation

Quorum turns a Markdown file into a presentation where the audience takes part, and that an AI agent can write and check for you. People scan a QR code and answer from their phones; the results land on your slides. Everything runs from your laptop.

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install -g github:JBoixCampos/quorum

quorum new my-talk          # a starter talk that shows every feature
quorum preview my-talk      # see it with a simulated audience
quorum live my-talk         # give it
```

`quorum new` creates a folder with `talk.md`, a `components/` folder and an `AGENTS.md` for AI agents. Edit `talk.md` while `quorum preview` is running and the slides update on their own.

## A slide is a few lines

This Markdown makes the slide next to it. Click the slide to open the vote, then again to close it and to reveal the answer.

<!-- demo-slide: 4 -->

Every block works the same way: you write it in `talk.md`, phones get the right input, and the screen shows the results.

| Block | What the audience does |
| --- | --- |
| `::: poll` | Pick one option |
| `::: multi` | Pick several |
| `::: estimate` | Guess a number |
| `::: rounds` | Answer the same question over a list |
| `::: sentence` | Write a sentence one word at a time |
| `::: questions` | Ask and upvote, anonymously |
| `::: component` | Whatever you build |

## The guides

- [The talk format](format.md): every block with examples, and [your brand](format.md#your-brand): colours, logo, fonts, footer, backgrounds.
- [Design and themes](design.md): eight themes, layouts, cards, timelines, charts, icons, transitions, result looks, reactions, and the checks that keep a talk readable.
- [PowerPoint and PDF](powerpoint.md): export a talk as an editable `.pptx`, with interactive slides as placeholders, or a report with the votes. A way to make PowerPoint decks with an agent.
- [Working in a repository](repository.md): one file per slide, slide by slide merging, checks on every push, `quorum diff`, and agents working on branches.
- [Studio](studio.md): edit a talk on a canvas: click, type, drag, place things freely, drop pictures, remix, undo. Every change is an edit to your files.
- [Remixing slides](remix.md): see one slide laid out six other ways and choose, with Quorum's own remixes and variants from agents.
- [Components](components.md): build your own slide pieces in JavaScript, including one that uses a local language model.
- [Giving a talk](giving-a-talk.md): the day itself, with screenshots of the three views (the shared screen, your panel, a phone), and what to do if people cannot join.
- [Built for agents](agents.md): install Quorum where your agent works, teach it the format, and ask it to write, check and extend your talk.

## Commands

| Command | Does |
| --- | --- |
| `quorum new <folder>` | Create a new talk |
| `quorum preview [folder]` | See the talk with a simulated audience, updated as you edit |
| `quorum live [folder]` | Give the talk: server, public link, QR code, windows |
| `quorum check [folder]` | Check `talk.md` for mistakes and design problems (`--json` for tools, `--visual` to measure in a browser) |
| `quorum snapshot [folder]` | A picture of every slide, and a contact sheet |
| `quorum schema` | Every theme, layout, block, class and icon (`--json`, `--icons`) |
| `quorum theme new <name>` | Save the talk's look as `themes/<name>.yaml` |
| `quorum theme from <logo>` | Propose colours and a theme from a logo |
| `quorum build [folder]` | Build a static, playable copy with a simulated audience |
| `quorum export [folder]` | The slides without the audience parts, for when nobody can join |
| `quorum clean [folder]` | Delete the votes and questions of the last session |
| `quorum skill` | Install the agent skill for Claude Code (`--to <folder>` for other agents) |

Options: `--port <n>`, `--file <name>`, `--no-tunnel`, `--no-open`, `--no-moderation`, `--out <folder>`, `--json`, `--visual`, `--icons`, `--no-results`, `--save <name>`, `--to <folder>`.
