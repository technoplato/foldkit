import { MultipleCountersProgram, encodeMessage } from 'counters-core-example'

import { makeV3SharedProgramMessageProtocol } from '@foldkit/instant'

/** Canonical v3 envelopes backed by the Multiple Counters Message Schema and event registry. */
export const MultipleCountersV3MessageProtocol =
  makeV3SharedProgramMessageProtocol({
    Message: MultipleCountersProgram.Message,
    envelopeVersion: 1,
    eventMetadata: message => {
      const event = encodeMessage(message)
      return {
        eventId: event.eventId,
        eventVersion: event.eventVersion,
      }
    },
  })
