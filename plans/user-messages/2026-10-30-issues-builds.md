# Issues show their build jobs | 2026-10-30

Scribe issue #1412 (https://issues.pisspoursoftware.xyz/issues/1412).

Michael, typed in the Claude chat on 2026-10-30:

> is there a way to incorporate instant in there so that instant logs are different things that are building, we can kind of track all of our in-progress work within the scribe schema.

> I like the idea of having the issues add this kind of build information to the schema for Scribe so that we can always query it with one tool.

The Scribe side (its ADR 0104) makes every job its build script runs a `buildJobs` row in Scribe's main Instant app, with the job's state (queued, running, passed, failed, stalled, or cancelled), the machine and slot it ran on, whether the slot's build cache was warm, the Issue number it works for, the agent that queued it, and its times and exit code. The session that built it asked the `issues` command for:

1. `issues show <n>` lists the Issue's newest 10 build jobs after the Now working and Work in progress blocks, newest first, one line each: when it was queued (local time), its state, where it ran, its label, its exit code, how long it ran and waited, and its agent;
2. the same rows under a `builds` key in `issues show --json`;
3. a second, read-only query to Scribe's app with its own credentials, bounded at 5 seconds, so a missing credential, a refused query, or a slow answer prints one line saying the builds are not shown and why, and `issues show` still succeeds.
