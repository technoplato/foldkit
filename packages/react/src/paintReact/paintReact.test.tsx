import { Button, Column, List, Row, Text, TextInput } from 'foldkit/renderers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { paintReact, paintTree } from './paintReact.js'

afterEach(() => {
  cleanup()
})

describe('paintReact', () => {
  it('paints Text and Button nodes from a screen tree', () => {
    const tree = Column(
      {},
      Text('5'),
      Row(
        {},
        Button({ token: 'increment', label: '+' }),
        Button({ token: 'decrement', label: '-' }),
      ),
    )
    render(paintReact(tree, vi.fn()))
    expect(screen.getByText('5')).toBeDefined()
    expect(screen.getByRole('button', { name: '+' })).toBeDefined()
    expect(screen.getByRole('button', { name: '-' })).toBeDefined()
  })

  it('sends the Button token on click', () => {
    const sendToken = vi.fn()
    render(paintReact(Button({ token: 'reset', label: 'reset' }), sendToken))
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(sendToken).toHaveBeenCalledTimes(1)
    expect(sendToken).toHaveBeenCalledWith('reset')
  })

  it('does not wire a disabled Button', () => {
    const sendToken = vi.fn()
    render(
      paintReact(
        Button({ token: 'reset', label: 'reset', disabled: true }),
        sendToken,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(sendToken).not.toHaveBeenCalled()
  })

  it('appends the className for a node kind after the base class', () => {
    render(paintReact(Text('hello'), vi.fn(), { Text: 'text-7xl' }))
    expect(screen.getByText('hello').className).toBe('fk-text text-7xl')
  })

  it('paints Text href as a link', () => {
    const href = 'https://puzzle.knophy.com'
    render(paintReact(Text(href, { href }), vi.fn()))
    const link = screen.getByRole('link', { name: href })
    expect(link.getAttribute('href')).toBe(href)
  })

  it('paints a Text image as a picture with its words as alt text', () => {
    const cover = {
      src: 'https://files.example/cover.jpg',
      width: 120,
      height: 180,
    }
    render(
      paintReact(
        Text('The Lantern Keeper cover', { image: cover, href: '/books/x' }),
        vi.fn(),
      ),
    )
    const picture = screen.getByRole('img', {
      name: 'The Lantern Keeper cover',
    })
    expect(picture.getAttribute('src')).toBe(cover.src)
    expect(picture.closest('a')?.getAttribute('href')).toBe('/books/x')
  })

  it('paints a TextInput and sends token plus value', () => {
    const sendToken = vi.fn()
    render(
      paintReact(
        TextInput({
          placeholder: 'Comment',
          token: 'comment-draft:',
          value: 'hello',
        }),
        sendToken,
      ),
    )
    const input = screen.getByPlaceholderText('Comment')
    expect(input).toBeDefined()
    fireEvent.change(input, { target: { value: 'Painted leftover.' } })
    expect(sendToken).toHaveBeenCalledWith('comment-draft:Painted leftover.')
  })
})

describe('fields and checks that press', () => {
  const pressedTags = (onPress: ReturnType<typeof vi.fn>) =>
    onPress.mock.calls.map(([button]) => button.action)

  it('presses a field that adds on Enter, then empties it for the next', () => {
    const onPress = vi.fn()
    render(
      paintTree(
        TextInput({
          value: '',
          placeholder: 'New reminder',
          action: 'AddReminder',
          label: 'New reminder in Groceries',
        }),
        { onPress },
      ),
    )
    const field = screen.getByRole('textbox', {
      name: 'New reminder in Groceries',
    })
    fireEvent.change(field, { target: { value: '  Buy milk ' } })
    fireEvent.blur(field)
    expect(onPress).not.toHaveBeenCalled()
    const form = field.closest('form')
    if (form === null) {
      throw new Error('the field sits in a form')
    }
    fireEvent.submit(form)
    expect(pressedTags(onPress)).toEqual(['AddReminder:Buy milk'])
    expect(field).toHaveProperty('value', '')
  })

  it('presses a field that edits when it is left after a change, and not when unchanged', () => {
    const onPress = vi.fn()
    render(
      paintTree(
        TextInput({
          value: 'Oat milk',
          action: 'RenameReminder',
          label: 'Title',
        }),
        { onPress },
      ),
    )
    const field = screen.getByRole('textbox', { name: 'Title' })
    fireEvent.blur(field)
    expect(onPress).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: 'Oat milk, 2 liters' } })
    fireEvent.blur(field)
    fireEvent.blur(field)
    expect(pressedTags(onPress)).toEqual(['RenameReminder:Oat milk, 2 liters'])
    expect(field).toHaveProperty('value', 'Oat milk, 2 liters')
  })

  it('presses the clear action when a field that edits is emptied', () => {
    const onPress = vi.fn()
    render(
      paintTree(
        TextInput({
          value: 'Fruit and water',
          action: 'SetNotes',
          clearAction: 'ClearNotes',
          label: 'Notes',
        }),
        { onPress },
      ),
    )
    const field = screen.getByRole('textbox', { name: 'Notes' })
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(pressedTags(onPress)).toEqual(['ClearNotes'])
  })

  it('paints a row check as a checkbox that presses its own action', () => {
    const onPress = vi.fn()
    render(
      paintTree(
        List({
          label: 'Groceries',
          items: [
            {
              key: 'r1',
              title: 'Oat milk',
              check: {
                isChecked: false,
                label: 'Mark Oat milk done',
                action: 'Complete:r1',
              },
              action: 'OpenReminder:r1',
            },
            {
              key: 'r2',
              title: 'Olive oil',
              check: { isChecked: true, label: 'Mark Olive oil not done' },
            },
          ],
        }),
        { onPress },
      ),
    )
    const open = screen.getByRole('checkbox', { name: 'Mark Oat milk done' })
    expect(open.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(open)
    const done = screen.getByRole('checkbox', {
      name: 'Mark Olive oil not done',
    })
    expect(done.getAttribute('aria-checked')).toBe('true')
    expect(done).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Oat milk' }))
    expect(pressedTags(onPress)).toEqual(['Complete:r1', 'OpenReminder:r1'])
  })
})
