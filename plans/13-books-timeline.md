# Plan 13 | Books on Scribe's timeline

**Status:** Accepted. The owner asked for it on 2026-10-18 (issue #842,
criterion 3); his words are in
[user-messages/2026-10-18-books-timeline.md](user-messages/2026-10-18-books-timeline.md).

## What a person sees

- He plays A New Earth in Books from 12:03 while Scribe records. Three
  seconds in, the stretch begins and Books writes it; seconds later his
  recording's timeline shows "Listening to A New Earth" with the book's
  cover. When he pauses at 15:00, it shows "Listened to A New Earth", and
  opened, "Listened to A New Earth, 12:03–15:00 · 2 min 57 s".
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
8. **A recording is live by its heartbeat.** The recording device writes its
   duration every 5 s; a recording counts as capturing until 15 s after the
   wall time that duration reached (Scribe's `RecordingLiveness.liveWindow`).
   Its `activityKind` stamp does not count: a crash leaves `active` behind,
   and a playback on another device writes over it. A book heard at 21:00
   never lands on a recording that crashed at 18:00.
9. **Rows are written once.** A report reads which of its rows Instant has,
   places an end from the start already there, and writes only what is
   missing, so a retry never conflicts with a row that landed.
10. **A closed page's play is ended later.** Every 10 minutes from the
    shelf's arrival, Books finds its plays with a start and no end on the
    account's recordings of the last 36 h and ends each at the title's last
    save, as the page closing (Scribe reads "Books closed"). It leaves the
    play this page is playing and any title saved in the last minute, and
    claims only the first 3 s when no save came after the play or a later
    play of the title began.

## Verified

On 2026-10-18 at 21:43, while a recording was live on his iPhone, the
deployed Books played A New Earth from 1:47:20 for 19 s (headless Chrome,
muted). Its two rows landed on that recording, owned by his Apple sign-in:
the start at the recording's second 144.5, and the end at 163.6, 19.1 s
later, paused. Scribe on the Mac showed both, at 2:24 and 2:43, with Open in
Books.

| From                      | To                        | Took                                                                          |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| The first second of audio | The start row in Instant  | 10.6 s: the 3 s threshold, 7.0 s until the write left the page, 0.6 s to land |
| Pause                     | The end row in Instant    | 5 to 6 s                                                                      |
| Play                      | The first second of audio | 26.7 s, headless Chrome fetching the audio                                    |

Before a write, Books reads the recordings and the rows already written.
The check ran on a busy Mac (the player took 79 s to load), so those reads
and the audio's start ran slow; the 3 s threshold is the only fixed wait.

## Not done here

- Until Scribe's build 109, its compact timeline rows show a play's symbol
  instead of the cover, and an end says its length twice ("· 19 s · 19 s").
  The fix is on Scribe's main (857a829b4). Build 108 already names Books:
  "Open in Books", "Played in Books".
- A pause from the lock screen or a call pauses the audio without telling
  the player, so its stretch stays open until the audio moves again (the
  jump ends it at the last second heard) or the page closes (the next check
  ends it).
