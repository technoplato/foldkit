# Reminders | Reminders V3 on Foldkit

Lists, smart lists, tags, sharing, and due dates on the same Instant rows as
the Reminders V3 Swift app, so both read and change the same reminders. One
Program in `core` holds the Model, the Catalog of Actions, update, the
screens, and every address; `react`, `cli`, and `opentui` only paint it and
route input back.

```
core/      the Program, the V3 store, the screens, the addresses
react/     the web window, a review fixture, and a screenshot script
cli/       reminders (one-shot commands) and reminders-tui
opentui/   reminders-opentui
scripts/   with-reminders-env and with-reminders-access
```

## The data

The store reads and writes Reminders V3's own entities, the way the Swift
Messages write them:

| V3 entity              | In the Program                                                  |
| ---------------------- | --------------------------------------------------------------- |
| `$users`               | `Member`: the signed-in person and everyone they share with     |
| `remindersLists`       | `ReminderList`: title, color, position, owner, readers, writers |
| `reminders`            | `Reminder`: title, notes, done, flag, due date, priority 1 to 3 |
| `tags`                 | `Tag`: one title, unique across the app as in V3                |
| `v3_shares`            | `Share`: a list's share, with its memberships                   |
| `v3_share_memberships` | `Membership`: one person, `Reader` or `Writer`, until revoked   |

`core/src/instantSchema.ts` and `core/src/instantPerms.ts` mirror V3's schema
and rules, pinned by `instantSchema.test.ts`, beside Foldkit's owner-scoped
`programMessage` log. Every change goes to the store as a Command, such as
`InsertReminder` or `UpdateDue`, and every device reads the board back. The
log keeps only the Catalog Actions a person pressed.

## Every place is an address

Every page, Sheet, and question has an address, the address bar follows it,
and every row is a link to the page it opens:

```
/reminders                                     home: search, smart lists, lists, tags
/reminders/today                               a smart list (scheduled, all, flagged, completed)
/reminders/lists/<list id>                     a list
/reminders/lists/<list id>/reminder/<id>       a reminder, above its list
/reminders/today/reminder/<id>                 the same reminder, opened from Today
/reminders/lists/<list id>/reminder/<id>/due   its due dates (also /priority and /move)
/reminders/lists/<list id>/details             a list's name and color (also /sharing and /sort)
/reminders/tags/errands                        every reminder tagged #errands
/reminders/search?search.query=milk            a search
/reminders/profile                             who is signed in, a tab
```

Share, `c` on a keyboard, sends the page on screen through the phone's share
sheet or copies it, a reminder always at its own list's address.

## Run it

Look at the web app without an Instant app, on a made-up board held in
memory:

```sh
pnpm --filter reminders-react-example fixture
# http://localhost:5224/fixture/?at=/reminders/today
```

`node scripts/screenshots.mjs <dir>` in `react/` shoots every screen and Sheet
from the fixture at 1280 and 390 wide, and checks adding, ticking, following a
row's link, choosing from a Sheet, dismissing one, sharing, the tabs, and
searching.

The live app runs only on an Instant app that has the V3 schema. There is no
default app: point `REMINDERS_ENV_FILE` at the env file of a dev app, never at
production, and push the schema and rules there first.

```sh
REMINDERS_ENV_FILE=~/path/to/dev.env pnpm --filter reminders-react-example dev
```

In a terminal, through your Cloudflare Access login:

```sh
pnpm --filter reminders-cli-example build
pnpm --filter reminders-cli-example reminders
pnpm --filter reminders-cli-example reminders -- --at /reminders/lists/<id> add-reminder Buy milk
pnpm --filter reminders-cli-example reminders -- complete <reminder id>
pnpm --filter reminders-cli-example reminders-tui
pnpm --filter reminders-opentui-example start
```

## Test it

```sh
pnpm --filter reminders-core-example test       # the Program, the store, the addresses
pnpm --filter reminders-cli-example test        # the commands on the made-up board
pnpm --filter reminders-opentui-example test    # a list and the due dates on OpenTUI
```
