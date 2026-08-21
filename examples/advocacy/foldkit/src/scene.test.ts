import {
  OpenVideo,
  PersistWrites,
  SucceededPersist,
  SucceededVideoOpened,
  initialModel,
  meetingSamVideoId,
  update,
} from 'advocacy-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './index.js'

describe('view', () => {
  test('renders today meetings for Sam and Elena', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.expect(Scene.text('Today')).toExist(),
      Scene.expect(Scene.text('Sam Ortiz')).toExist(),
      Scene.expect(Scene.text('Elena Cho')).toExist(),
      Scene.expect(Scene.text('1 person in the waiting room')).toExist(),
      Scene.expect(Scene.text('Seed graph')).toExist(),
      Scene.expect(Scene.role('button', { name: 'As Jordan Hale' })).toExist(),
    )
  })

  test('history lists finished calls', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(Scene.role('button', { name: 'History' })),
      Scene.expect(Scene.text('Call history')).toExist(),
      Scene.expect(Scene.text('Sam Ortiz')).toExist(),
    )
  })

  test('joining the video meeting shows the waiting room', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel),
      Scene.click(
        Scene.role('button', { name: /1 person in the waiting room/ }),
      ),
      Scene.expect(Scene.text('Preview · Sam Ortiz')).toExist(),
      Scene.click(Scene.role('button', { name: 'Join meeting' })),
      Scene.Command.resolve(
        OpenVideo,
        SucceededVideoOpened({
          meetingId: meetingSamVideoId,
          callId: 'call-video-sam',
          openedAt: 10,
          connectedAt: 11,
        }),
      ),
      Scene.Command.resolve(PersistWrites, SucceededPersist()),
      Scene.expect(Scene.text('Waiting room')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Admit Sam Ortiz' })).toExist(),
    )
  })
})
