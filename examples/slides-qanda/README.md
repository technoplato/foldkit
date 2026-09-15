# Slides Q&A

Glanceable interview slides. One question per URL. Paste anywhere to answer. The answer lands on disk next to that URL.

Agents: read `skill.md` before you write or ask a question.

## Run

```sh
pnpm --filter slides-qanda-example dev
```

Open `/q/01`. Arrow keys, `j` / `k`, or swipe move between slides. Press `e`
to read propositions on the current card. Explore is in the URL, for
example `/q/04h?filter=Unanswered&explore=lock-in-vs-surface`. Left and
right walk those screens and update the `explore` query. Leave with `e`
to drop it. Paste on an explore screen is feedback for the whole explorer
on that card, not one step. After a save, paste again to add a note. The
first verbatim stays. File:

`examples/slides-qanda/answers/01.json`

## Deck JSON

Slides are not hardcoded. Edit `public/deck.json`, or paste a whole deck JSON on the page (writes `public/deck.json`).

```json
{
  "title": "DEATH",
  "roots": [
    {
      "id": "01",
      "title": "WHO PLAYS?",
      "mapLines": ["Alice pays. Agents write.", "Dave pokes."],
      "story": "Alice pays. Dave pokes. Eve blogs. Eve scores 0.",
      "question": "Is this the game?",
      "options": [
        { "letter": "A", "text": "Yes. Pay, write, READY, poke." },
        { "letter": "B", "text": "Skip pay." },
        { "letter": "C", "text": "No contest." }
      ],
      "prompt": "Paste A, B, C, or a sentence."
    }
  ]
}
```

URL `/q/<id>` matches `roots[].id` or a nested follow-up id. Keep each slide short enough to see at a glance. No scroll.
