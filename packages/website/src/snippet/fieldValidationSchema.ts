import { Schema as S } from 'effect'
import { Calendar } from 'foldkit'
import { Field, Rule, makeRules } from 'foldkit/fieldValidation'

// A transform Schema: parses the input string into a CalendarDate on submit.
const EventDate = Calendar.CalendarDateFromIsoString

// A refinement Schema: a branded slug you decode the input into on submit.
const Slug = S.String.check(S.isPattern(/^[a-z0-9-]+$/)).pipe(S.brand('Slug'))
type Slug = typeof Slug.Type

// Reuse each Schema as a rule, so the rule can't drift from the Schema.
const eventDateRules = makeRules({
  required: 'Event date is required',
  rules: [Rule.fromSchema(EventDate, 'Enter a real date as YYYY-MM-DD')],
})

const slugRules = makeRules({
  required: 'Slug is required',
  rules: [Rule.fromSchema(Slug, 'Use lowercase letters, numbers, and hyphens')],
})

// The fields stay strings; decode them to the real types on submit.
const Model = S.Struct({
  eventDate: Field(S.String),
  slug: Field(S.String),
})
type Model = typeof Model.Type
