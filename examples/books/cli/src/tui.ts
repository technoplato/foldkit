#!/usr/bin/env node
/**
 * Books as a live terminal UI, the same as `books tui`: the player's
 * screen in this terminal, fitted to it, with the words being spoken and
 * the controls always in view. The arrows move between rows, Enter opens
 * one, `p` plays and pauses, `[` and `]` skip, `c` shows the contents,
 * `b` marks a bookmark, `?` opens the action menu, Escape goes back, and
 * `q` closes the view while the title plays on. This file must not import
 * Effect, Instant, or the Program, so it starts fast.
 */
import { showPlayerTui } from './view.js'

await showPlayerTui()
