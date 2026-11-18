/**
 * What the Books terminal does itself, declared once: each command's
 * name, what it does, why the user would want that, and its parameters
 * as Effect Schema fields. The usage, the help, the flags the argv
 * reader knows, and the refusals are all read from these values; no
 * usage line is typed anywhere else in this folder. The Program's own
 * Actions are declared in the Books core and reach the terminal through
 * `Catalog.declarationsOf`.
 */
import { catalog } from 'books-core-example'
import { Effect, Schema as S } from 'effect'
import { Catalog } from 'foldkit'
import * as Declaration from 'foldkit/declaration'

const Count = S.Int.check(S.isGreaterThanOrEqualTo(0))

const json = S.optionalKey(
  S.Boolean.annotate({
    description: 'Writes it as JSON, for another program to read',
  }),
)

const before = S.optionalKey(
  Count.annotate({
    description: 'How many paragraphs to show before the one being read',
  }),
)

const after = S.optionalKey(
  Count.annotate({
    description: 'How many paragraphs to show after the one being read',
  }),
)

// VIEW

/** `books help`: what is playing and what to run next, or how to start. */
export const Help = Declaration.declare('Help', {
  what: 'Says what is playing and what the user can ask for next',
  why: 'To see where things stand, or to learn one command',
  fields: {
    command: S.optionalKey(
      S.String.annotate({ description: 'A command to explain in full' }),
    ),
  },
  subject: 'command',
  examples: [
    { given: { command: 'search' }, what: 'Everything about one command' },
  ],
})

/** `books devices`: the audio outputs, by number. */
export const Devices = Declaration.declare('Devices', {
  what: 'Lists this Mac’s audio outputs, each with its number',
  why: 'To choose which speakers or headphones a book plays on',
})

/** `books login`: signs in. */
export const Login = Declaration.declare('Login', {
  aliases: ['SignIn'],
  what: 'Signs the user in to their library',
  why: 'To open the library again after the sign-in ran out',
  triggers: [{ name: 'OpenSignInPage' }],
})

/** `books stop`: pauses, saves the place, and ends the player. */
export const Stop = Declaration.declare('Stop', {
  what: 'Pauses, saves the place, and ends the player',
  why: 'To finish listening here',
  triggers: [{ name: 'EndPlayer' }],
})

/** `books tui`: the player, live, in the terminal. */
export const Tui = Declaration.declare('Tui', {
  what: 'Opens the player live in this terminal',
  why: 'To watch and steer the book without leaving the terminal',
})

/** `books follow`: prints something each time it changes. */
export const Follow = Declaration.declare('Follow', {
  what: 'Shows the words being read, moving with each word',
  why: 'To read along while the book plays',
  fields: {
    topic: S.Literals(['words', 'screen'])
      .annotate({ description: 'What to follow' })
      .pipe(S.withDecodingDefaultKey(Effect.succeed('words' as const))),
    eachWord: S.optionalKey(
      S.Boolean.annotate({
        description: 'Moves with every word, as it does unless told otherwise',
      }),
    ),
    paragraphs: S.optionalKey(
      S.Boolean.annotate({
        description: 'Follows by the paragraph alone, without each word',
      }),
    ),
    json,
    before,
    after,
  },
  subject: 'topic',
  examples: [
    { given: {}, what: 'The words as they are read' },
    { given: { topic: 'screen' }, what: 'The page the player is on' },
    {
      given: { topic: 'words', json: true },
      what: 'The words as lines of JSON',
    },
  ],
})

/** `books watch`: repaints the library as it changes. */
export const Watch = Declaration.declare('Watch', {
  what: 'Shows the library again each time it changes, on any device',
  why: 'To see an import or another device at work',
})

/** `books tail`: every Message as it lands. */
export const Tail = Declaration.declare('Tail', {
  what: 'Shows every change as it lands, from every device',
  why: 'To see exactly what a press did',
})

// PLAYER

/** `books words`: the paragraph being read, with those around it. */
export const Words = Declaration.declare('Words', {
  what: 'Shows the paragraph being read, with the paragraphs around it',
  why: 'To see the words of what the user is hearing',
  fields: { before, after, json },
  examples: [
    { given: {}, what: 'The paragraph being read, one before and one after' },
    { given: { before: 0, after: 3 }, what: 'None before and three after' },
  ],
})

/** `books bookmarks`: this title's bookmarks. */
export const Bookmarks = Declaration.declare('Bookmarks', {
  what: 'Lists the bookmarks of the title in the player',
  why: 'To find a place the user marked',
  fields: { json },
})

/** `books bookmark`: marks the word being spoken. */
export const Bookmark = Declaration.declare('Bookmark', {
  what: 'Marks the word being spoken, with a note when one is given',
  why: 'To come back to this place later',
  fields: {
    note: S.optionalKey(
      S.String.annotate({ description: 'A note to keep with the bookmark' }),
    ),
  },
  subject: 'note',
  triggers: [{ name: 'WriteLibrary' }],
  examples: [
    { given: {}, what: 'Marks the word being spoken' },
    { given: { note: 'the lamp again' }, what: 'Marks it with a note' },
  ],
})

/** `books link`: the link to the word being read. */
export const Link = Declaration.declare('Link', {
  what: 'Shows the whole link to the word being read',
  why: 'To send someone to this exact place, or to return to it',
})

/** `books search`: where words are spoken. */
export const Search = Declaration.declare('Search', {
  aliases: ['Find'],
  what: 'Finds where words are spoken, each with its link',
  why: 'To get back to a passage the user remembers a few words of',
  fields: {
    words: S.String.annotate({ description: 'The words to look for' }),
    json,
  },
  subject: 'words',
  examples: [
    {
      given: { words: 'lit at dusk' },
      what: 'Every place those words are spoken',
    },
  ],
})

/** `books play-from`: plays from a word a link names, or from a time. */
export const PlayFrom = Declaration.declare('PlayFrom', {
  what: 'Plays from the word a link names, or from a time',
  why: 'To hear a place the user has a link or a time for',
  fields: {
    place: S.String.annotate({
      description: 'A link to a word, or a time in the title',
      ...Declaration.place,
    }),
  },
  subject: 'place',
  examples: [
    { given: { place: '12m03s' }, what: 'Twelve minutes and three seconds in' },
  ],
})

/** `books open`: goes to a page and shows it. */
export const Open = Declaration.declare('Open', {
  what: 'Goes to a page of the library and shows it',
  why: 'To look at the library, a title, or the word a link names',
  fields: {
    page: S.String.annotate({
      description: 'The page, by its link',
      ...Declaration.link,
    }),
  },
  subject: 'page',
  examples: [{ given: { page: '/books' }, what: 'The library' }],
})

/** `books back`: goes back one page. */
export const Back = Declaration.declare('Back', {
  what: 'Goes back one page and shows it',
  why: 'To return to where the user was',
})

/** `books screen`: the page the player is on. */
export const Screen = Declaration.declare('Screen', {
  what: 'Shows the page the player is on',
  why: 'To see what any other device showing this player sees',
})

/** `books actions`: every Action, with whether it can be asked for now. */
export const Actions = Declaration.declare('Actions', {
  what: 'Lists everything the library can be asked to do',
  why: 'To find a command, or to hand the whole list to a program',
  fields: { json },
  examples: [
    { given: {}, what: 'Every Action with its keys' },
    { given: { json: true }, what: 'The same as tools a program can read' },
  ],
})

/** The commands this terminal answers without a player. */
export const viewDeclared = [
  Help,
  Devices,
  Login,
  Stop,
  Tui,
  Follow,
  Watch,
  Tail,
] as const

/** The commands the player answers beside the Program's own Actions. */
export const playerDeclared = [
  Words,
  Bookmarks,
  Bookmark,
  Link,
  Search,
  PlayFrom,
  Open,
  Back,
  Screen,
  Actions,
] as const

/**
 * What every command takes: the audio output the player uses when this
 * command is the one that starts it, and whether to paint in color.
 */
export const everywhere = Declaration.parametersOfFields({
  device: S.optionalKey(
    S.Int.annotate({
      description:
        'The audio output to play on, by its number, when this command starts the player',
    }),
  ),
  color: S.optionalKey(
    S.Boolean.annotate({
      description: 'Paints for a terminal that shows color',
    }),
  ),
  terminalGround: S.optionalKey(
    S.String.annotate({
      description:
        'The ground the terminal says it has, as its COLORFGBG says it, so colors read on it',
    }),
  ),
})

/** Everything this terminal declares itself, as plain data. */
export const hostTree: ReadonlyArray<Declaration.Node> = [
  ...viewDeclared,
  ...playerDeclared,
].map(declared => declared.declaration)

/**
 * The commands a first read of `books` shows, in order: a choice of
 * which declarations to lead with, by reference. Each line is derived.
 */
export const startHere: ReadonlyArray<Declaration.Declaration> = [
  ...Catalog.declarationsOf(catalog).filter(
    declaration => declaration.name === 'Listen',
  ),
  Open.declaration,
  Tui.declaration,
  Search.declaration,
  Follow.declaration,
  Link.declaration,
  PlayFrom.declaration,
  Devices.declaration,
  Login.declaration,
  Stop.declaration,
]

/** The Program's Actions as plain declarations, needing no Model. */
export const programTree: ReadonlyArray<Declaration.Node> =
  Catalog.declarationsOf(catalog)
