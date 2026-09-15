---
name: slides-qanda
description: >
  Run the glanceable interview in examples/slides-qanda with Michael.
  Use when writing or editing deck.json cards, asking the next slide in
  chat, folding a saved answer, or adding a follow-up. Do not use for
  Foldkit library work or for dumping a question list.
---

# Slides Q&A

This folder is a one-card-at-a-time interview. The human sees one URL.
They paste A, B, C, or a sentence. The stamp lands in `answers/<id>.json`
(gitignored). You write the card. You ask one question in chat. You fold
the answer after it is saved.

Read this file before you write a question.

## How to work here

1. Edit `public/deck.json`. Do not invent a second deck.
2. Chat asks **one** open card. Wait. Do not paste the rest of the list.
3. After `answers/<id>.json` gets a new stamp, write `cleaned`, then fold
   the same fact into `DEATH/qanda.md` if that interview is in play.
   Paste on `/sim` writes `answers/sim.json` (beat 1 feedback). A second
   paste appends `notes`. It does not lock a deck card.
4. Add a follow-up card only when the locked answer left a hole that
   blocks the next product rule. A restated A/B/C is not a follow-up.
   An implementation shape is not a follow-up.
5. Do not poke other agent PIDs. Mail stays in `DEATH/mailbox/` when
   this interview is DEATH.
6. `f` OPEN walks every unanswered card, including children. `f` FOLLOW
   walks unanswered children and opens the newest one.

## Voice: simple American Technical English

Write so a reader who has **only this card** can answer. No earlier
slide. No earlier chat. No nickname.

- Short sentences. US spelling (`behavior`, `license`, `canceled`).
- One idea per sentence. No stacked clauses.
- Define every term on this card. If you say "yield", say it means the
  submitted agents and scripts say they are done.
- Name people as labels, not jobs. Alice pays and submits a bundle. Her
  agents write the program. Dave is the published test list, not a
  person.
- Three options. A, B, and C. Each option is a rule the product can
  keep.
- Two or three map lines. One concrete story. One question.
- Glanceable. No scroll.

Do not use:

- Shorthand that points at another turn (`the cap`, `Run A`, `the wrap`)
- Jargon without a definition (`higher-order`, `functional vs meta`)
- Cute analogy, slang, or British spelling
- A question that only makes sense if you already know the domain

### Bad

> Which split do we lock? Visible facts versus new ability. The save
> path should not be rewritten.

A new reader cannot answer that.

### Good

> Alice paid twenty dollars. Her agents said they were done. The tests
> send show, then increment, increment, then show again. The second
> show must be two higher, or she loses that money.
>
> May she pay a new twenty dollars the same day?
>
> A. Yes. A new payment is a new attempt.
> B. No. One payment per calendar day.
> C. No. Version 1 allows one payment, then she is done.

## Card shape

Child ids (`04a`) belong to a parent hole. New roots use the next unused
number (`17`).

```json
{
  "id": "04a",
  "title": "WHAT ARE THE RUNGS?",
  "mapLines": [
    "One yield per submit.",
    "Claiming level N is scored through every earlier level."
  ],
  "story": "The submitted agents say they are done once. They claim a highest level. The tests then run every earlier level too.",
  "question": "What is the first scored ladder?",
  "options": [
    { "letter": "A", "text": "Show the number, then plus, then the same count on every device, then plus while offline." },
    { "letter": "B", "text": "Only show, plus, minus, and reset in version 1." },
    { "letter": "C", "text": "The submitter names their own rungs in the bundle." }
  ],
  "prompt": "Paste A, B, C, or a sentence.",
  "propositions": [
    {
      "id": "ios-expo",
      "title": "EXPO IOS",
      "file": "explore/04h/ios-expo.md"
    }
  ]
}
```

`propositions` is optional. Press **E** to read one screen at a time. The
URL carries the step, for example
`/q/04h?filter=Unanswered&explore=lock-in-vs-surface`. Left and right
then walk those screens and update `explore`. Paste on explore writes an
`explores` note for the whole card explorer. It does not lock the card.
Only a card-level A/B/C (or sentence) on `answers` closes OPEN. After a
lock or explore stamp exists, a second paste appends `notes` on that
stamp. It does not replace the first verbatim. OPEN still keys off
`answers` having at least one lock stamp.

After the card is on disk, ask that one question in chat. Do not audit
this skill in `qanda.md`.
