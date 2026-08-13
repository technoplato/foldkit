#!/usr/bin/env node
import { Effect } from "effect"

import { NodeRuntime, NodeServices } from "@effect/platform-node"

import { runHeadless } from "./host.js"

runHeadless().pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
