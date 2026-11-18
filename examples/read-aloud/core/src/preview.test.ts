import { describe, expect, it } from 'vitest'

import { Isbn13 } from './ids.js'
import { GooglePreview, NoPreview } from './model.js'
import { dynamicLinksUrl, previewOfDynamicLinks } from './preview.js'

const christmas = Isbn13.make('9780544553729')

const feelingHappy = Isbn13.make('9780063342705')

describe('Dynamic Links', () => {
  it('asks Google about one ISBN, answering with a call to the callback', () => {
    expect(dynamicLinksUrl(christmas, 'readAloudPreview')).toBe(
      'https://books.google.com/books?jscmd=viewapi&bibkeys=ISBN:9780544553729&callback=readAloudPreview',
    )
  })

  it('reads an embeddable preview with its volume', () => {
    expect(
      previewOfDynamicLinks(
        {
          'ISBN:9780544553729': {
            bib_key: 'ISBN:9780544553729',
            preview: 'partial',
            embeddable: true,
            preview_url:
              'https://books.google.com/books?id=l2WMBAAAQBAJ&printsec=frontcover&source=gbs_ViewAPI',
          },
        },
        christmas,
      ),
    ).toEqual(
      GooglePreview({
        volumeId: 'l2WMBAAAQBAJ',
        extent: 'Partial',
        previewUrl:
          'https://books.google.com/books?id=l2WMBAAAQBAJ&printsec=frontcover&source=gbs_ViewAPI',
      }),
    )
  })

  it('reads no preview where the publisher allows none, or Google does not know the book', () => {
    expect(
      previewOfDynamicLinks(
        {
          'ISBN:9780063342705': {
            preview: 'noview',
            embeddable: false,
            preview_url:
              'https://books.google.com/books?id=5MkG0AEACAAJ&source=gbs_ViewAPI',
          },
        },
        feelingHappy,
      ),
    ).toEqual(NoPreview())
    expect(previewOfDynamicLinks({}, feelingHappy)).toEqual(NoPreview())
    expect(previewOfDynamicLinks('not an answer', feelingHappy)).toEqual(
      NoPreview(),
    )
  })
})
