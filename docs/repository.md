# Working in a repository

Quorum does not run a shared editing service. A talk is a folder of plain text, so the way to work on it with other people and with agents is the way programmers do it: a git repository, one branch per task, and a pull request to bring changes back. Quorum makes that work well for decks.

```bash
quorum new my-talk --repo     # also: git init, a CI workflow, slide by slide merging
```

For a talk that is already in a repository, run `quorum repo my-talk` once in each clone.

## One file per slide

One `talk.md` merges fine when two people edit different slides. Adding, removing or moving slides on two branches is where git gets confused. So a talk can keep one file per slide:

```text
my-talk/
  talk.md          # the front matter, and slides: slides/
  slides/
    010-title.md
    020-why-bread-rises.md
    030-yeast-poll.md
```

```markdown
---
title: How bread rises
theme: paper
slides: slides/
---
```

The slides are read in file name order. Number them with gaps (010, 020, 030) so a new slide fits between two without renaming anything, or list the order yourself with `order: title, yeast-poll, why-bread-rises` in the front matter (names without `.md`; files not listed come after). Two agents writing two slides never touch the same file.

```bash
quorum split my-talk    # talk.md into slides/, one file per slide
quorum join my-talk     # and back to one talk.md
```

Everything else works the same on a split talk: `check`, `preview`, `live`, `build`, `export`. A warning names the slide file and its own line (`slides/030-yeast-poll.md line 4`).

## Slide by slide merging

If you keep one `talk.md`, Quorum can still merge it slide by slide. `quorum new --repo` and `quorum repo` add a line to `.gitattributes` and set a merge driver in your clone. Then, when two branches change the talk:

- slides added on both sides are both kept,
- a slide edited on one side and moved on the other gets both,
- a slide deleted on one side and untouched on the other is removed,
- front matter changes merge key by key,
- only a slide edited on **both** sides is merged line by line, and a real clash is marked with the usual `<<<<<<<` lines in that slide.

Slides are matched by their title, or by an id you give them (`<!-- id: intro -->`, or `{#id}` on a block). Give a slide an id if its title is likely to change, so it stays the same slide.

## Checks on every push

`quorum new --repo` adds `.github/workflows/quorum.yml` (edit it freely, or copy the steps into another CI). On every push and pull request it:

1. runs `quorum check --visual`, which fails on warnings, contrast problems and slides that do not fit,
2. builds a playable copy of the talk (`quorum build`) and a picture of every slide (`quorum snapshot`),
3. exports a PowerPoint file (`quorum export --pptx --safe-fonts`),
4. on a pull request, lists the slides that changed in the run's summary and saves before and after pictures.

The playable copy, the pictures and the PowerPoint file are saved as a build artifact, so a reviewer can click through the branch's version of the talk without installing anything.

## See what a change looks like

```bash
quorum diff main                    # the slides that changed since main
quorum diff main --json             # the same, for agents and tools
quorum diff main --pictures         # also a picture, before and after
```

```text
Changes since main: 1 changed, 1 added, 0 removed, 0 moved (14 slides now).
- changed: slide 2, A normal slide, rewritten (title, text)
- added: slide 14, A brand new slide
```

It reads the talk as it was at that branch, tag or commit and matches slides by id (a slide whose title changed is matched with the removed slide that reads most like it). The picture, saved in `.quorum-snapshots/diff/diff.png`, shows each changed slide before and after, so reviewing an agent's work is looking at pictures, not reading Markdown.

## Agents working in a repository

Several agents, or several people with their own agents, can work on one talk this way. The rules that make it go well are in the `AGENTS.md` that `quorum new` writes, and in the skill:

- One branch per task, named after it (`agent/yeast-chart`), with small commits that say which slides changed.
- Pull before starting. Run `quorum check` before pushing. Never push to `main` directly unless told to.
- In a split talk, touch only the slide files the task is about. A new slide is a new file.
- After pushing, run `quorum diff main --pictures` and fix anything that looks wrong.
- Do not commit `.quorum/` (votes, questions and the presenter key) or `.quorum-snapshots/`. The starter `.gitignore` already leaves them out.

`quorum preview` reloads when files change on disk, so `git pull` while it runs shows the others' work straight away.

## Working from several computers

Two people on different computers share a talk through git and nothing else. What holds up:

- **Different slides**: the slide by slide merge combines them without conflicts, as long as each of you pulls before pushing.
- **The same slide**: a normal merge conflict on that slide. Studio's **Pull** undoes a pull that would conflict and tells you, so nothing is left half merged.
- **Requests** (`requests/`) and the **decision log** (`decisions/`) are one file per entry, so they merge cleanly. A request made on one computer reaches the other person's agent after a push and a pull.
- **No live view**: you see each other's changes after they push and you pull, not while they type. Studio marks slides that changed upstream so you do not edit them blind.

Studio's Team tab does the fetch, pull and send steps. See [Studio](studio.md#the-team-tab). For agents working at the same time, see [Several agents at once](agents.md#several-agents-at-once).
