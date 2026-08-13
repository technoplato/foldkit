#!/usr/bin/env node
import { Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"

import { NodeRuntime, NodeServices } from "@effect/platform-node"

import { runCliOperation } from "./host.js"

const slugFlag = Flag.string("slug").pipe(
  Flag.optional,
  Flag.withDescription("Idea slug to show"),
)

const list = Command.make("list", {}, () =>
  runCliOperation("List", Option.none()),
).pipe(Command.withDescription("Print every Knophy idea slug and title"))

const show = Command.make("show", { maybeSlug: slugFlag }, ({ maybeSlug }) =>
  runCliOperation("Show", maybeSlug),
).pipe(Command.withDescription("Print one idea by slug"))

const ideas = Command.make("foldkit-ideas").pipe(
  Command.withSubcommands([list, show]),
)

Command.run(ideas, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
