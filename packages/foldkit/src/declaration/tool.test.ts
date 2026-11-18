import { describe, expect, it } from 'vitest'

import * as Declaration from './declaration.js'
import * as Parameter from './parameter.js'
import { toolOf, toolsOf } from './tool.js'

const Follow = Declaration.make('Follow', {
  what: 'Prints a topic each time it changes',
  why: 'To read along somewhere else, or to hand the words to another program.',
  parameters: {
    topic: Parameter.subject(
      Parameter.withDefault(
        Parameter.oneOf(['words', 'screen'], 'What to follow'),
        'words',
      ),
    ),
    eachWord: Parameter.toggle('Says each word as it is spoken'),
    before: Parameter.number('How many paragraphs to keep before'),
  },
})

const Listen = Declaration.make('Listen', {
  what: 'Plays a title from the last place the user listened',
  why: 'To hear the book',
  parameters: {
    slug: Parameter.required(
      Parameter.subject(Parameter.named('title', 'Which title?')),
    ),
  },
})

const SignIn = Declaration.make('SignIn', {
  what: 'Signs in to the library',
  why: 'A command was refused because the sign-in ran out',
})

describe('toolOf', () => {
  it('describes a declaration the way an agent reads a tool', () => {
    expect(toolOf(['Follow'], Follow)).toEqual({
      name: 'follow',
      title: 'Follow',
      description:
        'Prints a topic each time it changes. To read along somewhere else, or to hand the words to another program.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['words', 'screen'],
            description: 'What to follow',
            default: 'words',
          },
          eachWord: {
            type: 'boolean',
            description: 'Says each word as it is spoken',
          },
          before: {
            type: 'number',
            description: 'How many paragraphs to keep before',
          },
        },
        required: [],
        additionalProperties: false,
      },
    })
  })

  it('names what is required and what a person calls the thing chosen', () => {
    const tool = toolOf(['Listen'], Listen)
    expect(tool.inputSchema.required).toEqual(['slug'])
    expect(tool.inputSchema.properties['slug']).toEqual({
      type: 'string',
      description: 'Which title? Give the title by its name or part of it.',
    })
  })

  it('says what a call touches once that is derived, and nothing before', () => {
    expect(toolOf(['Listen'], Listen).annotations).toBeUndefined()
    expect(
      toolOf(['Follow'], { ...Follow, touches: { mutates: [], triggers: [] } })
        .annotations,
    ).toEqual({ readOnlyHint: true, openWorldHint: false })
    expect(
      toolOf(['Listen'], {
        ...Listen,
        touches: { mutates: ['listening'], triggers: [] },
      }).annotations,
    ).toEqual({ readOnlyHint: false, openWorldHint: false })
    expect(
      toolOf(['SignIn'], {
        ...SignIn,
        touches: { mutates: [], triggers: ['OpenSignInPage'] },
      }).annotations,
    ).toEqual({ readOnlyHint: false, openWorldHint: true })
  })

  it('names a tool by its whole path', () => {
    expect(toolOf(['Menu', 'TypeText'], SignIn).name).toBe('menu_type_text')
    expect(toolOf(['Menu', 'TypeText'], SignIn).title).toBe('Menu type text')
  })
})

describe('toolsOf', () => {
  it('lists every declaration of a tree, in order', () => {
    const tree = [
      Listen,
      Declaration.group('Account', {
        what: 'The account',
        children: [SignIn],
      }),
    ]
    expect(toolsOf(tree).map(tool => tool.name)).toEqual([
      'listen',
      'account_sign_in',
    ])
  })
})
