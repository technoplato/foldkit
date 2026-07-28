import {
  type AccessibilityProfile,
  CompletedZeroGame,
  type InputMethod,
  type Message,
  type Model,
  PressedLowercaseG,
  PressedSpace,
  PressedZeroButton,
  ReleasedZeroButton,
  ReturnedToCardboardSequence,
  SelectedAccessibilityProfile,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  ToggledRgbInversion,
  accessibilityProfileLabel,
  accessibleDescription,
  cardboardAuthorship,
  cardboardDesktopCommand,
  cardboardScreen,
  conversationLedger,
  conversationLedgerPortableRoute,
  conversationScale,
  currentConversationScaleLevel,
  initialAccessibilityProfile,
  inputMethodGlyph,
  inputMethodLabel,
  inputMethods,
  messageForCardboardAction,
  nextAccessibilityProfile,
  previousAccessibilityProfile,
} from 'cardboard-core-example'
import { Array, Option } from 'effect'
import { Document, html } from 'foldkit/html'

const presentationForModel = (
  model: Model,
): Readonly<{ isRgbInverted: boolean; profile: AccessibilityProfile }> => {
  if (
    model.zero._tag === 'ConfiguringAtZero' ||
    model.zero._tag === 'ChoosingInputMethod' ||
    model.zero._tag === 'RejectedInputMethodChoice' ||
    model.zero._tag === 'CompletedAtZero'
  ) {
    return {
      isRgbInverted: model.zero.isRgbInverted,
      profile: model.zero.profile,
    }
  } else {
    return { isRgbInverted: false, profile: initialAccessibilityProfile }
  }
}

const selectedInputMethod = (inputMethod: InputMethod): Message => {
  if (inputMethod === 'Mirror') {
    return SelectedMirrorAnswer()
  } else {
    return SelectedIncorrectInputMethod({ inputMethod })
  }
}

const keyboardMessage = (
  key: string,
  profile: AccessibilityProfile,
): Option.Option<Message> => {
  if (key === ' ') {
    return Option.some(PressedSpace())
  } else if (key === 'g') {
    return Option.some(PressedLowercaseG())
  } else if (key === 'G' || key === ';') {
    return Option.some(CompletedZeroGame())
  } else if (key === 'h' || key === 'ArrowLeft') {
    return Option.some(
      SelectedAccessibilityProfile({
        profile: previousAccessibilityProfile(profile),
      }),
    )
  } else if (key === 'l' || key === 'ArrowRight') {
    return Option.some(
      SelectedAccessibilityProfile({
        profile: nextAccessibilityProfile(profile),
      }),
    )
  } else {
    return Option.none()
  }
}

const conversationLedgerView = (): Document => {
  const h = html<Message>()
  return {
    title: 'Project Cardboard | When /0 is four | Foldkit',
    body: h.main(
      [h.Class('cardboard-shell profile-AmberPaper')],
      [
        h.article(
          [h.Class('cardboard-stage ledger-page')],
          [
            h.header(
              [h.Class('cardboard-header')],
              [
                h.div(
                  [],
                  [
                    h.p([h.Class('eyebrow')], ['Project Cardboard']),
                    h.h1([], ['When /0 is four']),
                  ],
                ),
                h.code([], ['/0/log']),
              ],
            ),
            h.p(
              [h.Class('ledger-declaration')],
              [
                'Four means Ship. Stop expanding the theory. Publish the smallest verified artifact, record what happened, and continue from evidence.',
              ],
            ),
            h.button(
              [
                h.Class('ledger-link'),
                h.OnClick(ReturnedToCardboardSequence()),
              ],
              ['Return to /0'],
            ),
            h.section(
              [
                h.AriaLabelledBy('conversation-scale'),
                h.Class('ledger-section'),
              ],
              [
                h.p(
                  [h.Class('eyebrow')],
                  [`Current level ${currentConversationScaleLevel.toString()}`],
                ),
                h.h2([h.Id('conversation-scale')], ['Conversation scale']),
                h.ol(
                  [h.Class('scale-list')],
                  Array.map(conversationScale, level =>
                    h.li(
                      [
                        h.Key(level.level.toString()),
                        h.Class(
                          level.level === currentConversationScaleLevel
                            ? 'scale-level current-scale-level'
                            : 'scale-level',
                        ),
                      ],
                      [
                        h.strong(
                          [],
                          [`${level.level.toString()} · ${level.label}`],
                        ),
                        h.span([], [level.description]),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            h.section(
              [h.AriaLabelledBy('decision-log'), h.Class('ledger-section')],
              [
                h.p([h.Class('eyebrow')], ['Append only']),
                h.h2([h.Id('decision-log')], ['Public decision log']),
                h.ol(
                  [h.Class('decision-log')],
                  Array.map(conversationLedger, entry =>
                    h.li(
                      [h.Key(entry.sequence.toString())],
                      [
                        h.p(
                          [],
                          [
                            `${entry.sequence.toString().padStart(2, '0')} · ${entry.recordedOn}`,
                          ],
                        ),
                        h.h3([], [entry.title]),
                        h.span([], [entry.statement]),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            h.details(
              [h.Class('authorship')],
              [
                h.summary([], ['Original author and desktop command']),
                h.p([], [cardboardAuthorship.statement]),
                h.code([], [cardboardAuthorship.acronym]),
                h.code(
                  [],
                  [`statement sha256:${cardboardAuthorship.statementSha256}`],
                ),
                h.p([], ['Play the same Program on your desktop:']),
                h.code([], [cardboardDesktopCommand]),
              ],
            ),
          ],
        ),
      ],
    ),
  }
}

const sequenceView = (model: Model): Document => {
  const h = html<Message>()
  const screen = cardboardScreen(model)
  return {
    title: `Project Cardboard | ${screen.content.text} | Foldkit`,
    body: h.main(
      [h.Class('cardboard-sequence')],
      [
        h.button(
          [
            h.AriaLabel(screen.content.accessibilityLabel),
            h.Class('cardboard-sequence-button'),
            h.OnClick(messageForCardboardAction(screen.content.action)),
          ],
          [screen.content.text],
        ),
        h.nav(
          [h.AriaLabel('Cardboard commands'), h.Class('cardboard-commands')],
          Array.map(screen.commands, command =>
            h.button(
              [
                h.Key(command.key),
                h.OnClick(messageForCardboardAction(command.action)),
              ],
              [`[${command.key}] ${command.text}`],
            ),
          ),
        ),
      ],
    ),
  }
}

// VIEW

/** Renders the same Cardboard Program with Foldkit HTML. */
export const view = (model: Model): Document => {
  if (model.page._tag === 'SequencePage') {
    return sequenceView(model)
  } else if (model.page._tag === 'ConversationLedgerPage') {
    return conversationLedgerView()
  }

  const h = html<Message>()
  const presentation = presentationForModel(model)
  const isConfigurationVisible = model.zero._tag === 'ConfiguringAtZero'
  const isRiddleVisible =
    model.zero._tag === 'ChoosingInputMethod' ||
    model.zero._tag === 'RejectedInputMethodChoice'
  const progress =
    model.zero._tag === 'OpeningZero'
      ? `${(model.zero.progressPermille / 10).toString()}%`
      : '0%'

  return {
    title: 'Project Cardboard | Rule Zero | Foldkit',
    body: h.main(
      [
        h.Class(
          `cardboard-shell profile-${presentation.profile}${presentation.isRgbInverted ? ' rgb-inverted' : ''}`,
        ),
        h.OnKeyDownPreventDefault(key =>
          keyboardMessage(key, presentation.profile),
        ),
      ],
      [
        h.section(
          [h.Class('cardboard-stage'), h.AriaLabelledBy('cardboard-title')],
          [
            h.header(
              [h.Class('cardboard-header')],
              [
                h.div(
                  [],
                  [
                    h.p([h.Class('eyebrow')], ['Project Cardboard']),
                    h.h1([h.Id('cardboard-title')], ['Rule Zero']),
                  ],
                ),
                h.code([], ['/0']),
              ],
            ),
            h.button(
              [
                h.AriaLabel('Rule Zero black button. Hold to open.'),
                h.AriaDescribedBy('cardboard-readout'),
                h.Class(`zero-button state-${model.zero._tag}`),
                h.OnPointerDown(() => Option.some(PressedZeroButton())),
                h.OnPointerUp(() => Option.some(ReleasedZeroButton())),
                h.OnKeyDownPreventDefault(key =>
                  key === 'Enter'
                    ? Option.some(PressedZeroButton())
                    : Option.none(),
                ),
                h.OnKeyUpPreventDefault(key =>
                  key === 'Enter'
                    ? Option.some(ReleasedZeroButton())
                    : Option.none(),
                ),
              ],
              [
                h.span([h.Class('zero-button-label')], ['0']),
                h.span(
                  [
                    h.Class('zero-button-progress'),
                    h.Style({ width: progress }),
                  ],
                  [],
                ),
              ],
            ),
            h.p(
              [
                h.AriaLive('polite'),
                h.Class('readout'),
                h.Id('cardboard-readout'),
              ],
              [accessibleDescription(model)],
            ),
            h.a(
              [h.Class('ledger-link'), h.Href(conversationLedgerPortableRoute)],
              ['Open /0/log decision log'],
            ),
            ...(isConfigurationVisible
              ? [
                  h.section(
                    [
                      h.AriaLabel('Accessibility presentation'),
                      h.Class('configuration'),
                    ],
                    [
                      h.p(
                        [h.Class('eyebrow')],
                        ['Presentation, not diagnosis'],
                      ),
                      h.h2(
                        [],
                        [accessibilityProfileLabel(presentation.profile)],
                      ),
                      h.div(
                        [h.Class('configuration-actions')],
                        [
                          h.button(
                            [
                              h.OnClick(
                                SelectedAccessibilityProfile({
                                  profile: previousAccessibilityProfile(
                                    presentation.profile,
                                  ),
                                }),
                              ),
                            ],
                            ['Previous'],
                          ),
                          h.button(
                            [h.OnClick(ToggledRgbInversion())],
                            [
                              `RGB negative ${presentation.isRgbInverted ? 'on' : 'off'}`,
                            ],
                          ),
                          h.button(
                            [
                              h.OnClick(
                                SelectedAccessibilityProfile({
                                  profile: nextAccessibilityProfile(
                                    presentation.profile,
                                  ),
                                }),
                              ),
                            ],
                            ['Next'],
                          ),
                          h.button(
                            [h.OnClick(CompletedZeroGame())],
                            ['Continue'],
                          ),
                        ],
                      ),
                    ],
                  ),
                ]
              : []),
            ...(isRiddleVisible
              ? [
                  h.section(
                    [h.AriaLabelledBy('input-riddle'), h.Class('riddle')],
                    [
                      h.p([h.Class('eyebrow')], ['Dungeon one']),
                      h.h2(
                        [h.Id('input-riddle')],
                        [
                          'If you are looking at yourself, where are you looking?',
                        ],
                      ),
                      h.div(
                        [h.Class('input-methods')],
                        Array.map(inputMethods, inputMethod =>
                          h.button(
                            [
                              h.AriaLabel(inputMethodLabel(inputMethod)),
                              h.Class(`input-method input-${inputMethod}`),
                              h.Key(inputMethod),
                              h.OnClick(selectedInputMethod(inputMethod)),
                            ],
                            [
                              h.span(
                                [h.AriaHidden(true)],
                                [inputMethodGlyph(inputMethod)],
                              ),
                              h.strong([], [inputMethodLabel(inputMethod)]),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ]
              : []),
            h.details(
              [h.Class('authorship')],
              [
                h.summary([], ['Original author and desktop command']),
                h.p([], [cardboardAuthorship.statement]),
                h.code([], [cardboardAuthorship.acronym]),
                h.code(
                  [],
                  [`acronym sha256:${cardboardAuthorship.acronymSha256}`],
                ),
                h.code(
                  [],
                  [`statement sha256:${cardboardAuthorship.statementSha256}`],
                ),
                h.p([], ['Play the same Program on your desktop:']),
                h.code([], [cardboardDesktopCommand]),
              ],
            ),
            h.footer(
              [],
              [
                'Hold the control, press Space three times, use h/l, gg, G, or semicolon.',
              ],
            ),
          ],
        ),
      ],
    ),
  }
}
