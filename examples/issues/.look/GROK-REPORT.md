# Issues 245 — leftover + product filter

One Instant origin (issues.knophy.com). One `issuesScreen`. One product name set from live issue payloads + Casino. Did not invent a second tracker. Did not close 240-243. Did not bounce 5209/5210/5212/5215.

## CLI

`/Users/laptop/.local/bin/foldkit-issues` → `node /Users/laptop/Development/foldkit/examples/issues/cli/dist/entry.js`

Working (live Instant, 9:41 AM ET):

```
foldkit-issues comment 242 --summary "…"
foldkit-issues link 244 242
foldkit-issues status 242 Blocked
foldkit-issues show --product foldkit
foldkit-issues show --uri /issues/242
foldkit-issues show --uri /issues/244
foldkit-issues retarget 243 --product casino
```

Also: `show` / `file` / `run` / `log` (alias of comment). Tokens: `comment:…`, `link:<id>`, `status:Open|Blocked|Verify|Closed`, `product:foldkit`. Filter is `SelectedProductFilter` (Program message). CLI `show --product foldkit` paints Product filter chips then Current issues.

## PRODUCT NAMES FOUND (live catalog — not invented)

From Instant issue payloads / `product:` tokens after `show --product foldkit --verbose`:

| id                      | kind        | name                                                                                                |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| scribe                  | Application | Scribe                                                                                              |
| foldkit                 | Library     | Foldkit                                                                                             |
| instant-data-swift      | Library     | Instant Data Swift (also InstantSwiftData / Instant Swift Data on later issues)                     |
| ayutia                  | Application | AYUTIA (scored live debate / proof surface, issue 061)                                              |
| universal-software-shop | Application | Universal Software Shop (privacy-bounded proof challenge / participation economics, issues 060 064) |
| casino                  | Application | Casino (NEW — 243 retargeted off Foldkit)                                                           |

Also present on the live catalog (not invented, not requested as chrome): ACESS, Instant Tools Issue Tracker, Predictev GPT, Firstmate, DomainAsTree / PIS, SwiftAudioCapture, rust-instantdb, TCA Rust Port, Issue tracker.

Instant `instantToolsProducts` table cannot take string ids; catalog is derived from issue product payloads + Casino merged in. Filter chips are that live catalog, not hardcoded chrome.

## PAINT

- Public `https://issues.knophy.com` → Access **302** (OK).
- Loopback `curl -H "Host: issues.knophy.com" http://127.0.0.1:5198/` → **200**. Same for `/issues/242` and `/issues/244`.
- Host paints one `issuesScreen` (React `paintReact`, Foldkit `paintHtml`, CLI `formatModel`).
- Headless Chrome with Instant app id stays on "Starting Issue Tracker…" (hosted identity). Signed-in window + CLI/Program tree paint.
- Live `issuesScreen` after `product:foldkit`: chips All / Scribe / Instant Data Swift / Foldkit / AYUTIA / Casino / Universal Software Shop / …; **20 Foldkit cards; 0 Scribe cards**. 243 is Casino, not on Foldkit board.
- Evidence: `examples/issues/.look/PAINT-FOLDKIT-FILTER.txt`
- 242 Work log is outside details, newest first (9:34:37 AM ET leftover comment still there).

## LINKS

244 lists **240, 241, 242, 243** as Linked issues (`CatalogIssueReference` on `mentions.related`). Tokens `open:240`… open those Issues. Details blob left in place.

## LEFTOVER

Control is **Open | Blocked | Verify | Closed**. Stored `IssueStatus` stays the wide union. Verify ↔ `VerificationNeeded`. Kind Idea | Task | Bug | Improvement from `issueType`. Inbox stays `TriageCandidate`. Leftovers = unfinished (not Closed) child Issues. No auto-close. Michael closes.

Did not close:

- 240 Open (Foldkit)
- 241 Open (Foldkit)
- 242 Blocked (Foldkit)
- 243 Blocked (Casino)

244 Open. 245 Open. 240-243 omit Closed in leftover chrome.

## GROK_WRAPPER

`/Users/laptop/.local/bin/run-issues-245-grok` → `--prompt-file /Users/laptop/.config/knophy-host/issues-245-jira.prompt`

Also `run-*-grok` / `--prompt-file`. One issues origin.

## PREVIEW

issues-react-example built (with `VITE_INSTANT_APP_ID`) to `/Users/laptop/Library/Application Support/KnophyIssues/site`. Kickstarted **5198** only. 5209/5210/5212/5215 still LISTEN.
