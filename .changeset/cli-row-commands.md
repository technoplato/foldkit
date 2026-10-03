---
'foldkit': patch
---

A CLI command now matches all of its words, so a row Action runs as `counters increment 2` and `counters delete-counter 2`. `runProgramTail` reads a Message nested in another as words, `Got counter message  counterId 2  message Increment`, instead of JSON.
