# Plan 13 | Books on Scribe's timeline

**Status:** Accepted. The owner asked for it on 2026-10-18 (issue #842,
criterion 3); his words are in
[user-messages/2026-10-18-books-timeline.md](user-messages/2026-10-18-books-timeline.md).

## What a person sees

- He plays A New Earth in Books from 12:03 while Scribe records. Three
  seconds in, his recording's timeline shows "Listening to A New Earth ·
  Eckhart Tolle, from 12:03" with the book's cover. When he pauses at 15:00,
  it shows "Listened to A New Earth, 12:03–15:00 · 2 min 57 s".
- A tap on the row opens
  `https://books.pisspoursoftware.xyz/books/a-new-earth/listen/12m03s`: the
  player, paused at the second the stretch began.
- Nothing shows when no recording was live while he listened, and a tap on
  Play then Pause under 3 s is no stretch at all.

## Decisions

1. **Scribe Videos' contract, not a new one.** A Books stretch is written as
   Scribe Videos writes a podcast episode's (Scribe issue #863, criterion
   17): on every recording live while it played, two
   `recordingRuntimeEvents` of kind `mediaPlay`, the start and the end. The
   payload is the bytes Scribe Videos writes, tested against Scribe's shared
   fixture, with `kind` `audiobook`, `mediaKey` `audiobook:<rendition id>`,
   the title, its authors as `showTitle`, `player`
   `books.pisspoursoftware.xyz`, and `source` `books`. Scribe's timeline
   already reads it (`RuntimeMediaPlay`); no schema or rules change.
2. **Stable ids.** The stretch is
   `stableUUID("books-stretch|<media key>|<started at ms>")`, its play on a
   recording `stableUUID("media-play|<stretch>|<recording>")`, and the
   play's events `stableUUID("media-play-event|<play>|start")` and `|end`,
   ADR 0048's SHA-256 construction. A retry from any tab lands on the same
   rows, which the rules accept unchanged.
3. **The place and the moment come from the audio.** `ReachedPlace` and the
   Transcript Player's `Advanced` carry `wallClockMs`, stamped when the audio
   reported the second, so a stretch's media second and wall time are one
   observation: 12:03 into the book at 15:20:03.
4. **The stretch is Model state.** The loaded title keeps Quiet, Starting
   (under 3 s), or Begun. The first second heard opens one; 3 s in it
   begins; a pause, a failed file, a skip or a jump of more than 2 s from
   where the clock and the speed put it, a new speed, another title, or the
   end of the book ends it. These are Scribe Videos' thresholds.
5. **Reporting is a Command to a service.** `ReportStretch` asks the
   `ScribeTimeline` service; the Instant one queries the person's
   recordings from the 36 h before the stretch, places it on each one's
   clock through its capture gaps (the YouTube companion's `clock.ts`, case
   for case), and writes one transaction. A refusal is kept and sent again
   with the next report, oldest first.
6. **Whose recording.** His recordings belong to his Apple sign-in; Books
   signs in with his email. Both are members of one account link (Scribe ADR
   0024), so Books places stretches on every member's recordings and writes
   each event with the recording's own owner, which the rules allow a member.
7. **The cover is the public one.** Scribe's app has no Cloudflare Access
   login, so the artwork is Books' public cover,
   `https://books.pisspoursoftware.xyz/books/a-new-earth/cover`, already
   served to link previews.

## Not done here

- A stretch a closed tab left open keeps only its start. Ending it on the
  next load at the title's last saved place is the next slice.
- Scribe's row still says "Open in Scribe Videos" for a book until Scribe
  learns the Books source; that change is in Scribe, not here.
