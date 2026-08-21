import { Schema as S } from 'effect'

// MODEL

/** One public Knophy idea note. */
export const Idea = S.Struct({
  body: S.String,
  id: S.String,
  index: S.Number,
  slug: S.String,
  title: S.String,
})
/** A public Knophy idea note. */
export type Idea = typeof Idea.Type

const idea = (
  id: string,
  index: number,
  slug: string,
  title: string,
  body: string,
): Idea => Idea.make({ body, id, index, slug, title })

/** Canonical seed catalog. Instant is the live source of truth. */
export const seedIdeas: ReadonlyArray<Idea> = [
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e501',
    1,
    'books-timeline',
    'One timeline for books and audiobooks',
    'Attributed words sit on one shared playback and read position. Instant-first links keep the same place across packaging.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e502',
    2,
    'words-knophy',
    'words.knophy.com',
    'Stitched voice memos with a scannable word-level transcript. Remember the spot in the recording, not just the file.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e503',
    3,
    'foldkit-windows',
    'Derive the UI from the Foldkit domain',
    'Nested Foldkit programs are windows. The domain owns structure; presenters only render it.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e504',
    4,
    'gemma-iphone',
    'Run open-weight models on iPhone',
    'Gemma should run on-device. Phone-class inference is a product surface, not a demo.',
  ),

  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e505',
    5,
    'stream-companion',
    'Stream Companion',
    'Hot-words plus QR pairing let a device hub take paired audio without a hunting UI.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e506',
    6,
    'account-transcription',
    'Account-scoped transcription access and sharing',
    'Transcription is an account capability. Sharing follows the account, not a sticky device secret.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e507',
    7,
    'device-class-icons',
    'Device-class icons for where a recording was made',
    'Phone, tablet, laptop, TV, watch, and Vision each have a class icon. The capture place is visible at a glance.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e508',
    8,
    'instant-audio-streams',
    'Instant streams for live audio chunks',
    'Live audio chunks travel on Instant streams. APIs should feel like TanStack Query: named, typed, and cacheable.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e509',
    9,
    'grok-session-index',
    'Cross-machine Grok session index over project folders',
    'Index Grok sessions across machines by project folder. Resume from a fast menu instead of hunting transcripts.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e50a',
    10,
    'first-mate-trace',
    'First Mate should not mangle Grok turns',
    'Trace user to sub-agent to First Mate. Turns stay intact so the chain of work is readable.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e50b',
    11,
    'sqlite-infinite-query',
    'Canonical SQLite-data-style fetch plus InfiniteQuery',
    'Treat InfiniteQuery as a property wrapper. The reducer owns paging, not an ad-hoc cache in the view.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e50c',
    12,
    'bundle-id-config',
    'Separate dev versus TestFlight and prod bundle IDs',
    'One config locus chooses the bundle ID. Dev, TestFlight, and prod stay distinct without scattered literals.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e50d',
    13,
    'debug-hud',
    'Collapsible floating debug HUD',
    'Build, commit, branch, and bundle sit in a HUD via Swift Sharing. Collapse it when the product needs the screen.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e50e',
    14,
    'apple-signin-mac',
    'Sign in with Apple on the Mac settings account UI',
    'The Mac settings account surface should offer Sign in with Apple. Same account story as the rest of the product.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e50f',
    15,
    'speech-analyzer',
    'Apple Speech Analyzer as the default transcriber',
    'Apple Speech Analyzer is the default. Deepgram is not the first path for on-device speech.',
  ),
  idea(
    '7c3a1b10-4e2f-4a91-8c01-a1b2c3d4e510',
    16,
    'axi-wrappers',
    'Agent-ergonomic axi wrappers',
    'Wrap gh, chrome-devtools, lavish, and quota so agents call them as tools instead of reconstructing flags.',
  ),
]
