import { Array, Option, pipe } from 'effect'

import { Tabs } from '@foldkit/ui'

export type Tab = 'Architecture' | 'Note Player'

export const DemoTabs = Tabs.create<Tab>()

export const all: ReadonlyArray<Tab> = ['Architecture', 'Note Player']

export const isActive =
  (tab: Tab) =>
  (demoTabsModel: Tabs.Model): boolean =>
    pipe(
      all,
      Array.get(demoTabsModel.activeIndex),
      Option.exists(activeTab => activeTab === tab),
    )
