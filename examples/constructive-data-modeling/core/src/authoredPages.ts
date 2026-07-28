import { Array, Option, Schema as S } from 'effect'

import { RevealPage, type RevealPage as RevealPageValue } from './model.js'

/** Exact selectable text for one page of the official authored reveal deck. */
export const AuthoredPageText = S.Struct({
  page: RevealPage,
  text: S.String,
})
/** One exact authored page text value. */
export type AuthoredPageText = typeof AuthoredPageText.Type

/** Selectable text recovered from all 158 pages of the official uncondensed PDF. */
export const authoredPageTexts = S.NonEmptyArray(AuthoredPageText).make([
  {
    page: 1,
    text: 'The unreasonable effectiveness of\nconstructive\ndata modeling\n\nAlexis King\nSoftware Should Work',
  },
  { page: 2, text: 'about me' },
  { page: 3, text: 'about me' },
  {
    page: 4,
    text: 'about me\n\n\n           previously\n                  /GHC',
  },
  {
    page: 5,
    text: 'about me\n\n\n           previously\n                  /GHC\n\n             now\n             @',
  },
  {
    page: 6,
    text: 'August Health eMAR\nOur smarter, fully-integrated eMAR dramatically improves your medication management and clinical operations.\n\n[Medication administration interface]',
  },
  { page: 7, text: 'Software should work, indeed!' },
  { page: 8, text: 'static typing' },
  { page: 9, text: '15 years ago: the static typing dark ages.' },
  {
    page: 10,
    text: '15 years ago: the static typing dark ages.\n\n\n\n\n      Java',
  },
  {
    page: 11,
    text: '15 years ago: the static typing dark ages.\n\n\n\n\n      Java                      C++',
  },
  {
    page: 12,
    text: '   15 years ago: the static typing dark ages.\n\n\n\n\n          Java                     C++\n→ infamously conservative',
  },
  {
    page: 13,
    text: '  15 years ago: the static typing dark ages.\n\n\n\n\n          Java                    C++\n→ infamously conservative\n→ deeply entangled with OOP',
  },
  {
    page: 14,
    text: '  15 years ago: the static typing dark ages.\n\n\n\n\n          Java                        C++\n→ infamously conservative     → extremely complicated\n→ deeply entangled with OOP',
  },
  {
    page: 15,
    text: '  15 years ago: the static typing dark ages.\n\n\n\n\n          Java                        C++\n→ infamously conservative     → extremely complicated\n→ deeply entangled with OOP   → very unsound',
  },
  {
    page: 16,
    text: '  15 years ago: the static typing dark ages.\n\n\n\n\n          Java                        C++\n→ infamously conservative     → extremely complicated\n→ deeply entangled with OOP   → very unsound\n\n\n          Static typing: old and crusty!',
  },
  { page: 17, text: 'the renaissance' },
  { page: 18, text: '   the renaissance\n\n\n\nRust' },
  { page: 19, text: '   the renaissance\n\n\n\nRust           TypeScript' },
  {
    page: 20,
    text: '                the renaissance\n\n\n\n           Rust               TypeScript\n→ focus on safety/soundness',
  },
  {
    page: 21,
    text: '                the renaissance\n\n\n\n           Rust                 TypeScript\n→ focus on safety/soundness\n→ sum types, pattern-matching\n→ traits and associated types',
  },
  {
    page: 22,
    text: '                the renaissance\n\n\n\n           Rust                     TypeScript\n→ focus on safety/soundness     → structural typing\n→ sum types, pattern-matching   → fancy type inference\n→ traits and associated types   → type-level programming',
  },
  {
    page: 23,
    text: '                the renaissance\n\n\n\n           Rust                     TypeScript\n→ focus on safety/soundness     → structural typing\n→ sum types, pattern-matching   → fancy type inference\n→ traits and associated types   → type-level programming\n\n\n             Static typing is cool again!',
  },
  { page: 24, text: 'but at what cost?' },
  {
    page: 25,
    text: '         but at what cost?\nExtreme increase in type system complexity!',
  },
  {
    page: 26,
    text: '         but at what cost?\nExtreme increase in type system complexity!\n→ Programmers don’t know the whole type system',
  },
  {
    page: 27,
    text: '         but at what cost?\nExtreme increase in type system complexity!\n→ Programmers don’t know the whole type system\n→ Typechecker treated as a black box',
  },
  {
    page: 28,
    text: '         but at what cost?\nExtreme increase in type system complexity!\n→ Programmers don’t know the whole type system\n→ Typechecker treated as a black box\n→ Time spent “fighting with the typechecker”',
  },
  {
    page: 29,
    text: '         but at what cost?\nExtreme increase in type system complexity!\n→ Programmers don’t know the whole type system\n→ Typechecker treated as a black box\n→ Time spent “fighting with the typechecker”\n→ Ever-growing set of type system features',
  },
  {
    page: 30,
    text: '           but at what cost?\n Extreme increase in type system complexity!\n  → Programmers don’t know the whole type system\n  → Typechecker treated as a black box\n  → Time spent “fighting with the typechecker”\n  → Ever-growing set of type system features\n\nWhat made programmers willing to accept this?',
  },
  { page: 31, text: 'gradual typing' },
  {
    page: 32,
    text: '                 gradual typing\n→ TypeScript is supposed to be “JavaScript, but typed”',
  },
  {
    page: 33,
    text: '               gradual typing\n→ TypeScript is supposed to be “JavaScript, but typed”\n→ Static semantics must be more complex to accommodate\n  dynamic typing idioms\n          if (typeof x === "string") {\n            useString(x)\n          }',
  },
  {
    page: 34,
    text: '               gradual typing\n→ TypeScript is supposed to be “JavaScript, but typed”\n→ Static semantics must be more complex to accommodate\n  dynamic typing idioms\n          if (typeof x === "string") {\n            useString(x)\n          }\n→ Programmers have mental model of dynamic semantics',
  },
  {
    page: 35,
    text: '               gradual typing\n→ TypeScript is supposed to be “JavaScript, but typed”\n→ Static semantics must be more complex to accommodate\n  dynamic typing idioms\n          if (typeof x === "string") {\n            useString(x)\n          }\n→ Programmers have mental model of dynamic semantics\n→ Type checker is perceived as a magic oracle',
  },
  { page: 36, text: 'This makes me sad. :(' },
  {
    page: 37,
    text: '       This makes me sad. :(\n          increasing type system complexity\n\n\n\n\nJava                                          TypeScript',
  },
  {
    page: 38,
    text: '           This makes me sad. :(\n                 increasing type system complexity\n\n\n\n\n    Java                                             TypeScript\nfrustrating!\n(too limiting)',
  },
  {
    page: 39,
    text: '           This makes me sad. :(\n                 increasing type system complexity\n\n\n\n\n    Java                                             TypeScript\nfrustrating!                                         frustrating!\n(too limiting)                                       (too complex)',
  },
  {
    page: 40,
    text: '           This makes me sad. :(\n                 increasing type system complexity\n\n\n                                ?\n    Java                                             TypeScript\n                          the mythical\nfrustrating!              sweet spot?                frustrating!\n(too limiting)                                       (too complex)',
  },
  { page: 41, text: 'What if I told you…' },
  {
    page: 42,
    text: '                What if I told you…\n→ …I don’t ever feel like I’m fighting the typechecker.',
  },
  {
    page: 43,
    text: '                What if I told you…\n→ …I don’t ever feel like I’m fighting the typechecker.\n→ …I feel equipped to use my type system to capture\n  invariants without built-in language support.',
  },
  {
    page: 44,
    text: '                What if I told you…\n→ …I don’t ever feel like I’m fighting the typechecker.\n→ …I feel equipped to use my type system to capture\n  invariants without built-in language support.\n→ …it involves less sophisticated type system machinery.',
  },
  {
    page: 45,
    text: '                What if I told you…\n→ …I don’t ever feel like I’m fighting the typechecker.\n→ …I feel equipped to use my type system to capture\n  invariants without built-in language support.\n→ …it involves less sophisticated type system machinery.\n→ …you can do it, too, in the language you already use!',
  },
  { page: 46, text: 'ingredients' },
  {
    page: 47,
    text: '                     ingredients\n\n→ Some form of product types (e.g. tuples, structs, records).',
  },
  {
    page: 48,
    text: '                     ingredients\n\n→ Some form of product types (e.g. tuples, structs, records).\n→ Some form of sum types (e.g. ADTs/Rust-style enums,\n  union types, sealed interfaces).',
  },
  {
    page: 49,
    text: '                     ingredients\n\n→ Some form of product types (e.g. tuples, structs, records).\n→ Some form of sum types (e.g. ADTs/Rust-style enums,\n  union types, sealed interfaces).\n→ Exhaustive pattern-matching on sum type variants.',
  },
  {
    page: 50,
    text: '                     ingredients\n\n→ Some form of product types (e.g. tuples, structs, records).\n→ Some form of sum types (e.g. ADTs/Rust-style enums,\n  union types, sealed interfaces).\n→ Exhaustive pattern-matching on sum type variants.\n\n\n                       That’s it!',
  },
  { page: 51, text: 'a shift in perspective' },
  { page: 52, text: 'What are types?' },
  { page: 53, text: 'What are types? Possible answer: restrictions.' },
  {
    page: 54,
    text: 'What are types? Possible answer: restrictions.\n\n\n                8\n                     -103\n                               "hello"\n                    59\n                                 "spring"\n                               "abc123"\n\n               [1, "a"]\n\n\n                                  true\n                    [2, 9]\n                                   false\n                     [-3, 4]',
  },
  {
    page: 55,
    text: 'What are types? Possible answer: restrictions.\n                             unknown\n\n\n                8\n                     -103\n                                 "hello"\n                    59\n                                   "spring"\n                                 "abc123"\n\n               [1, "a"]\n\n\n                                       true\n                    [2, 9]\n                                        false\n                     [-3, 4]',
  },
  {
    page: 56,
    text: 'What are types? Possible answer: restrictions.\n                             unknown\n\n                number\n                8                  string\n                     -103\n                                 "hello"\n                    59\n                                   "spring"\n                                 "abc123"\n                    unknown[]\n               [1, "a"]\n                                       boolean\n                                       true\n                    [2, 9]\n                                        false\n                     [-3, 4]',
  },
  {
    page: 57,
    text: 'What are types? Possible answer: restrictions.\n                             unknown\n\n                number\n                8                  string\n                     -103\n                                 "hello"\n                    59\n                                   "spring"\n                                 "abc123"\n                    unknown[]\n               [1, "a"]\n                                       boolean\n                     number[]\n                                       true\n                    [2, 9]\n                                        false\n                     [-3, 4]',
  },
  { page: 58, text: 'But other languages work differently!' },
  {
    page: 59,
    text: '    But other languages work differently!\nJava: record Point(double x, double y)',
  },
  {
    page: 60,
    text: '      But other languages work differently!\n  Java: record Point(double x, double y)\n  Rust: struct Point { x: f64, y: f64 }\n Scala: case class Point(x: Double, y: Double)\nHaskell: data Point = Point\n          { x :: Double, y :: Double }',
  },
  {
    page: 61,
    text: '      But other languages work differently!\n  Java: record Point(double x, double y)\n  Rust: struct Point { x: f64, y: f64 }\n Scala: case class Point(x: Double, y: Double)\nHaskell: data Point = Point\n          { x :: Double, y :: Double }\n\n     We can extend the set of possible values!',
  },
  { page: 62, text: 'key idea 1' },
  {
    page: 63,
    text: '              key idea 1\nThink positive space, not negative space.',
  },
  {
    page: 64,
    text: '              key idea 1\nThink positive space, not negative space.\n\ntype Natural = ?',
  },
  {
    page: 65,
    text: '              key idea 1\nThink positive space, not negative space.\n\ntype Natural = Int ?',
  },
  {
    page: 66,
    text: '              key idea 1\nThink positive space, not negative space.\n\ntype Natural = Int ?\n    ..., -3, -2, -1, 0, 1, 2, 3, ...',
  },
  {
    page: 67,
    text: '              key idea 1\nThink positive space, not negative space.\n\ntype Natural = Int where >= 0\n    ..., -3, -2, -1, 0, 1, 2, 3, ...',
  },
  {
    page: 68,
    text: '              key idea 1\nThink positive space, not negative space.\n\ntype Natural = UInt\n    ..., -3, -2, -1, 0, 1, 2, 3, ...',
  },
  {
    page: 69,
    text: '                key idea 1\n  Think positive space, not negative space.\n\n  type Natural = UInt\n      ..., -3, -2, -1, 0, 1, 2, 3, ...\ntype Integer = (Boolean, Natural)',
  },
  {
    page: 70,
    text: '                key idea 1\n  Think positive space, not negative space.\n\n  type Natural = UInt\n      ..., -3, -2, -1, 0, 1, 2, 3, ...\ntype Integer = (Boolean, Natural)\n\n  It’s easier to add than to subtract!',
  },
  { page: 71, text: 'more examples' },
  {
    page: 72,
    text: '                 more examples\ntype List<T> = < from library >',
  },
  {
    page: 73,
    text: '                 more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = ?',
  },
  {
    page: 74,
    text: '                 more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = List<T> where length > 0',
  },
  {
    page: 75,
    text: '                 more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = List<T> where length > 0',
  },
  {
    page: 76,
    text: '                  more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = List<T> where length > 0\n  Thought process: a nonempty list always has one element …',
  },
  {
    page: 77,
    text: '                  more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = List<T> where length > 0\n  Thought process: a nonempty list always has one element …\n           …plus zero or more additional elements.',
  },
  {
    page: 78,
    text: '                  more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = (T, List<T>)\n  Thought process: a nonempty list always has one element …\n           …plus zero or more additional elements.',
  },
  {
    page: 79,
    text: '                  more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = (T, List<T>)\n  Thought process: a nonempty list always has one element …\n           …plus zero or more additional elements.\n\ntype EvenList<T> = ?',
  },
  {
    page: 80,
    text: '                   more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = (T, List<T>)\n   Thought process: a nonempty list always has one element …\n            …plus zero or more additional elements.\n\ntype EvenList<T> = ?\nThought process: in an EvenList, elements always come in pairs.',
  },
  {
    page: 81,
    text: '                   more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = (T, List<T>)\n   Thought process: a nonempty list always has one element …\n            …plus zero or more additional elements.\n\ntype EvenList<T> = List<(T, T)>\nThought process: in an EvenList, elements always come in pairs.',
  },
  {
    page: 82,
    text: '                   more examples\ntype List<T> = < from library >\n\ntype NonEmptyList<T> = (T, List<T>)\n   Thought process: a nonempty list always has one element …\n            …plus zero or more additional elements.\n\ntype EvenList<T> = List<(T, T)>\nThought process: in an EvenList, elements always come in pairs.\n                   Is this “cheating”?',
  },
  { page: 83, text: 'key idea 2' },
  {
    page: 84,
    text: '               key idea 2\nDecouple representation from interpretation.',
  },
  {
    page: 85,
    text: '                   key idea 2\nDecouple representation from interpretation.\n\n“My data is an array, so I must ascribe it an array type.”',
  },
  {
    page: 86,
    text: '                   key idea 2\nDecouple representation from interpretation.\n\n“My data is an array, so I must ascribe it an array type.”\n  “My data is a sequence of zero or more elements,\n       which can be represented by an array.”',
  },
  {
    page: 87,
    text: '                   key idea 2\nDecouple representation from interpretation.\n\n“My data is an array, so I must ascribe it an array type.”\n   “My data is a sequence of zero or more elements,\n         which can be represented by an array.”\n“My data is a sequence of one or more elements, which\n can be represented by a single element, plus an array.”',
  },
  {
    page: 88,
    text: '                       key idea 2\n   Decouple representation from interpretation.\n\n    “My data is an array, so I must ascribe it an array type.”\n       “My data is a sequence of zero or more elements,\n             which can be represented by an array.”\n    “My data is a sequence of one or more elements, which\n     can be represented by a single element, plus an array.”\n\nData does not have a single “privileged” representation!',
  },
  {
    page: 89,
    text: '// at least one of email or phone must be set\nstruct User {\n  id: Int,\n  email: Option<EmailAddress>,\n  phone: Option<PhoneNumber>\n}',
  },
  {
    page: 90,
    text: '// at least one of email or phone must be set\nstruct User {\n  id: Int,\n  email: Option<EmailAddress>,\n  phone: if (email == None) PhoneNumber\n         else Option<PhoneNumber>\n}',
  },
  {
    page: 91,
    text: '// at least one of email or phone must be set\nstruct User {\n  id: Int,\n  contact: UserContact\n}\n\n\nenum UserContact {\n  Email(EmailAddress),\n  Phone(PhoneNumber),\n  Both(EmailAddress, PhoneNumber)\n}',
  },
  {
    page: 92,
    text: '// at least one of email or phone must be set\nstruct User {\n  id: Int,\n  contact: UserContact\n}\n\n\nenum UserContact {\n  Email(EmailAddress),\n  Phone(PhoneNumber),\n  Both(EmailAddress, PhoneNumber)\n}',
  },
  {
    page: 93,
    text: '// at least one of email or phone must be set\nstruct User {\n  id: Int,\n  contact: Ior<EmailAddress, PhoneNumber>\n}\n\n\nenum Ior<A, B> {\n  Left(A),\n  Right(A),\n  Both(A, B)\n}',
  },
  {
    page: 94,
    text: '// at least one of email or phone must be set\nstruct User {\n  id: Int,\n  contact: UserContact\n}\n\n\nenum UserContact {\n  Email(EmailAddress),\n  Phone(PhoneNumber),\n  Both(EmailAddress, PhoneNumber)\n}',
  },
  {
    page: 95,
    text: '// contact is None iff isSystemUser is true\nstruct User {\n  id: Int,\n  contact: Option<UserContact>,\n  isSystemUser: Boolean\n}\n\nenum UserContact {\n  Email(EmailAddress),\n  Phone(PhoneNumber),\n  Both(EmailAddress, PhoneNumber)\n}',
  },
  {
    page: 96,
    text: '// contact is None iff isSystemUser is true\nstruct User {\n  id: Int,\n  contact: UserContact\n}\n\n\nenum UserContact {\n  System,\n  Email(EmailAddress),\n  Phone(PhoneNumber),\n  Both(EmailAddress, PhoneNumber)\n}',
  },
  { page: 97, text: 'Constructive modeling can be tricky!' },
  {
    page: 98,
    text: 'Constructive modeling can be tricky!\nstruct TimeRange\n  { start: Instant, end: Instant }\n  where start <= end',
  },
  {
    page: 99,
    text: '   Constructive modeling can be tricky!\n   struct TimeRange\n     { start: Instant, end: Instant }\n     where start <= end\n\nstruct TimeRange\n  { start: Instant, duration: Duration }',
  },
  { page: 100, text: '“How do I know which representation to pick?”' },
  { page: 101, text: 'What is the type system for?' },
  {
    page: 102,
    text: 'What is the type system for?\n  (At least as far as correctness goes.)',
  },
  {
    page: 103,
    text: '          What is the type system for?\n            (At least as far as correctness goes.)\n\n→ Preventing you from writing 1 + stringVariable?',
  },
  {
    page: 104,
    text: '          What is the type system for?\n            (At least as far as correctness goes.)\n\n→ Preventing you from writing 1 + stringVariable?\n→ Formally proving your program correct?',
  },
  {
    page: 105,
    text: '          What is the type system for?\n            (At least as far as correctness goes.)\n\n→ Preventing you from writing 1 + stringVariable?\n→ Formally proving your program correct?\n→ Playing taxonomist in your product domain?',
  },
  {
    page: 106,
    text: '           What is the type system for?\n              (At least as far as correctness goes.)\n\n→ Preventing you from writing 1 + stringVariable?\n→ Formally proving your program correct?\n→ Playing taxonomist in your product domain?\n→ Writing maximally-precise specifications of the shape of\n  your data at runtime?',
  },
  {
    page: 107,
    text: '           What is the type system for?\n              (At least as far as correctness goes.)\n\n→ Preventing you from writing 1 + stringVariable?\n→ Formally proving your program correct?\n→ Playing taxonomist in your product domain?\n→ Writing maximally-precise specifications of the shape of\n  your data at runtime?\n\nMy answer: keeping track of the cases to handle!',
  },
  { page: 108, text: 'enum UserType { Standard, Admin, System }' },
  {
    page: 109,
    text: '  enum UserType { Standard, Admin, System }\n\n\ndef authenticateUser(request) =\n  …\n  if (hasSuperuserPrivileges)\n    User(type = Admin)\n  else\n    User(type = Standard)\n\ndef processJob(job) =\n  let user = User(type = System)\n …',
  },
  {
    page: 110,
    text: '  enum UserType { Standard, Admin, System }\n\n\ndef authenticateUser(request) =    def authorizeAction(user) =\n  …                                  match user {\n  if (hasSuperuserPrivileges)          case Standard => …\n    User(type = Admin)                 case Admin    => …\n  else                                 case System   => …\n    User(type = Standard)            }\n\ndef processJob(job) =\n  let user = User(type = System)\n …',
  },
  {
    page: 111,
    text: '  enum UserType { Standard, Admin, System }\n\n\ndef authenticateUser(request) =    def authorizeAction(user) =\n  …                                  match user {\n  if (hasSuperuserPrivileges)          case Standard => …\n    User(type = Admin)                 case Admin    => …\n  else                                 case System   => …\n    User(type = Standard)            }\n\ndef processJob(job) =\n  let user = User(type = System)\n …\n\n                 Might be very far apart!',
  },
  {
    page: 112,
    text: '  enum UserType { Standard, Admin, System, Api }\n\n\ndef authenticateUser(request) =    def authorizeAction(user) =\n  …                                  match user {\n  if (hasSuperuserPrivileges)          case Standard => …\n    User(type = Admin)                 case Admin    => …\n  else                                 case System   => …\n    User(type = Standard)            }\n\ndef processJob(job) =\n  let user = User(type = System)\n …\n\n                 Might be very far apart!',
  },
  {
    page: 113,
    text: '  enum UserType { Standard, Admin, System, Api }\n\n\ndef authenticateUser(request) =    def authorizeAction(user) =\n  …                                  match user {\n  if (hasSuperuserPrivileges)          case Standard => …\n    User(type = Admin)                 case Admin    => …\n  else                                 case System   => …\n    User(type = Standard)            }\n\ndef processJob(job) =              error: non-exhaustive pattern match\n  let user = User(type = System)\n …\n\n                 Might be very far apart!',
  },
  { page: 114, text: 'A type system is an obligation propagation machine.' },
  {
    page: 115,
    text: 'A type system is an obligation propagation machine.\nUse sites inform what the obligations must be!',
  },
  {
    page: 116,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()',
  },
  {
    page: 117,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()',
  },
  {
    page: 118,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()',
  },
  {
    page: 119,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()',
  },
  {
    page: 120,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()',
  },
  {
    page: 121,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!',
  },
  {
    page: 122,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!\n\ndef getLastChanged(entries: List<InventoryLogEntry>) =\n match entries.head {\n   Some(latestEntry) => latestEntry.timestamp\n   None              => ???\n }',
  },
  {
    page: 123,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!\n\ndef getLastChanged(entries: List<InventoryLogEntry>) =\n match entries.head {\n   Some(latestEntry) => latestEntry.timestamp\n   None              => ???\n }',
  },
  {
    page: 124,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!\n\ndef getLastChanged(entries: List<InventoryLogEntry>) =\n match entries.head {\n   Some(latestEntry) => latestEntry.timestamp\n   None              => ???\n }',
  },
  {
    page: 125,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!\n\ndef getLastChanged(entries: List<InventoryLogEntry>) =\n match entries.head {\n   Some(latestEntry) => latestEntry.timestamp\n   None              => panic("shouldn\'t happen")\n }',
  },
  {
    page: 126,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!\n\ndef getLastChanged(entries: List<InventoryLogEntry>) =\n match entries.head {\n   Some(latestEntry) => latestEntry.timestamp\n   None              => panic("shouldn\'t happen")\n }\n\ndef getLastChanged(\n      entries: NonEmptyList<InventoryLogEntry>) =\n  entries.head.timestamp',
  },
  {
    page: 127,
    text: 'def calculateTotal(entries: List<InventoryLogEntry>) =\n  entries.map(entry => entry.change).sum()\n\n           No need to get fancy: List is fne!\n\ndef getLastChanged(entries: List<InventoryLogEntry>) =\n match entries.head {\n   Some(latestEntry) => latestEntry.timestamp\n   None              => panic("shouldn\'t happen")\n }\n\ndef getLastChanged(\n      entries: NonEmptyList<InventoryLogEntry>) =\n  entries.head.timestamp',
  },
  { page: 128, text: 'key idea 3' },
  {
    page: 129,
    text: '                    key idea 3\n\nPick the simplest representation that allows writing\n      panic("this shouldn\'t happen")\n                as little as possible.',
  },
  {
    page: 130,
    text: '                    key idea 3\n\nPick the simplest representation that allows writing\n      panic("this shouldn\'t happen")\n                as little as possible.\n\n In other words: write total functions!',
  },
  {
    page: 131,
    text: '               option types\n     Rust: enum Option<T> { None, Some(T) }\n   Haskell: data Maybe a = Nothing | Just a\nTypeScript: type Option<T> = T | null\n          type Option<T> = { some: T } | null',
  },
  {
    page: 132,
    text: '               option types\n     Rust: enum Option<T> { None, Some(T) }\n   Haskell: data Maybe a = Nothing | Just a\nTypeScript: type Option<T> = T | null\n          type Option<T> = { some: T } | null\n\n\n         Which is more restrictive?\n              T or Option<T> ?',
  },
  { page: 133, text: 'It depends!' },
  {
    page: 134,
    text: '                 It depends!\nnotifyAboutFailure(user: Option<User>): void',
  },
  {
    page: 135,
    text: '                 It depends!\nnotifyAboutFailure(user: Option<User>): void',
  },
  {
    page: 136,
    text: '                 It depends!\nnotifyAboutFailure(user: Option<User>): void\n\n     def myCoolApiEndpoint() =\n       try { ... }\n       catch { notifyAboutFailure(None) }',
  },
  {
    page: 137,
    text: '                 It depends!\nnotifyAboutFailure(user: Option<User>): void\n\n     def myCoolApiEndpoint() =\n       try { ... }\n       catch { notifyAboutFailure(None) }',
  },
  {
    page: 138,
    text: '                    It depends!\n notifyAboutFailure(user: Option<User>): void\n\n       def myCoolApiEndpoint() =\n         try { ... }\n         catch { notifyAboutFailure(None) }\n\ndef notifyAboutFailure(user: Option<User>) =\n  match user {\n    case Some(user) => sendFailureEmail(user.email)\n    case None       => ???\n  }',
  },
  {
    page: 139,
    text: '                    It depends!\n notifyAboutFailure(user: Option<User>): void\n\n       def myCoolApiEndpoint() =\n         try { ... }\n         catch { notifyAboutFailure(None) }\n\ndef notifyAboutFailure(user: Option<User>) =\n  match user {\n    case Some(user) => sendFailureEmail(user.email)\n    case None       => ???\n  }',
  },
  {
    page: 140,
    text: 'The Golden Sir\n@screaminbutcalm\n\nMe sowing: Haha fuck yeah!!! Yes!!\n\nMe reaping: Well this fucking sucks. What the fuck.\n\n4:14 PM · Mar 12, 2019',
  },
  { page: 141, text: 'Let’s try again.' },
  {
    page: 142,
    text: '           Let’s try again.\ndef notifyAboutFailure(user: User) =\n  sendFailureEmail(user.email)',
  },
  {
    page: 143,
    text: '           Let’s try again.\ndef notifyAboutFailure(user: User) =\n  sendFailureEmail(user.email)',
  },
  {
    page: 144,
    text: '           Let’s try again.\ndef notifyAboutFailure(user: User) =\n  sendFailureEmail(user.email)\n\ndef myCoolApiEndpoint() =\n  try { ... }\n  catch { notifyAboutFailure(???) }',
  },
  {
    page: 145,
    text: '           Let’s try again.\ndef notifyAboutFailure(user: User) =\n  sendFailureEmail(user.email)\n\ndef myCoolApiEndpoint() =\n  try { ... }\n  catch { notifyAboutFailure(???) }',
  },
  {
    page: 146,
    text: '            Let’s try again.\ndef notifyAboutFailure(user: User) =\n  sendFailureEmail(user.email)\n\ndef myCoolApiEndpoint() =\n  try { ... }\n  catch { notifyAboutFailure(???) }\n\n Types allow moving obligations around.',
  },
  { page: 147, text: 'recap' },
  {
    page: 148,
    text: '                           recap\n→ Define your data’s positive space, not its negative space.',
  },
  {
    page: 149,
    text: '                           recap\n→ Define your data’s positive space, not its negative space.\n→ Decouple data representation from interpretation.',
  },
  {
    page: 150,
    text: '                           recap\n→ Define your data’s positive space, not its negative space.\n→ Decouple data representation from interpretation.\n→ Use type definitions to encode the obligations necessary to\n  write total functions.',
  },
  {
    page: 151,
    text: '                           recap\n→ Define your data’s positive space, not its negative space.\n→ Decouple data representation from interpretation.\n→ Use type definitions to encode the obligations necessary to\n  write total functions.\n→ Push obligations to the places best equipped to handle them.',
  },
  {
    page: 152,
    text: '                           recap\n→ Define your data’s positive space, not its negative space.\n→ Decouple data representation from interpretation.\n→ Use type definitions to encode the obligations necessary to\n  write total functions.\n→ Push obligations to the places best equipped to handle them.\n\n    “As simple as possible, but no simpler.”',
  },
  { page: 153, text: 'convenience' },
  {
    page: 154,
    text: '            convenience\n\nFancy type system features are not bad!',
  },
  {
    page: 155,
    text: '            convenience\n\nFancy type system features are not bad!\ntype NonEmptyList<T> = [T, ...T[]]',
  },
  {
    page: 156,
    text: '                 convenience\n\n Fancy type system features are not bad!\n type NonEmptyList<T> = [T, ...T[]]\n\nTake advantage of what your language has to offer!',
  },
  {
    page: 157,
    text: '                 convenience\n\n Fancy type system features are not bad!\n type NonEmptyList<T> = [T, ...T[]]\n\nTake advantage of what your language has to offer!\nJust don’t get tricked into thinking you need them.',
  },
  {
    page: 158,
    text: '                        thanks!\n→ Define your data’s positive space, not its negative space.\n→ Decouple data representation from interpretation.\n→ Use type definitions to encode the obligations necessary to\n  write total functions.\n→ Push obligations to the places best equipped to handle them.\n\n              blog: https://lexi-lambda.github.io/\n            twitter: @lexi_lambda\n           bluesky: @lexi-lambda.bsky.social',
  },
])

/** Returns the official selectable text for one authored reveal page. */
export const authoredTextForPage = (page: RevealPageValue): string =>
  Option.getOrThrow(
    Array.findFirst(
      authoredPageTexts,
      authoredPage => authoredPage.page === page,
    ),
  ).text
