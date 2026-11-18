# Plan 12 | Books credits: authors, illustrators, editors, and publishers

**Status:** Accepted. The owner asked for it in Recording 243 (issue #798);
his words are in [user-messages/2026-10-17-books-authors.md](user-messages/2026-10-17-books-authors.md).

## What a person sees

- A book read aloud lists its credits, each a link to a page in Books:
  "Ada Quill, Author" opens `/books/authors/ada-quill`, "Noor Vale,
  Illustrator" opens `/books/illustrators/noor-vale`, "Iris Penn, Editor"
  opens `/books/editors/iris-penn`, and "Harbor House, Publisher" opens
  `/books/publishers/harbor-house`.
- An author's page names them and lists their books read aloud, each a link
  to the book: `/books/authors/ada-quill` lists the two picture books she
  wrote. It also lists the library's audiobooks that name her as an author,
  and links her other roles ("Also an illustrator").
- An illustrator's, an editor's, and a publisher's page do the same for that
  role.
- A title in the library links its authors to the same pages:
  `/books/the-lantern-keeper` links "Ada Quill" to `/books/authors/ada-quill`.

## Decisions

1. **The address names a person by a tag of their name**, as a title is
   named by its slug: `Ada Quill` is `ada-quill`, `H. G. Marsh` is
   `h-g-marsh`, accents drop (`Renée Lune` is `renee-lune`). A name with no
   Latin letters or digits is tagged by its code points, so every name has a
   page. The tag is ours: no Open Library id appears in an address, and no
   credit links outside Books.
2. **Credits are data in Scribe's things graph** (ADR 0048 Amendment 2, issue
   #613): a `person` or `organization` thing and a `thingRelations` row whose
   predicate gives the role. `authorOf` is Author, `illustratorOf` is
   Illustrator, `contributedTo` with the qualifier `role: "editor"` is Editor,
   and `publisherOf` is the publisher. A retracted, rejected, candidate, or
   personal row never shows. Until the graph moves into Instant, Read Aloud
   reads it where Scribe keeps it on this laptop: `~/Scribe/things/graph/`
   (`things.jsonl`, `relations.jsonl`), beside the books it already reads.
3. **The catalog fills in only what the graph lacks.** A book with no credit
   in the graph credits the authors Open Library lists; a book with no
   publisher in the graph takes the first publisher Open Library lists, since
   Open Library often lists one publisher under several names
   (`Harbor House Publishing` and `Harbor House`). Open Library often lists a
   picture book's illustrator as an author, so a book's credits come from the
   graph once its credits page was read aloud.
4. **The pages are Books' places, above the library**, like the books read
   aloud: `/books/authors/ada-quill` is the library with the author's page
   on top. Read Aloud stays the Program that follows a reading: it decodes the
   credits, offers the rows, and draws a book's credits as links when its
   holder gives the paths, and as names when it does not.
5. **Older rows still decode.** A book's `credits` and `publishedBy` decode
   to `[]` when a row lacks them, so the program log's older
   `ReceivedReadings` rows and a device's kept snapshot still decode. The old
   `authors` and `publishers` lists are gone from the book. A tab still on the
   previous build cannot read the newer rows; once it is running it skips them
   (`SyncFailed` is ignored outside Starting), and a reload brings the new
   build.
6. **Link previews say who, never what was read.** `/books/authors/ada-quill`
   unfurls as "Ada Quill" with "Author". It lists no books, as the books read
   aloud have no preview. An unknown name answers nothing.

## Not in this plan

- Narrators, cover designers, and art directors as their own pages. The graph
  already has `narratorOf` and `coverDesignerOf`; adding a role is one literal
  and one address word.
- Reading the graph from Instant. Read Aloud reads Scribe's files today, as it
  reads the books.
