import { Button, Column, Row, Text } from 'foldkit/renderers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { paintReact } from './paintReact.js'

afterEach(() => {
  cleanup()
})

describe('paintReact', () => {
  it('paints Text and Button nodes from a screen tree', () => {
    const tree = Column(
      {},
      Text('/puzzle#next'),
      Row(
        {},
        Button({ token: 'yes', label: 'y' }),
        Button({ token: 'no', label: 'n' }),
      ),
    )
    render(paintReact(tree, vi.fn()))
    expect(screen.getByText('/puzzle#next')).toBeDefined()
    expect(screen.getByRole('button', { name: 'y' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'n' })).toBeDefined()
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
})
