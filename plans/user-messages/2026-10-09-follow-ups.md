# User messages | 2026-10-09 | Follow-ups to the plans

Three messages the owner sent after reading the first plans, saved verbatim in
the order they arrived. One redaction in each: the name of the client project
is replaced by `[client]`, because the owner decided (message 1) that it is
named nowhere in this repository. Everything else is as written or dictated.

## Message 1 | Decisions on the finance example

> Decision for the owner examples slash finance is going to live in this repository. But it's not going to reference [client] anywhere. And no, the generated skill is not going to be pushed to [client]'s S three.The goal of the generator is just to create the markdown for the Program similar to what is done currently for [client]'s web app and the skills directory. And you can see it's a mess of keeping things up to date with the web and the mobile. So, this is the solution, is this architecture?

Decisions taken from it: `examples/finance` lives in this repository; it
references no outside client anywhere; the generated skill is published
nowhere by this repository; the generator's one job is the Program's markdown.

## Message 2 | Sync engine, not database; declare and derive

> Generating the markdown from the program's declaration removes that copy entirely, and a byte check in CI makes it impossible to edit by hand. The copies that are not marked down in SQL functions at nightly job only stop drifting if they become projections of the same. What do you mean? The copies that are not marked down, SQL functions, a nightly job. What do you mean SQL functions and a nightly job? I think another one of my philosophies, and if you could record these philosophies, please, so you can reference back to them. Is that with the sync engine? We don't really care about SQL function. It's just we want like more of a sync engine-driven approach, um, like we have with uh with instant or um you know with super base, which I guess is still SQL. But um, then if we need to, we can go to a more uh Phoenix, what's it called, Phoenix? What's the Elm arc? Not Elm. Sorry. The Elixir. Is it Phoenix? I think it's Phoenix framework where you define your actions and schema, and then out of that falls the implementation details. So I think some kind of combination of that and this will be the solution there. Plan eight now says exactly that with your three decisions recorded. Okay, well, thank you.

This message is the source of `PRINCIPLES.md` principles 7 ("Sync engine, not
database") and 8 ("Declare actions and schema; the implementation falls out").
The Elixir pattern described, where attributes and actions are declared and
the data layer and API derive from them, is the Ash framework on Phoenix.

## Message 3 | Net worth as the proof, and the inputs inventory

> <!-- reply 2 -->
>
> > What I meant: the SQL functions and the nightly job are in the production finance app I reviewed, not in Foldkit. That app recomputes net worth in six places: the web hook, a mobile copy, an AI cache, a nightly cron that writes history rows, three Postgres functions that feed alerts and an admin leaderboard, and the skills' own SQL. Three of the six disagree. My sentence was saying the markdown generator fixes the markdown copy, but those other copies would still drift unless they stopped being hand-written.
>
> Well, that's why I was saying the net worth needs to be part of this architecture. And if it was, if it was part of the model and the events that accumulate into the model in order to update, and if that core business logic was shared and synchronized, that would basically prove my point, right?
>
> <!-- reply -->
>
> > Your philosophy makes that moot, and I've recorded it. With a sync-engine-driven design there are no SQL functions or jobs to keep in step. Net worth is one derived Model field folded from the log on every device, and history is a Model field a Subscription appends to once a day. Supabase is just the log store. I rewrote plan 08 and plan 06 to say exactly that and removed the "SQL consumer" framing.
>
> Ah, okay. As a human, when I read top to bottom, I don't see what you say down here before I respond. So, thank you.
>
> The question still stands of we have to interact with APIs in order to get the information about the stock prices, exchange rates, et cetera. And so I'm curious about all the things that are all the different dynamic rates that go to calculating the net worth. And let's create the complete list of all of the different independent variables, and then what's in each place based on a table and make some kind of pretty graphic that shows where we're missing what.

The inventory and graphic it asked for live outside the repository
(`~/Sync/audit/finance-net-worth-inputs-2026-10-09/`), because they name the
reviewed app's internals. Plan 08's "The independent variables" section is the
client-free result.
