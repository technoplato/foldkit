import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Chat, Graph, Meeting, Participant, PhoneNumber } from './model.js'

export const ClickedOpenDay = m('ClickedOpenDay')
export const ClickedOpenHistory = m('ClickedOpenHistory')
export const ClickedGoBack = m('ClickedGoBack')
export const ClickedOpenMeeting = m('ClickedOpenMeeting', {
  meetingId: S.String,
})
export const ClickedOpenNotes = m('ClickedOpenNotes', {
  meetingId: S.String,
})
export const ClickedJoinVideo = m('ClickedJoinVideo', {
  meetingId: S.String,
})
export const ClickedLeaveVideo = m('ClickedLeaveVideo')
export const ClickedPlacePhone = m('ClickedPlacePhone', {
  meetingId: S.String,
})
export const ClickedHangUpPhone = m('ClickedHangUpPhone')
export const ClickedAnswerPhone = m('ClickedAnswerPhone')
export const ClickedDeclinePhone = m('ClickedDeclinePhone')
export const ClickedSimulateInbound = m('ClickedSimulateInbound')
export const ClickedAdmit = m('ClickedAdmit', {
  participantId: S.String,
})
export const ClickedInvitePhysician = m('ClickedInvitePhysician', {
  meetingId: S.String,
})
export const ClickedSimulateGuestWaiting = m('ClickedSimulateGuestWaiting', {
  meetingId: S.String,
})
export const ClickedStartShare = m('ClickedStartShare')
export const ClickedStopShare = m('ClickedStopShare')
export const UpdatedDraft = m('UpdatedDraft', {
  value: S.String,
})
export const ClickedSendChat = m('ClickedSendChat')
export const ClickedSwitchPerson = m('ClickedSwitchPerson', {
  personId: S.String,
})
export const ClickedToggleCaptions = m('ClickedToggleCaptions')
export const ClickedFinishMeeting = m('ClickedFinishMeeting')
export const UpdatedNotes = m('UpdatedNotes', {
  value: S.String,
})
export const ClickedStartImpromptu = m('ClickedStartImpromptu')
export const ClickedArrive = m('ClickedArrive', {
  meetingId: S.String,
})

export const PhoneOperation = S.Literals([
  'Place',
  'Connect',
  'HangUp',
  'Answer',
  'Ring',
])
export type PhoneOperation = typeof PhoneOperation.Type

export const VideoOperation = S.Literals([
  'Open',
  'Leave',
  'Admit',
  'Arrive',
  'Invite',
  'Share',
])
export type VideoOperation = typeof VideoOperation.Type

export const SucceededPhoneOpened = m('SucceededPhoneOpened', {
  meetingId: S.String,
  callId: S.String,
  fromNumber: PhoneNumber,
  openedAt: S.Number,
})
export const SucceededPhoneConnected = m('SucceededPhoneConnected', {
  callId: S.String,
  connectedAt: S.Number,
})
export const SucceededPhoneEnded = m('SucceededPhoneEnded', {
  callId: S.String,
  finishedAt: S.Number,
})
export const SucceededInboundRang = m('SucceededInboundRang', {
  meetingId: S.String,
  callId: S.String,
  fromNumber: PhoneNumber,
  openedAt: S.Number,
})
export const FailedPhone = m('FailedPhone', {
  operation: PhoneOperation,
  reason: S.String,
  at: S.Number,
})

export const SucceededVideoOpened = m('SucceededVideoOpened', {
  meetingId: S.String,
  callId: S.String,
  openedAt: S.Number,
  connectedAt: S.Number,
})
export const SucceededVideoLeft = m('SucceededVideoLeft', {
  callId: S.String,
  finishedAt: S.Number,
})
export const SucceededParticipantAdmitted = m('SucceededParticipantAdmitted', {
  participantId: S.String,
  admittedAt: S.Number,
})
export const SucceededParticipantArrived = m('SucceededParticipantArrived', {
  participantId: S.String,
  arrivedAt: S.Number,
})
export const SucceededGuestArrived = m('SucceededGuestArrived', {
  participant: Participant,
})
export const SucceededParticipantInvited = m('SucceededParticipantInvited', {
  participant: Participant,
})
export const SucceededShareStarted = m('SucceededShareStarted', {
  meetingId: S.String,
  at: S.Number,
})
export const SucceededShareStopped = m('SucceededShareStopped', {
  meetingId: S.String,
  at: S.Number,
})
export const FailedVideo = m('FailedVideo', {
  operation: VideoOperation,
  reason: S.String,
  at: S.Number,
})
export const SucceededChatRecorded = m('SucceededChatRecorded', {
  chat: Chat,
})
export const RefusedVideoAfterPhone = m('RefusedVideoAfterPhone', {
  meetingId: S.String,
  at: S.Number,
})
export const ObservedGraph = m('ObservedGraph', {
  graph: Graph,
  source: S.Literals(['Instant', 'StaticFallback']),
})
export const FailedObserveGraph = m('FailedObserveGraph', {
  reason: S.String,
})
export const SucceededPersist = m('SucceededPersist')
export const FailedPersist = m('FailedPersist', {
  reason: S.String,
})
export const SucceededMeetingFinished = m('SucceededMeetingFinished', {
  meetingId: S.String,
  finishedAt: S.Number,
})
export const SucceededImpromptuStarted = m('SucceededImpromptuStarted', {
  meeting: Meeting,
  participant: Participant,
})

export const Message = S.Union([
  ClickedOpenDay,
  ClickedOpenHistory,
  ClickedGoBack,
  ClickedOpenMeeting,
  ClickedOpenNotes,
  ClickedJoinVideo,
  ClickedLeaveVideo,
  ClickedPlacePhone,
  ClickedHangUpPhone,
  ClickedAnswerPhone,
  ClickedDeclinePhone,
  ClickedSimulateInbound,
  ClickedAdmit,
  ClickedInvitePhysician,
  ClickedSimulateGuestWaiting,
  ClickedStartShare,
  ClickedStopShare,
  UpdatedDraft,
  ClickedSendChat,
  ClickedSwitchPerson,
  ClickedToggleCaptions,
  ClickedFinishMeeting,
  UpdatedNotes,
  ClickedStartImpromptu,
  ClickedArrive,
  SucceededPhoneOpened,
  SucceededPhoneConnected,
  SucceededPhoneEnded,
  SucceededInboundRang,
  FailedPhone,
  SucceededVideoOpened,
  SucceededVideoLeft,
  SucceededParticipantAdmitted,
  SucceededParticipantArrived,
  SucceededGuestArrived,
  SucceededParticipantInvited,
  SucceededShareStarted,
  SucceededShareStopped,
  FailedVideo,
  SucceededChatRecorded,
  RefusedVideoAfterPhone,
  ObservedGraph,
  FailedObserveGraph,
  SucceededPersist,
  FailedPersist,
  SucceededMeetingFinished,
  SucceededImpromptuStarted,
])
export type Message = typeof Message.Type
