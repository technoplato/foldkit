import { expect, test } from 'vitest'

import permissions from '../../instant.perms.js'

test('session claim updates preserve ownership and modify only the refresh time', () => {
  expect(permissions.instantCounterSessionClaims.allow.update).toBe(
    "auth.id != null && auth.id == data.subjectId && auth.id == newData.subjectId && request.modifiedFields.all(field, field in ['claimedAtMs'])",
  )
})
