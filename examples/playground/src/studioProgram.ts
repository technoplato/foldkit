import { Array, Match as M, Option, Schema as S, String, pipe } from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
  Session,
} from 'foldkit'
import { ModelPath } from 'foldkit/declaration'
import {
  Box,
  Button,
  Column,
  List,
  Progress,
  Row,
  Text,
  TextInput,
  Toolbar,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'
import { ts } from 'foldkit/schema'

// DOMAIN MODEL

export const IssuePriority = S.Literals(['Low', 'Medium', 'High', 'Critical'])
export type IssuePriority = typeof IssuePriority.Type

export const IssueStatus = S.Literals(['Open', 'Done'])
export type IssueStatus = typeof IssueStatus.Type

export const StudioIssue = S.Struct({
  slug: S.String,
  title: S.String,
  priority: IssuePriority,
  status: IssueStatus,
  summary: S.String,
})
export type StudioIssue = typeof StudioIssue.Type

export const StudioModel = S.Struct({
  issues: S.Array(StudioIssue),
  releasesCut: S.Number,
  activityLog: S.Array(S.String),
})
export type StudioModel = typeof StudioModel.Type

const priorityOrder: ReadonlyArray<IssuePriority> = [
  'Low',
  'Medium',
  'High',
  'Critical',
]

export const initialStudioIssues: ReadonlyArray<StudioIssue> = [
  {
    slug: 'mobile-touch',
    title: 'Derive mobile Slot input & drag traits from Core',
    priority: 'Critical',
    status: 'Done',
    summary:
      'Project InputMode, EnterKeyHint, Autofill, and DragAxis on Slot so HTML, React, Svelte, and React Native share one contract.',
  },
  {
    slug: 'hover-intent',
    title: 'Gate touch hover & focus stickiness in HoverIntent',
    priority: 'High',
    status: 'Done',
    summary:
      'Keep keyboard focus accessible while preventing synthetic touch hover or tap-focus double-toggles.',
  },
  {
    slug: 'surface-drag',
    title: 'Move single-pointer surfaceDragMount to foldkit/renderers',
    priority: 'High',
    status: 'Open',
    summary:
      'Snapshot bounding rect on pointerdown, defer capture past thresholdPx, and cancel on lostpointercapture under painter ratchet.',
  },
  {
    slug: 'cli-bridge',
    title: 'Drive live CLI output and commands from BoundInteraction',
    priority: 'Medium',
    status: 'Open',
    summary:
      'Render paintProgram live alongside React NavigationFrame and run CLI commands against the same Program.',
  },
]

export const initialStudioModel = (): StudioModel => ({
  issues: [...initialStudioIssues],
  releasesCut: 4,
  activityLog: [
    'Booted Release Studio v0.4 at /studio',
    'Completed mobile-touch & hover-intent core verification',
  ],
})

const slugOfTitle = (raw: string): string => {
  const cleaned = pipe(String.trim(raw), String.toLowerCase, text =>
    text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  )
  return String.isEmpty(cleaned) ? 'new-issue' : cleaned
}

const findIssue = (
  model: StudioModel,
  slug: string,
): Option.Option<StudioIssue> =>
  Array.findFirst(model.issues, issue => issue.slug === slug)

const stepPriority = (current: IssuePriority, delta: 1 | -1): IssuePriority => {
  const currentIndex = Option.getOrElse(
    Array.findFirstIndex(priorityOrder, level => level === current),
    () => 1,
  )
  const nextIndex = Math.min(
    priorityOrder.length - 1,
    Math.max(0, currentIndex + delta),
  )
  return Option.getOrElse(Array.get(priorityOrder, nextIndex), () => current)
}

// CATALOG ACTIONS (DECLARED ONCE; DERIVED BY REACT, MENU, AND CLI)

const at = ModelPath.of(StudioModel)

const whichIssue = (
  availabilityOf: (
    model: StudioModel,
    issue: StudioIssue,
  ) => Catalog.Availability,
): Catalog.Choose<StudioModel, 'slug', string> => ({
  field: 'slug',
  noun: 'issue',
  prompt: 'Which issue?',
  token: S.String,
  choicesOf: model =>
    Array.map(model.issues, issue => ({
      value: issue.slug,
      title: issue.title,
      detail: `${issue.priority} · ${issue.status}`,
      availability: availabilityOf(model, issue),
    })),
  preferredOf: model =>
    Option.map(Array.head(model.issues), issue => issue.slug),
  nothingToChoose: 'no issues remain in the studio backlog',
})

export const ToggleIssueStatus = Catalog.action('ToggleIssueStatus', {
  fields: { slug: S.String },
  what: 'Toggles an issue between open and done',
  why: 'To record completion progress in the release backlog',
  choose: whichIssue(() => Catalog.Enabled()),
  mutates: [at.issues, at.activityLog],
  meta: { label: 'Toggle Status', keys: ['x'] },
})

export const RaisePriority = Catalog.action('RaisePriority', {
  fields: { slug: S.String },
  what: 'Raises the priority level of an issue',
  why: 'To move urgent work ahead in the release queue',
  choose: whichIssue((_model, issue) =>
    issue.priority === 'Critical'
      ? Catalog.Disabled({ because: 'priority is already Critical' })
      : Catalog.Enabled(),
  ),
  mutates: [at.issues, at.activityLog],
  meta: { label: 'Raise Priority', keys: [']'] },
})

export const LowerPriority = Catalog.action('LowerPriority', {
  fields: { slug: S.String },
  what: 'Lowers the priority level of an issue',
  why: 'To defer lower-urgency work behind critical fixes',
  choose: whichIssue((_model, issue) =>
    issue.priority === 'Low'
      ? Catalog.Disabled({ because: 'priority is already Low' })
      : Catalog.Enabled(),
  ),
  mutates: [at.issues, at.activityLog],
  meta: { label: 'Lower Priority', keys: ['['] },
})

export const CreateIssue = Catalog.action('CreateIssue', {
  fields: { title: S.String },
  what: 'Adds a new issue to the studio backlog',
  why: 'To capture engineering work for an upcoming release',
  choose: {
    field: 'title',
    noun: 'title',
    prompt: 'What should the issue be titled?',
    token: S.String,
    choicesOf: () => [
      {
        value: 'Verify iOS OTP autofill',
        title: 'Verify iOS OTP autofill',
        detail: 'Preset suggestion',
      },
      {
        value: 'Audit painter ratchet ledger',
        title: 'Audit painter ratchet ledger',
        detail: 'Preset suggestion',
      },
    ],
    accepts: (_model: StudioModel, value: string) =>
      String.isEmpty(String.trim(value))
        ? Catalog.Disabled({ because: 'an issue title cannot be empty' })
        : Catalog.Enabled(),
    nothingToChoose: 'provide a title for the new issue',
  },
  mutates: [at.issues, at.activityLog],
  meta: { label: 'Create Issue', keys: [] },
})

export const ArchiveIssue = Catalog.action('ArchiveIssue', {
  fields: { slug: S.String },
  what: 'Removes an issue from the active studio backlog',
  why: 'To clear retired or superseded items out of the queue',
  choose: whichIssue(() => Catalog.Enabled()),
  mutates: [at.issues, at.activityLog],
  meta: { label: 'Archive Issue', keys: [] },
})

export const CutRelease = Catalog.action('CutRelease', {
  what: 'Publishes the next release from completed issues',
  why: 'To ship finished work as a numbered studio release',
  enabled: (model: StudioModel) =>
    Array.some(model.issues, issue => issue.status === 'Done')
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'mark at least one issue Done first' }),
  mutates: [at.releasesCut, at.activityLog],
  meta: { label: 'Cut Release', keys: ['c'] },
})

export const ResetStudio = Catalog.action('ResetStudio', {
  what: 'Restores the studio backlog and release counter',
  why: 'To start the demonstration over with fresh sample data',
  mutates: [at.issues, at.releasesCut, at.activityLog],
  meta: { label: 'Reset Studio', keys: ['r'] },
})

export const studioCatalog = Catalog.make([
  ToggleIssueStatus,
  RaisePriority,
  LowerPriority,
  CreateIssue,
  ArchiveIssue,
  CutRelease,
  ResetStudio,
])

export const StudioMessage = studioCatalog.Message
export type StudioMessage = typeof StudioMessage.Type

// NAVIGATION DESTINATIONS & ROUTES

export const IssuesPage = ts('IssuesPage')
export type IssuesPage = typeof IssuesPage.Type

export const ReleasesPage = ts('ReleasesPage')
export type ReleasesPage = typeof ReleasesPage.Type

export const IssueDetailPage = ts('IssueDetailPage', { slug: S.String })
export type IssueDetailPage = typeof IssueDetailPage.Type

export const NewIssueSheet = ts('NewIssueSheet')
export type NewIssueSheet = typeof NewIssueSheet.Type

export const PrioritySheet = ts('PrioritySheet', { slug: S.String })
export type PrioritySheet = typeof PrioritySheet.Type

export const ActivityDrawer = ts('ActivityDrawer')
export type ActivityDrawer = typeof ActivityDrawer.Type

export const ArchiveDialog = ts('ArchiveDialog', { slug: S.String })
export type ArchiveDialog = typeof ArchiveDialog.Type

export type StudioDestination =
  | IssuesPage
  | ReleasesPage
  | IssueDetailPage
  | NewIssueSheet
  | PrioritySheet
  | ActivityDrawer
  | ArchiveDialog

const slugSegment = Route.schemaSegment('slug', S.String)

const isIssuesPage = (destination: unknown): destination is IssuesPage =>
  typeof destination === 'object' &&
  destination !== null &&
  '_tag' in destination &&
  destination._tag === 'IssuesPage'

const isReleasesPage = (destination: unknown): destination is ReleasesPage =>
  typeof destination === 'object' &&
  destination !== null &&
  '_tag' in destination &&
  destination._tag === 'ReleasesPage'

const isIssueDetailPage = (
  destination: unknown,
): destination is IssueDetailPage =>
  typeof destination === 'object' &&
  destination !== null &&
  '_tag' in destination &&
  destination._tag === 'IssueDetailPage'

const isHomeTab = (destination: unknown): boolean =>
  isIssuesPage(destination) || isReleasesPage(destination)

const isBaseLayer = (beneath: ReadonlyArray<unknown>): boolean =>
  Option.exists(
    Array.last(beneath),
    top => isHomeTab(top) || isIssueDetailPage(top),
  )

const titleOfSlug = (slug: string): string =>
  pipe(String.split(slug, '-'), Array.map(String.capitalize), Array.join(' '))

export const studioScreens = Navigation.screens({
  slug: 'studio',
  root: Navigation.rootScreen(IssuesPage, Route.here, {
    title: () => 'Issues · Studio',
  }),
  screens: [
    Navigation.pushScreen(ReleasesPage, Route.literal('releases'), {
      title: () => 'Releases · Studio',
      isAllowedAbove: beneath => Array.every(beneath, isIssuesPage),
      isTab: true,
    }),
    Navigation.presentScreen(
      NewIssueSheet,
      Route.literal('new'),
      Navigation.Sheet(),
      {
        title: () => 'New Issue',
        isAllowedAbove: beneath => Array.every(beneath, isHomeTab),
      },
    ),
    Navigation.presentScreen(
      ActivityDrawer,
      Route.literal('activity'),
      Navigation.Drawer({ from: 'Left' }),
      {
        title: () => 'Activity Log',
        isAllowedAbove: isBaseLayer,
      },
    ),
    Navigation.presentScreen(
      PrioritySheet,
      pipe(Route.literal('priority'), Route.slash(slugSegment)),
      Navigation.Sheet(),
      {
        title: ({ slug }) => `Priority · ${titleOfSlug(slug)}`,
        isAllowedAbove: isBaseLayer,
      },
    ),
    Navigation.presentScreen(
      ArchiveDialog,
      pipe(Route.literal('archive'), Route.slash(slugSegment)),
      Navigation.Dialog(),
      {
        title: ({ slug }) => `Archive ${titleOfSlug(slug)}?`,
        isAllowedAbove: isBaseLayer,
      },
    ),
    Navigation.pushScreen(
      IssueDetailPage,
      pipe(Route.literal('issues'), Route.slash(slugSegment)),
      {
        title: ({ slug }) => `${titleOfSlug(slug)} · Issue`,
        isAllowedAbove: beneath => Array.every(beneath, isHomeTab),
      },
    ),
  ],
})

// SCREENS (UI-AGNOSTIC FOLDKIT RENDERER NODES — PAINTED BY BOTH REACT & CLI)

const tabNavigationRow = (activeTab: 'Issues' | 'Releases'): UiNode =>
  Toolbar({
    start: [
      Text(
        activeTab === 'Issues' ? '● Issues' : '○ Issues',
        activeTab === 'Issues'
          ? { href: '/studio', emphasis: 'Headline' }
          : { href: '/studio' },
      ),
      Text(
        activeTab === 'Releases' ? '● Releases' : '○ Releases',
        activeTab === 'Releases'
          ? { href: '/studio/releases', emphasis: 'Headline' }
          : { href: '/studio/releases' },
      ),
    ],
    center: [Text('Foldkit Release Studio', { dim: true })],
    end: [
      Text('+ New Issue', { href: '/studio/new' }),
      Text('Activity', { href: '/studio/activity' }),
      Text('Session', { href: '/studio/session' }),
    ],
  })

const issuesRootScreen = (model: StudioModel): UiNode => {
  const doneCount = Array.filter(
    model.issues,
    issue => issue.status === 'Done',
  ).length
  const totalCount = model.issues.length

  return Column(
    { gap: 1 },
    tabNavigationRow('Issues'),
    Row(
      { gap: 2 },
      Text(`${doneCount}/${totalCount} Done`, { mono: true }),
      Text(`Release v0.${model.releasesCut}`, { dim: true, mono: true }),
    ),
    List({
      label: 'Release Backlog',
      filter: {
        placeholder: 'Filter backlog issues…',
        label: 'Filter backlog issues',
        emptyText: 'No matching issues in backlog.',
      },
      items: Array.map(model.issues, issue => ({
        key: issue.slug,
        href: `/studio/issues/${issue.slug}`,
        title: issue.title,
        lines: [`${issue.slug} · ${issue.status}`],
        badge: {
          text: issue.priority,
          label: `Priority ${issue.priority}`,
        },
        check: {
          isChecked: issue.status === 'Done',
          label: `Toggle ${issue.title}`,
          action: `ToggleIssueStatus:${issue.slug}`,
        },
      })),
    }),
    Row(
      { gap: 1 },
      ...actionButtons(
        Array.filter(
          Catalog.entries(studioCatalog, model),
          entry => entry.tag === 'CutRelease' || entry.tag === 'ResetStudio',
        ),
      ),
    ),
  )
}

const releasesTabScreen = (model: StudioModel): UiNode => {
  const doneCount = Array.filter(
    model.issues,
    issue => issue.status === 'Done',
  ).length
  const totalCount = Math.max(1, model.issues.length)

  return Column(
    { gap: 1 },
    tabNavigationRow('Releases'),
    Text(`v0.${model.releasesCut}`, {
      label: `Current release v0.${model.releasesCut}`,
      emphasis: 'Display',
    }),
    Progress({
      value: doneCount,
      max: totalCount,
      label: `Readiness (${doneCount} of ${model.issues.length} done)`,
    }),
    Text(
      `${doneCount} completed item(s) ready to ship into v0.${model.releasesCut + 1}.`,
      { dim: true },
    ),
    Row(
      { gap: 1 },
      ...actionButtons(
        Array.filter(
          Catalog.entries(studioCatalog, model),
          entry => entry.tag === 'CutRelease' || entry.tag === 'ResetStudio',
        ),
      ),
    ),
  )
}

const issueDetailScreen = (model: StudioModel, slug: string): UiNode =>
  Option.match(findIssue(model, slug), {
    onNone: () =>
      Column(
        { gap: 1 },
        Text(`Issue "${slug}" not found`, { emphasis: 'Headline' }),
        Text('It may have been archived from the backlog.', { dim: true }),
        Text('← Back to Issues', { href: '/studio' }),
      ),
    onSome: issue =>
      Column(
        { gap: 1 },
        Toolbar({
          start: [Text('← Issues', { href: '/studio' })],
          center: [Text(issue.slug, { mono: true, dim: true })],
          end: [
            Text('Priority Sheet', {
              href: `/studio/issues/${issue.slug}/priority/${issue.slug}`,
            }),
            Text('Archive Dialog', {
              href: `/studio/issues/${issue.slug}/archive/${issue.slug}`,
            }),
          ],
        }),
        Text(issue.title, { emphasis: 'Headline' }),
        Row(
          { gap: 2 },
          Text(`Status: ${issue.status}`, { mono: true }),
          Text(`Priority: ${issue.priority}`, { mono: true }),
        ),
        Box({ padding: 1 }, Text(issue.summary)),
        Row(
          { gap: 1 },
          Button({
            label: issue.status === 'Done' ? 'Mark Open' : 'Mark Done',
            action: `ToggleIssueStatus:${issue.slug}`,
            variant: 'Primary',
          }),
          Button({
            label: 'Raise Priority',
            action: `RaisePriority:${issue.slug}`,
            disabled: issue.priority === 'Critical',
            ...(issue.priority === 'Critical'
              ? { because: 'priority is already Critical' }
              : {}),
          }),
          Button({
            label: 'Lower Priority',
            action: `LowerPriority:${issue.slug}`,
            disabled: issue.priority === 'Low',
            ...(issue.priority === 'Low'
              ? { because: 'priority is already Low' }
              : {}),
          }),
        ),
      ),
  })

const newIssueSheetScreen = (): UiNode =>
  Column(
    { gap: 1 },
    Text('New Backlog Issue (Sheet)', { emphasis: 'Headline' }),
    Text('Type any title and press Enter, or pick a quick preset below.', {
      dim: true,
    }),
    TextInput({
      value: '',
      action: 'CreateIssue',
      label: 'New issue title',
      placeholder: 'Type an issue title and press Enter…',
    }),
    Row(
      { gap: 1 },
      Button({
        label: '+ Verify iOS OTP autofill',
        action: 'CreateIssue:Verify iOS OTP autofill',
        variant: 'Primary',
      }),
      Button({
        label: '+ Audit painter ratchet ledger',
        action: 'CreateIssue:Audit painter ratchet ledger',
        variant: 'Ghost',
      }),
    ),
  )

const prioritySheetScreen = (model: StudioModel, slug: string): UiNode =>
  Option.match(findIssue(model, slug), {
    onNone: () =>
      Column(
        { gap: 1 },
        Text('Issue unavailable', { emphasis: 'Headline' }),
        Text('Choose an active issue from /studio.', { dim: true }),
      ),
    onSome: issue =>
      Column(
        { gap: 1 },
        Text(`Adjust Priority · ${issue.slug} (Sheet)`, {
          emphasis: 'Headline',
        }),
        Text(`Current priority: ${issue.priority}`, { mono: true }),
        Row(
          { gap: 1 },
          Button({
            label: 'Raise (+1)',
            action: `RaisePriority:${issue.slug}`,
            variant: 'Primary',
            disabled: issue.priority === 'Critical',
          }),
          Button({
            label: 'Lower (−1)',
            action: `LowerPriority:${issue.slug}`,
            variant: 'Ghost',
            disabled: issue.priority === 'Low',
          }),
        ),
      ),
  })

const activityDrawerScreen = (model: StudioModel): UiNode =>
  Column(
    { gap: 1 },
    Text('Studio Activity (Left Drawer)', { emphasis: 'Headline' }),
    List({
      label: 'Recent Events',
      items: Array.map(model.activityLog, (entry, index) => ({
        key: `event-${index}`,
        title: entry,
      })),
    }),
  )

const archiveDialogScreen = (model: StudioModel, slug: string): UiNode =>
  Option.match(findIssue(model, slug), {
    onNone: () =>
      Column(
        { gap: 1 },
        Text(`Archived "${slug}"`, { emphasis: 'Headline' }),
        Text(
          'This issue has been removed. Dismiss this dialog or return to /studio.',
          { dim: true },
        ),
      ),
    onSome: issue =>
      Column(
        { gap: 1 },
        Text(`Archive "${issue.title}"?`, { emphasis: 'Headline' }),
        Text(
          'Confirming removes this item from both the React view and the live CLI output.',
          { dim: true },
        ),
        Row(
          { gap: 1 },
          Button({
            label: 'Confirm Archive',
            action: `ArchiveIssue:${issue.slug}`,
            variant: 'Destructive',
          }),
        ),
      ),
  })

// UPDATE

const appendActivity = (
  log: ReadonlyArray<string>,
  line: string,
): ReadonlyArray<string> => Array.take([line, ...log], 12)

const updateStudio = (
  model: StudioModel,
  message: StudioMessage,
): readonly [StudioModel, ReadonlyArray<never>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [StudioModel, ReadonlyArray<never>]>(),
    M.tagsExhaustive({
      ToggleIssueStatus: ({ slug }) => {
        const maybeTarget = findIssue(model, slug)
        if (Option.isNone(maybeTarget)) {
          return [model, []]
        }
        const nextStatus: IssueStatus =
          maybeTarget.value.status === 'Done' ? 'Open' : 'Done'
        return [
          {
            ...model,
            issues: Array.map(model.issues, issue =>
              issue.slug === slug ? { ...issue, status: nextStatus } : issue,
            ),
            activityLog: appendActivity(
              model.activityLog,
              `Marked ${slug} as ${nextStatus}`,
            ),
          },
          [],
        ]
      },
      RaisePriority: ({ slug }) => {
        const maybeTarget = findIssue(model, slug)
        if (Option.isNone(maybeTarget)) {
          return [model, []]
        }
        const nextPriority = stepPriority(maybeTarget.value.priority, 1)
        return [
          {
            ...model,
            issues: Array.map(model.issues, issue =>
              issue.slug === slug
                ? { ...issue, priority: nextPriority }
                : issue,
            ),
            activityLog: appendActivity(
              model.activityLog,
              `Raised ${slug} priority to ${nextPriority}`,
            ),
          },
          [],
        ]
      },
      LowerPriority: ({ slug }) => {
        const maybeTarget = findIssue(model, slug)
        if (Option.isNone(maybeTarget)) {
          return [model, []]
        }
        const nextPriority = stepPriority(maybeTarget.value.priority, -1)
        return [
          {
            ...model,
            issues: Array.map(model.issues, issue =>
              issue.slug === slug
                ? { ...issue, priority: nextPriority }
                : issue,
            ),
            activityLog: appendActivity(
              model.activityLog,
              `Lowered ${slug} priority to ${nextPriority}`,
            ),
          },
          [],
        ]
      },
      CreateIssue: ({ title }) => {
        const trimmed = String.trim(title)
        if (String.isEmpty(trimmed)) {
          return [model, []]
        }
        const baseSlug = slugOfTitle(trimmed)
        const slug = Option.isSome(findIssue(model, baseSlug))
          ? `${baseSlug}-${model.issues.length + 1}`
          : baseSlug
        const created: StudioIssue = {
          slug,
          title: trimmed,
          priority: 'Medium',
          status: 'Open',
          summary: 'Created interactively from the live Studio session.',
        }
        return [
          {
            ...model,
            issues: [created, ...model.issues],
            activityLog: appendActivity(
              model.activityLog,
              `Created issue ${slug} ("${trimmed}")`,
            ),
          },
          [],
        ]
      },
      ArchiveIssue: ({ slug }) => [
        {
          ...model,
          issues: Array.filter(model.issues, issue => issue.slug !== slug),
          activityLog: appendActivity(
            model.activityLog,
            `Archived issue ${slug}`,
          ),
        },
        [],
      ],
      CutRelease: () => {
        const nextRelease = model.releasesCut + 1
        return [
          {
            ...model,
            releasesCut: nextRelease,
            activityLog: appendActivity(
              model.activityLog,
              `Published studio release v0.${nextRelease}`,
            ),
          },
          [],
        ]
      },
      ResetStudio: () => [initialStudioModel(), []],
    }),
  )

// COMPOSED PROGRAM & BOUND HANDLE

export const StudioCoreProgram = Program.make({
  id: 'foldkit-studio',
  version: 1,
  Model: StudioModel,
  Message: StudioMessage,
  init: () => [initialStudioModel(), []],
  update: updateStudio,
  catalog: studioCatalog,
  screen: issuesRootScreen,
  navigation: {
    ...studioScreens,
    viewOf: (model: StudioModel, destination: StudioDestination) =>
      M.value(destination).pipe(
        M.withReturnType<Option.Option<Navigation.EntryView>>(),
        M.tagsExhaustive({
          IssuesPage: () => Option.none(),
          ReleasesPage: () =>
            Option.some(Navigation.screenView(releasesTabScreen(model))),
          IssueDetailPage: ({ slug }) =>
            Option.some(Navigation.screenView(issueDetailScreen(model, slug))),
          NewIssueSheet: () =>
            Option.some(Navigation.screenView(newIssueSheetScreen())),
          PrioritySheet: ({ slug }) =>
            Option.some(
              Navigation.screenView(prioritySheetScreen(model, slug)),
            ),
          ActivityDrawer: () =>
            Option.some(Navigation.screenView(activityDrawerScreen(model))),
          ArchiveDialog: ({ slug }) =>
            Option.some(
              Navigation.screenView(archiveDialogScreen(model, slug)),
            ),
        }),
      ),
  },
})

export const StudioApp = ActionMenu.compose({
  of: Session.compose({
    of: StudioCoreProgram,
  }),
})

export type StudioAppModel = typeof StudioApp.Model.Type
export type StudioAppMessage = typeof StudioApp.Message.Type
export type BoundStudio = Interaction.BoundInteraction<
  StudioAppModel,
  StudioAppMessage
>

export const createBoundStudio = (initialUri?: string): BoundStudio => {
  const listeners = new Set<() => void>()
  let model: StudioAppModel = StudioApp.init()[0]
  const bound = Interaction.bind<StudioAppModel, StudioAppMessage>(StudioApp, {
    readModel: () => model,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      model = StudioApp.update(model, message)[0]
      listeners.forEach(listener => listener())
    },
    stop: () => Promise.resolve(),
  })
  if (initialUri !== undefined && initialUri.startsWith('/studio')) {
    bound.openUri(initialUri, Navigation.Launch())
  }
  return bound
}
