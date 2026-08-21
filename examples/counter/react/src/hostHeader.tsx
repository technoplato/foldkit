import type { HostSurface } from 'counter-core-example'

/** Renders one host title, sentence, and GitHub source link. */
export const HostHeader = ({ title, description, sourceUrl }: HostSurface) => (
  <header className="space-y-2">
    <h1 className="text-xl font-semibold">{title}</h1>
    <p className="text-sm text-gray-600">
      {description}{' '}
      <a className="underline break-all" href={sourceUrl}>
        {sourceUrl}
      </a>
    </p>
  </header>
)
