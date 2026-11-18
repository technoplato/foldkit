---
'@foldkit/instant': minor
---

A program log can run on any Instant app, not only the shared project: `makeInstantCoreProgramLogTransport(database, app, { owner })` takes any Instant core client (`ProgramLogDatabase`), whatever its schema, and with `owner: 'SignedInUser'` stamps each row with the signed-in member's id as `ownerUserID`, for an app whose rules let each person read and write only their own rows. A write with no sign-in fails as a `SnapshotLogError` instead of writing an ownerless row. Pass it to `Instant({ transport })`.
