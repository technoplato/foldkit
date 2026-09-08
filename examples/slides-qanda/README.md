# Slides Q&A

Glanceable interview slides. One question per URL. Paste anywhere to answer. The answer lands on disk next to that URL.

## Run

```sh
pnpm --filter slides-qanda-example dev
```

Open `/q/01`. Arrow keys, `j` / `k`, or swipe move between slides. Paste `A`, `B`, `C`, or a sentence. File:

`examples/slides-qanda/answers/01.md`

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

URL `/q/<id>` matches `slides[].id`. Keep each slide short enough to see at a glance. No scroll.
