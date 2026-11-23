# Presenting

## Before the day

1. **Rehearse.** **Rehearse** in Studio (or `quorum preview my-talk`) shows the talk with 24 simulated people who join, vote and ask questions, so every slide looks the way it will with a room. Click through it once with a clock: votes take longer than you think (count on 30 to 60 seconds each).
2. **Look at the Checks** in Studio (or run `quorum check my-talk`). They list anything that looks wrong.
3. **Install cloudflared** for the public link: `winget install --id Cloudflare.cloudflared` on Windows, `brew install cloudflared` on a Mac, or see [Cloudflare's downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). ngrok works too. Without either, only people on the same network as your laptop can join.
4. **Do a test run with a real phone**, on mobile data rather than your wifi: **Present** in Studio, scan the QR code, vote once, stop, then `quorum clean my-talk` to delete that vote.
5. If you will be **on a video call**, try sharing the presentation window with the tool you will use.

## On the day

Press **Present** in Studio. For a talk with slides that ask the audience, choose a public link or only your local network, then **Start**. From a terminal, `quorum present my-talk` does the same.

Two windows open on your laptop, and Studio's top bar shows that the talk is live, its link (the one in the QR code), how many phones are connected and a **Stop** button. That gives three views of the same talk, always in sync.

### What the room sees: the presentation

It opens in its own window. Share or project this window, and only this one. The QR code stays in the corner whenever the audience can answer, so latecomers can still join.

![The presentation during a poll: live bars, 23 answers and a QR code in the corner](images/screen.png)

### What you see: the panel

It opens in your browser and is only for you: a clickable preview of the presentation, the next slides, your notes, the clock against your plan, how many people are in, the votes so far, and the questions waiting for your approval. Never share it: its link contains the presenter key.

![The panel: preview, next slides, notes, vote counts and two questions waiting for approval](images/panel.png)

### What each phone sees

After scanning the QR code, a phone shows only what the room is asked right now, and a button to ask a question. No app, no account, no name.

![A phone showing the poll with three options to tap](images/phone.png)

### Driving the talk

Drive the talk from either window. In the panel, click the preview or use the arrow keys; in the presentation, use the keyboard or a clicker.

| Key | Does |
| --- | --- |
| → Space Page Down Enter | Next: open voting, close it, reveal, then the next slide |
| ← Page Up Backspace | Previous |
| Home / End | First / last slide |
| N | Speaker notes on the presentation (only if you are not sharing it) |
| F | Full screen |

Clicking the right part of the presentation also moves forward; clicking the left third goes back.

### With one screen

On a call with one monitor, share the presentation window and keep the panel in another window or on a tablet (open the panel link there). The presentation window is opened with settings that keep it painting while other windows cover it, so the call keeps showing it live.

### Questions

People can ask at any time from the button on their phone. New questions wait in the panel until you approve them (or approve all). On the questions slide, click one to highlight it while you answer, and click again to mark it as answered.

## If people cannot join

- **The public link stops**: Studio (or the terminal) says so, and the QR code switches to your laptop's address on the local network, so people on the same wifi can still join. For a new public link, stop and present again. Votes and questions are kept.
- **No internet, but one network**: choose **This network only** when you press Present (or `quorum present my-talk --no-tunnel`), and everyone joins on the same wifi as your laptop.
- **Nobody can join at all**: give the talk without the audience. `quorum export my-talk` makes a copy with only the slides nobody answers (the QR code is left out too), in `my-talk/export`. Present it from any static web server, for example `python3 -m http.server -d my-talk/export`, and open the address it prints. Make one before the day, just in case.

## After the talk

- The results stay in `my-talk/.quorum/state.json` until you delete them. Copy what you need (the panel shows every question), then run `quorum clean my-talk`.
- `quorum clean my-talk --key` also creates a new presenter key next time.
- To share a playable version of the talk afterwards, `quorum build my-talk` makes a static site that anyone can open and click through with a simulated audience. It contains your slides and components, never the votes or questions.

## Privacy

- People join without an account or a name. Each phone gets a random id stored in its browser, used only to count one vote per phone.
- Votes and questions live in your talk folder, on your laptop. Nothing is sent to any other service except through the tunnel you start.
- Questions are limited to 140 characters, and to one every few seconds per phone.
- The presenter key (in `.quorum/key.txt` and in the presentation and panel links) is what controls the talk. Do not show those links on screen or share them.
