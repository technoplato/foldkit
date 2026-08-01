import { Array, Option } from 'effect'
import { type Html, type HtmlBuilder, inertHtml as ih } from 'foldkit/html'

import { type DocPage, docPage } from '../../markdown'
import { type Message } from '../../message'
import { pageTitle } from '../../prose'
import { blogRouter } from '../../route'
import { type CopiedSnippets } from '../../view/codeBlock'
import { type BlogPost, formatPostDate, posts } from './posts'

// VIEW

const docPageBySlug: ReadonlyMap<string, DocPage> = new Map(
  Array.map(posts, post => [post.slug, docPage(post.document, post.slug)]),
)

const backToBlogLink: Html = ih.a(
  [
    ih.Href(blogRouter()),
    ih.Class(
      'inline-block mb-6 text-sm font-medium text-accent-600 dark:text-accent-400 hover:underline',
    ),
  ],
  ['← Blog'],
)

export const view = (
  post: BlogPost,
  copiedSnippets: CopiedSnippets,
  h: HtmlBuilder<Message>,
): Html =>
  ih.article(
    [],
    [
      backToBlogLink,
      ih.header(
        [ih.Class('mb-8')],
        [
          pageTitle(post.slug, post.frontmatter.title),
          ih.p(
            [ih.Class('text-sm text-gray-500 dark:text-gray-400')],
            [formatPostDate(post.frontmatter.date)],
          ),
        ],
      ),
      Option.match(Option.fromNullishOr(docPageBySlug.get(post.slug)), {
        onNone: () => ih.empty,
        onSome: page => page.view(copiedSnippets, h),
      }),
    ],
  )
