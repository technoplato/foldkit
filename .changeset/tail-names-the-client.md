---
'foldkit': minor
---

A log row now says which client a Message was pressed on when it was sent on behalf of a client on another Host. The runtime writes `client` on the row, that Host's printed name, beside `from`, the Processor that wrote it: a key a `books tui` view sent to the CLI daemon is written `{ from: 'cli-fdb5a3a8', client: 'tui' }`. `formatTailRow` names that client, so the tail prints `TUI` for that key where it printed `CLI`. A row that names no client shows the Processor's own Host. `clientHostOf(source)` reads the client from a transition's source.

`followProgramTail(engine, messageSchema)` is the tail as a Stream of its lines, starting with the last ten rows the engine holds when the view follows, for a Background Processor to serve as a topic.

`@foldkit/instant` stores the columns its log has and no others, so a row kept on Instant does not keep `client` until that log has a column for it.
