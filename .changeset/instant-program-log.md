---
'@foldkit/instant': minor
---

Every app can sync through the one Instant project without sharing the Counter's rows. `Instant({ app, processor, instance, programLog: 'multiple-counters' })` writes each Message to the new `programMessage` entity as one row with its app, Program version, tag, and payload (`{ app: 'multiple-counters', programVersion: 1, tag: 'Decrement', payload: { counterId: 2 } }`), and reads back only that app's rows. `programLogEnvelope(app)` is the Effect Schema that checks each row's app, version, tag, and payload on the way in and out. A Node host's admin subscription now keeps `programMessage` rows, so OpenTUI and the TUI see live writes.
