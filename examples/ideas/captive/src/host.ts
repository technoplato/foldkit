import { Runtime } from 'foldkit'

import { makeIdeasElement } from './element.js'

const getElement = (elementId: string): HTMLElement => {
  const element = document.getElementById(elementId)
  if (element === null) {
    throw new Error('Missing host element ' + elementId)
  }
  return element
}

/** Starts the host-owned page and embeds the Ideas widget. */
export const startHost = (): void => {
  getElement('root').outerHTML = [
    '<div class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-8">',
    '<header class="flex flex-col gap-1">',
    '<h1 class="text-2xl font-bold text-gray-900">Host application</h1>',
    '<p class="text-sm text-gray-600">This page owns the document title and URL. It embeds Knophy ideas with Runtime.embed and makeElement.</p>',
    '</header>',
    '<div id="widget-slot"></div>',
    '</div>',
  ].join('')
  const widgetSlot = getElement('widget-slot')
  Runtime.embed(makeIdeasElement(widgetSlot))
}
