import { Array, Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  AdmitParticipant,
  AnswerPhone,
  ArriveGuest,
  ArriveParticipant,
  ClickedAdmit,
  ClickedAnswerPhone,
  ClickedGoBack,
  ClickedInvitePhysician,
  ClickedJoinVideo,
  ClickedOpenHistory,
  ClickedOpenMeeting,
  ClickedPlacePhone,
  ClickedSimulateGuestWaiting,
  ClickedSimulateInbound,
  ClickedStartShare,
  ClickedSwitchPerson,
  ClickedToggleCaptions,
  LoadGraph,
  NoteRefusedVideo,
  OpenVideo,
  Participant,
  PersistWrites,
  PlacePhone,
  RefusedVideoAfterPhone,
  RingInbound,
  RoleAdvocate,
  ScreenDay,
  ScreenHistory,
  ScreenPreview,
  ScreenRoom,
  ScreenWaiting,
  ShareActive,
  ShareIdle,
  StartShare,
  SucceededGuestArrived,
  SucceededInboundRang,
  SucceededParticipantAdmitted,
  SucceededParticipantArrived,
  SucceededPersist,
  SucceededPhoneConnected,
  SucceededPhoneOpened,
  SucceededShareStarted,
  SucceededVideoOpened,
  VideoConnected,
  WaitPhoneConnected,
  advocateFromNumber,
  elenaFromNumber,
  guestAlexId,
  init,
  initialModel,
  isInRoom,
  isWaiting,
  meetingElenaPhoneId,
  meetingSamPastId,
  meetingSamVideoId,
  participantPriyaInvitedId,
  participantSamWaitingId,
  patientSamId,
  restore,
  update,
  waitingForMeeting,
} from './index.js'

const persistOk = () => Story.Command.resolve(PersistWrites, SucceededPersist())

const participantIds = (modelParticipants: typeof initialModel.participants) =>
  Array.map(modelParticipants, row => row.id)

describe('update', () => {
  test('init seeds today and loads the graph', () => {
    const [model, commands] = init()

    expect(model).toEqual(initialModel)
    expect(commands).toEqual([LoadGraph()])
    expect(
      participantIds(waitingForMeeting(model.participants, meetingSamVideoId)),
    ).toEqual([participantSamWaitingId])
  })

  test('restore preserves the Model', () => {
    expect(restore(initialModel)).toStrictEqual([initialModel, []])
  })

  test('history is the call list', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenHistory()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ScreenHistory())
      }),
      Story.message(ClickedGoBack()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(ScreenDay())
      }),
    )
  })

  test('opening the video meeting goes to preview', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenMeeting({ meetingId: meetingSamVideoId })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen).toEqual(
          ScreenPreview({ meetingId: meetingSamVideoId }),
        )
        expect(model.video._tag).toBe('VideoPreview')
      }),
    )
  })

  test('a patient opening the video meeting waits until admitted', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedSwitchPerson({ personId: patientSamId })),
      Story.Command.expectNone(),
      Story.message(ClickedOpenMeeting({ meetingId: meetingSamVideoId })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.sessionPersonId).toBe(patientSamId)
        expect(model.screen).toEqual(
          ScreenWaiting({ meetingId: meetingSamVideoId }),
        )
        expect(model.video._tag).toBe('VideoWaiting')
      }),
    )
  })

  test('joining video opens the room and keeps the waiting patient', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenMeeting({ meetingId: meetingSamVideoId })),
      Story.Command.expectNone(),
      Story.message(ClickedJoinVideo({ meetingId: meetingSamVideoId })),
      Story.Command.resolve(
        OpenVideo,
        SucceededVideoOpened({
          meetingId: meetingSamVideoId,
          callId: 'call-video-sam',
          openedAt: 10,
          connectedAt: 11,
        }),
      ),
      persistOk(),
      Story.model(model => {
        expect(model.screen).toEqual(
          ScreenRoom({ meetingId: meetingSamVideoId }),
        )
        expect(model.video).toEqual(
          VideoConnected({
            meetingId: meetingSamVideoId,
            share: ShareIdle(),
          }),
        )
        expect(
          Array.some(model.calls, call => call.id === 'call-video-sam'),
        ).toBe(true)
        expect(
          Option.exists(
            Array.findFirst(
              model.participants,
              row => row.id === participantSamWaitingId,
            ),
            isWaiting,
          ),
        ).toBe(true)
      }),
    )
  })

  test('admitting the waiting patient puts them in the room', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedAdmit({ participantId: participantSamWaitingId })),
      Story.Command.resolve(
        AdmitParticipant,
        SucceededParticipantAdmitted({
          participantId: participantSamWaitingId,
          admittedAt: 20,
        }),
      ),
      persistOk(),
      Story.model(model => {
        expect(
          Option.exists(
            Array.findFirst(
              model.participants,
              row => row.id === participantSamWaitingId,
            ),
            isInRoom,
          ),
        ).toBe(true)
      }),
    )
  })

  test('simulating a guest puts them in the waiting room', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(
        ClickedSimulateGuestWaiting({ meetingId: meetingSamVideoId }),
      ),
      Story.Command.resolve(
        ArriveGuest,
        SucceededGuestArrived({
          participant: Participant.make({
            id: 'participant-alex-demo',
            meetingId: meetingSamVideoId,
            personId: guestAlexId,
            role: RoleAdvocate(),
            invitedAt: 30,
            maybeArrivedAt: Option.some(31),
            maybeAdmittedAt: Option.none(),
            maybeLeftAt: Option.none(),
            maybeFailedAt: Option.none(),
          }),
        }),
      ),
      persistOk(),
      Story.model(model => {
        expect(
          Option.exists(
            Array.findFirst(
              model.participants,
              row => row.personId === guestAlexId,
            ),
            isWaiting,
          ),
        ).toBe(true)
      }),
    )
  })

  test('physician arriving uses the existing participant row', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedInvitePhysician({ meetingId: meetingSamVideoId })),
      Story.Command.resolve(
        ArriveParticipant,
        SucceededParticipantArrived({
          participantId: participantPriyaInvitedId,
          arrivedAt: 40,
        }),
      ),
      persistOk(),
      Story.model(model => {
        expect(
          Option.exists(
            Array.findFirst(
              model.participants,
              row => row.id === participantPriyaInvitedId,
            ),
            isWaiting,
          ),
        ).toBe(true)
      }),
    )
  })

  test('phone can connect while video stays up', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenMeeting({ meetingId: meetingSamVideoId })),
      Story.Command.expectNone(),
      Story.message(ClickedJoinVideo({ meetingId: meetingSamVideoId })),
      Story.Command.resolve(
        OpenVideo,
        SucceededVideoOpened({
          meetingId: meetingSamVideoId,
          callId: 'call-video-sam',
          openedAt: 10,
          connectedAt: 11,
        }),
      ),
      persistOk(),
      Story.message(ClickedPlacePhone({ meetingId: meetingSamVideoId })),
      Story.Command.resolve(
        PlacePhone,
        SucceededPhoneOpened({
          meetingId: meetingSamVideoId,
          callId: 'call-phone-sam',
          fromNumber: advocateFromNumber,
          openedAt: 12,
        }),
      ),
      persistOk(),
      Story.Command.resolve(
        WaitPhoneConnected,
        SucceededPhoneConnected({ callId: 'call-phone-sam', connectedAt: 13 }),
      ),
      persistOk(),
      Story.model(model => {
        expect(model.video._tag).toBe('VideoConnected')
        expect(model.phone._tag).toBe('PhoneConnected')
        expect(
          Array.length(
            Array.filter(
              model.calls,
              call => call.meetingId === meetingSamVideoId,
            ),
          ),
        ).toBe(2)
      }),
    )
  })

  test('video is refused after a phone-started meeting', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenMeeting({ meetingId: meetingElenaPhoneId })),
      Story.Command.resolve(
        PlacePhone,
        SucceededPhoneOpened({
          meetingId: meetingElenaPhoneId,
          callId: 'call-phone-elena',
          fromNumber: advocateFromNumber,
          openedAt: 50,
        }),
      ),
      persistOk(),
      Story.Command.resolve(
        WaitPhoneConnected,
        SucceededPhoneConnected({
          callId: 'call-phone-elena',
          connectedAt: 51,
        }),
      ),
      persistOk(),
      Story.message(ClickedJoinVideo({ meetingId: meetingElenaPhoneId })),
      Story.Command.resolve(
        NoteRefusedVideo,
        RefusedVideoAfterPhone({ meetingId: meetingElenaPhoneId, at: 52 }),
      ),
      Story.model(model => {
        expect(model.video._tag).toBe('VideoIdle')
        expect(
          Option.exists(Array.head(model.trace), row =>
            row.label.includes('Video is not allowed'),
          ),
        ).toBe(true)
      }),
    )
  })

  test('inbound ring then answer connects the advocate', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedSimulateInbound()),
      Story.Command.resolve(
        RingInbound,
        SucceededInboundRang({
          meetingId: meetingElenaPhoneId,
          callId: 'call-in-elena',
          fromNumber: elenaFromNumber,
          openedAt: 60,
        }),
      ),
      persistOk(),
      Story.model(model => {
        expect(model.phone._tag).toBe('PhoneRinging')
      }),
      Story.message(ClickedAnswerPhone()),
      Story.Command.resolve(
        AnswerPhone,
        SucceededPhoneConnected({ callId: 'call-in-elena', connectedAt: 61 }),
      ),
      persistOk(),
      Story.model(model => {
        expect(model.phone._tag).toBe('PhoneConnected')
      }),
    )
  })

  test('share nests under video connected', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedStartShare()),
      Story.Command.expectNone(),
      Story.message(ClickedOpenMeeting({ meetingId: meetingSamVideoId })),
      Story.Command.expectNone(),
      Story.message(ClickedJoinVideo({ meetingId: meetingSamVideoId })),
      Story.Command.resolve(
        OpenVideo,
        SucceededVideoOpened({
          meetingId: meetingSamVideoId,
          callId: 'call-video-sam',
          openedAt: 70,
          connectedAt: 71,
        }),
      ),
      persistOk(),
      Story.message(ClickedStartShare()),
      Story.Command.resolve(
        StartShare,
        SucceededShareStarted({ meetingId: meetingSamVideoId, at: 72 }),
      ),
      Story.model(model => {
        expect(model.video).toEqual(
          VideoConnected({
            meetingId: meetingSamVideoId,
            share: ShareActive(),
          }),
        )
      }),
    )
  })

  test('finished meetings open notes from the day list', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedOpenMeeting({ meetingId: meetingSamPastId })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.screen._tag).toBe('ScreenNotes')
      }),
    )
  })

  test('captions toggle is local session state', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedToggleCaptions()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.isCaptionsOn).toBe(true)
      }),
    )
  })
})
