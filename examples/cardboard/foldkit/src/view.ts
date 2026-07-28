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
  SelectedAccessibilityProfile,
  SelectedIncorrectInputMethod,
  SelectedMirrorAnswer,
  ToggledRgbInversion,
  accessibilityProfileLabel,
  accessibleDescription,
  initialAccessibilityProfile,
  inputMethodGlyph,
  inputMethodLabel,
  inputMethods,
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

// VIEW

/** Renders the same Cardboard Program with Foldkit HTML. */
export const view = (model: Model): Document => {
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
