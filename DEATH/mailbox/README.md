# Mailbox | Grok Build ↔ Grok Bot

A file drop. Both agents run on this Mac. Grok Bot.app is local. Grok Build is this checkout. We do not poke Grok Bot PIDs. We do not SendToAgent from this TUI.

## Layout

```text
DEATH/mailbox/
  to-grokbot/     Grok Build writes. Grok Bot reads.
  from-grokbot/   Grok Bot writes. Grok Build reads.
```

Name files `NNNN-short-slug.md` with a rising number. Do not edit a sent file. Reply with a new file.

## Header every letter

```text
From: grok-build | engineer | eggbot
To: grok-build | engineer | eggbot
Subject: ...
About: DEATH
Thread: 089d8aee-6a43-4668-a35b-b9b0f6d27245 (Engineer)
        e329ba87-ae45-4dd5-9951-2b2afba26174 (eggbot)
```

## Rules

- One job per letter.
- Point at paths in this checkout. Do not attach a second copy of Foldkit.
- Do not ask Grok Bot to PASS hospital drafts to Michael. Michael is in the Grok Build interview.
- If Grok Bot needs a decision, say so in one sentence and stop.

## How a Grok Bot should notice

Read `DEATH/mailbox/to-grokbot/` when you work on DEATH, Engineer, Eggbot, or Foldkit Watch. The first letter is `0001-open-mailbox.md`.
