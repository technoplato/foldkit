import { Option } from 'effect'
import { Scene } from 'foldkit'
import { LoadedCatalog, seedIdeas, update } from 'ideas-core-example'
import { describe, test } from 'vitest'

import { view } from './index.js'

const loadedModel = {
  catalog: LoadedCatalog.make({ ideas: seedIdeas }),
  query: '',
  selectedId: Option.none(),
  source: 'Instant' as const,
}

describe('view', () => {
  test('renders the Knophy ideas heading and seed titles', () => {
    Scene.scene(
      { update, view },
      Scene.with(loadedModel),
      Scene.expect(Scene.text('Knophy ideas')).toExist(),
      Scene.expect(
        Scene.text('One timeline for books and audiobooks'),
      ).toExist(),
    )
  })
})
