import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  DueToken,
  LocalDay,
  LocalTime,
  addDays,
  dayLabel,
  dueTokenOf,
  hostCalendar,
  quickDueDates,
  timeLabel,
  utcCalendar,
} from './calendar.js'

const day = (text: string) => LocalDay.make(text)

describe('the calendar', () => {
  it('reads a day next to today as a person would', () => {
    const today = day('2026-10-07')
    expect(dayLabel(today, today)).toBe('Today')
    expect(dayLabel(day('2026-10-08'), today)).toBe('Tomorrow')
    expect(dayLabel(day('2026-10-06'), today)).toBe('Yesterday')
    expect(dayLabel(day('2026-10-10'), today)).toBe('Saturday')
    expect(dayLabel(day('2026-11-20'), today)).toBe('Fri, Nov 20')
    expect(dayLabel(day('2027-01-02'), today)).toBe('Sat, Jan 2, 2027')
  })

  it('reads times on a twelve-hour clock', () => {
    expect(timeLabel(LocalTime.make('00:05'))).toBe('12:05 AM')
    expect(timeLabel(LocalTime.make('09:00'))).toBe('9:00 AM')
    expect(timeLabel(LocalTime.make('12:30'))).toBe('12:30 PM')
    expect(timeLabel(LocalTime.make('18:00'))).toBe('6:00 PM')
  })

  it('counts days across months and years', () => {
    expect(addDays(day('2026-10-31'), 1)).toBe('2026-11-01')
    expect(addDays(day('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(day('2026-03-01'), -1)).toBe('2026-02-28')
  })

  it('offers today, tomorrow, the weekend, and next week, each on its own day', () => {
    const daysFrom = (today: string) =>
      Array.map(quickDueDates(day(today)), ({ name, due }) => [name, due.day])
    expect(daysFrom('2026-10-07')).toEqual([
      ['Today', '2026-10-07'],
      ['Tomorrow', '2026-10-08'],
      ['This weekend', '2026-10-10'],
      ['Next week', '2026-10-12'],
    ])
    expect(daysFrom('2026-10-11')).toEqual([
      ['Today', '2026-10-11'],
      ['Tomorrow', '2026-10-12'],
      ['Next weekend', '2026-10-17'],
      ['Next week', '2026-10-19'],
    ])
    expect(daysFrom('2026-10-10')).toEqual([
      ['Today', '2026-10-10'],
      ['Tomorrow', '2026-10-11'],
      ['Next week', '2026-10-12'],
    ])
    expect(daysFrom('2026-10-12')).toEqual([
      ['Today', '2026-10-12'],
      ['Tomorrow', '2026-10-13'],
      ['This weekend', '2026-10-17'],
      ['Next week', '2026-10-19'],
    ])
  })

  it('reads a typed due date and prints it as one word', () => {
    const decode = S.decodeUnknownOption(DueToken)
    expect(decode('2026-10-12')).toEqual(
      Option.some({ day: '2026-10-12', time: '09:00' }),
    )
    expect(decode(' 2026-10-12 7:45 ')).toEqual(
      Option.some({ day: '2026-10-12', time: '07:45' }),
    )
    expect(decode('2026-02-30')).toEqual(Option.none())
    expect(decode('2026-10-12 25:00')).toEqual(Option.none())
    expect(decode('next tuesday')).toEqual(Option.none())
    expect(
      dueTokenOf({ day: day('2026-10-12'), time: LocalTime.make('14:30') }),
    ).toBe('2026-10-12T14:30')
  })

  it('turns a day and time into an instant and back on one calendar', () => {
    const due = { day: day('2026-10-12'), time: LocalTime.make('14:30') }
    const utc = utcCalendar(0)
    expect(utc.localOf(utc.instantOf(due))).toEqual(due)
    expect(hostCalendar.localOf(hostCalendar.instantOf(due))).toEqual(due)
  })
})
