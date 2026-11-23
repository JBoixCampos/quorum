---
name: quorum
description: Write and check Quorum talks, and build components for them. Quorum talks are presentations written in Markdown where the audience answers from their phones (polls, estimates, rounds, a shared sentence, questions and custom JavaScript components). Use when asked to make, edit or extend a Quorum talk, or a talk with live audience interaction.
---

# Quorum talks

Quorum turns `talk.md` into a presentation where people vote, guess and ask from their phones, and the results appear on the slides. Your job is to author: write the talk, build any components it needs, and check it. The speaker looks at it and gives it.

## 1. Set up

- Check that the command exists: `quorum --version`. If not: `npm install -g github:JBoixCampos/quorum` (Node 18 or newer).
- New talk: `quorum new <folder>`. It creates `talk.md`, `components/counter.js` and an `AGENTS.md` with the format in short. Read that `AGENTS.md`.
- The full reference, in one file: https://jboixcampos.github.io/quorum/llms-full.txt

## 2. Write

Plan first: how long the talk is (`duration:` in the front matter, in minutes), its sections, and where the audience takes part. Count 30 to 60 seconds for each vote.

- One idea per slide, few words. Titles short.
- If the user gives a brand (colours, logo, fonts), put it in the front matter: `accent`, `primary`, `secondary`, `background`, `text`, `logo`, `font`, `text-font`, `footer`, `style`. See "Your brand" in the reference.
- Start with a title slide that has `::: join`, then a quick warm-up `::: poll` so everyone has answered once.
- One interaction per slide, each with a unique `{#id}`.
- An `::: estimate` with a reveal must use a well-known, verifiable fact, with its source in the reveal text. Never invent numbers.
- Put what the speaker should say and press in `::: notes`.
- End with `::: questions` and a closing slide.
- For anything the blocks do not cover, write a component in `components/<name>.js` (see the `AGENTS.md` in the talk folder). Use `audience:` to give phones an input.

## 3. Check

```bash
quorum check <folder> --json
```

It prints `{ ok, title, slides, interactions, warnings }` and exits non-zero while there are warnings. Fix each warning and run it again until `ok` is `true`. Report the slide count and the interactions to the user.

## 4. Hand over

Tell the user they can see the talk with `quorum preview <folder>`: it opens in the browser with a simulated audience, and the slides update as you keep editing `talk.md`. Then take their changes and check again.

`quorum live <folder>` gives the talk to a real audience. That is the user's to run, not yours.

## Never

- Never read, edit or delete `.quorum/` (votes, questions, the presenter key).
- Never show or share the presenter key, or the presentation and panel links that contain it.
- Never add tracking, accounts or requests to other services to a talk without the user asking.
