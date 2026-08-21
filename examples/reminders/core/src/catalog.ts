import { Schema as S } from 'effect'

export const ReturnToLaptop = S.TaggedStruct('returnToLaptop', {})
export const AtTime = S.TaggedStruct('atTime', { iso: S.String })
export const Manual = S.TaggedStruct('manual', {})
export const Trigger = S.Union([ReturnToLaptop, AtTime, Manual])
export type Trigger = typeof Trigger.Type

export const ReminderStatus = S.Literals(['pending', 'done', 'dismissed'])
export type ReminderStatus = typeof ReminderStatus.Type

export const Reminder = S.Struct({
  body: S.String,
  createdAt: S.String,
  id: S.String,
  status: ReminderStatus,
  triggers: S.Array(Trigger),
})
export type Reminder = typeof Reminder.Type

const reminder = (
  id: string,
  body: string,
  triggers: ReadonlyArray<Trigger>,
  createdAt: string,
): Reminder =>
  Reminder.make({ body, createdAt, id, status: 'pending', triggers })

/** Canonical seed. Instant is live when credentials/schema allow. */
export const seedReminders: ReadonlyArray<Reminder> = [
  reminder(
    'a8e4c2b0-1d3f-4a56-9c78-90ab12cd3456',
    'Shopify CLI: auth Pouruss (`pouruss.myshopify.com`) with `shopify auth login` then `shopify store auth --store pouruss.myshopify.com --scopes read_orders,read_all_orders` so School Bot can read invoices/orders',
    [ReturnToLaptop.make()],
    '2026-08-13T13:54:00Z',
  ),
]
