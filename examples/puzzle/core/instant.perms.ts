/**
 * Puzzle tape/message rules only.
 * Do not `instant-cli push perms` from this tree onto the shared
 * Knophy Instant demo app. That push would replace ideas and /dir rules.
 */
export { InstantPuzzleSnapshotLogPermissions as default } from './src/instantSchema.js'
