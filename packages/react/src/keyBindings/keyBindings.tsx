import { useEffect } from 'react'

import {
  getBoundProgram,
  getProgramHandle,
} from '../programHandle/programHandle.js'

const canAttachDomKeydown = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  if (typeof window.addEventListener !== 'function') {
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return false
  }
  return typeof document !== 'undefined'
}

/**
 * One document keydown listener for a bound Program.
 * Does not own a Model store. React Native does not attach.
 */
export const ProgramKeyBindings = ({
  path,
  children,
}: Readonly<{
  path: { readonly _tag: string }
  children?: React.ReactNode
}>) => {
  useEffect(() => {
    if (!canAttachDomKeydown()) {
      return
    }
    const handle = getProgramHandle(path)
    const slot = getBoundProgram(path)
    if (slot.keyToMessage === undefined) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const message = slot.keyToMessage?.(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        },
        handle.readModel(),
      )
      if (message === undefined) {
        return
      }
      event.preventDefault()
      handle.send(message)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [path])
  return children ?? null
}
