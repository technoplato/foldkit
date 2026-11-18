import { Schema as S } from 'effect'

import * as Declaration from '../declaration/index.js'

// CONTROLS

const toggle = (description: string) =>
  S.optionalKey(S.Boolean.annotate({ description }))

/** `show`: the Program and its Actions. */
export const Show = Declaration.declare('Show', {
  what: 'Shows the screen and every Action, with what cannot be done now',
  why: 'To see where things stand and what can be asked for',
})

/** `menu open`: presents the action menu. */
export const OpenMenu = Declaration.declare('Open', {
  what: 'Presents the action menu',
  why: 'To see every Action offered now, as every other Client shows it',
})

/** `menu close`: dismisses the action menu. */
export const CloseMenu = Declaration.declare('Close', {
  what: 'Dismisses the action menu',
  why: 'The user is done with the menu',
})

/** `menu type <text>`: filters the action menu. */
export const TypeInMenu = Declaration.declare('Type', {
  what: 'Filters the action menu',
  why: 'To find an Action by a few of its letters',
  fields: {
    text: S.String.annotate({ description: 'The letters to filter by' }),
  },
  subject: 'text',
})

/** `menu next`: moves focus down the action menu. */
export const NextInMenu = Declaration.declare('Next', {
  what: 'Moves focus to the next row of the action menu',
  why: 'To reach an Action without typing its name',
})

/** `menu previous`: moves focus up the action menu. */
export const PreviousInMenu = Declaration.declare('Previous', {
  what: 'Moves focus to the row before in the action menu',
  why: 'To go back to an Action the focus passed',
})

/** `menu enter`: runs the focused row. */
export const EnterInMenu = Declaration.declare('Enter', {
  what: 'Runs the focused row of the action menu',
  why: 'To run the Action the focus is on',
})

/** `menu choose <action>`: chooses one Action from the menu. */
export const ChooseFromMenu = Declaration.declare('Choose', {
  what: 'Chooses one Action from the action menu',
  why: 'To run an Action the way a press on its menu row does',
  fields: {
    action: S.String.annotate({ description: 'The Action, by its command' }),
  },
  subject: 'action',
})

/** Everything the action menu takes, under `menu`. */
export const Menu = Declaration.group('Menu', {
  what: 'The action menu',
  children: [
    OpenMenu.declaration,
    CloseMenu.declaration,
    TypeInMenu.declaration,
    NextInMenu.declaration,
    PreviousInMenu.declaration,
    EnterInMenu.declaration,
    ChooseFromMenu.declaration,
  ],
})

/** `key <key>`: presses a key. */
export const Key = Declaration.declare('Key', {
  what: 'Presses a key, as a keyboard would',
  why: 'To use a shortcut an Action declares',
  fields: {
    key: S.String.annotate({ description: 'The key to press' }),
    meta: toggle('Holds the Command or Windows key'),
    ctrl: toggle('Holds the Control key'),
    shift: toggle('Holds the Shift key'),
  },
  subject: 'key',
})

/** `open <uri>`: goes to one of the Program's URIs. */
export const Open = Declaration.declare('Open', {
  what: 'Goes to one of the pages the Program has',
  why: 'To move to a page by its link',
  fields: {
    uri: S.String.annotate({
      description: 'The page, by its link',
      ...Declaration.link,
    }),
  },
  subject: 'uri',
})

/** `back`: goes back one screen. */
export const Back = Declaration.declare('Back', {
  what: 'Goes back one screen',
  why: 'To return to where the user was',
})

/** `where`: the current URI. */
export const Where = Declaration.declare('Where', {
  what: 'Shows the link to the page that is open',
  why: 'To copy the place, or to check it',
})

/** `watch`: repaints the screen as it changes. */
export const Watch = Declaration.declare('Watch', {
  what: 'Shows the screen again each time it changes, on any device',
  why: 'To see what another device does as it happens',
})

/** `follow [topic]`: prints a topic each time it changes. */
export const Follow = Declaration.declare('Follow', {
  what: 'Shows something again each time it changes, such as the screen',
  why: 'To keep an eye on it while doing something else',
  fields: {
    topic: S.optionalKey(S.String.annotate({ description: 'What to follow' })),
  },
  subject: 'topic',
})

/** `tail`: every event as it lands. */
export const Tail = Declaration.declare('Tail', {
  what: 'Shows every change as it lands, from every device',
  why: 'To see exactly what a press did',
})

/** `help`: the usage. */
export const Help = Declaration.declare('Help', {
  what: 'Shows every Action and control, each with a line to copy',
  why: 'To learn what can be asked for',
})

/**
 * The controls every Program's terminal has beside its Actions, declared
 * once. The usage `help` prints, each control's line and example, and
 * the flags the argv reader knows are read from these.
 */
export const programControls: ReadonlyArray<Declaration.Node> = [
  Show.declaration,
  Menu,
  Key.declaration,
  Open.declaration,
  Back.declaration,
  Where.declaration,
  Watch.declaration,
  Follow.declaration,
  Tail.declaration,
  Help.declaration,
]
