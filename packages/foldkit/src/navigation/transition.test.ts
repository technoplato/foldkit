import { describe, expect, it } from 'vitest'

import {
  Counter,
  type Destination,
  menuEntry,
  model,
  navigation,
  sessionEntry,
} from '../test/apps/navigationCounter.js'
import { Link, NavigatedBack, OpenedUri } from './message.js'
import { stackAtRoot, stackWithEntries } from './structure.js'
import { applyMessage } from './transition.js'

describe('applyMessage', () => {
  it('adopts the parsed URI on OpenedUri and settles what the URI does not carry', () => {
    const current = model({ preferredFocus: 2 })
    expect(
      applyMessage(
        navigation,
        current,
        current.navigation,
        OpenedUri({ uri: '/counter/menu?menu.q=re', via: Link() }),
      ),
    ).toEqual(stackWithEntries<Destination>(Counter(), [menuEntry('re', 2)]))
  })

  it('truncates on NavigatedBack and keeps the entries beneath as they were', () => {
    const stack = stackWithEntries<Destination>(Counter(), [
      menuEntry('re', 1),
      sessionEntry,
    ])
    expect(
      applyMessage(
        navigation,
        model({ preferredFocus: 3 }),
        stack,
        NavigatedBack({ uri: '/counter/menu?menu.q=other' }),
      ),
    ).toEqual(stackWithEntries<Destination>(Counter(), [menuEntry('re', 1)]))
  })

  it('returns to the named entry, so an entry pushed mid-swipe is not the one popped', () => {
    const pushedDuringSwipe = stackWithEntries<Destination>(Counter(), [
      sessionEntry,
      menuEntry(''),
    ])
    expect(
      applyMessage(
        navigation,
        model(),
        pushedDuringSwipe,
        NavigatedBack({ uri: '/counter' }),
      ),
    ).toEqual(stackAtRoot<Destination>(Counter()))
  })

  it('adopts the URI on NavigatedBack when no entry is printed at it', () => {
    const stack = stackWithEntries<Destination>(Counter(), [menuEntry('re')])
    expect(
      applyMessage(
        navigation,
        model(),
        stack,
        NavigatedBack({ uri: '/counter/session' }),
      ),
    ).toEqual(stackWithEntries<Destination>(Counter(), [sessionEntry]))
  })
})
