---
name: foldkit-debugging
description: Find out what a running Foldkit Program did from its own trace. Use when something is slow, a press seems to do nothing, two devices are out of step, a Message did not arrive, a screen repaints too often, or a store sends too much. Covers where each client keeps its trace, the `foldkit telemetry` summary, reading two devices' traces side by side to say whether a press on one reached the other and when, the heaviest Messages, and what to fix in the core instead of the app.
---

# Foldkit Debugging

A running Program records what it did: every Message and where it came from,
every Command, every paint, every Subscription that started or failed, and,
when it is synced, what its sync runtime did with each row. Read that before
guessing. Fix what it shows in the core or the adapter that owns it, never by
adding a special case to one app.

## Where each client keeps its trace

`Telemetry.attach(handle, { app, sink })` is the one line a host adds where it
starts the Program. The sink decides where the lines go:

- A terminal host writes
  `~/Library/Logs/foldkit/telemetry/<app>-<surface>.ndjson` (`fileSink()`),
  one file per surface: `books-terminal-cli.ndjson`.
- A web page sends its lines to the endpoint its host serves, which writes
  `<app>-web-react.ndjson` beside the terminal's.
- A phone has no place of its own. `@foldkit/react-native/telemetry` writes
  each line to the console with the mark `foldkit-telemetry `, and the machine
  that serves the build keeps the console. Take the marked lines out of
  Metro's log into a file:

  ```sh
  grep -o 'foldkit-telemetry {.*' metro.log | sed 's/^foldkit-telemetry //' > books-mobile-ios.ndjson
  ```

Every line is one JSON event with `at`, `session`, `app` and `surface`.
Payloads are redacted by the same policy on every client.

## Start with the summary

```sh
foldkit telemetry books --since 30m
```

It reads every `books-*.ndjson` and prints, surface by surface: the busiest
Messages, the heaviest Messages, the slowest Commands, failures, update and
render durations, transitions a minute, Subscription restarts, each surface's
link, and crashes. `--surface`, `--from`, `--to`, `--rotated`, `--limit` and
`--json` narrow or reshape it.

## Two devices, side by side

Use this when a press on one device did not show on another, or showed late.

Each device's sync runtime writes `Synced` lines into its own file:

| kind               | written by                | says                                                  |
| ------------------ | ------------------------- | ----------------------------------------------------- |
| `WroteRow`         | the device that sent      | the store took the row; `link`, and `tookMs`          |
| `QueuedRow`        | the device that sent      | the row waits behind one that has not gone out        |
| `FailedToWriteRow` | the device that sent      | the store refused it; `cause` is the store's sentence |
| `ConfirmedRow`     | the device that sent      | the store sent the device's own row back              |
| `ReceivedRow`      | every other device        | it has the row; `from` is the Processor that wrote it |
| `DroppedRow`       | a device that got the row | it could not read the row; `cause` says why           |
| `RefusedRow`       | a device that got the row | its session's policy keeps the Message on its sender  |
| `LinkChanged`      | any device                | `Connecting`, `Connected`, `SignedIn` or `Offline`    |

`rowId` is the log row's id. It is the same in every device's file, so the
`WroteRow` in one file and the `ReceivedRow` with that `rowId` in another are
the same row. `message` is the Message's tag, never its payload.

1. Run the summary over both devices' files and the minutes in question. An
   app's name reads every file of that app in the telemetry folder; a path
   reads any file, such as the phone's:

   ```sh
   foldkit telemetry books ./books-mobile-ios.ndjson --from 2026-11-18T21:49:00Z --to 2026-11-18T21:53:00Z
   ```

2. Read **Deliveries**. Each row is one Message a device wrote, newest first:
   when it left, what it was, which surface wrote it, how the write ended,
   and what every other device did with it.

   ```text
   Deliveries
     sent                      message  from          link       reached
     2026-11-18T21:50:27.031Z  Pause    mobile-ios    delivered  terminal-cli after 240 ms
     2026-11-18T21:50:12.120Z  Play     terminal-cli  delivered  not seen by mobile-ios eeee0005
   ```

3. Decide from what the row says:
   - `after N ms`: it arrived. If the screen still did not change, the
     fault is after sync: find the `Transition` for `RemoteMessageReceived`
     at that time in the receiving file and read what the update did.
   - `link` is `queued`, `failed` or `offline`: it never left. Read the
     sender's **Link** rows and its `FailedToWriteRow` cause.
   - `not seen by`: the other device was running and never had it. Read that
     device's **Link** rows around the time: `Offline`, or `Connected` and
     never `SignedIn`, explains it. If its link was good, the row was
     written to a log that device does not read: compare the two sessions'
     program ids and Processors.
   - `dropped it`: the two devices run builds whose Messages differ.
   - `refused it`: the session's policy keeps that Message on the device
     that sent it; this is the mode working, not a fault.
   - `no other device was recording`: the other device's file is missing
     from the folder, or its build is older than the sync trace.

4. To follow one row by hand, search both files for its `rowId`.

A device's clock decides its `at`. Two devices a second apart show a row
arriving a second early or late; compare each device's own times first.

## Too slow, or too much

- **Heaviest Messages** ranks Messages by the bytes their payloads carried a
  minute. A Message near the top that arrives every few seconds carries a
  whole collection for one changed row. Send the change:
  `changedRows`, `rowChangesBetween` and `appliedRowChanges` from
  `foldkit/synchronization`.
- A picture that loads again with nothing changed has an address whose
  signature was renewed. Keep the address a client holds while it works:
  `keptAddress` from `foldkit/synchronization`.
- **Durations** separates the update from the paint. A slow update is the
  Program's; a slow paint is the painter's. `Rendered` lines name the screen
  that painted.
- **Transitions** a minute far above what a person can press is a
  Subscription or a clock; **Top Messages** names it.

## Rules

- Measure with the trace before and after a change, on the same steps, and
  say both numbers.
- Reproduce on a made-up library or a Memory sync engine before touching a
  person's own session.
- Fix it where it is owned: the sync runtime, the telemetry core, the
  painter, or the store adapter. An app gains it by taking the change.

## Source anchors

- `packages/foldkit/src/telemetry/`: events, `attach`, sinks, `summarize`,
  `formatSummary`, and the `foldkit telemetry` command.
- `packages/foldkit/src/runtime/syncTrace.ts` and `start.ts`: what a sync
  runtime says it did.
- `packages/foldkit/src/synchronization/`: row changes and kept addresses.
- `packages/react-native/src/telemetry/`: the phone's development trace.
