# QubeQuote

Mobile-first marketplace web app (Thai) — buyers post RFQs, sellers post offers.
Vanilla HTML/CSS/JS, no build step. Open `index.html` in a browser.

Shipped as **Konnex** until 2026-09-01, and the change log below is written in
the name that was current when each entry was written. Two things still answer
to the old one on purpose: the Cloudflare Worker (`konnex.xeeb0262.workers.dev`,
see `wrangler.toml`) and the service-worker cache cleanup, which clears caches an
older build created under that name.

## Structure

```
index.html          single-page app, 19 screens toggled by navigateTo('page-…')
assets/img/         41 photos + brand mark + PWA icon
assets/fonts/       22 IBM Plex Sans / Plex Sans Thai woff2 subsets
```

Screens: `page-feed`, `page-rfq-offers`, `page-rfq-detail`, `page-company-profile`,
`page-messages`, `page-edit-profile`, `page-create-post`, `page-notifications`,
`page-my-bids`, `page-my-offers`, `page-offer-detail`, `page-my-requests`,
`page-settings`, `page-saved`, `page-history`, `page-auth`, `page-dashboard`,
`page-premium`, `page-analytics`.

The PWA manifest is generated in-browser at runtime, so the app still works when
opened straight off the filesystem.

## Provenance

Imported from the `Konnex app` Claude Design project, file `uploads/konnex-app_1.html`.

That file could not be read through the design API directly — it inlines a 512×512
PNG as a base64 data URI, which pushes it past the API's 256 KiB per-file read cap.
It was instead recovered from the project's standalone export
(`Konnex (standalone).html`), whose `<script type="__bundler/template">` block holds
the original page as a JSON-encoded string. The recovered page was verified
byte-for-byte against the 262,070 characters that *were* readable through the API.

Three changes were made to the recovered source, all mechanical:

1. The bundler had replaced external image/font URLs with uuid placeholders and
   moved the bytes into a `__bundler/manifest` block. All 63 were extracted to
   `assets/` and the references rewritten to relative paths.
2. Three large inline base64 icons were written out as real files. Identical bytes
   were deduplicated — the favicon, the apple-touch-icon and the nav brand logo turned
   out to be the same 512×512 PNG (`assets/img/konnex-mark-1.png`). A 37-byte 1×1 GIF
   placeholder was left inline.
3. One lookup read `window.__resources.pfPlaceholder`, a global the bundler injected
   at runtime, and fell back to an Unsplash URL when absent. Since this build ships
   real files rather than that global, the lookup now points directly at
   `assets/img/pfplaceholder-1.jpg` — the same image the standalone build resolved to.
   Left as-is it would have silently degraded to the network fallback.

No markup, styling or behaviour was otherwise altered during the import itself; later
edits are listed under *Changes after import*. `index.html` is 580 KB; it was 1.8 MB
before the assets were extracted.

Verified after import: all 19 screens navigate without error, all 67 images resolve
locally, no console errors, Thai and Latin fonts load from `assets/fonts/`.

## Changes after import

**Mobile left-nav drawer.** On mobile the left sidebar column sat on top of the page
content. The source already hid it at `≤1024px`, but via a hardcoded list of page ids
that missed three pages — `page-rfq-detail`, `page-offer-detail` and `page-settings`
(the settings rule targeted `.set-wrap`, while that page's sidebar actually lives in
`.layout`). Those three were added to the hide rule.

Rather than just hiding the menu, it is now reachable from a `☰` button in the top bar
that opens it as an off-canvas drawer over a scrim. It closes on the ✕ button, a scrim
tap, `Esc`, or picking any nav item, and auto-closes if the window widens past 1024px
so it can't be left stranded. Body scroll is locked while open, focus moves into the
drawer and returns to the button on close, and the transition is dropped under
`prefers-reduced-motion`.

The drawer is a single element at the end of `<body>` holding a `.side-nav`, so the
app's existing `renderSidebars()` fills it and keeps the active item in sync on every
navigation — no duplicate menu definition. All of it is additive: one `<style>`, the
drawer markup and one `<script>`, appended at the end of the file. Desktop (>1024px)
renders exactly as before — sidebars back in flow, no button, drawer `display:none`.

**Mobile overflow fixes.** Several rows overlapped their neighbours on mobile. All of
it was one defect repeated: a flex child left at the default `flex: 0 1 auto` with no
min-width floor, so once the row ran out of space the box shrank below its own text
and the text spilled out (overflow is visible).

- **Top-bar search pill.** The source hides it at `≤1024px` via `.navbar .search`
  (specificity 0,2,0), but every page also ships `#page-x .search{display:flex}`
  (1,1,0) further down, which outranks it. The pill therefore survived on mobile,
  collapsed to ~34px, and spilled its placeholder across the notification and message
  icons — the overlap in the reported screenshot. Now hidden with `!important`, which
  is what it takes to win here.
- **`KONNEX` wordmark** was collapsing to 0–32px against a 67px text.
- **Profile tabs** were crushed to 9–15px each. Six Thai labels total 784px against
  282px of room — nearly 3× over, so no font or spacing tweak fits them on one line.
  The strip scrolls instead, with gap and padding tightened (30→16px, 28→12px) so more
  tabs are visible at once, a mask-based fade on whichever edge still has content, and
  the selected tab scrolled into view automatically so it is never left half-cut.
- **Saved/history rows** — text column collapsed to 5px between a 150px thumbnail and
  a 130px action column.
- **Profile rating bars** and the **sealed-bid banner** got 0px because their
  non-shrinkable siblings already exceeded the row (banner: 42+72+192 = 306 > 283).
  Those rows now wrap, pushing the wide fixed element onto its own line.
- **Offer-comparison grid** on the RFQ detail page was 586px of fixed columns inside a
  283px card, spilling over the page; it now scrolls horizontally instead.

- **Feed card imagery** was capped at `max-width: 280px` inside a card whose content
  box is 315px, so every thumbnail sat flush left with 35px of dead space down the
  right — on both the buy (RFQ) and sell (offer) cards, which share
  `.post-thumb-wrap`. The cap is lifted on mobile so the image fills the card.
  `cycleThumb()` translates the track by `-N * 100%`, so a wider slide still steps
  exactly one image; verified the slide width equals the track width after the change.

Measured across all 19 screens: **0 overflowing elements at 375px and above**, and no
horizontal page scroll. Everything is inside `@media (max-width: 1024px)`, so desktop
is untouched by construction.

**Touch-device hover latch.** The app ships 101 `:hover` rules and no `(hover: hover)`
guard. On a touch screen there is no pointer to leave, so tapping a card latches its
hover state — lifted, shadowed, thumbnail zoomed — until you tap something else. The 41
selectors that move things are neutralised under `@media (hover: none)`. Colour-only
hovers are left alone; they read as a harmless selection cue.

**Card galleries on "งานของฉัน".** Those cards carried a single static `<img>`, while
feed cards have a 3-image swipeable gallery. A script at the end of the file upgrades
each one in place: it wraps the existing image in the same `.post-thumb-wrap` /
`.post-thumb-track` structure, adds two more from `assets/`, and builds the prev/next
arrows and dots — reusing the global `cycleThumb()` rather than duplicating the logic.
Pointer-swipe is bound with the same handler the feed uses. The gallery stops click
propagation so swiping does not fire the card's own navigate-to-detail handler; the
rest of the card still navigates. The feed's gallery CSS is all `#page-feed`-scoped, so
a sibling set was added for this page: 200×158 on desktop matching the original thumb,
full-width 4:3 once the card stacks at ≤768px.

The prev/next arrows are revealed on hover, which a touch screen can never do — they
are forced visible under `@media (hover: none)` on both pages.

Effects audited end to end: 3 `@keyframes` (`pageFadeIn`, `modalPop`, `badgePulse`) all
defined and bound to live elements, 41 transition declarations intact across cards,
buttons, sidebar links, the carousel track, the drawer and the scrim, and two
`prefers-reduced-motion` blocks — the app's own, which kills all animation and clamps
every transition to 0.01ms, plus the drawer's.

**Account entity type.** Signup now asks บุคคลธรรมดา vs นิติบุคคล before anything else.
The choice is persisted to `localStorage` under `kx.entity` and drives three places that
were previously unrelated: the signup fields themselves (ชื่อ-นามสกุล + เลขบัตรประชาชน
vs ชื่อบริษัท + เลขทะเบียนนิติบุคคล), the Verified flow — which already had its own
person/company document switch, now pre-selected to match — and the edit-profile
wording (รูปโปรไฟล์ vs โลโก้บริษัท).

**Profile and cover upload.** The edit-profile page had a decorative "เปลี่ยนโลโก้"
button wired to nothing. It now has real `<input type="file">` controls for a cover
image and a profile image, with object-URL previews, a clear button, and validation on
type (JPG/PNG/WebP) and size (2MB). A rejected file is cleared from the input rather
than left there — otherwise the previous preview stays on screen while the input holds
a file that failed validation, and a submit would send it.

**Offer detail right rail removed.** `#page-offer-detail .content` was a 490px + 300px
grid; the second column is gone and the main column now spans the full 810px. Note this
also removed the seller card (rating, jobs completed, response time, ดูโปรไฟล์ผู้ขาย)
and the status / posted-date / quote-count card — that information is no longer shown
anywhere on this page.

**ใบเสนอราคา rows link to their source.** The rows had `cursor: pointer` but no handler,
so clicking did nothing. Each row now reads its own `RFQ-####-####` or `OFR-####-####`
id and navigates to the matching detail page. Buttons, links and file chips inside a row
keep their own behaviour rather than triggering the row link.

**Uniform mobile gutters.** `.page-layout` and `.profile-layout` carried a 32px desktop
gutter into mobile, and offer-detail nested `.content` inside `.wrap` with both at 14px.
So detail and profile pages rendered 28–64px narrower than the rest. All content pages
now sit at a 14px gutter — measured 402px wide at a 430px viewport across every page.

**Entity type is editable from the profile too.** The signup choice is now mirrored by a
ประเภทบัญชี section on the edit-profile page. Both write the same `kx.entity` key and
call the same handler, so changing it in either place updates the signup fields, the
Verified document list and the profile wording together.

**Buyer/seller picker removed from signup.** An account can post RFQs and offers both,
so the choice only added a step. `authRole()` is kept as a null-guarded no-op rather
than deleted, in case anything still reaches for it.

**Full-screen lightbox.** Images opened from a gallery were capped at 90vw × 88vh
inside a 30px-padded overlay. They now fill the viewport with `object-fit: contain`.

**Top bar: ข้อความ and บันทึกไว้ swapped for search.** Both remain reachable from the
drawer, the desktop sidebar and the bottom bar, so nothing became orphaned. Search had
no working entry point anywhere before — the wide desktop pill was decorative markup.
It now opens a real search overlay, as does the new icon on mobile; the icon is hidden
above 1024px so each breakpoint has exactly one way in. The query layers a free-text
match on top of the feed's existing type/location/category filters rather than
replacing them, and drives the same empty state.

**Uploaded photo appears in the top bar.** The avatar chip on all 18 page headers
switches from the placeholder icon to the uploaded image, and back when it is cleared.
It is persisted as a data URL only when the file is under 700KB — larger images would
risk the localStorage quota, so those last the session only.

**Edit-profile rebuilt around a shared profile record.** The page was a five-field stub
whose Save did nothing but `alert()`. It is now the full form from the design: account
type, cover + logo, basic info (with live character counters), contact, a tag input for
ความเชี่ยวชาญ, repeatable certificate rows, service-area toggles, plus a right rail
holding a live profile preview and a completeness meter.

All of it reads and writes one record in `localStorage` under `kx.profile`, and that
same record is pushed onto the public company profile on save — name, hero initial or
logo, cover, about text, contact rows, skill tags, certificate rows, service areas, and
the location in the hero meta line. The hero's Verified pill is preserved by replacing
only the heading's leading text node rather than its innerHTML.

Signup feeds the same record: the name and tax/ID typed there seed the profile, so a new
account doesn't land on a form pre-filled with the sample company's details. Entity type
reshapes all three surfaces at once — the company-only block (ประเภทธุรกิจ, ปีที่ก่อตั้ง,
จำนวนพนักงาน, ทุนจดทะเบียน, เลขผู้เสียภาษี) is hidden for บุคคลทั่วไป, and the labels
switch to ชื่อ - นามสกุล / เกี่ยวกับตัวคุณ / อัปโหลดรูปโปรไฟล์.

Two bugs found while building it, both fixed:

- `collect()` dropped blank certificate rows, which desynced `data.certs` from the DOM —
  deleting one row removed two, and the wrong one. Blanks are now kept in the working
  copy and filtered only on save and on render.
- Writing a certificate's subtitle used a `span:last-of-type` fallback, which matched the
  badge icon's span and replaced the SVG with text. It now targets `.cert-title` and
  `.cert-sub` explicitly and never touches `.cert-ic`.

**Province dropdown scrolls.** The panel was capped at 340px but left `overflow: visible`,
and the list inside had no max-height — so 78 provinces rendered as a 3,197px column
straight down through the page behind it. The list is now capped at 270px (340 minus the
search row and padding) and scrolls; the panel clips.

**Mobile touch targets.** The top bar ran with **0px** between its left and right groups,
and its controls were 26×26 — well under a comfortable thumb target. Raised to 40×40 with
a 12px gap between groups; the feed card's save control went 21→36px and the carousel
arrows 24→34px. Each page ships its own `#page-x .icon-btn` rule at 26px, which outranks
any class selector, so these need `!important` to land. Below 360px the `KONNEX` wordmark
is hidden — its 67px is the difference between the bar fitting and not. Desktop keeps the
original sizes; all of it is inside `@media (max-width: 1024px)`.

Checked at 320 / 375 / 1280px: no horizontal page scroll at any width, and the 375px
sweep is clean across all 19 screens.

**Edit-profile trimmed and completed.** An audit found six fields collecting input that
never appeared anywhere — แท็กไลน์, ประเภทธุรกิจ, ปีที่ก่อตั้ง, จำนวนพนักงาน,
ทุนจดทะเบียน, เลขผู้เสียภาษี — inside the page's largest card (937px, 8 inputs, 5 of them
dead). Rather than delete useful B2B credibility signals, they now have somewhere to
land:

- **Tagline** renders under the company name in the hero (the slot didn't exist and is
  created on first use).
- **ประเภทธุรกิจ / ปีที่ก่อตั้ง / จำนวนพนักงาน / ทุนจดทะเบียน** render as a
  ข้อมูลบริษัท card on the public profile, company accounts only — it is removed when
  the account is บุคคลทั่วไป.
- **เลขประจำตัวผู้เสียภาษี** was dropped from this form entirely. It is already captured
  at signup and consumed by the Verified flow, it is sensitive, and it was never public.
  `collect()` no longer reads it, which would otherwise blank the stored value now that
  the field is gone.

**ประเภทบัญชี moved to Settings.** It is an account setting, not profile content, and it
sat 170px tall at the top of the page pushing the real content down. Both places drove
the same handler, so moving it changed nothing functionally — the edit form still
reshapes when it is switched.

**Portfolio upload added.** The completeness meter listed เพิ่มผลงาน (Portfolio) with no
control anywhere on the page, so it was pinned at 80% forever. There is now a multi-file
portfolio uploader with thumbnails, per-image removal and the same type/size validation;
images are stored as data URLs so they survive a reload, and they render into the
profile's ผลงานของเรา grid. The meter reaches 100%.

**Individual accounts got their own shape, not a trimmed company one.** In person mode
the form had exactly eight generic fields and nothing designed for an individual — a
company account had a four-field credibility block (ประเภทธุรกิจ / ปีที่ก่อตั้ง /
จำนวนพนักงาน / ทุนจดทะเบียน) while a freelancer had no equivalent at all. Person accounts
now get อาชีพ / ตำแหน่ง and ประสบการณ์ (ปี), which render as a ข้อมูลส่วนตัว card on the
public profile the same way the company block renders as ข้อมูลบริษัท.

The public profile is written for a company throughout, so its headings are swapped by
entity: เกี่ยวกับบริษัท → เกี่ยวกับฉัน, ติดต่อบริษัท → ติดต่อ, บริการของเรา →
บริการของฉัน, ผลงานของเรา → ผลงานของฉัน, ใบรับรองและมาตรฐาน → ใบรับรองและวุฒิบัตร. The
map is applied in both directions so switching back restores the company wording rather
than leaving the page stuck.

The certificates section also advertised "เช่น ISO, BOI" to individuals — those are
company certifications an individual cannot hold. It now says ใบประกาศนียบัตร /
ใบอนุญาต / วุฒิบัตร in person mode.

**Text contrast raised to WCAG AA.** An audit of every text node on all 19 screens found
**171 elements below the AA threshold**, across 62 distinct styles. Font weight was not
the cause — the app declares 700 on 314 rules and nothing below 400 anywhere. It was
purely colour, and mostly one variable.

| token | was | ratio | now | ratio |
|---|---|---|---|---|
| `--ink-faint` | `#9296a8` | 2.94 | `#5f6675` | 5.76 |
| `--amber` | `#f59e0b` | 2.15 | `#b45309` | 5.02 |
| `--orange` | `#f97316` | 2.80 | `#c2410c` | 5.18 |
| `--green` | `#16a34a` | 3.30 | `#15803d` | 5.02 |
| `--red` | `#ef4444` | 3.99* | `#dc2626` | 4.83* |

\* red is mostly a badge fill, so the figure is for white text on it.

`--ink-faint` alone accounted for over half the failures — chat timestamps, notification
times, the ราคาที่เสนอ labels, group headers, the auth footer. Several of these run at
10.5–12.5px, where a light grey in Thai is genuinely hard to read.

Each token is used as a fill as well as a text colour, so the fills are pinned back to
the original bright values (dots, progress bars, badge chips) — except where a fill
carries white text, which needs the darker value. White-on-brand-blue buttons were 3.80;
their surfaces use `--blue-700` (5.35) while borders, links and icons keep `--blue-600`,
so the brand colour is unchanged everywhere it isn't sitting under white text.

Result: **0 failing elements** at 375px and 1280px.

Two things worth knowing:

- `--ink-faint` (#5f6675) is now nearly identical to `--ink-soft` (#5f6479). The
  three-tier grey scale has effectively collapsed to two — passing AA on the off-white
  page background (#f7f7fb) leaves very little room below `--ink-soft`. Hierarchy now
  has to come from size and weight rather than colour. Darkening `--ink-soft` would open
  the gap back up if the flattening reads badly.
- Elements over gradients are skipped by the audit — a flat-colour walk can't judge
  them. They were checked by hand instead; all are white on dark blue.

**Status tabs made uniform and colour-coded.** The three status strips (`page-rfq-offers`,
`page-my-bids`, `page-my-offers` — one `.status-tab` component, 11 tabs) put the label and
its count in a single bare text node after the icon. Thai then wrapped mid-word —
"เปิดอยู่" broke into "เปิด" / "อยู่" — so tabs ran 2–3 lines at 83px and 105px tall
depending on how each label happened to break. Widths were already equal; the ragged
height was the asymmetry.

A script now splits `label (count)` into a count row and a `nowrap` label row, with the
icon riding beside the label. Every tab is the same shape: **67px tall**, equal width, no
clipped text, at both 375px and 1280px.

Each tab also carries a status colour, reusing the dashboard's vocabulary (a 3px accent
bar plus a coloured count):

| status | tabs | colour |
|---|---|---|
| total | ทั้งหมด | `#16192b` |
| live | เปิดรับ, เปิดอยู่ | `--blue-700` |
| waiting | พิจารณา, รอผล | `--amber` |
| done | เสร็จสิ้น, ชนะ | `--green` |
| lost | ไม่ผ่าน | `--red` |
| on hold | พักไว้ | `#6b7280` |
| closed | ปิดแล้ว | `#5f6479` |

The count renders at 17px bold — under the large-text threshold — so each of these was
picked to clear 4.5:1 on white in its own right. พักไว้ and ปิดแล้ว get separate greys
rather than sharing one, since "paused" and "closed" are different states.

**Offer comparison fits the card.** `#page-rfq-detail .offer-card` is a five-column grid
(38+150+92+92+132 plus gaps = 604px) inside a 347px card, so reading one offer meant
scrolling sideways. On mobile it stacks — avatar and name on the first row, then each
detail block full width with its label and value on one line, which costs almost no
height. Measured 355px wide against a 353px scroll width: no horizontal scroll. Desktop
keeps the five-column row.

**Back bar, only where it means something.** `goBack()` and `.kx-backbar` already existed
but the bar was only in the markup of two detail pages, so anything reached by a button
was a dead end — สอบถามรายละเอียด jumps to ข้อความ, which had no way back. A script now
injects the bar, labelled with the page you came from (`navHistory`), reusing `goBack()`.

It appears only on a *contextual* navigation, and getting that right took three passes:

1. First cut showed it on every inner page — wrong for anything opened from a menu.
2. Then it keyed off "was the click inside a menu?", which still leaked on the top bar's
   notification bell. The whole `.navbar` is menu-level, not just the drawer and bottom
   bar.
3. That test still had a hole: it asked *where* a click came from, never *whether* a
   click happened. Boot restores the page from `location.hash` with
   `navigateTo(start, true)`, and the `hashchange` listener does the same — no gesture
   involved, so both looked identical to pressing a button in the content. Opening the
   app straight at `#page-rfq-offers` produced a back bar labelled with a page the user
   had never visited.

It now requires a real press: a capture-phase listener timestamps clicks that land
outside any menu, and the bar mounts only if a navigation follows one within a second.
Boot, hash edits and programmatic calls all produce nothing.

Verified across six menu paths (sidebar, drawer, bell, logo), three contextual ones, two
programmatic calls, plus a fresh boot at `#page-my-bids` and a `hashchange` — no leaks in
either direction.

**The back chain terminates at the page you opened from the menu.** Separate from where
the bar *appears* was where it *goes*. `navigateTo` pushes the previous page on every
call, menu jumps included, so the stack never had a floor: opening งานของฉัน from the
menu, tapping a card, then pressing back returned to งานของฉัน — and pressing back again
kept walking out to whatever preceded it. Opening a page from the menu now resets the
stack, making that page the root, and the bar is suppressed whenever the stack is empty.

Two things made this harder to see than it should have been:

- The detail pages carry a **static** `.kx-backbar` in their markup, so a bar was visible
  on them regardless of the injection logic — its `goBack()` fell through to
  `navigateTo('page-feed')` when the stack was empty, which is why back from a card
  landed on the feed instead of งานของฉัน.
- A single card tap calls `navigateTo` **three times** — the card carries both an inline
  `onclick` and a `[data-clickable]` handler. The gesture marker was being consumed on
  the first call, so calls two and three looked programmatic and triggered the
  root-reset, wiping the very origin the back button needed. The marker is no longer
  consumed; the one-second window bounds it, and the reset only fires on a real page
  change.

**Decided by destination, not by how you got there.** Even after the above, แดชบอร์ด
still showed a bar after login, and switching ที่ส่ง ↔ ที่ขอ looked like a drill-down —
because the rule was still reading the *trigger*. A press on the sign-in button or on a
section tab is a content press, so it qualified.

The rule is now a set of **root pages**: the ten main-menu destinations, the bottom bar's
page-create-post, and the tab siblings that sit next to a menu page (page-my-offers next
to ต้องการซื้อ, page-my-requests next to ที่ส่ง). A root never carries a back bar and
always resets the chain, however it was reached. Everything else shows one when there is
something on the stack.

Note this makes ข้อความ a root too, so สอบถามรายละเอียด → ข้อความ no longer offers a
back step — consistent with the rule, since ข้อความ is a main-menu destination in its
own right.

Verified: all 14 roots entered by every available route carry no bar; menu → งานของฉัน →
card → back lands on งานของฉัน and stops with an empty stack; the same from ใบเสนอราคา;
login → แดชบอร์ด is clean; ที่ส่ง ↔ ที่ขอ switches both ways with no bar. Holds via the
sidebar on desktop and the bottom bar on mobile.

**Wider phone gutters.** 14px each side spends 7.5% of a 375px screen on margin. Below
480px the page gutter is 10px and card padding 14px, taking cards from 347px to 355px.

**Individuals are their own contact.** The signup field "ชื่อผู้ติดต่อ (ถ้าต่างจากด้านบน)"
wrapped to two lines and restated the name just entered. It is hidden for บุคคลธรรมดา —
the form drops to five fields — and companies keep it, relabelled to plain ชื่อผู้ติดต่อ.

**Company profile no longer overflows the viewport.** This one predated the import work.
`#page-company-profile .profile-layout` declares `grid-template-columns: 230px 1fr`,
which looks right — but a `1fr` track is `minmax(auto, 1fr)`, and that `auto` floor is the
content's min-content width. Something inside the column could not shrink, so the track
resolved to **958px** against **866px** of available space (1180px layout − 64px padding
− 230px sidebar − 20px gap), pushing the page 3px past the viewport and dragging
`.wrap`, `.hero-card`, `.grid` and every card in the right rail out with it.

`minmax(0, 1fr)` removes the floor, on the outer layout and the inner `.grid`. The column
now resolves to exactly 866px and the inner grid to 528px + 320px. Nothing is clipped and
no text overflows. Scoped to `min-width: 1025px`, since both already collapse to a single
column on phones.

**Back bar: the top bar counts as menu.** The first pass at this missed the notification
bell — the whole `.navbar` is menu-level (burger, logo, search, bell, avatar), not just
the drawer and bottom bar. The selector now covers `.navbar` and `.sh-nav`; the back bar
is a sibling of `.navbar`, so pressing it never re-triggers the check. Verified across 10
menu entry points (0 leaks) and 4 contextual ones (all correct).

**The three principles, expressed as behaviour — not copy.** An audit of what the app
already does found the mechanisms largely in place and simply invisible:

- **Equality** — across the four listing pages there is *no* boosted, sponsored, pinned
  or featured styling at all. Every card is rendered identically. Nothing told the user
  that, so they had to assume it.
- **Transparency** — the sort rule is declared on four pages ("เรียงตาม: ราคาต่ำ-สูง",
  "ล่าสุดก่อน"), and the sealed-bid banner explains the reveal mechanic.
- **Fair competition** — sealed bidding works, and all bidders carry a verified badge.

The gap was that none of it was restated at the moment someone commits. A rule panel now
appears inside the two modals that matter, built from the page's live state rather than
fixed copy:

- **Submitting a price** — that the price is sealed and *when* it opens (reading the live
  countdown), that all bidders see the same brief and placement cannot be bought, and
  that every bidder is identity-verified. Once the auction closes the sealed line drops
  out on its own, so the panel never claims something untrue.
- **Choosing a winner** — the exact sort rule in force, the verified bidder count, and
  that the decision is recorded and announced to everyone at once.

An earlier attempt printed the three words on the login screen. That was the wrong read —
the request was for the product to behave this way, not to advertise it — and that change
was reverted in full.

**งานของฉัน / ใบเสนอราคา cards squared up.** Both wrapped into a ragged shape on mobile:
a full-width image, then a cramped 200px/110px row, then a full-width status block — and
on ใบเสนอราคา the price box floated 90px below the text beside it. Each card is now a
single column of full-width bands, and the stat boxes became strips with the label left
and the figure right. The ใบเสนอราคา card came down from 464px to 405px.

**Cards actually read as separate cards.** Three separation cues were weak at the same
time: a white card on a `#f7f7fb` page (about a 3% luminance step), a `#eef0f4` border
that barely registers against either, and no shadow at all — a rule commented "flatten
cards" had set `box-shadow: none !important`. The list read as one continuous sheet.
Border to `#dde1ea`, a soft two-layer shadow, and the list gap from 14px to 16px.

That flatten rule is `!important` behind id-scoped selectors, so a class rule cannot
reach it; the fix mirrors its selector list and wins on source order.

**Every status badge saturated.** The whole app's 27 tinted badges were built from just
five very pale fills — chroma 16 to 25 out of a possible 255 — so a status read as
decoration rather than information. Raising a fill always costs contrast against the
text on it, so each family gets a darker companion colour; the result is 2.5–4.6× the
chroma *and* better contrast than before:

| family | fill | chroma | text | contrast |
|---|---|---|---|---|
| green — verified, won, sent, received | `#ecfdf3` → `#bbf7d0` | 17 → 60 | `#116635` | 4.76 → 5.82 |
| orange — ปิดรับข้อเสนอ, รอผล, ข้อเสนอขาย | `#fff4ec` → `#fed7aa` | 19 → 84 | `#9a3412` | 4.78 → 5.40 |
| blue — tags, quote counts, roles | `#e8f3fc` → `#bfdbfe` | 20 → 63 | `#0f52b0` | 4.76 → 5.18 |
| amber — ยังไม่ได้ตอบ, รอราคา | `#fff7e6` → `#fde68a` | 25 → 115 | `#92400e` | 4.71 → 5.69 |
| purple — category tag | `#f2eefe` → `#ddd6fe` | 16 → 40 | `#5b3fd4` | **3.97 → 4.87** |

Applied to status and label badges only — action buttons, chips and tabs keep the lighter
tints so a control still reads differently from a state.

The purple one was already failing AA at 3.97 before any of this. The earlier contrast
sweeps missed it because they only measured leaf nodes with text, and that badge wraps an
icon span. Widening the sweep to elements whose children are icon-only also surfaced four
more white-on-brand-blue controls still at 3.80 — `.btn-create`, `.btn-edit-offer`,
`.sealed-reveal`, `.btn-choose`, `.pf-btn.primary`, `.chat-send`, `.btn-submit-quote`,
`.mr-btn.primary` — now on `--blue-700` with the rest.

The sweep also learned to skip text over artwork: the hero meta line is light text on a
cover photo behind a scrim, and no ancestor carries a solid colour, so a flat-colour walk
scored it 1.14 and cried wolf.

**Offer-count badge saturated.** `#ECFDF3` and `#FFF4EC` were pale enough that the count
read as decoration rather than data. Now `#BBF7D0` / `#FED7AA` with matching `#86EFAC` /
`#FDBA74` edges. The count is 24px bold so it clears the large-text bar (4.14 and 3.83
against 3.0), but the caption is 11.5px normal — at the existing `#5f6479` it scored
**4.33** on the orange fill and missed AA, so inside these badges it moves to `#565b6e`
(4.98 / 5.56).

**Category UI removed.** Every category surface is gone — 25 lines across eight places:

- the purple `เครื่องจักร/ขนส่ง` tag on the RFQ detail header
- the `หมวดหมู่` filter chip on the feed
- the `หมวดหมู่ยอดนิยม` card in the feed's left sidebar
- the `หมวดหมู่` select in advanced search

Four more were not circled in the request but are the same feature, and leaving them
would have been inconsistent: the `หมวดหมู่ยอดนิยม` card in the feed's right rail, and
the `หมวดหมู่ทั้งหมด` chips on งานของฉัน, ใบเสนอราคา and ประกาศขายของฉัน.

The category filter's script is left in place but inert: `buildFeedCatMenu()` already
guards on a missing element, and `currentFeedCatFilter` stays `'all'`, so
`applyFeedFilters()` keeps passing every card — verified 6 of 6 still visible. The
advanced-search grid reflows from six fields to five on its own (`repeat(3, 1fr)`), and
the RFQ header keeps its remaining `ปิดรับข้อเสนอ` tag.

## พื้นที่ให้บริการ removed, reviews un-stacked, feed type filter dropped

Three cleanups.

**พื้นที่ให้บริการ, everywhere it appeared.** Two blocks came out: the profile card
with the province list and its inline map SVG (24 lines), and the matching section in
edit-profile with the `#pfAreas` chip picker (5 lines). The address field's label also
read `ที่อยู่ / พื้นที่ให้บริการ` — now just `ที่อยู่`. The renderer `renderAreas()`
and the `.area-sub` sync inside `applyToProfile()` were already guarded with
`if(!wrap) return`, so both no-op rather than throw; they were left in place. A sweep
of all 19 pages finds zero remaining occurrences of the phrase and zero `.area-loc`,
`.area-sub`, or `.area-map` elements.

**The overlapping review card.** `.review-flex` lays out three children in a row:
`.review-summary` (floor 180px), `.rev-bars`, and `.review-item` (floor 230px). With
gaps that needs 570px, but the column is 478px. Neither flooring child can shrink and
overflow is visible, so the review card ran to x=919 — past its own column (828) and
49px into the right rail, which starts at 870. That is the overlap. Because the
*container* stayed inside its parent, the generic overflow sweep never flagged it;
only measuring the children against the rail found it. A ≤1024px rule already wrapped
this row, which is why the bug was desktop-only.

The fix drops the width condition: `.review-flex` wraps at every size and
`.review-item` takes `flex:1 1 100%` with `min-width:0`, so the ratings sit on the
first line and the review carousel gets its own full-width line beneath. It is a
carousel, so the extra width suits it. After: item right edge 828, rail left 870 — no
contact.

**The ทั้งหมด type chip** on the feed (`#fddType`) is gone. The filter row keeps
สถานที่, ล่าสุด, and ค้นหาขั้นสูง. The one surviving `fddTypeBtn` reference sits in a
handler that already null-checks.

Verified at 375px and 1280px: no JS errors across all 19 pages, no horizontal document
scroll. The overflow sweep reports `.post-thumb` slides sitting past the viewport
edge, but those are the image carousels — `.post-thumb-wrap` is `overflow:hidden` and
the off-screen slides are clipped by design.


## ที่ขอ now uses the same card as ที่ส่ง

The two tabs of ใบเสนอราคา had been built as separate components. ที่ส่ง
(`page-my-bids`) uses a three-column `.bid-row` — body, a boxed price column, a fixed
status column. ที่ขอ (`page-my-requests`) used a two-column `.mr-card` that pushed the
price, the file chip and the buttons all into one right-hand column, so the same piece
of information sat at a different width and a different height depending on which tab
you were on.

There was already a sign of the intended direction: the ≤1024px stacking rules named
`#page-my-requests .bid-row` and `#page-my-requests .bid-price-col`, written in an
earlier round, but the markup never had those classes — so on mobile ที่ขอ was falling
through to a `.mr-card` rule from a different breakpoint (768px) entirely.

**Markup.** `renderMyRequests()` now emits `.bid-row` with the same three children.
The mapping keeps every field the old card showed:

| ที่ส่ง | ที่ขอ |
| --- | --- |
| `.bid-id` — quote/RFQ number + reply badge | quote number when one has come back, otherwise the badge alone |
| `.bid-title` | same |
| `.bid-buyer` — avatar + `ผู้ซื้อ:` | avatar + `ผู้ขาย:` |
| `.bid-meta` — 📍 place ǀ 🕗 date | 📍 place ǀ 🕗 ขอเมื่อ date |
| `.bid-files` — PDF chip | the returned quote PDF, received rows only |
| `.bid-price-col` | `ราคาที่เสนอ` + figure, or `—` + `ยังไม่ได้รับราคา` while waiting |
| `.bid-status-col` — pill, sub-label, sub-value, button | `ได้รับแล้ว` / `รอราคา`, then `ดูใบเสนอราคา` or `แชทกับผู้ขาย` |

Both avatar and seller name still open the company profile, the PDF chip and the button
still open `openQuotePdf`, and the card still opens the offer detail — all the old
`event.stopPropagation()` guards are kept.

**CSS.** Rather than re-typing the rules, the ที่ส่ง block is copied verbatim with the
page prefix swapped, so the two tabs cannot drift apart later. `#page-my-requests` also
gets a palette declaration, which it never had — it had been borrowing whatever the
`.mr-*` rules hard-coded. The mirror is inserted *above* the ≤1024px stacking block on
purpose: those rules set width and padding without `!important`, so they have to come
later to win on mobile. The ≤1100px rule that un-right-aligns the status column when
the card wraps is mirrored too.

Measured on both tabs: card 866px, columns 468 / 130 / 190, padding 18px 20px, radius
16px, gap 18px, same border and shadow, title 16px, figure 19px, price box 96px on
every row. At 768px and 375px both stack to one column with all three bands at the same
width and the same left alignment. No JS errors across all 19 pages, no horizontal
scroll, and the ทั้งหมด / รอราคา / ได้รับแล้ว filters still return 3 / 1 / 2.

The `.mr-*` rules for the old card are now dead but were left in place — `.mr-badge` is
referenced by the badge-saturation block, and `.mr-head`, `.mr-tabs`, `.mr-tab`,
`.mr-empty` are all still in use.


## Left rail rebuilt to the attached spec sheet

The sheet specifies four things: an icon set, an icon system, a colour system, and a
spacing system. The menu items themselves already matched — `KX_NAV` had all ten in the
right order with the same two badge counts — so nothing about navigation or routing
changed.

**Icons.** The rail drew emoji, which a global converter (`kxApplyIcons`) swaps for
outline SVG at runtime. That map is app-wide and generic, so four rows were wrong
against the sheet: ค้นหางาน rendered a house instead of a compass, งานของฉัน a
megaphone instead of a briefcase, ผู้ให้บริการ one person instead of two, and ตั้งค่า
a sliders glyph instead of a toothed cog. `KX_NAV` now carries an explicit icon key and
the ten paths live in `KX_ICO`, drawn on a 24-unit box as single outlines. The emoji map
is untouched and still serves the rest of the app.

**System.** The numbers are tokens on `.side-card` so the sheet stays traceable — change
these ten values, not forty rules:

| | |
| --- | --- |
| `--nav-ink` `#1E293B` | label |
| `--nav-ico` `#64748B` | icon at rest |
| `--nav-on` `#2563EB` | selected icon + label |
| `--nav-on-bg` `#EFF6FF` | selected row |
| `--nav-hover` `#F8FAFC` | hover |
| `--nav-line` `#E2E8F0` | divider |
| `--nav-badge` `#EF4444` | count |
| `--nav-row` `52px` · `--nav-pad` `20px` · `--nav-gap` `14px` | spacing |

Rows go from 14px/700 with a 19px emoji at 10px 12px padding to 16px/500 with a 22px
1.75px-stroke outline icon, 20px in, 14px to the label, 52px tall, 4px apart, 14px
corner. Selected rows are 600. The old hover animated `padding-left` from 12px to 16px,
which made the row twitch — hover is now background only.

`!important` is needed because the rail is redeclared by `#page-company-profile
.profile-side-col .side-link` and by per-page copies. Those are id-scoped and outrank
any class selector, which is why the profile page had been keeping its own metrics.

**Footer.** The sheet ends the rail with a divider and a profile row, so
`renderSidebars()` emits one: avatar, name, ดูโปรไฟล์, chevron, linking to the profile
page. Name and picture read from `kx.profile` and `kx.avatar`, the same stores the
profile editor writes, so an uploaded avatar appears here too. The name is assigned with
`textContent`, never interpolated into the HTML string.

Measured on the desktop rail, the profile page's own rail, the settings rail and the
mobile drawer: 10 rows, all 52px, 20px left padding, 14px gap, 4px between, 16px/500 and
600 when selected, `#1E293B` on `#fff` and `#2563EB` on `#EFF6FF`, icons 22px at 1.75px
with round caps. No emoji left in any rail, no truncated labels, no JS errors, no
horizontal scroll.

**One contrast note.** White on `#EF4444` is 3.76:1. The count is 11.5px, so AA wants
4.5 and it misses. This is not a regression — the rail was already `#ef4444` before the
sheet, and the sheet confirms it. Changing `--nav-badge` to `#DC2626` (the app's
existing `--red`) scores 4.83 and is very close in appearance. Left as drawn; it is a
one-value change either way. Everything else in the rail passes: labels 14.63, selected
label 4.75, ดูโปรไฟล์ 4.76, icons 4.76 and 4.75 against a 3.0 bar for graphics.


## Coloured accent bars removed from the stat cards

The dashboard stat cards and the status tabs on งานของฉัน and ใบเสนอราคา each carried a
coloured strip along one edge — a 4px bar down the left of `.dash-stat`, a 3px bar
across the top of `.status-tab` — both drawn as a `::before` and both repeating the
colour already carried by the figure inside the card. Those rules are gone.

Two stragglers had to go with them. The contrast pass had pinned `.dash-stat.wait` and
`.dash-stat.mine` back to the bright `#f59e0b` / `#16a34a` in a separate block, on the
grounds that a bar is a fill and not text. With the base rule deleted those set a
background on a pseudo-element whose `content` no longer exists — invisible, but it
would have brought the bar back the moment anything restored `content`. The other users
of those two brightened fills (the review bars on the profile, the online dot in
messages, the completion meters) are untouched and still measure `#f59e0b` / `#16a34a`.

The `--kx-st` token stays: the count above each tab label still reads blue for live,
amber for waiting, green for done, red for lost. Removing the bar takes away the second,
louder copy of that signal, not the signal.

Verified across all four strips — dashboard, `page-rfq-offers`, `page-my-offers`,
`page-my-bids`: no pseudo-element left with content or a background, tabs still even at
65px each, no JS errors.


## Feed cards show the price, the way งานของฉัน does

The count box on a feed card said how many offers a ต้องการซื้อ post had, or how many
quote requests a ประกาศขาย post had, but never what any of it was worth. The same post
on งานของฉัน carries that figure, so the two pages disagreed about how much a card
tells you.

`.rfq-avg` is the pattern copied: a dashed rule, an 11px caption, the figure bold
underneath — all inside the box that was already there, so no new column and no change
to the card's shape. ต้องการซื้อ gets **ราคาเฉลี่ย**, ประกาศขาย gets **ราคาเริ่มต้น**.

Every figure is lifted from the matching card on งานของฉัน rather than invented, so one
job cannot show two different prices in two places:

| Feed card | | Source |
| --- | --- | --- |
| ต้องการผลิตชิ้นส่วนเครื่องจักร CNC | ราคาเฉลี่ย 92,500 ฿ | RFQ-2505-0012 |
| ติดตั้ง Solar Rooftop 50 kW | ราคาเฉลี่ย 385,000 ฿ | RFQ-2505-0011 |
| พัฒนาเว็บไซต์บริษัท | ราคาเฉลี่ย 68,000 ฿ | RFQ-2505-0008 |
| รับผลิตงานโลหะแผ่นทุกชนิด | ราคาเริ่มต้น 15,000 ฿ | OFR-2505-0021 |
| รถบรรทุก 6 ล้อ ตู้ทึบ | ราคาเริ่มต้น 3,500 ฿/เที่ยว | OFR-2505-0011 |
| ออกแบบและติดตั้งระบบไฟฟ้าโรงงาน | ราคาเริ่มต้น 80,000 ฿ | OFR-2505-0009 |

The caption is `#565b6e`, not `--ink-faint`. `--ink-faint` scores 4.27 on the saturated
peach of `.offer-box.sell` at 11px, just under AA — `#565b6e` makes it 4.98. That is the
same substitution `.offer-label` already carries, for the same reason. Measured: caption
5.56 on the mint fill and 4.98 on the peach, figure 14.34 and 12.84.

**Mobile.** The box goes full width below 1024px, and stacking the count over the price
inside 325px pushed it to 129px of mostly empty space. งานของฉัน had already solved
this — its box becomes a strip with the count left and the figure right, 72px tall — so
the feed now does the same and lands at 69px. Desktop is untouched: 110px box, centred,
24px count, dashed rule above the price.

No overflow at 375px or 1280px, no horizontal scroll, all six cards still visible to the
filters, no JS errors across all 19 pages.


## ผลงานสะสม — a track record the seller cannot write

The profile already had **ผลงานของเรา**, a gallery the owner uploads. A visitor has no
way to tell a real job from a stock photo in it. The new **ผลงานสะสม** card sitting
directly beneath it is the opposite kind of evidence: every row comes from a bid the
system recorded as won, and the card says so in its header and again in its footnote.
That contrast is the point of the card.

Only the buy side is built. Won bids are clean — `page-my-bids` marks them
`data-status="won"` — but ประกาศขาย has no "sold" state at all, only เปิดอยู่ / พักไว้ /
ปิดแล้ว, so there is nothing to read. Left out deliberately, at the user's direction.

**It accumulates rather than being a list.** `collect()` reads
`#page-my-bids .bid-row[data-status="won"]` live and merges it over a `HISTORY` array of
jobs closed before the card existed, keyed on the RFQ number so nothing appears twice.
`navigateTo` is wrapped so opening the profile re-reads. Verified: flipping one more bid
to `won` puts it at the top of the card within the same session, and reverting the
status removes it again.

Each row shows the job, its category (derived from the title), the province, the RFQ
number, and the month it was awarded — `ตัดสินใจเมื่อ`, not the date the bid was sent.
The headline figure is read from the profile's own งานสำเร็จ stat rather than counted
locally, so the card and the number above it cannot disagree.

**No price, no buyer name.** The price a job was won at is the seller's position against
its competitors, and this platform runs sealed bids on purpose — publishing it
permanently on a public page would undo that. The buyer's identity is the buyer's to
publish, not the seller's. Job, category, province and month answer "what have they
actually done", which is what was asked for. Asserted by test: no `\d{1,3},\d{3}` and no
buyer name anywhere in the card.

Two things needed fixing during the build. The date started as a third flex column; at
355px it needed 55px the card did not have, so rows wrapped into three stacked lines and
ran to 157px. It is now the last item of the meta row — right-aligned on desktop, folded
onto the next line on a phone. Rows are 79px desktop, 105px mobile. Separately, the Thai
date parser was first written as a regex assembled from the month list inside a template
literal, which emitted broken source and silently killed the whole script block; it is a
`split(/\s+/)` now.

All eight text styles clear WCAG AA (4.76 to 17.38 against a 4.5 bar; the 20px/800
figure clears the 3.0 large-text bar at 16.27). No overflow at 375px or 1280px, no
horizontal scroll, no JS errors across all 19 pages.


## A reviews page, and ผลงานสะสม gets photos

Three changes.

**`page-reviews`, the twentieth page.** The profile showed reviews as a single card with
one review visible in a horizontal strip, which is why the review card kept colliding
with the right rail in the first place — 128 reviews were being squeezed into a shape
built for one. They now have their own page: the 4.8 score, the four criteria averages
and the star distribution across two columns, star filters with live counts, review
cards with the reviewer, date, per-criterion chips, the verified-transaction mark, the
job it came from, and the provider's reply where there is one. Four load at a time
behind a ดูรีวิวเพิ่มเติม button.

The gate line is restated at the top — only counterparties who closed a deal through
Konnex can review, and the provider cannot delete its own reviews. That is the same
claim the profile made, said where someone is actually reading reviews.

Reached from ดูรีวิวทั้งหมด › in the profile's review card head. It is not in `ROOTS`,
so it gets the back bar automatically: verified 48px, reading กลับโปรไฟล์, and goBack
lands on the profile.

**The summary strip is gone from ผลงานสะสม.** Markup, render block and styles all
removed — `pfWinsSum`, `.pf-wins-sum`, `.pf-wins-stat` are now zero occurrences. The
card goes straight from its header to the list.

**Every entry carries a photo, shaped like a feed card.** Picture left, text beside it,
stacking to a full-width image on a phone — the same treatment `.post-card` gets. The
trophy moved onto the image as a ชนะงานนี้ pill in the bottom-left corner.

A finished job has no photo of its own; the picture on the RFQ belongs to the buyer's
post, not to this record. So each entry draws from an asset pool matched to its
category, picked by hashing the RFQ number so a job always shows the same image rather
than shuffling on every render. Hashing alone put `pfportfolio-1` on two manufacturing
jobs, so the picker now walks forward from the hashed slot to the first image not
already on screen — six entries, six distinct photos, confirmed.

Rows are 122px on desktop with a 132×96 thumbnail, 285px on mobile with a full-width
170px image. All fourteen new text styles clear WCAG AA (4.76 to 17.38 against a 4.5
bar; the 44px score clears the 3.0 large-text bar at 17.38). No overflow at 375px or
1280px on either page, no horizontal scroll, no JS errors across all 20 pages.


## The รีวิว tab opens the reviews page

Every tab in the profile header navigates somewhere — ประกาศซื้อ, ประกาศขาย,
ใบเสนอราคาที่ส่ง, ใบเสนอราคาที่ขอ all call navigateTo. รีวิว (128) was the exception:
it ran scrollIntoView on the review card further down the same page, which is why it
felt like it did nothing. It now goes to page-reviews like its neighbours.

Checked: the tab lands on page-reviews with its cards rendered, the back bar reads
กลับโปรไฟล์, and goBack returns to the profile.

## ผลงานของฉัน removed; the wrong lorry removed with it

The uploaded photo gallery is gone. ผลงานสะสม underneath it already answers the same
question with evidence the owner cannot author, and the gallery was showing five slots
filled by three images repeated — `pfportfolio-1, -2, -3, -1, -2` in the markup.

Removed in full rather than just hidden, since an editor that uploads into nothing is
worse than no editor: the profile card, the ผลงาน (Portfolio) section in edit-profile,
the `'port'` branch of `pfOpen` and `pfSubmit`, `renderWorks()` and its call, the
`pfWorkInput` upload listener, the copy into the grid in `applyToProfile`, the
เพิ่มผลงาน line in the completion checklist, the ผลงานของเรา → ผลงานของฉัน heading
rename, `works: []` in the defaults, and the three `.portfolio-grid` style blocks.
`pfPortfolio`, `portfolio-grid`, `data.works`, `renderWorks` and `'port'` are all at
zero occurrences.

`pfOpen`, `pfSubmit` and `pfClose` are shared with เพิ่มบริการ and เขียนรีวิว, so both
were re-checked after the branch came out: the modals still open with the right titles.
The completion checklist is down to four items and still scores.

**A real bug came out of the screenshot too.** The ระบบไฟฟ้าโรงงาน entry was showing
the same Scania lorry as the ขนส่ง entry above it. Not a repeat of one file —
`rfq-thumb-3.jpg` and `offer-thumb-3.jpg` are different files, byte-for-byte, but they
are the same photograph at different crops, and the first had been put in the
ก่อสร้าง & รับเหมา pool. A hash check across all 42 assets finds no byte-identical
pairs, which is why the de-duplication added earlier did not catch it. The construction
pool is now solar and site photography; the six entries render six visibly distinct
images.

**One process note.** The removal script's helper cut `[from..to)` but then re-inserted
`to`, which `h.slice(e)` already began with — so every one of the nine cuts duplicated
its end marker and left things like `else { t.innerText=    else { t.innerText=`. That
broke the profile's whole script block, which is why `pfOpen` came back undefined. The
file was restored from the backup and the helper corrected before re-running. Worth
remembering: after a scripted edit, check that the functions near the seam still exist,
not just that the text is gone.

No JS errors across all 20 pages, no horizontal scroll.


## The review card leaves the profile overview

With `page-reviews` in place, the profile was showing the same 128 reviews twice — once
properly, once crammed into a card built for a single item. The card is gone: the
gate note, the score block, the criteria bars, the star distribution, the one visible
review and its carousel dots.

**เขียนรีวิว moved with it.** The button was the only entry to `openReviewGate`, so it
now sits in the reviews page header, which is where someone would look for it anyway.
The write flow was re-checked end to end: the gate opens the modal, submitting adds the
review, and the page lands on the list with the new entry at the top and the tab counts
stepped from 8 to 9.

`pfSubmit` used to append DOM straight into `#pfReviews`. That element no longer exists,
so it now hands a plain object to `window.rvAddReview`, and the reviews page — which
owns `REVIEWS`, the filters and the counts — redraws itself. The `stars` and `chips`
string builders went with the markup they fed.

Dead styles removed too: the whole `#page-company-profile` review block, and both
`review-flex` overflow fixes — the desktop one that stopped the card lapping the right
rail and the ≤1024px one that kept the ratings column from collapsing. Neither has
anything left to act on. `pfReviews`, `review-flex`, `review-summary` and
`rev-gate-note` are all at zero occurrences.

The new เขียนรีวิว button is on `--blue-700`, not `--blue-600`. White on `#1a7fff` is
3.80 and the label is 13px, which would have missed AA; `#1466d8` measures 5.35 for a
barely perceptible shift in hue.

No overflow at 375px on either page, no horizontal scroll, no JS errors across all 20
pages.


## ใบเสนอราคา cards get a picture too

ค้นหางาน, งานของฉัน and ผลงานสะสม all show the job. ใบเสนอราคา was the last list that
did not, so a row was a wall of text you had to read to recognise. Both tabs now carry a
thumbnail — seven static rows on ที่ส่ง, three through the renderer on ที่ขอ.

The stylesheet already had `.bid-row:hover .rfq-thumb{ transform:scale(1.05) }`, a hover
lift written for a thumbnail these cards never had. The same lift now applies to
`.bid-thumb`.

**The picture is the job's own.** The app keeps one canonical image per document number
— `RFQ-2505-0012 → rfq-thumb-1`, `OFR-2505-0021 → offer-thumb-1` and so on — so the
mapping reuses it and a job looks the same on the feed, on งานของฉัน and here. Two rows
quote work that has no card anywhere else (ซ่อมบำรุงเครื่องจักร, เช่ารถเครน); those got
a welding shot and a heavy-vehicle shot picked to match the work. Ten thumbnails, all
loading, seven distinct on ที่ส่ง.

Sized 110×118 at a **fixed** height, not `align-self:stretch`. Stretching is what
งานของฉัน appears to do, but its thumbnails are pinned at 158px so the stretch never
takes effect; copying the stretch without the pin gave every row a differently shaped
picture — 133px beside 172px. Now every one measures 110×118, and 326×170 full width
below 1024px where the row is already a single stacked column.

**Two bugs fixed on the way.**

`MY_REQUESTS` has a sibling — a `MY_REQUESTS.unshift({seller:'Prime CNC Co., Ltd.', …})`
that runs when a quote is requested. A string `replace` takes the first match, so the
image landed on the unshift call and the array entry went without, rendering
`src="undefined"`. Both carry it now.

The ผลงานสะสม category pools had pictures that did not match their heading:
`offergallery-2` and `pfportfolio-3` are both a phone showing a payment QR code, filed
under ก่อสร้าง and งานผลิต; `pfportfolio-1` and `offergallery-3` are a row of parked
cars; `post-thumb-3` is a solar roof filed under ขนส่ง and `post-thumb-7` a lorry filed
under ไอที. Only one had surfaced so far, but the next won job would have shown a QR
code as factory work. Re-sorted against what the files actually contain — the six
entries now render welding, machining, solar and haulage, all in the right categories.

No overflow at 375px or 1280px on either tab, filters keep the thumbnails, no JS errors
across all 20 pages.


## One thumbnail size across every card list

The three lists had grown three different pictures, declared in five separate places:

| | before | after |
| --- | --- | --- |
| ค้นหางาน | 240×180 | 200×150 |
| งานของฉัน — ประกาศซื้อ | 200×158 | 200×150 |
| งานของฉัน — ประกาศขาย | 200×158 | 200×150 |
| ใบเสนอราคา — ที่ส่ง | 110×118 | 200×150 |
| ใบเสนอราคา — ที่ขอ | 110×118 | 200×150 |

Scrolling from one page to the next made the same job change shape. One size now —
200×150, a clean 4:3 — with a 12px radius everywhere, stated once in a single block.

**200 rather than 240** because a ใบเสนอราคา row also carries a price column and a
status column. Three candidate sizes were measured on the real rows first: at 240 the
text block is squeezed to 210px, at 200 it keeps 250px, at 170 it gets 280px. Nothing
overflowed at any of them, so this was about the text having room to breathe, not about
fitting.

The two carousels were the risk — their slides are sized in pixels, not percentages, and
`cycleThumb` translates the track by whole multiples of 100%. Both were re-checked with
the transition disabled: frame 200, slide 200, and the track lands on exactly −200 and
−400. Sliding is unaffected.

The image inside a carousel keeps square corners on purpose; the rounding belongs to the
clipped frame around it. That was already true on ประกาศซื้อ and is now stated rather
than incidental.

**Mobile needed a second pass.** All five go full width below 1024px, but ใบเสนอราคา
stayed at 190 → 170 because the rule added with those thumbnails repeated the height and
sat later in the sheet, so it won on source order. The duplicate declaration is gone and
that rule now only sets what is actually specific to it. All five measure 326×190 at
375px.

No overflow on any of the five pages at 375px or 1280px, no horizontal scroll, no JS
errors across all 20 pages.


## The origin and reply badges come off the ใบเสนอราคา cards

The document-number line carried two extra pills — คำขอราคาเข้า and
ส่งใบเสนอราคาแล้ว / ยังไม่ได้ตอบ — sitting above the title on ที่ส่ง, with matching
ones on ที่ขอ. Both restated something the status column on the right already says
plainly, and they pushed the ID line onto two rows. Gone from both tabs: the two static
rows, the row template that runs when you answer a quote request, and the ที่ขอ
renderer. The page-scoped CSS for both badge families went with them.

On ที่ขอ a request with no quote back yet had no document number, so the badge was the
only thing on that line. Rather than render an empty line, the line is now left out
entirely — the status column already says รอราคา.

Neither filter depended on the badges: ประเภท reads `data-origin` and the status tabs
read `data-status`. Re-checked after the change — 7 / 5 / 2 across ทั้งหมด, เสนอราคา,
ตอบคำขอ, and 2 rows under ชนะ.

**A gap closed while in there.** `addQuoteToMyBids()` builds a row when you answer a
quote request, and it never got a thumbnail when thumbnails were added to these cards —
a new row would have appeared without a picture next to seven that had one. It now looks
the offer up in the canonical image map and falls back to a generic industrial shot for
an id it does not know. Verified both paths: a known offer gets its own 200×150 picture,
an unknown one gets the fallback.

No overflow at 375px or 1280px on either tab, no JS errors across all 20 pages.


## Document numbers off the cards

`RFQ-2505-0012`, `OFR-2505-0021`, `KX-QT-2567-00231` — the reference number printed above
or below each card title. Removed from every card list:

| | |
| --- | --- |
| งานของฉัน — ประกาศซื้อ | 4 rows, number out, the ปิดราคา / เปิดราคา badge stays |
| งานของฉัน — ประกาศขาย | 5 rows, the line held nothing else so it goes entirely |
| ใบเสนอราคา — ที่ส่ง | 7 rows, plus the row template that runs on answering a quote |
| ใบเสนอราคา — ที่ขอ | rendered rows, plus the now-unused `idLine` variable |
| ผลงานสะสม | the number in the meta row |

Neither filter reads them — `applyBidFilters` works off `data-status` and `data-origin`,
and the ที่ขอ tabs off the status field. Re-checked after the change: 7 / 4 / 2 / 1
across the ที่ส่ง status tabs, 3 / 1 / 2 across ที่ขอ.

`openQuotePdf(docNo, seller)` takes the number as an argument rather than reading it
from the page, so the PDF viewer is unaffected and still opens with the right document.

**One thing did read the DOM.** The ผลงานสะสม collector pulled the RFQ number out of
`.bid-id` to key its de-duplication against the historical entries. That element is gone,
so the `querySelector` could only ever return null and the fallback — the job title —
became the real key. Made explicit rather than left as a lookup that cannot succeed. Six
entries, six distinct jobs, unchanged.

**Left alone:** the attachment chips still read `KX-QT-2567-00231.pdf` and
`ใบเสนอราคา-0021.pdf`. Those are file names, not the reference labels that were marked,
and stripping the number would leave a chip called `.pdf`. Say the word if they should
change too.

Detail pages and the quotation PDF keep their numbers — a reference number belongs on
the document, which is the one place it is genuinely useful.

No overflow on any of the five pages, no JS errors across all 20 pages.


## งานของฉัน cards: quieter edit button, cleaner column

**แก้ไขประกาศ was the loudest thing on the card.** A filled blue button pinned to the
top-right corner, for the action taken least often — while the real primary below it
(เสนอราคา on ประกาศซื้อ, the status control on ประกาศขาย) was only an outline. The
hierarchy was upside down.

It is now a quiet outline button: white fill, grey border, `#565b6e` label at 6.74
contrast. Blue outline still marks the primary, grey the utility, so there is a
hierarchy without anything shouting.

**The date drops its label.** `🕗 ประกาศเมื่อ 15 พ.ค. 2567` → `🕗 15 พ.ค. 2567` on all
nine cards across both tabs. The clock icon already says the field is a date. The stat
row inside the offer modal keeps the words, because there it is a label in a
label/value pair rather than a prefix.

**The status column re-laid out.** The pill and the edit button used to share the top
line. The pill now has that line to itself and both buttons sit together at the foot of
the column, primary first, so it reads top to bottom as state → deadline → what you can
do:

| | |
| --- | --- |
| 0px | ● เปิดรับ |
| 32px | สิ้นสุดการเสนอราคา · date · time |
| 106px | เสนอราคา, then แก้ไขประกาศ — both full width |

Below 1024px the two buttons sit side by side instead of stacked. They came out 4px
apart at first: an older rule gives `.btn-detail` a `margin-top:4px` for when it stood
alone at the bottom of the column, and inside a flex row that margin offsets it against
its neighbour. Zeroed within `.rfq-actions` — all four rows now match at 41px.

`editPost` still fires with the right arguments from the restyled button. No overflow at
375px or 1280px, no JS errors across all 20 pages.

**Worth a look, not changed:** on ประกาศซื้อ the primary button says เสนอราคา and opens
the RFQ detail — but these are RFQs *you* posted, so bidding on them is not a thing you
can do. ดูข้อเสนอ would match what the card is for. Left alone since this was a layout
pass, not a copy one.


## ใบเสนอราคา cards get the same treatment

Same three changes as งานของฉัน, applied to both tabs.

**Button hierarchy.** Neither button here was filled, so nothing was shouting — but a
ที่ส่ง row can carry two of them (ตอบกลับด้วยใบเสนอราคา and the PDF button, which is
appended by script), both blue-ish outlines at whatever width their label happened to
need. Two similar buttons of different sizes read as two equal choices. The PDF is now
the quiet one — grey border, `#565b6e` label at 6.74 — matching แก้ไขประกาศ on
งานของฉัน, and the action button keeps the blue edge at 5.35. Every button on both tabs
now measures 190×40 on desktop, 326×40 on mobile.

**The date drops its label.** Nine occurrences across both tabs and the two render
templates: `🕗 ส่งข้อเสนอเมื่อ 19 พ.ค. 2567` → `🕗 19 พ.ค. 2567`, likewise
ขอใบเสนอราคาเมื่อ and ขอเมื่อ. The line inside the quote-requests modal keeps its
wording — different surface, and there the phrase is the whole sentence.

**The column re-laid out.** `.bid-status-col` was a plain block with `text-align:right`,
so the buttons sat loose at the bottom at their natural widths. It is a flex column now
and reads top to bottom: status → what it is waiting on → the actions, full width and
even. No markup change was needed: the PDF button is added with `appendChild`, so it is
always the last child and lands under the action button on its own.

Below 1024px the column stretches to the card width along with everything else.

Status filters re-checked after the change — 7 / 4 / 2 / 1. No overflow at 375px or
1280px, no JS errors across all 20 pages.


## แก้ไขประกาศ becomes an icon; bigger pictures, one card height

**The edit button is now a 34px icon.** Even as an outline it was a full-width control
competing with the real action. It has moved out of the action stack and up beside the
status pill, where a utility belongs, leaving the stack to the thing you came to do —
four cards on ประกาศซื้อ, five on ประกาศขาย. The label survives as `title` and
`aria-label`, so it is still announced to a screen reader and still appears on hover.
`editPost` fires with the right arguments from both pages.

**Pictures 20% larger:** 240×180 on desktop, 210px tall full width on mobile, the same
4:3 in both. That costs 40px from the text column — ใบเสนอราคา is the tightest at 210px,
which is why it stopped at 240 rather than going further.

The size lives in **one** rule. My first attempt added a second block declaring 240 and
the picture stayed at 200: the existing `!important` rule sat later in the sheet and won
on source order. Rather than fight it, the competing block was deleted and the canonical
one raised — which is the point of having consolidated these into a single declaration
in the first place.

**Every card is now exactly 228px.** Heights had drifted to 216–226 across the five
lists, so a row on one page did not line up with a row on the next. A `min-height` of
228 clears the tallest, so all five report a single figure. It is a floor, not a fixed
height — a card with more content than that would still grow rather than clip, and none
currently does. Below 1024px the floor is removed: the cards are stacked there and a
minimum would only add dead space.

No overflow on any of the five pages at 375px or 1280px, no horizontal scroll, no JS
errors across all 20 pages.


## The type badge comes off the feed cards

`RFQ ต้องการซื้อ` and `ข้อเสนอขาย` sat above the title on every ค้นหางาน card. The tab
row directly above the list already splits the feed into ทั้งหมด / ต้องการซื้อ /
ประกาศขาย, so the badge repeated the filter you had just chosen, on every row. Gone from
all six cards, along with the `.tag-row` wrapper that held nothing else.

`.post-top-row` was `justify-content:space-between`, balancing the badge on the left
against the status and bookmark on the right. With the left side gone that would have
dragged the pair across to the left edge, so the row is `flex-end` now — the status and
bookmark stay exactly where they were, measured flush at 0px from the right at both
375px and 1280px.

Nothing depended on the badge. The type filter reads the `data-type` attribute on the
card, not the label: re-checked at 6 / 3 / 3 across the three tabs. Saving a card to
บันทึกไว้ also reads `data-type` — a saved buy card still records `buy` and a sell card
`sell`.

The `.type-tag` styles are gone with it, including the shared override that also named
`#page-rfq-offers` and `#page-my-offers`; neither of those pages has carried a
`.type-tag` in its markup for some time, so the whole rule was dead.

Cards remain 228px. No overflow at 375px or 1280px, no JS errors across all 20 pages.


## Cards fill their height; profile tabs point inward

**The cards were even but hollow.** The 228px floor added in the last pass made every
card the same height, but the columns inside were still sized to their own content and
pinned to the top (ประกาศซื้อ) or the middle (ใบเสนอราคา). A 124px body in a 194px space
left 87px of nothing beneath it; the picture left 31px. Uniform height, dead space —
which is what looked wrong.

Everything stretches now:

- Padding normalised to 16px. ใบเสนอราคา was on `18px 20px`, which would have made its
  picture 4px shorter than everyone else's.
- The picture fills the card interior exactly — **194px**, not 196: `box-sizing` is
  `border-box` app-wide, so the 1px top and bottom border come out of the 228 as well as
  the 32px of padding. At 196 every card with a picture rendered 230 while the feed's
  text-only card stayed 228.
- The boxed figures (ข้อเสนอ, ราคาที่เสนอ, ราคาเริ่มต้น) became full-height panels with
  their contents centred instead of short boxes floating at the top.
- Status columns spread: pill at the top, buttons at the bottom.

All five lists now report a single card height of 228 with all four columns at 194.
Carousel sliding re-checked against the taller frame — still lands on −240.

That is the third time a size change has been written as a new rule and lost to the
canonical one further down the sheet. Both times the fix was the same: delete the
competing block, edit the canonical value. Worth remembering as the pattern rather than
the accident.

**Profile tabs.** ประกาศซื้อ (RFQ), ประกาศขาย (Offer), ใบเสนอราคาที่ส่ง and
ใบเสนอราคาที่ขอ are gone — four tabs that jumped off the profile into the owner's own
working pages, which is not what a profile is for. In their place, บริการของฉัน and
ผลงานสะสม, which scroll to those two cards further down the overview and mark themselves
active. The row is now ภาพรวม · รีวิว (128) · บริการของฉัน · ผลงานสะสม.

The services card gained an id to be a scroll target; ผลงานสะสม already had one.

No overflow at 375px or 1280px on any of the six pages, no JS errors across all 20.


## The count box goes vivid green and red

ต้องการซื้อ moves from a pale mint to a vivid green, ประกาศขาย from peach to red. Both
are the 400-level of the same scale, so they read as a pair rather than two unrelated
colours, with the 500-level as the border.

| | fill | border |
| --- | --- | --- |
| ต้องการซื้อ | #bbf7d0 → **#4ade80** | #86efac → #22c55e |
| ประกาศขาย | #fed7aa → **#f87171** | #fdba74 → #ef4444 |

Raising a fill always costs contrast, and it costs the small text most. #565b6e scored
3.55 on the new green — below the 4.5 that 11px text needs — so the label and the price
caption move to the app ink. The figure had been on the mid-tone --green and --orange:
--green fell to 2.88 on #4ade80, failing even the 3.0 bar that 24px bold is allowed. It
now takes the darkest shade of its own hue instead.

Measured after the change — every one passes:

| | green | red |
| --- | --- | --- |
| figure (24px bold, needs 3.0) | 5.23 | 3.62 |
| label, caption, price (needs 4.5) | 9.98 | 6.28 |

`.offer-box` appears only on ค้นหางาน, so nothing else in the app is affected — checked
across all 20 pages. Cards stay 228px, boxes 110×194, no overflow, no JS errors.

## Profile tabs become panels; the reviews page folds back in

The four tabs all sent you somewhere: ภาพรวม did nothing, รีวิว opened a separate page,
บริการของฉัน and ผลงานสะสม scrolled. They switch the left column in place now, which is
what a tab means.

| tab | shows |
| --- | --- |
| ภาพรวม | เกี่ยวกับฉัน + ข้อมูลบริษัท |
| รีวิว (128) | the reviews panel |
| บริการของฉัน | บริการของฉัน |
| ผลงานสะสม | ผลงานสะสม |

The right rail — ติดต่อ, การยืนยันตัวตน, ใบรับรอง, ความเชี่ยวชาญ — is never hidden. It is
how someone reaches the seller whatever they are reading, and with it always present
ภาพรวม shows exactly the five cards that were asked for.

Cards carry `data-pf-sec`; a card without one counts as ภาพรวม. That matters because
ข้อมูลบริษัท is injected at runtime by `applyToProfile` and would otherwise vanish the
first time someone touched a tab.

**`page-reviews` is gone** — 19 pages again. Keeping a page that a tab was supposed to
replace would have left two homes for the same content. It was taken apart rather than
copied:

- the `.rv-` half of its stylesheet moved across with the prefix rewritten; the shell it
  came with — its own palette, navbar, layout, logo, search, badge — was left behind,
  since those selectors would have redecorated the profile's own chrome
- the panel markup moved into a card, minus the page heading and the "all reviews of X"
  line, which only make sense on a page
- the script moved intact; its `navigateTo` hook now fires on `page-company-profile`

Submitting a review used to navigate to the page. It now switches to the รีวิว tab and
re-renders in place — verified end to end: the modal opens, the new review appears at
the top of the panel, and the page never changes.

Filters and ดูรีวิวเพิ่มเติม work unchanged inside the card (4 → 8, 4-star → 2). All ten
text styles in the panel clear AA (5.18 to 17.38). At 375px the summary and the bars
collapse to one column as before. No overflow, no JS errors across all 19 pages.


## The profile becomes one column

ติดต่อ, การยืนยันตัวตน, ใบรับรอง and ความเชี่ยวชาญ were a fixed right rail, so they sat
beside whichever tab you were on — including รีวิว and ผลงานสะสม, where they are not part
of what you asked to see. They are ordinary cards in the main column now, tagged
`data-pf-sec="overview"` like everything else on that tab, so the tab switch governs them
and the page reads straight down.

| tab | cards, top to bottom |
| --- | --- |
| ภาพรวม | เกี่ยวกับฉัน · ข้อมูลบริษัท · ติดต่อ · การยืนยันตัวตน · ใบรับรอง · ความเชี่ยวชาญ |
| รีวิว (128) | the reviews panel alone |
| บริการของฉัน | บริการของฉัน alone |
| ผลงานสะสม | ผลงานสะสม alone |

`.grid` drops its second track. The rule that had to change is the one inside the
`min-width: 1025px` block that set `minmax(0,1fr) 320px` — a fresh declaration elsewhere
would have lost to it on source order, which is the trap this file has sprung three
times now. Editing the canonical rule and adding a guard beside it, rather than writing
a competing one.

Every card measures 866px on desktop and 355px at 375px, all four tabs. No `.right`
container left in the profile and no orphaned `.right`-scoped styles. No overflow at
either width, no JS errors across all 19 pages.


## Mobile: the figure boxes centre their contents

The count box on a phone was a full-width green panel with its number inset 15px from
the left and 254px of empty fill to the right of it.

Two designs had half-cancelled. These boxes were originally a strip — label pushed left
with `margin-right:auto`, figure pushed right, on `align-items:baseline` and
`justify-content:space-between` — from when a stacked card laid them out in a row. A
later pass turned every one of them into a column so they would fill the card height on
desktop. Column plus `baseline` plus `text-align:left` is what pinned everything to the
left edge; `space-between` then had nothing horizontal left to distribute.

Five boxes were affected, four visibly:

| | before (L / R) | after |
| --- | --- | --- |
| ค้นหางาน `.offer-box` | 15 / 254 | 134 / 134 |
| ประกาศซื้อ `.rfq-offers` | 15 / 254 | 134 / 134 |
| ที่ส่ง `.bid-price-col` | 15 / 233 | 124 / 124 |
| ที่ขอ `.bid-price-col` | 15 / 244 | 129 / 129 |
| ประกาศขาย `.offer-price-col` | already centred, but 140px wide while its siblings were 322 | consistent |

Fixed in one late block rather than five edits: the strip rules sit across two earlier
media blocks and are the superseded design, so overriding them in one place says that
more plainly than unpicking each.

**A second thing the sweep found.** Asked to check everywhere, a scan of every
near-full-width filled box across all 19 pages at 375px turned up the status pill on
ใบเสนอราคา stretched to 322px with its dot and label stranded at the left. The status
column stretches its children so the buttons fill the card width — but a pill is not a
button. It sizes to its own text again: 67px and 84px on the two tabs.

The scan now returns nothing on any page at 375px, and all five boxes are centred to
within a pixel at both 375 and 320. Desktop is untouched — boxes 110–140 wide, 194 tall,
cards still 228. No horizontal scroll at 320, 375 or 1280; no JS errors across all 19
pages.


## The bid button moves to where you can actually bid

งานของฉัน → ประกาศซื้อ lists the RFQs *you* posted, and every card carried a เสนอราคา
button — an action you cannot take on your own request. Off all four cards. The status
column now reads status → deadline and stops, with the edit icon already up beside the
pill.

It lands on ค้นหางาน instead, where the post belongs to someone else. Each card's type
decides the label and the destination:

| card | button | opens |
| --- | --- | --- |
| ต้องการซื้อ | เสนอราคา | `page-rfq-detail` |
| ประกาศขาย | ขอใบเสนอราคา | `page-offer-detail` |

The sell side needed its own wording: เสนอราคา on a ประกาศขาย would be asking the reader
to quote a price at a seller, which is backwards — there you ask *for* a quote. Both
destinations are the same page the card itself opens, so the button makes the action
explicit without introducing a route that could go stale.

`event.stopPropagation()` on the handler, since the whole card is clickable — verified
by clicking each type and landing on the right page rather than being double-fired.

`.post-right` widens 110 → 150px so ขอใบเสนอราคา sits on one line; every button measures
150×40 on desktop and 322×40 at 375px, none wrapping. That 40px comes out of the text
column, which drops 706 → 666. Cards stay 228px, the count box stays centred at 134/134
on mobile, and the button clears AA at 5.35.

No overflow at either width, no JS errors across all 19 pages.


## The figure box wears the same two colours everywhere

ค้นหางาน got the vivid green and red last round; ประกาศซื้อ was still on pale mint and
the other three on plain grey, so the same box meant different things depending on which
page you were on. One rule now, keyed the way the feed keys it — buy side green, sell
side red:

| page | | fill |
| --- | --- | --- |
| ประกาศซื้อ | every row is an RFQ | green |
| ประกาศขาย | every row is an offer | red |
| ใบเสนอราคา ที่ส่ง | `data-origin="rfq"` — you bid on someone's buy post | green |
| | `data-origin="offer"` — you answered a request on your own sell post | red |
| ใบเสนอราคา ที่ขอ | you asked a seller to quote | red |

The ที่ส่ง split is per row, off the attribute the origin filter already uses, so a card
is coloured by what it actually is rather than by which tab it sits on.

**The text had to move with the fill.** The captions were `--ink-soft` / `--ink-faint`,
around 3.5 on the new green — they go to the app ink. The figure keeps a tint of its own
hue because at 19px/800 it is large text and only needs 3.0. The small comparison lines
(ต่ำกว่างบที่ตั้งไว้, พร้อมรับงาน) could not keep theirs: `#14532d` scores 3.30 on the red
fill, so they go to ink and give up their green/red shading. The fill already carries
that signal and carries it louder than 11px type ever did.

**One thing the audit caught.** ประกาศขาย set its figure at 17px while ใบเสนอราคา uses
19px — an inconsistency in its own right on otherwise identical boxes, and the reason
this one box failed: below 18.66px the large-text allowance does not apply, so it had to
clear 4.5 and scored 3.62. At 19px it matches its counterparts and passes.

Every text element inside all five boxes now clears AA — the sweep returns zero failures.
Fills confirmed per page and per row, boxes still centred to within a pixel at 375px, no
overflow at either width, no JS errors across all 19 pages.


## Konnex goes blue-toned

Measured first rather than guessed. A sweep of every filled surface over 400px² across
all 19 pages, bucketed by hue, put the two figure-box fills at **602k px²** — every other
non-blue colour in the app was 60k or less. The app could not read as blue while those
stayed green and red; nothing else was close enough to matter.

That reverses the green/red asked for two turns ago, so it is worth stating plainly: the
boxes are the whole question, and this is the trade. Reverting is two fill values.

**The boxes.** Two tones of one family rather than two hues, so the buy/sell distinction
survives:

| | fill | border | figure |
| --- | --- | --- | --- |
| ต้องการซื้อ | `#60a5fa` | `#3b82f6` | `#0a3f8f` |
| ประกาศขาย | `#bae6fd` | `#7dd3fc` | `#0a3f8f` |

Captions stay on the app ink. Every text element inside all five box types clears AA —
the targeted sweep returns zero failures, and none of the 31 remaining failures anywhere
in the app sit on either new fill.

**What deliberately stayed coloured.** Green for ชนะ and verified, orange for รอผล, red
for ไม่ผ่าน, amber for rating stars, and the per-company avatar hues. Those carry meaning
or identity; a blue-toned app still needs to distinguish a won bid from a lost one.
Blue now covers **92%** of coloured area, which is a blue product with semantic accents
rather than a monochrome one.

**Two things changed to blue because they were not semantic.** The ผลงานสะสม
"บันทึกอัตโนมัติ" badge and the ชนะงานนี้ pill on each entry photo were green, reading as
a success state. They are platform attestations, and blue is this app's trust colour —
the hero's Verified pill already uses it.

**Two contrast clusters fixed while in the palette.** The app-wide sweep counted 77
failures; 46 of them were two things:

- the sidebar count badge, white on `#EF4444` at 3.76. This was flagged when the nav
  spec sheet went in and left as drawn; with the palette open it is now `#DC2626` at
  4.83 — 34 of the 77.
- white initials on all five avatar identity colours, 2.80 to 4.23. Each darkened one
  step (`#f97316`→`#c2410c`, `#16a34a`→`#15803d`, `#e8447a`→`#be185d`,
  `#8b5cf6`→`#6d28d9`, `#0891b2`→`#0e7490`), which also mutes the loudest remaining
  non-blue accents — useful either way.

31 failures remain, all pre-existing and mostly not text: 14 are the `|` separator glyph
drawn in the line colour, the rest are small login-screen labels, the amber rating stars,
and the Facebook button, whose blue is that brand's and should not move.

No overflow on any of the 19 pages at 375px or 1280px, boxes still centred on mobile, no
JS errors.


## Pale blue box, shorter deadline

**One box treatment everywhere.** The buy side was the mid `#60a5fa`; it takes the pale
`#bae6fd` fill with the `#7dd3fc` border that the sell side already had. All five lists
now render the same box: pale blue ground, `#0a3f8f` figure at 7.46, ink captions. Zero
contrast failures inside any of them.

Worth knowing: with both sides on the same treatment, the box no longer distinguishes
ต้องการซื้อ from ประกาศขาย. Its own labels still do — ข้อเสนอ / ราคาเฉลี่ย against
ผู้ขอใบเสนอราคา / ราคาเริ่มต้น — as do the feed's own tabs. If the two should read apart
again, the sell side can go back a step to `#7dd3fc` without touching anything else.

**สิ้นสุดการเสนอราคา → สิ้นสุด** on all four ประกาศซื้อ cards, and the `17:00 น.` line is
gone.

**That exposed a spacing problem.** With the เสนอราคา button moved to the feed last
round and now the time line removed, `.rfq-status-col` was down to three items and its
`justify-content:space-between` was pushing them 98px apart — the label floating alone
in the middle, 74px above its own date. The column is `flex-start` now with
`margin-top:auto` on the label, so the pill holds the top and the deadline pair sinks to
the bottom as one block: 2px between label and date instead of 74. The other status
columns keep `space-between` because they still have buttons to anchor.

Cards remain 228px on all five lists, boxes still centred at 375px, no overflow at either
width, no JS errors across all 19 pages.


## The stat figures go to ink

The three numbers on แดชบอร์ด and the counts on all four status-tab strips were each
coloured by their state — blue for open, amber for waiting, green for done, red for
failed. Every one of them is now #16192b.

Fourteen figures across แดชบอร์ด, ประกาศซื้อ, ประกาศขาย and ใบเสนอราคา, measured at
15.44 to 17.38 against their cards. Nothing was lost: on แดชบอร์ด the ผู้ซื้อ / ผู้ขาย
pill under each figure already says which is which, and on the tab strips the label
beside the count does the same.

The --kx-st token went with them. It had two jobs — the coloured accent bar along the
top of each tab, and the count. The bar came off several rounds ago, so with the count
on ink the token had nothing left to drive; its seven per-state declarations are gone
rather than left sitting there resolving to nothing.

No overflow at 375px or 1280px, no JS errors across all 19 pages.

## The blue scale goes navy, and a layout pass at four widths

### The palette

An inventory of every hex literal in the file, filtered to the blue band by hue, showed
four values carrying the platform: `#1466d8` ×51, `#1a7fff` ×38, `#0a3f8f` ×36,
`#e8f3fc` ×30. Those moved, along with eleven strays that were doing the same job under
slightly different values:

| | was | now | white on it |
| --- | --- | --- | --- |
| `--blue-600` primary | `#1a7fff` | `#1d4ed8` | 3.80 → **6.63** |
| `--blue-700` | `#1466d8` | `#1e40af` | 5.35 → **8.72** |
| `--blue-900` deepest | `#0a3f8f` | `#172554` | 9.90 → **14.83** |
| `--blue-50` tint | `#e8f3fc` | `#eef4ff` | — |

181 replacements. Darkening was not only a tone change: **39 solid primary buttons were
white on `#1a7fff` at 3.80**, the largest remaining AA failure in the app and one flagged
several rounds ago. They now measure 8.72. A fortieth — the RFQ detail page's submit
button, still on a leftover sky `#17a2e8` at 2.85 — was pulled onto the same fill.

The figure boxes moved from sky to the true-blue family at the same paleness the last
round asked for: `#bae6fd`→`#dbeafe`, border `#7dd3fc`→`#93c5fd`. The nav spec's
`#2563EB` / `#EFF6FF` fold into the primary and the tint, so there is one blue scale
rather than two.

Facebook's `#1877f2` and Google's `#4285f4` were left alone — those are other people's
brands. So were the violet and teal avatar hues and the Word icon's `#2b579a`.

Blue holds 92% of coloured area; the remaining 8% is the semantic set (won, pending,
failed, verified, rating stars) plus company avatars.

### The layout pass

A detector for three separate faults — content past its page, text clipped by its own
box, and static siblings intersecting — run over all 19 pages at **1280, 768, 375 and
320**:

| | 1280 | 768 | 375 | 320 |
| --- | --- | --- | --- | --- |
| overflow | 0 | 0 | 0 | 0 |
| clipped text | 0 | 0 | 0 | 0 |
| real overlap | 0 | 0 | 0 | 0 |

Two things it flagged that are not faults, both worth recording so the next sweep does
not chase them:

- 20 hits of `kx-ico into badge` and friends are absolutely-positioned overlays working
  as designed — the bell's count sitting on the bell, a hidden radio inside its label,
  the ✓ on a selected card.
- one `hss → hss` on the profile at 375px is a diagonal pair across a wrap: the four
  hero stats form a clean 2×2, and checking every pair for a real intersection returns
  none.

The 320px text overflows recorded under Known wrinkles — the profile rating, the my-bids
separator, the offer-detail price, the login label — no longer reproduce. The layout work
of the last several rounds cleared them.

31 contrast failures remain app-wide, unchanged by this pass and all pre-existing: 14 are
the `|` separator glyph drawn in the line colour, the rest are small login-screen labels,
the amber rating stars, and the Facebook button. No JS errors on any page at any width.


## Four small corrections

**The feed card's first line comes up.** `.post-top-row` used to hold the type badge on
the left and the status + bookmark on the right. The badge went several rounds ago, so
the row is one right-aligned pair — but it kept a 33px height, which was the bookmark's
own box, plus 8px of margin. That left 41px of nothing above the company name. The
bookmark now sizes to its icon and the margin goes: the poster line moves from 43px to
23px, and everything below it rises 20px. Cards stay 228px.

**The deadline is a date, not a duration.** It was a three-option dropdown — 7 / 14 / 30
วัน — so a poster could not say "the 25th". It is `<input type="date">` now, labelled
วันสิ้นสุดการรับข้อเสนอ. Default is a week out, which was the old default; `min` is
tomorrow, because a deadline today or in the past would let someone post an RFQ nobody
can answer. A hint line under it restates the pick in words — รับข้อเสนอได้อีก 7 วัน —
which is the one thing the dropdown was genuinely good at.

**ผู้ให้บริการ → โปรไฟล์** in the left rail. Changed in `KX_NAV`, which is what
`renderSidebars` actually reads, and in the twelve static copies scattered through the
page markup. Those get overwritten at runtime, but leaving them saying something else
makes the source contradict itself. The phrase is untouched everywhere it means "service
provider" in body copy — the RFQ modals, the review gate, the wins note.

**The avatar menu takes the sidebar's icons.** Its rows were emoji (`✎`, `⚙️`, `🛡️`),
which the app-wide emoji converter renders from a generic map — so ตั้งค่า showed a
sliders glyph in the menu and a toothed cog in the rail, for the same destination. All
four rows now carry the same inline outline set the nav uses; the gear's path geometry is
identical between the two, checked by comparing the rendered markup.

Verified at 1280 and 375: no overflow, no clipped text, no JS errors across all 19 pages.
The date field is legible at 17.38 with its hint at 6.74, and the drawer nav on mobile
shows โปรไฟล์ too. Contrast failures hold at the same pre-existing 31.


## From navy back to blue

Read as a correction to the previous round rather than a repeat of it: last time the ask
was น้ำเงินเข้ม and the scale went to navy; this time it is "สีน้ำเงิน (Blue)", so the
whole scale moves one step lighter and bluer.

| | navy pass | now |
| --- | --- | --- |
| `--blue-600` | `#1d4ed8` | `#2563eb` |
| `--blue-700` buttons, links | `#1e40af` | `#1d4ed8` |
| `--blue-900` deepest | `#172554` | `#1e3a8a` |
| `--blue-50` tint | `#eef4ff` | `#eff6ff` |

The AA gain from the navy pass survives: every solid button still passes — 24 at 6.70 on
the primary, 2 at 10.36 on the deepest, 20 at 16.53 on the dark chrome. Nothing had to be
traded back to get the lighter hue.

**Two gradients were still slate.** The profile hero cover ran
`linear-gradient(120deg, #1a2233, #3a4a6b)` — charcoal with a hint of blue, and the
largest dark surface in the app. It reads as slate, not blue, which is why the platform
still felt off-tone from the top of the page down. It and the edit-profile preview cover
now run `#1e3a8a → #2563eb`, the scale's own two ends. Five places in total; no slate
literals left.

Checked what sits on those gradients rather than assuming: the profile hero has no text
directly over it, so nothing to lose. The login brand panel does, and its muted lines
were already among the known failures — but its light stop has gone `#1a7fff` (L 0.226)
→ `#2563eb` (L 0.153) across the two colour rounds, which is darker, so that text is
better off than it started, not worse.

Worth recording: the app-wide contrast sweep walks up to the nearest solid
`background-color`, so it steps straight past a gradient and scores that text against
whatever opaque ancestor it finds — the login panel has been measured against `#f7f7fb`
all along. A separate gradient-aware pass is what actually covers it.

Blue now holds **95%** of coloured area, counting gradients. Zero overflow and zero
clipped text across all 19 pages at 1280 and 375; contrast failures hold at the same
pre-existing 31; no JS errors.


## The last orange selection state goes blue

The ประเภท chip row on ใบเสนอราคา still marked its selection in orange — fill, border
and label. Three rules carried it: the base .active declaration, a later border-colour
override, and the hover border. All three now use the blue scale: #eff6ff fill,
#2563eb border, #1d4ed8 label at 6.16, against 5.86 for the unselected chips.

A sweep of every .active / .on / .selected / aria-checked element across all 19 pages
now returns no orange, amber or red on any selection state. The only amber left in the
app is the rating stars, where it belongs.

Two things worth recording from checking this:

The first measurement appeared to show a bug — after switching chips, the old one kept
its blue fill while the new one got only a border. That was the probe reading
mid-animation: background-color and color are transitioned over 150ms, border-color is
not, so borders snap while fills lag. With transitions disabled the selection tracks
cleanly through all three chips and back. Worth remembering before filing a state bug
from a synchronous read after a click.

App-wide contrast failures are down from 31 to 23 at 375px — the eight that went were
login-panel text the earlier blue passes had already improved; they crossed the
threshold once the chip rules stopped pulling --orange into the cascade.

Zero overflow, zero clipped text, no JS errors across all 19 pages.

## ค้นหางาน becomes a social feed

The card was a horizontal row — thumbnail left, text in the middle, a figure box and a
button in a right rail, all pinned to a 228px floor. That shape reads as a directory
listing. A post reads top to bottom, so the card now does:

| | |
| --- | --- |
| head | avatar, company name with a verified tick, `ผู้ซื้อ · ชลบุรี · 15 นาทีที่แล้ว`, and the ต้องการซื้อ / ประกาศขาย pill on the right |
| text | title at 17px/800, description, tag chips, the attachment summary |
| media | the picture, edge to edge at 21:9 — 866×370 on desktop, 355×199 at 375px |
| stats | `5 ข้อเสนอ` · `ราคาเฉลี่ย 92,500 ฿`, view count pushed right |
| actions | บันทึก · ถาม · the primary, filled |

Card one had no gallery at all; it gets the picture that job already carries elsewhere in
the app, so all six posts have media.

**Nothing was renamed.** Six scripts read this markup, and every class they depend on
stayed exactly where it was: `.offer-num` (the sort comparator), `.post-title`,
`.pp-name` and the first `<img>` (the save-to-บันทึกไว้ builder reads all three),
`.post-thumb-wrap` / `.post-thumb-track` / `.post-thumb` (carousel and lightbox),
`.bookmark-ic` with its `data-saved` flag, and the `data-type` / `data-cat` /
`data-location` attributes the three filters read. The attachment summary and the
galleries were lifted out of the old cards and dropped into the new ones verbatim rather
than re-typed, so their file names, sizes and handlers are untouched.

Re-checked end to end: type tabs 6 / 3 / 3; sort by offer count reorders 23-17-14-8-6-5
and back; the carousel lands on −864 for an 864 frame; saving produces a card with the
right type, title and image.

**One real bug surfaced.** `applyFeedFilters` set `card.style.display = 'flex'` when
showing a card — a leftover from the horizontal layout. The new card is `display:block`,
and the only reason the feed did not break on every filter click is that the stylesheet's
`!important` outranks an inline style. Both filters now set `''` and let the stylesheet
decide; verified that no card carries an inline `display` afterwards and all six compute
`block` through filtering and sorting.

All nine new text styles clear AA (5.17 to 17.38). No overflow, no clipped text, no JS
errors across all 19 pages at 375px and 1280px.


## The brand blue lands, and the feed becomes a column

### #0A5BFF

It was not that colour: the scale was `#2563eb` / `#1d4ed8` / `#1e3a8a`. Rebuilt around
the brand:

| | was | now | white on it |
| --- | --- | --- | --- |
| `--blue-600` | `#2563eb` | **`#0a5bff`** | 5.31 |
| `--blue-700` | `#1d4ed8` | `#0846c7` | 7.75 |
| `--blue-900` | `#1e3a8a` | `#052a7a` | 12.97 |
| `--blue-50` | `#eff6ff` | `#eaf1ff` | — |

Renaming the tokens alone would not have made the app *look* like `#0A5BFF`: the darker
`--blue-700` was doing the work, carrying 235k of surface against 105k for `--blue-600`.
So the 23 non-hover solid fills were repointed to `--blue-600`, leaving `--blue-700` as
what it should be — the darker step a button moves to on hover. `#0a5bff` now carries
312k, against 4k for the step below it. The brand is what you see.

Every solid button still clears AA on the new fill, and Facebook's `#1877f2` and Google's
`#4285f4` are untouched.

### The feed picture

864 wide by 370 tall is 2.33:1 — a letterbox. Nothing was wrong with the ratio in
isolation; the column was simply wider than a feed should be. The post card had inherited
the 866px content track, and every social feed caps this well below that: Facebook near
590, LinkedIn 555, X 600.

The feed column caps at **640 and centres** — and not just the list. The header, the type
tabs, the filter row, the advanced panel, the empty state and the load-more button were
all still full width, which would have left the posts inset from everything above them.
All six now sit at L113 w640, in line with each other. The picture is 16:9 from there:
638×359 desktop, 354×199 at 375px, where the cap lifts and the column is the screen.

That is the fourth time a size change in this file has been written as a new rule and
lost to the canonical one further down the sheet — the 21/9 declaration in the
social-feed block had to be edited in place. Writing it as a competing rule is the
mistake; editing the source value is the fix, every time.

Zero overflow, zero clipped text, no JS errors across all 19 pages at 375px and 1280px.
Contrast failures hold at the pre-existing 23; filters, sort, save and the carousel all
still work.


## ผลงานสะสม entries become feed cards

The markup was already photo → body → title → meta, so this was CSS only. The entry was
a horizontal row — 132×96 thumbnail on the left, text beside it — and it now has the
feed post card exactly: the picture leads full bleed at 16:9, the text sits underneath,
16px radius, no padding on the card itself.

The list takes the same 640px cap and centring the feed column uses, so a win renders at
the same size as a post rather than stretching to the profile column. Measured side by
side, both are 638×359 on desktop and 1.78:1 on mobile — the wins entry at 324×182
inside its card, the feed at 354×199 at full page width.

All six entries report one shape: 640×436, radius 16, block. The ชนะงานนี้ pill moved
from a 6px inset to 10px, since a 638px picture needs more margin than a 132px one to
look intentional.

The mobile rule that used to stack the row and pin the photo to 170px is gone — the card
is a column at every width now, so only the date needs releasing from its right push.

Title, category, date and pill all clear AA (5.45 to 17.38). No overflow, no clipped
text, no JS errors across all 19 pages at 375px and 1280px.

## ผลงานสะสม entries link back to the job

A record you cannot click through to is only an assertion. Each entry now opens the RFQ
it came from.

The whole card is the target, not a small link inside it: role="link", tabindex="0", an
aria-label carrying the job title, pointer cursor, a border and shadow on hover, a focus
ring, and the title turning blue. A ดูงานต้นทาง › line sits under the meta row — without
a visible affordance the card still reads as a static record. Enter activates it from the
keyboard.

Checked end to end at both widths: all six entries carry the handler and the affordance,
clicking lands on page-rfq-detail, the back bar reads กลับโปรไฟล์, and goBack returns to
the profile *still on the ผลงานสะสม tab* — the tab state survives the round trip because
pfTab holds it on the page rather than in the route.

The affordance is #0846c7 at 12.5px/700, 7.75 on the card. Cards measure 640×436 on
desktop and 326×287 at 375px. No overflow, no clipped text, no JS errors across all 19
pages.

**A note on escaping.** Writing this handler through a shell heredoc collapsed the inner
quotes — navigateTo('page-rfq-detail') inside a single-quoted JS string terminated it,
and the whole profile script block died silently, taking renderProfileWins with it. The
symptom was an empty list, not an error. Generated code with nested quotes belongs in an
editor edit, not a shell one-liner; that is the second time this file has caught it.

## Auditing every blue against #0A5BFF

The two elements circled were already on the brand *scale* — but on the wrong step. Their
border and label were `#0846c7`, the darker hover colour, while the ประเภท chip a few
pixels below marked its selection with `#0a5bff`. Selection was being signalled in two
different blues on the same screen.

A sweep of every rendered `background`, `border` and `color` in the blue band across all
19 pages found 37 declarations on selected states using `--blue-700` / `#0846c7`. All
moved to the brand. Every selected element in the app now reads `#0a5bff` — 30 of them,
one colour, checked by re-running the sweep.

The three on ใบเสนอราคา now measure identically:

| | fill | border | text |
| --- | --- | --- | --- |
| ที่ส่ง | `#eaf1ff` | `#0a5bff` | `#0a5bff` (4.69) |
| 893 ทั้งหมด | `#eaf1ff` | `#0a5bff` | `#0a5bff` (4.69) |
| ประเภท: ทั้งหมด | `#eaf1ff` | `#0a5bff` | `#0a5bff` (4.69) |

**The pale blues were tints of a different blue.** `#bfdbfe`, `#dbeafe` and `#93c5fd` are
steps of a stock ramp, not of `#0a5bff` — near enough to pass unnoticed, far enough to
read as a second family beside it. Mixed with white at 25 / 15 / 45 percent the brand
gives `#c2d6ff`, `#dae6ff` and `#91b5ff`: same weights, same hue as everything else. Ten
further one-off tints scattered across the RFQ detail, create-post and dashboard pages
folded into those three. 29 replacements.

Two other strays: the dashboard's selection glow was still `rgba(26,127,255,.25)`, the
blue from two rounds ago; and the sealed-bid banner ran a violet gradient with a violet
border. Both now sit on the brand.

**Deliberately left alone:** the neutral text scale (`#5f6479`, `#64748b`, `#1e293b`,
`#94a3b8`) reads as blue to a hue test because it is slightly blue-leaning, which is what
makes it work against blue accents; the light text on the dark auth panel; and three
other companies' brand colours — Facebook `#1877f2`, Google `#4285f4`, the Word icon
`#2b579a`.

No overflow, no clipped text, no JS errors across all 19 pages; contrast failures hold at
the pre-existing 31.


## The figure in the price box takes the brand

The box itself was already on brand tints after the last audit — #dae6ff fill, #91b5ff
border. What was left was the number inside it, still on #052a7a, the deepest navy in
the scale. It is #0a5bff now, across all four lists: ประกาศซื้อ, ประกาศขาย, ที่ส่ง and
ที่ขอ.

At 19px/800 and 26px/700 the figure counts as large text, which needs 3.0; #0a5bff on
#dae6ff measures 4.24, so it clears the bar it is held to and the 4.5 bar below it as
well. Every other element inside the boxes was re-checked after the change — no
failures.

Two rules became one. The figure colour had been split by buy and sell back when the
boxes were green and red; they have been the same colour since the blue pass, so the
split was carrying no information. The four selectors now share a single declaration.

Zero overflow, zero clipped text, no JS errors across all 19 pages at 375px and 1280px.

## The profile becomes a social profile

Measured against the feed first, which gave three concrete reasons it was not landing:
the profile column was 866 while the feed is 640, so the two pages felt like different
products; the identity — logo, name, tagline, rating — sat on top of the 200px cover,
which is a marketing hero rather than a profile header; and ภาพรวม opened with roughly
1,400px of paperwork (เกี่ยวกับ 351, ข้อมูลบริษัท 133, ติดต่อ 328, การยืนยันตัวตน 269,
ใบรับรอง 202, ความเชี่ยวชาญ 124) with everything the seller had actually done hidden
behind a tab.

**Same column as the feed.** Both now measure 640.

**The header is a header.** The cover is just a cover at 170px; the logo straddles its
bottom edge; name, Verified, bio, rating, the two buttons and the counts sit on white
below it. The four stat boxes became an inline row — 356 RFQ ที่ตอบ · 892 ใบเสนอที่ส่ง ·
248 งานสำเร็จ · 95% ตอบใน 1 ชม. — which is how a follower row reads.

**ภาพรวม leads with work.** เกี่ยวกับ, then the three most recent ผลงาน as feed cards
with a ดูทั้งหมด link into the tab, then ติดต่อ, then the credentials. Ordered with flex
order rather than by moving markup, because ข้อมูลบริษัท is injected at runtime by
applyToProfile and lands wherever it lands; :has(.contact-list) picks out ติดต่อ, the one
card with no id.

**Two mistakes worth recording.**

The hero replacement spanned from .hero-card to the tab strip, and that region ends at
div depth 1, not 0 — .hero-card wraps the tabs. Closing it in the replacement dropped a
level, .grid fell out of .wrap into the layout grid as a third item, and the whole card
column collapsed to 230px. Counting the depth of a region before replacing it is the
check that catches this; a balanced-looking replacement is not the same as a replacement
that ends at the same depth.

Then the new grid rule carried an unscoped !important, which overrode the rule that
collapses the profile to one column on a phone — the entire page rendered inside the
230px rail at 375px. Scoped to min-width 1025px.

Verified at both widths: profile 640 / feed 640 on desktop, 375 full width on mobile;
logo straddles the cover at both; three wins in the preview; every tab still isolates
its own section. No overflow, no clipped text, no JS errors across all 19 pages.

## The price, and the order of the rail

### The number people scan for

`5 ข้อเสนอ · ราคาเฉลี่ย 92,500 ฿ · 842 วิว` was one flat grey line: the price set in
13.5px bold, weighing the same as the view count sitting beside it. The price is the
thing a buyer decides on, so it is now the only large item in the row — 19px/800 on the
brand with an 11.5px label stacked above it (17px on a phone) — and the offer count
reads as a chip on #eaf1ff rather than as more running text. วิว stays small and grey on
the right. Applied to all six cards, buy and sell (ราคาเฉลี่ย / ราคาเริ่มต้น).

`.offer-num` stays exactly where it was, because setFeedSort reads it to sort by offer
count — checked, still 23·17·14·8·6·5 descending. The row holds one line at 375px:
57px tall, chip and วิว on the same baseline, no wrap.

### Rail order

It was dashboard-first, which is a SaaS template assumption rather than anything about
this app. ค้นหางาน is the feed and the reason the app gets opened, so it leads; แดชบอร์ด
is a summary you check, so it closes the working group. ข้อความ and แจ้งเตือน carry the
only two unread badges in the rail and were sitting sixth and seventh. โปรไฟล์ left the
list — the footer row underneath the divider already goes there, so it was in the rail
twice; that row now marks itself active when you are on the profile.

ค้นหางาน · งานของฉัน · ใบเสนอราคา · แดชบอร์ด · ข้อความ (5) · แจ้งเตือน (3) ·
บันทึกไว้ · ประวัติการเข้าชม · ตั้งค่า, then the divider and the profile row.

I first shipped this as three groups with `__g` labels — งาน / การติดต่อ / ของฉัน — and
they came straight back out. Nine rows do not need signposting; the labels were three
extra things to read on a rail that already fits on one screen, and the grouping is
legible from the order alone. The order is the change. The drawer picks it up unchanged.

One contrast regression from the new active footer: --nav-ico reads 4.76 on white but
4.20 once the row is tinted, so the active sub-line takes #4b5563.

Verified at 375 and 1280: no overflow, no clipped text, no JS errors across all 19
pages. Every element in the new stats row clears AA — 19px/800 brand on white 5.31,
the chip number 4.69 on its tint, the label and วิว 6.74.

## The feed tabs were not filtering

ทั้งหมด / ต้องการซื้อ / ประกาศขาย marked themselves selected and did nothing to the list.

`applyFeedFilters` hides a card with `card.style.display = 'none'`, and when the feed
was rebuilt as a post list the new card rule was written as
`#page-feed .post-card{ display:block !important }`. An inline style loses to
!important, so every card stayed visible. Location, category, the free-text search and
ค้นหาขั้นสูง all hide cards the same way and were all equally dead.

The !important was never needed: the rule sits later in the sheet than the one it was
overriding, so ordinary specificity already wins. It was there to beat
`display: flex` in the original horizontal-card rule — which is simply stale, and is now
`display: block` at source. The override drops the declaration entirely.

This is the same trap as the four size regressions, arriving from the other side: there,
a new rule lost to a canonical !important further down; here, a canonical !important beat
the JavaScript. Both come from reaching for !important instead of editing the value that
was actually wrong.

Verified at 375 and 1280 — type tabs give 3 buy / 3 sell / 6 all, location and type
combine (ชลบุรี + ประกาศขาย = 0 with the empty state showing), the search overlay and
ค้นหาขั้นสูง each narrow to 1 on เลเซอร์ and restore to 6, sort-by-offers still returns
23·17·14·8·6·5, save still round-trips. Cards measure 640x628 / 355x461 as before — the
layout did not move. No overflow, no clipped text, no JS errors across all 19 pages.

## The chat actually sends

### The two header icons

Removed. 📞 and ℹ️ were bare spans with no handler — a phone call is not something this
platform does, and the ℹ️ never had a panel behind it. Nothing was lost; the company
name in the header already goes to the profile.

### Send and attach

Both were decoration: the paperclip was a span, the send button a button with no
listener, and the whole page script was four lines that toggled a CSS class on the
conversation list.

Send now works on click and on Enter, ignores whitespace-only input, appends an outgoing
bubble with the current time, scrolls the thread down, clears the field and keeps focus.
Text is escaped — `<img src=x onerror=...>` renders as characters, not as an element.
The paperclip opens a real file picker; chosen files come back as file rows with name
and size (name truncates, size does not), and the input is reset after each pick so the
same file twice still registers. Both actions update the conversation row in the list,
which is how you find the thread again.

### The part that had to come with it

`openConv` only toggled a class — clicking Siam Metal Works left Prime CNC's messages on
screen. Sending into that would have put the message in a thread the header said you
were not in, so send could not be correct without it. Each conversation now has its own
message store, seeded from the list itself so adding a row to the markup is enough, and
switching swaps the body, the name, the avatar and its colour, and the online line.
Messages persist per conversation across switches. Opening a conversation also clears
its unread dot, which is what opening it means.

Two details the switch had to preserve: the ● in the status line is converted to an svg
dot by kxApplyIcons at load, so setting textContent regresses it — kxApplyIcons is
re-run on the header. And .chat-status is green unconditionally, so an offline label
read as though it were online; it takes .off.

Verified at 375 and 1280: send by click and by Enter, empty input ignored, escaping
holds, attach shows 2 KB and 3.0 MB correctly and truncates a long filename inside the
bubble, messages survive switching between three conversations and back, unread dots
clear. No overflow, no clipped text, no JS errors across all 19 pages.

Still static: the other side never replies, and nothing is uploaded or persisted past a
reload.

## Attachments split themselves, and โพสต์ประกาศ actually posts

### The question was where each kind goes

The card already had a slot for each: .post-thumb-wrap is the carousel, .files-sum is
the '📎 2 ไฟล์แนบ · กดเพื่อดู ›' strip under the description. Nothing on the card side
needed designing. The gap was the form — one dropzone, no preview, and a post button
that ran alert() and navigated away.

### One dropzone, split on the way in

The poster is not asked to sort what the browser already knows. Anything whose type
starts with image/ is a picture; everything else is a document. Extension decides the
document icon, because Windows hands over an empty MIME type for .xlsx and .dwg — both
were classified correctly from the name alone in testing.

Pictures get a grid, documents get chips, and the difference is not decorative: the
first picture is the cover the feed shows, so their order is editable (drag to reorder,
the cover badge follows), while the documents' order carries no meaning. Both lists
stay hidden until something is in them.

DWG became a real type rather than falling through to the Excel icon — added to the chip
colours, the mini icons, the preview modal and DP_LABELS as แบบ CAD.

### Publishing

โพสต์ประกาศ now builds a card and puts it at the top of the feed: pictures into the
carousel with working arrows and dots, documents into the ไฟล์แนบ strip in the exact
markup openFilesList and openDocPreview already read. RFQ and Offer differ where they
should — ต้องการซื้อ/ประกาศขาย, ข้อเสนอ/ผู้ขอใบเสนอราคา, ราคาเฉลี่ย/ราคาเริ่มต้น,
ดูข้อเสนอ/เสนอราคา. A new post has no offers and no price yet, so it says ยังไม่มี
rather than inventing a number. An empty title is refused.

**A post with no pictures gets no picture.** The carousel is simply not emitted and the
card ends after the stats — a placeholder would pretend there was something to look at.
A first attempt to add bottom padding for that case used
.post-card > .pc-text:last-of-type, which never matches: :last-of-type goes by tag, and
.pc-actions is the last div. .pc-text's own 12px was already carrying the gap, so the
rule was removed rather than fixed.

Verified at 375 and 1280: 2 images + 3 documents split correctly with sizes at
1.1 MB / 88 KB / 488 KB, removal reindexes both lists, the cover badge stays on the
first, the grid is 4-up on desktop and 2-up at 375 (148x111), long filenames truncate
inside their chip. Posted cards carry 4 thumbs / 4 file rows / working carousel and
files modal; the text-only card renders 235px tall with no picture and no strip; the
type tabs count the new cards (5 buy / 4 sell / 9 all). Cover badge contrast 5.31. No
overflow, no clipped text, no JS errors across all 19 pages.

One gap left standing: the form has no province field, so a published card carries an
empty data-location and a location filter will hide it.

## The bid modal was a picture of a form

Measured before touching it: the price input had no id and no name, so nothing could
read it; the textarea likewise; and **ส่งข้อเสนอ had no onclick and no listener at all**.
Clicking it left the modal open, the price in the field, the files in the list, and
changed nothing anywhere in the app. Only the paperclip worked.

It also had the same bug the chat had: renderOfferFiles pushed the filename straight
into innerHTML. A file named `<img src=x onerror=alert(1)>.pdf` produced a real <img>
element in the page — verified, then fixed. That is the second place in this file where
a name reached innerHTML unescaped, so it is worth stating as a rule: nothing a user can
name goes into innerHTML without passing through an escape first.

### What it does now

The price is validated (empty, non-numeric and ≤ 0 are refused, with an inline error and
a red field rather than an alert). The file list keeps size and type, not just the name.
And ส่งข้อเสนอ builds a row at the top of **ใบเสนอราคา → ที่ส่ง**, then goes there.

The row is built to the shape the page already filters on — data-status="pending",
data-origin="rfq" — so the existing tabs pick it up with no change: it appears under
ทั้งหมด (8), under รอผล (5), under เสนอราคา (6), and correctly not under ตอบคำขอ (2).

Title, location and thumbnail are read off the RFQ page. The buyer name was there too
but only as a bare <b> inside an inline-styled div, so it got a class (.kx-rfq-owner)
rather than being reached by a fragile structural selector — the row now says
"ผู้ซื้อ: บจก. ไทยพรีซิชั่น" with a matching avatar letter instead of a placeholder.

Verified at 375 and 1280: empty and non-numeric prices refused with nothing added, the
filename escape holds (zero injected elements), a real bid lands as one row with price
15,000 / 250,000 formatted, status รอผล, note and both files attached, the form clears,
the modal closes and the page follows. Modal 322px wide at 375 with the file rows inside
it. Error text contrast 5.44. No overflow, no clipped text, no JS errors across all 19
pages.

Still static: the bid does not appear on the RFQ's own offer list, and nothing persists
past a reload.

## Every control that rendered and did nothing

Found by clicking every button on all 19 pages under a MutationObserver and keeping the
ones that produced no mutation, no page change and no modal. Twelve were real.

| หน้า | control | now |
| --- | --- | --- |
| ประกาศซื้อ | สถานะทั้งหมด | filters on the status pill; empty state when nothing matches |
| ประกาศซื้อ | ล่าสุดก่อน | sorts by posted date, both directions |
| ประกาศขาย | ล่าสุดก่อน | + ราคาสูง/ต่ำ |
| ใบเสนอราคา | ล่าสุดก่อน | + ราคาสูง/ต่ำ |
| ตั้งค่า | ยกเลิก · บันทึกการเปลี่ยนแปลง · อัปเดตรหัสผ่าน | validate and save |
| ประวัติการเข้าชม | ล้างประวัติ | confirms, clears, shows the empty state |
| โปรไฟล์ | ดูเพิ่มเติม | expands เกี่ยวกับบริษัท |
| เข้าสู่ระบบ | Google · Facebook | sign in |
| เข้าสู่ระบบ | เข้าสู่ระบบ | validated — it navigated on any input, blank included |
| แก้ไขโปรไฟล์ | × on a skill tag | removes the tag |
| ค้นหางาน | ดูแพ็กเกจ (เร็ว ๆ นี้) | goes to หน้าแพ็กเกจ, which exists — the label was stale |
| RFQ / Offer | ถาม | posts into the Q&A list and bumps its count |

The four sort chips share one popup rather than three implementations. The confirmations
share one toast rather than four alert() boxes; premChoose kept its alert until now too.

**ตั้งค่า had no ids at all** — six fields, none with an id or a name, so nothing could
read them even in principle. Given ids, they now validate (email format, password at
least 8 characters, confirmation must match) and persist to localStorage, and ยกเลิก
restores the last saved values rather than doing nothing.

**ถาม was an alert claiming the question had been sent** while the Q&A list two inches
above it stayed at three. It appends a real entry and moves the count. Escaped, like the
other two places a user string reaches innerHTML.

### Four mistakes worth recording

**The probe was wrong before the code was.** MutationObserver delivers on a microtask, so
disconnecting straight after click() reported every control as dead, including ones I had
just written. takeRecords() reads the queue synchronously. Five of the six survivors in
the final sweep were correct no-ops — an empty title, an empty message, a declined
confirm — and only ถาม was real.

**:nth-of-type(2) does not mean the second chip.** It counts among siblings of the same
tag, and the chips are divs among other divs, so the rfq sort wired itself to nothing.
Indexing querySelectorAll is what was meant.

**display:-webkit-box was being dropped** while -webkit-line-clamp and -webkit-box-orient
from the same rule applied — computed display stayed block, so ดูเพิ่มเติม expanded text
that was never clipped. A stated line-height with a matching max-height clips for certain.

**A hidden page measures 0.** The show/hide test for ดูเพิ่มเติม ran at boot, when the
profile is not the active page, so scrollHeight and clientHeight were both 0 — read as
not clipped, and the button hid itself permanently. It runs on navigation to that page
and on resize instead, which also handles the real case: the text clips at 375 and not at
1280.

One more, caught in testing rather than in review: the chip menu tracked open/closed in a
data attribute, so anything that removed the menu without clearing the flag swallowed the
next click. It reads the state off the DOM now.

Verified at 375 and 1280. No overflow, no clipped text, no JS errors across all 19 pages;
contrast failures hold at the pre-existing 31, toast 17.38, chip menu 4.69.

Still stubbed on purpose, and stated rather than hidden: payment (แพ็กเกจ says so), the
other side of a chat never replies, and nothing survives a reload.


## Search finds the platform, not just the feed

It filtered `#page-feed .post-card` and navigated to the feed. That is 6 of the roughly 40
things in the app; the other 34 — my RFQs, my offers, quotes, conversations, saved items,
notifications, browsing history, the company profile — were invisible to it.

**The results could not live in the feed.** The feed renders post cards and nothing else,
so a conversation or a quote has no shape there. Results get their own page, grouped by
kind with a count per group and a tab strip to narrow to one kind.

**The index is the DOM.** Every page of this app is already in the document, so the cards
are their own index — nine sources, each with a selector and a way to pull a title and a
subtitle. Nothing has to be kept in sync by hand, and anything created during the session
is findable: a post published from โพสต์ประกาศ and a message typed into a chat both came
back in the results, without a line of code connecting them to the search.

**Substring, not tokens.** Thai has no word boundaries. A tokeniser would need a
dictionary to split ชิ้นส่วนเครื่องจักร, and would then miss a search for ส่วนเครื่อง
that substring matching finds. The matched run is marked in the result so you can see why
a row came back.

**A result has to take you to the thing.** Clicking one navigates to its page, scrolls the
row into view and flashes it. If a filter on that page was hiding the row, the display is
cleared first — verified by filtering ใบเสนอราคา to ชนะ, then opening a รอผล result from
search and finding it visible and highlighted.

Searching CNC returns 14 across 7 groups: งาน 5 · บริษัท 1 · ใบเสนอราคา 2 · ข้อความ 1 ·
บันทึกไว้ 1 · แจ้งเตือน 2 · ประวัติการเข้าชม 2. ชลบุรี returns 7 across 5. A term that
matches nothing gets an empty state rather than a blank page.

ค้นหาขั้นสูง on the feed is untouched — it filters within the feed, which is a different
job from finding something across the app.

One contrast fix on the way in: the `›` chevron at `#8a90a6` reads 3.17 on white, and it
is a text node rather than an icon, so it took `#565b6e` (6.74).

Verified at 375 and 1280 — 14 results both widths, rows and the wrapped tab strip inside
the column, thumbnails 64x48 / 52x40, highlight 10.34, active tab 4.69. No overflow, no
clipped text, no JS errors across all 20 pages; contrast failures hold at the pre-existing
count.


## ค้นหาขั้นสูง: three of five fields worked

Measured field by field against the six feed cards:

| field | before |
| --- | --- |
| คำค้น / คีย์เวิร์ด | worked — 6 → 1 on เลเซอร์ |
| จังหวัด | worked — 6 → 1 on ชลบุรี |
| ประเภท | worked — 6 → 3 on ประกาศขาย |
| งบประมาณขั้นต่ำ | **never read** — 1,000,000 still returned all 6 |
| งบประมาณสูงสุด | **never read** — a maximum of 1 still returned all 6 |

`applyAdvSearch` read `advKw`, `advProv` and `advKind` and nothing else. The two number
fields rendered, accepted input, and were ignored.

**They filter on price now, and the labels say price.** What a card actually carries is
the price it displays — ราคาเฉลี่ย on a buy, ราคาเริ่มต้น on a sell. Calling that a
budget would be wrong on the buy side, where it is what the offers came in at rather than
what the buyer set aside, so the labels became ราคาขั้นต่ำ / ราคาสูงสุด. Filtering on a
number the card does not show would have been the other way to be wrong.

A card with no price yet — a post made this session shows ยังไม่มี — drops out once a
bound is set, because that is what asking for a range means, and comes back when the range
is cleared. Non-numeric input is ignored rather than hiding everything.

**One inconsistency fixed alongside.** Every other filter hides โหลดเพิ่ม when nothing
matches; ค้นหาขั้นสูง left it sitting under the empty state.

Verified at 375 and 1280: ≥80,000 returns 92,500 / 385,000 / 80,000; ≤70,000 returns
15,000 / 3,500 / 68,000; 10,000–100,000 returns four; ประกาศซื้อ combined with ≥90,000
returns two, both buy. An impossible range shows the empty state with โหลดเพิ่ม hidden,
and ล้าง restores all seven. No overflow, no clipped text, no JS errors across all 20
pages.

Left as it is: `3,500 ฿/เที่ยว` compares as 3,500. It is a per-trip rate rather than a
total, so a range filter is comparing unlike things — but it is the number on the card,
and inventing a normalisation the data does not support would be worse.


## The price moves to the middle of the card

`justify-content:center` on the stats row was the wrong instrument: it would have centred
all three items together, so the price would sit somewhere different on every card — the
sell chip (ผู้ขอใบเสนอราคา) is nearly twice the width of the buy chip (ข้อเสนอ), and วิว
varies with the digit count.

The chip and the price are now one element, `.pc-center`, in a three-column grid whose
outer columns are both `1fr`. That puts the middle column at the true centre of the card
whatever is in the other two, and วิว stays pinned right. Measured across all six cards:
the pair's centre is 0px from the card's centre on every one, while the pair itself ranges
from 173 to 266 wide. Rows stay 59px, so the cards still line up.

At 375 the sell pair is 243 and วิว another 55 — three columns would have squeezed the
price — so วิว drops to its own line beneath, and both are centred. 82px rows, equal
across all six.

The wrapper went into the six static cards and into the template `cpPublish` builds, so a
post made in the app gets the same treatment; checked by publishing one.

No overflow, no clipped text, no JS errors across all 20 pages at either width.

## /เที่ยว comes off the price

`3,500 ฿/เที่ยว` in two places — the feed card and the same listing on ประกาศขาย — now
reads `3,500 ฿`, so every price on the platform is one number in one unit.

Three other uses of เที่ยว stay, because they describe the work rather than price it:
the `🔁 รายเที่ยว` chip on the RFQ, and `5 เที่ยว/เดือน` and `1 เที่ยว` in the quantity
column of the requests list.

This also closes the wrinkle recorded with the price range filter. That entry noted
`3,500 ฿/เที่ยว` parsed as 3,500 and was therefore compared against totals as though it
were one — unlike things being ranked together. With the suffix gone the comparison is
honest: filtering to ≤4,000 returns that one card and nothing else.

Centring holds at both widths now the string is shorter — the pair is still 0px off the
card's centre on all six, rows still equal height. No overflow, no clipped text, no JS
errors across all 20 pages.

## The view count comes off the feed card

`.pc-views` is gone from all six cards and from the template `cpPublish` builds, along
with the three rules that placed it. The stats row is now the offers chip and the price
and nothing else.

Nothing read the element — checked before removing — so the sort-by-offers comparator,
which reads `.offer-num` inside the chip, is untouched and still returns descending.

The three-column grid stays. It is what centres the pair, and it did that by making the
outer columns equal rather than by reserving space for วิว, so removing the right-hand
occupant changes nothing about the centring. Verified: 0px off centre on all six cards at
both widths.

The row got shorter at 375, from 82px to 56px, because วิว no longer takes a second line
there. 59px on desktop, unchanged.

No overflow, no clipped text, no JS errors across all 20 pages.

## Each card says how many pictures it has

The dot row said "there are more" and nothing else — it stops being countable past four
or five, and it never told you which one you were looking at. Every carousel now carries
`1/3` in the top-right of the picture, with a small camera mark.

**One pass, not three implementations.** The feed writes its carousels into markup with
inline `cycleThumb` handlers; ประกาศซื้อ builds its at runtime with listeners; a
published post builds a third. The badge does not care which — it finds every
`.post-thumb-wrap`, reads the track, and watches that track for movement, so anything
that moves the strip updates the count, including mechanisms added later. Verified on all
three: the feed arrows, the runtime-built ประกาศซื้อ arrows, and a post published during
the session all count correctly and wrap at the end.

Where a track has no `data-index` yet, the index is read back off the transform the swipe
handler set, so a card swiped before it was ever clicked still reads right.

A card with a single picture gets no badge and no dots — there is nothing to count.

Contrast 18.7 on the overlay; the badge sits 10px in from the top-right and clears the
arrows at both widths. 11 badges across the app. No overflow, no clipped text, no JS
errors across all 20 pages at 375 and 1280.

**Third time on the same trap.** The first read of the counter after clicking said it
never changed. MutationObserver delivers on a microtask, so a synchronous read after the
click sees the old text. This is now the third measurement in this file to be wrong that
way — after the dead-control probe and the chip menu. When a check reads DOM state right
after an event, wait a tick before believing it.

## The chess king becomes the app icon

Swapped across 24 references: the mark in the top bar on all 19 pages, the favicon, the
apple-touch-icon, and the icon the PWA manifest hands the launcher. The old files are
still on disk, untouched.

**The source needed work before it could be an icon.** It arrived 1067x1474 with an opaque
near-white ground (`rgb(253,254,253)`, PNG colour type 2 — no alpha channel at all) and
875KB. As a favicon that is a white rectangle with a king in it, and against the white top
bar the rectangle would have shown.

The ground is keyed out on the red channel, which runs 0 on the blue and ~253 on the
ground and so gives the cleanest ramp for the anti-aliased edge. Flat areas still wobble a
few levels, which stops the encoder collapsing them — snapping the ends and quantising
between took the mark from 125KB to 7.5KB for the same picture.

**The blue was not quite the brand.** The artwork measured about `#005cf8` against the
platform's `#0a5bff` — close enough to look like a mistake rather than a choice, so the
silhouette is recoloured to the brand exactly. It is a flat two-colour shape, so this
costs nothing. Say the word if the original blue was deliberate.

**Two files, because they are two different jobs.** The top bar gets 124x240, trimmed
tight and transparent. The installed-app icon gets 512x512 on solid white with the king at
62% height: the manifest declares `purpose: "any maskable"`, so Android crops it to a
circle, and art that reaches the edge loses its crown and its base.

`.brand-logo` was `width:26px; height:26px` — square, because the old mark was. The king is
124x240 and was being squashed into that box. Width follows height now, and the corner
radius went with it: there is no corner to round on a transparent silhouette.

Verified: all 19 marks load and point at the new file, rendered 14x28 at both widths and
matching the file's aspect ratio, inside the bar and vertically centred. Corner pixel
`rgba(0,0,0,0)`, body pixel `rgba(10,91,255,255)`. Favicon and apple-touch-icon resolve,
and the runtime-built manifest reports the 512. No overflow, no clipped text, no JS errors
across all 20 pages.

The scratch server grew a `POST /__write` endpoint for this: canvas already has a PNG
decoder and encoder, so the image work happens in the page and the bytes come back to
disk, rather than hand-rolling a PNG codec in node.

## The lockup: mark and word, with the mark big enough to read

The mark was 14x28 — 17% of the lockup, a blue sliver next to the word. What makes this
particular artwork worth having is the pair of faces in the stem, and at that size the
stem is 8px tall, so the thing the logo is *for* was invisible.

40px tall now (21 wide), 21% of the lockup, in a 67px bar that still has 27px spare. The
faces get 12px. Vertically centred and centre-aligned with the word at both widths.

**The word was on the wrong blue.** `.brand-word` was `--blue-700` / `#0846c7`, the darker
hover step, while the mark had just been set to `#0a5bff` exactly — two blues a few
degrees apart sitting 6px from each other, which reads as a mistake rather than a choice.
Both on the brand now, 5.31 on white. Word went 16px to 17px so it holds its own beside a
taller mark.

Verified at 375 and 1280: 21x40 on every one of the 19 bars, none spilling out, the search
pill still 28px clear of it on desktop and the right-hand icons clear on mobile. No
overflow, no clipped text, no JS errors across all 20 pages.

## The app icon, matched to the mockup

The mockup rendered the icon under both masks, so it could be measured rather than
eyeballed: the king is 70% of the tile height in the squircle, 60% once a circle crops it.
The icon I had built was 62%. Regenerated at 70%, which is the number the mockup states.

**70% still survives the circular crop.** A maskable icon has to keep everything inside a
circle of 80% diameter — radius 0.40 of the canvas from centre. At 185x358 the art's
bounding-box corner sits at 0.394 and the tip of the crown at 0.350, so nothing is lost
when Android rounds it. That is close to the limit; anything past about 71% would start
clipping the corners of the crown.

Ground `#ffffff`, king `#0a5bff`, centred to the pixel on both axes, 77px of margin top
and bottom.

**The manifest was lying about the size.** It declared `sizes: "192x192"` for a file that
has been 512 square the whole time. Now `512x512`.

The top-bar mark is untouched — 21x40, its own trimmed transparent file, which is a
different job from the installed-app tile.

Verified: manifest resolves to the new icon at the right size with `purpose: "any
maskable"` and theme `#0a5bff`; favicon and the 19 bar marks load. No overflow, no clipped
text, no JS errors across all 20 pages.

`assets/img/preview_mockup.png` and the original `ChatGPT Image ….png` are still in the
assets folder and nothing references them — left alone rather than deleted, since they are
the source material.

## The blue king on the blue panel

`.au-mark` and `.au-cardmark` both carry a `.tile` class whose whole job is to strip the
CSS tile — `background:transparent !important; padding:0 !important`. That was right for
the old mark, which was a square PNG with its own background baked in: two tiles would
have doubled up.

The new mark is a bare transparent silhouette. So on the sign-in page's blue gradient
panel, `.tile` left a `#0a5bff` king sitting on a `#0a5bff` field with nothing behind it —
the shape was there and essentially invisible.

Both spots now show the actual app icon, which already is a white tile with the king on
it, and the CSS only rounds the corners: 13px on the 44px panel mark, 21px on the 72px
card mark, `overflow:hidden` so the square image takes the radius.

Sampled the rendered pixels to confirm rather than assume: corner `rgb(255,255,255)`,
centre `rgb(10,91,255)`, above the crown `rgb(255,255,255)` on both. White tile against
the panel measures 5.31.

The top-left mark is hidden below 640 — that is the existing layout, the blue panel does
not show on a phone — and the card mark is 72x72 there.

No overflow, no clipped text, no JS errors across all 20 pages.

## The top bar moves left on a phone, and stops overlapping itself

The bar kept its desktop 32px inset at 375px, so the burger started 32px in and the
lockup began at 98. Measuring it turned up something worse than the gap: on 13 of the 19
bars the wordmark ran **30px past the left edge of the right-hand icon group**. `.nav-left`
was being squeezed and `.brand-word` is `flex:none; white-space:nowrap`, so instead of
shrinking it overflowed its own container and sat under the icons.

14px from the breakpoint where the burger appears. Burger at 14, mark at 62, wordmark
ending at 160, icons starting at 212 — 52px of clearance where there was −30.

**There was no shared rule to change.** Each page carried its own `#page-x .navbar` with
the whole declaration, and an id selector beats a class one in a media query wherever that
media query sits in the sheet. The first attempt — a `.navbar, .sh-nav` rule inside
`@media (max-width:1024px)` — took effect on the 6 `.sh-nav` pages and changed nothing on
the other 13. Specificity, not source order; the trap this file usually springs is the
other one.

The 13 page rules had their horizontal padding stripped (their vertical padding stays,
since three of them differ) and the inset now lives in one place: 32 by default, 14 below
1024.

That also merged three stray insets — 32, 28 and 26 across different pages — into one
number, which is why the bar now starts at the same place on every page instead of three.

Verified: one padding value across all 19 bars at each width, no overlap anywhere, no
overflow, no clipped text, no JS errors across all 20 pages.

## An Offer does not have an auction

Auction type is the rule for whether bidders can see each other's prices. That only means
anything when several of them are bidding for your job — on an Offer you are the one
listing something and nobody is competing, so there is no price to hide or reveal. The
step was not merely irrelevant there; it carried a required asterisk.

`selectPostType` recoloured the two cards at the top and touched nothing below them, so
the whole form stayed an RFQ form whichever you picked. It switches now:

| | RFQ | Offer |
| --- | --- | --- |
| เลือกประเภทการเสนอราคา | shown | hidden |
| วันสิ้นสุดการรับข้อเสนอ | shown | hidden — no incoming offers to stop accepting |
| ราคาเริ่มต้น | — | **shown, required** |
| description label | รายละเอียดงาน | รายละเอียดสินค้า / บริการ |
| title + description placeholders | asking | offering |

**The price field did not exist.** The feed card has always had a ราคาเริ่มต้น slot on the
sell side, and the form never asked for the number, so every Offer posted from inside the
app read ยังไม่มี. It is validated the way the bid modal is — empty, non-numeric and ≤ 0
refused with an inline error and a red field — and formatted into the card.

Verified at 375 and 1280: switching type moves all five things and switches back; an Offer
with no price is refused with nothing added to the feed; a real one posts as `data-type=sell`
with ราคาเริ่มต้น 15,000 ฿, "0 ผู้ขอใบเสนอราคา" and the เสนอราคา action; an RFQ still posts
with ราคาเฉลี่ย ยังไม่มี, which is correct — there are no offers in yet.

The posted Offer behaves like any other card: it appears under the ประกาศขาย tab, the
14,000–16,000 price range finds it, and global search returns it. Step numbering stays
coherent — Offer shows step 1 only, RFQ shows 1 and 2, so there is no gap where 2 used to
be.

## Two text colours, not five

The rail ran on `#1E293B` while everything else used `#16192b`. Folded into `#16192b`,
which is what was asked for — the menu is 17.38 on white now instead of 14.63 — and it
also removes an ink nobody could have told apart from the other one on purpose.

Then the audit found the same thing four times over in the greys. Measured across all 20
pages:

| | contrast on white | uses |
| --- | --- | --- |
| `#5f6479` (`--ink-soft`) | 5.86 | 114 |
| `#565b6e` | 6.74 | 87 |
| `#5f6675` (`--ink-faint`) | 5.76 | 84 |
| `#64748b` (`--nav-ico`) | 4.76 | 17 |

Not a hierarchy — drift. `#565b6e @12px`, `#5f6479 @12px` and `#5f6675 @12px` all appeared
on the same kind of line, and `--ink-soft` and `--ink-faint` differ by three points in one
channel, which is an accident rather than a step. All four fold into `#565b6e`, the
strongest of them (6.30 even on the page ground).

**Half-pixel font sizes.** 11 and 11.5, 12 and 12.5, 13 and 13.5, 14 and 14.5, 15 and
15.5, 16 and 16.5 were each doing one job in two values. 266 declarations merged, each
pair into whichever value the file already used more.

The scale after: 473 elements on the ink, 279 on the one grey, and 23 distinct sizes where
there were 29 — 12.5 / 11.5 / 16 / 13 / 14 carrying most of it.

Nothing moved: no overflow, no clipped text, no JS errors across all 20 pages at 375 and
1280, contrast failures hold at the pre-existing 31. The drawer picks the darker ink up
too, since it reads the same tokens.

`#0846c7` stays at 56 uses — that one is a real second step, the darker blue for hover and
links, not another accident.

## The ที่ขอ cards stop saying it twice

Each card carried a status pill and then, underneath it, a label/value pair that repeated
the pill in smaller type: ได้รับแล้ว above ใบเสนอราคา / 1 ฉบับ, รอราคา above สถานะ /
รอผู้ขายจัดทำ. The pill and the button below already carry both facts — the pill says
whether the quote arrived, the button says ดูใบเสนอราคา or แชทกับผู้ขาย accordingly.

Both pairs removed from the renderer. The status column is 194px on all three rows and
rows are 228px, so nothing lost its alignment.

Scoped to ที่ขอ. ใบเสนอราคา → ที่ส่ง keeps its own seven sub-labels, which say something
the pill there does not (ปิดรับข้อเสนอ and the date).

Verified at 375 and 1280: no sub-labels left on the page, rows fit the column, pills and
actions unchanged, no overflow, no clipped text, no JS errors across all 20 pages.

## The tile logo: white king on blue

The new artwork is the finished icon — a white king on a blue gradient inside a rounded
square — where the old one was a bare blue silhouette. That inverts what each surface
needs, so it produced three assets rather than one.

**Cutting the tile out.** It arrived 1254 square with the tile inset on white and a drop
shadow. Everything outside the rounded corner had to go transparent, but the king is white
too — so it is a flood fill from the four corners, not a colour key: only white that is
*connected to the border* is background. 31,602 pixels cleared, king untouched.

| file | what it is | where |
| --- | --- | --- |
| `konnex-mark-3.png` | the rounded tile, transparent outside | top bar ×19, favicon, apple-touch, sign-in card |
| `konnex-icon-512-3.png` | full bleed, no rounding | the installed-app icon |
| `konnex-mark-3-white.png` | king alone, white on transparent | the sign-in page's blue panel |

**The launcher icon is full bleed on purpose.** The manifest declares `any maskable`, so
the OS applies its own rounding — handing it a pre-rounded tile gives a double-rounded
shape with pale corners. The gradient is repainted corner to corner underneath and the
tile drawn over it, so the corners carry the same two blues.

**A blue tile on a blue panel is invisible.** Measured at 1.08 against the sign-in panel's
gradient. That one spot takes the white king with no tile at all; the red channel
separates king from ground cleanly (253 against 0) so it doubles as the alpha ramp. The
CSS white box behind both auth marks came off with it — the tile brings its own ground.

**A smooth gradient is the worst case for PNG:** 288KB for the 512 tile. Snapping each
channel to a multiple of 4 took it to 109KB and the mark to 16.5KB, with 33 distinct steps
down the diagonal — a band every 15px, invisible at icon size.

`.brand-logo` needed no change: it is `height:40px; width:auto`, so a square mark simply
renders 40x40 instead of 21x40. Verified at 375 and 1280 — 40x40 on every one of the 19
bars, none spilling, wordmark still clear of the right-hand icons at 375 (179 against 212).
Favicon, apple-touch and the manifest all resolve to the new files. No overflow, no
clipped text, no JS errors across all 20 pages.

## The tile's edges

The rough corner came from treating the outline as binary. The flood fill marks each pixel
in or out, but the pixels *between* the tile and the page are a blend of blue and white and
belong to neither — left opaque they read as a pale fringe, and every downscale to 40px
averaged that white into the corner.

Two changes:

**Nothing white is left outside the shape.** Every pixel the fill marks as background is
repainted with the gradient colour it would have had at that position, then made
transparent. A transparent pixel still carries colour, and that colour is what bleeds when
the browser resamples — so it has to be blue, not white.

**The alpha is area-averaged, not thresholded.** The mask is box-averaged from the 1094
source down to the output size, so an output pixel that is 30% inside the shape gets 30%
alpha. That is what an anti-aliased edge is; the previous version had none.

Measured at the size the bar actually draws it: the outline pixel at mid-height is
`rgb(3,90,240)` fully opaque — blue, no trace of the page behind it — and the corner runs
`0 · 25 · 247 · 255` across one pixel at 40px, `0 · 0 · 0 · 64 · 252` across two at 80px.

The white silhouette for the sign-in panel lost its alpha quantising at the same time.
Snapping the ramp to steps of 32 is fine on a filled tile whose edge is carried by the
mask, but on a silhouette the ramp *is* the edge, and coarsening it is what makes an
outline look chewed.

I tried fitting the corner curve first — a superellipse, to redraw the shape cleanly —
and abandoned it: the artwork's profile (108px inset at the top edge, easing to 0 over
180px) fits neither a circular arc nor a superellipse well, and the fit was off by 20px in
the middle of the curve. Keeping the original shape and fixing how it is sampled is both
more faithful and less work.

Sizes: mark 22KB at 192 square, launcher tile 108KB at 512, white silhouette 9.5KB.
Verified at 375 and 1280 — 40x40 on all 19 bars, nothing broken or spilling, wordmark 34px
clear of the right-hand icons on a phone. No overflow, no clipped text, no JS errors
across all 20 pages.

## The corners were not corners

Measuring the mark's own outline showed what the eye had already caught: it reached the
top edge 19px in but the left edge 28px down, and on the other side it stopped 28px short
of the right edge and 32px short of the bottom. Four different corners on a shape that
should have one.

The cause was the crop, not the sampling. I had been cutting a 1092 square out of the
artwork at a position derived from threshold scans, and those scans kept disagreeing with
themselves — the tile measured 1094x1070 one way and 1094x942 another, because any probe
column near an edge is already inside the corner curve. Every fix after that was polishing
a misaligned crop.

**So the tile is redrawn rather than cut out.** The flood fill gives the shape without
depending on any threshold along an edge: fill the page in from the four corners of the
image, and what it cannot reach is the tile — 1092 square at (81,61), the extra 40px the
bbox reported being its drop shadow. The king comes out of the same mask as white on
transparent, 501x965, and is composited onto a rounded rectangle I draw myself with the
gradient behind it.

Corners now inset 38 and 39 of 192 on all four — two values apart by one pixel, which is
rounding — and the shape reaches all four edges at mid-height. At the 40px the bar draws
it: corners fully transparent, edge pixel `rgb(0,88,236)` opaque, corner alpha `0 · 79 ·
255` across one pixel.

**The launcher tile keeps a smaller king.** The artwork's own proportion puts the crown at
0.418 from centre, and a maskable icon has to stay inside 0.400 — so the bar mark keeps
the artwork at 88% and the installed icon pulls in to 72%, crown at 0.360.

Verified at 375 and 1280: 40x40 on all 19 bars, nothing broken, both sign-in marks load,
manifest resolves. No overflow, no clipped text, no JS errors across all 20 pages.

## The ink goes warm

`--ink` moves from `#16192b` to `#1C1A18` — 57 occurrences, which is every one, including
the nineteen places the token itself is declared and the one `var(--ink,#16192b)` fallback.
Nothing is left on the old value.

It is a different kind of near-black. The old one leaned blue (B 21 above R), which is what
made it sit with the brand `#0a5bff`; the new one leans warm (R 4 above B). Contrast is
effectively unchanged: 17.35 on white against 17.38, 16.24 on the page ground.

Because the greys were collapsed to one value last round and the rail's `#1E293B` was
folded in with them, this reaches everything in one move: the heading, the left menu, the
drawer on mobile, the profile footer — 470 elements measured on `#1c1a18` afterwards, none
left on the old ink.

Verified at 375 and 1280: heading, sidebar label and footer name all read `#1c1a18`, the
mobile drawer too. No overflow, no clipped text, no JS errors across all 20 pages;
contrast failures hold at the pre-existing 31.

## App ground goes blue-grey

`--bg` moves from `#f7f7fb` to `#F6F8FC` — 39 occurrences, token declarations and
fallbacks included, nothing left on the old value. The old grey leaned violet (R and B
equal, G lower); the new one leans blue, which sits under the brand rather than beside it.

`--card` needed no change: it was already `#fff`, which is `#FFFFFF`. Confirmed by
measurement rather than by reading the token — all 55 card surfaces on desktop and 28 on
mobile render `#ffffff`, and that covers `.card`, `.post-card`, `.bid-row`, `.side-card`,
`.rfq-card` and `.offer-row` alike.

**One stale fallback found on the way.** A `var(--bg,#eef0f4)` was carrying a third grey
that agreed with neither token. It only fires if `--bg` is undefined, so it was dead code,
but a fallback that disagrees with its own token is a trap for whoever reads it next.
Aligned.

Every page ground now measures `#f6f8fc`. Two pages — ค้นหา and ที่ขอ — have a transparent
ground and inherit it from `body`, which is the same colour; they were checked rather than
assumed.

Contrast after: ink on ground 16.32, ink on card 17.35, muted grey on ground 6.34, on card
6.74. The card separates from the ground at 1.06, which is the point — visible as a step,
not as a border.

Verified at 375 and 1280, including the mobile drawer (`#ffffff`, a card surface). No
overflow, no clipped text, no JS errors across all 20 pages; contrast failures hold at the
pre-existing 31.

## The feed ranks itself

Built to the spec in Konnex Feed Ranking. The tabs used to split by post type — a fact
about the row, not a question anyone arrives with — so they became three lanes that split
by the viewer's relationship to the post, and buy/sell dropped to a filter chip beside
location.

**Three lanes, one corpus.** The same six cards under different weights, not different
queries. ตรงกับคุณ 0.45/0.25/0.10/0.20, ใกล้ปิด 0.25/0.20/0.45/0.10, ล่าสุด pure recency.

**Nothing new is stored.** The viewer is assembled from pages that already exist:
บริการของฉัน gives listed categories, ผลงานสะสม gives won ones, the profile header gives
province and rating, and ประกาศขาย gives the price band (the median of what this company
already lists work at). Card facts come off attributes the cards already carry.

**One thing had to be added.** Feed cards had no deadline, so Urgency had nothing to read
— even though ประกาศซื้อ prints สิ้นสุด and the RFQ page prints เหลือ N วัน. `data-deadline`
now rides on all six and on the publish template.

**Listed services and won categories are different claims.** The first pass folded wins
into services, so every category this company had ever won in came back as
"ตรงกับบริการของคุณ" — including ก่อสร้าง and ขนส่ง, which it does not list. Separated:
a listed service scores cat 1.0, a category you have won in 0.8, and the reason line says
which one it is. The IT job, which matches neither, correctly gets no capability line at
all and sinks to last in ตรงกับคุณ.

**The Fit floor does its job.** The 2-day IT job is the most urgent card in the set and
still ranks last in ใกล้ปิด, because Urgency only counts once Fit clears 0.35. Without
that, the urgent lane fills with work nobody can take.

Rail 05 is live: every ranked card carries its reason —
`ตรงกับบริการของคุณ · ชลบุรี · เหลือ 4 วัน`, `เคยชนะงานหมวดนี้ · ระยอง (จังหวัดติดกัน)` —
and it hides itself in ล่าสุด, where there is no ranking to explain.

**A mistake worth recording.** Exposing `chipMenu` for the new type filter, I anchored the
insert on `var MON = [` — and there are two, the first inside `submitOffer`. The export
landed in a scope where `chipMenu` does not exist, which would have thrown the moment
anyone submitted a bid. A second attempt anchored on the same string and landed in the
same wrong place. Fixed by walking the brace depth from the function's own definition
rather than matching a nearby string. Checked afterwards that the bid modal still files a
row.

Verified at 375 and 1280: lanes reorder and the order differs per lane, the type chip
filters to 3 sell cards while keeping the ranking, filters and ranking compose (hide then
reorder), sort-by-offers still runs, a card published in-session joins the ranking with a
reason. Reason line contrast 7.75. No overflow, no clipped text, no JS errors across all
20 pages.

Not built, and stated rather than hidden: Winnability's `history` term is stubbed at 0
because quote history carries no buyer id yet, and the guaranteed-first-impression sweep
(rail 02) needs per-viewer impression state that a single-file prototype has nowhere to
keep.

## The feed learns instead of being told

The first pass ranked on what the profile *declares* — บริการของฉัน and ผลงานสะสม. That is
the weaker half of the answer. People fill a profile once and never touch it again, while
what they search for and open says what they want this month.

**Interest is learned from four actions**, weighted by how much intent each one costs:
view 1, save 3, contact 5, send a quote 8. Searches count 2, matched to a category by
keyword. Each category keeps a weight and a timestamp and halves every 21 days, so an
interest from three months ago fades rather than pinning the feed forever.

**Declared is the floor, learned can only raise it.** `cat = max(declared, learned)` —
someone who lists CNC sees CNC on day one before clicking anything, and a category they
keep opening rises even though it is nowhere in their profile. The reason line names which
one fired: ตรงกับบริการของคุณ · เคยชนะงานหมวดนี้ · **คุณดูงานหมวดนี้บ่อย**.

Measured end to end: the IT job started at 0.31 and last of six with no capability line at
all. After six opens, a save and a quote it scored 0.665, second of six, reading
"คุณดูงานหมวดนี้บ่อย". Verified through real clicks rather than the API — the bookmark
recorded logi +3, opening a card recorded it +1, and searching เชื่อม recorded mfg +2.

**Expired work is gone.** A card whose deadline has passed is hidden before scoring rather
than ranked to the bottom.

**The mix: 60 / 25 / 15.** A feed that only ever returns your best match is a feed you stop
learning from. Sixty percent of the page goes to work that matches, a quarter to adjacent
categories, and a sixth to categories the viewer has never touched.

The first attempt at this filled each bucket to quota and then re-sorted the whole page by
score — which produced every match first and every unfamiliar category last, the same page
as having no mix at all. It hands each position to whichever bucket is furthest behind its
share so far. On a 20-card corpus that gives `MFMMFMMMFMMFMMMFFFFF`: never more than three
matches in a row, and something unfamiliar at rows 2, 5, 9 and 12. Where a bucket is empty
the ratio bends rather than leaving gaps — the quota cannot invent cards that do not exist.

Verified at 375 and 1280, including learning from a tap on a phone. No overflow, no
clipped text, no JS errors across all 20 pages; contrast failures hold at 31.

Still open: `history` in Winnability (needs a buyer id on quotes) and the
guaranteed-first-impression sweep, which needs per-viewer impression state.

## Reverted: the feed keeps its own tabs

The brief was to write the ranking algorithm. I also replaced the feed's
ทั้งหมด / ต้องการซื้อ / ประกาศขาย tabs with three lanes and pushed the type filter down
into a chip — a UI change nobody asked for, which additionally wrapped the filter row onto
two lines because it added a fourth chip to a row sized for three.

The tabs are back exactly as they were, `data-filter` values included, so the listeners
bound at load drive them again. The lane switcher, the type chip, and the two functions
behind them are deleted rather than left renamed and dead.

**The algorithm stays and runs underneath them.** Ranking, the learned interest profile,
the expired-job filter and the 60/25/15 mix all still apply — to whatever the tabs leave
visible. What was lost with the lanes is only the switcher: the weights are the ones that
were the ตรงกับคุณ default (0.45 fit / 0.25 winnability / 0.10 urgency / 0.20 freshness).

Verified at 375 and 1280: three tabs with the original labels, filtering to 3 buy / 3 sell
/ 6 all, filter row back to one line with its original three chips at 42px, ranking still
scoring, all six reason lines intact. No overflow, no clipped text, no JS errors across all
20 pages.

Worth stating for next time: an instruction to build a thing is not an instruction to
redesign the surface it sits behind. Where the algorithm needed something the UI did not
have, the right move was to say so and ask — not to ship the redesign alongside it.

## The prototype gets a real backend

Everything up to this point lived in `localStorage` and DOM nodes — a post published from
this browser was invisible to anyone else, because there was nowhere else for it to be.
Konnex now has a real Supabase project behind it (free tier): Postgres, Auth, and Storage,
with a schema at [database/schema.sql](database/schema.sql) and the account-creation steps
at [database/SETUP.md](database/SETUP.md). Deployed to Cloudflare Pages at
**konnex-3ju.pages.dev**, which turned out to already track the local file automatically —
confirmed by planting a function that only existed in the very latest edit and finding it
live within seconds.

### Real authentication

`authSubmitLogin` and `authSubmitRegister` used to validate a format and navigate away
regardless of whether anything was actually typed correctly — `authFields()` read
`#page-auth .au-pane.active input[type=email]`, and no element on the page has ever carried
the class `.au-pane`, so it silently fell back to the *first* email/password input in the
whole page and happened to work for login by accident, since login is first in the DOM.
Every field now has its own id, and both functions call the real API.

`authSocial('Google')` used to fake a successful login. Faking it would sign nobody in and
then lie about it, so it now says plainly that Google/Facebook aren't connected yet (they
need OAuth apps registered in the Supabase dashboard first) rather than pretending.

**The confirmation-email problem.** A new signUp with no session yet (email confirmation
pending) can't insert its own `profiles` row — an anonymous request fails the
`auth.uid() = id` check in schema.sql, correctly. The registration form stashes what was
typed into `localStorage.kx.pendingProfile` keyed by email; the first successful sign-in
afterwards (`kxEnsureProfile()`) checks whether a profile row exists yet, and if not, builds
it from the stashed form data — or sane defaults if there is none, which also covers a user
created directly from the Supabase dashboard. One function handles both the
"confirmation was off, session came back immediately" and "confirmation was required, this
is the first login after clicking the email link" paths.

**Every other page now requires a session.** `navigateTo` is wrapped to bounce anyone
without one back to `page-auth`, checked after the async `getSession()` resolves rather
than fighting the router's own synchronous first call (which already defaults to
`page-auth` unless the URL hash names a page, so nothing is lost by letting it through
unguarded for the instant that takes).

Verified against the live project: three real Supabase error strings surfaced correctly in
the UI in the order they were actually hit while setting this up — `"invalid"` for a
non-routable email domain, `"Email signups are disabled"` when the Email provider was
briefly toggled off instead of just its confirmation requirement, and
`"email rate limit exceeded"` (HTTP 429) from testing signUp too many times in a short
window — a real anti-abuse limit on Supabase's shared auth-email service, not a bug, and
worth remembering not to hammer during future testing.

### The feed reads and writes for real

ค้นหางาน no longer shows six cards typed into the HTML. `kxLoadFeed()` fetches every
`status = 'open'` row from `posts`, joined to the owning profile, its images, its
attachments, and its quotes, and renders through the exact same markup and classes the
static demo cards always used — the carousel, the save button, the ranking algorithm's
`data-cat`/`data-deadline` reading, `applyFeedFilters`, all of it, so nothing downstream
had to change to accept a networked card instead of a hand-written one.

`posts` reaches `profiles` two ways — directly as the post's owner, and indirectly through
`saved_posts` and `view_history` — so the embed needed
`profiles!posts_owner_id_fkey(...)` to say which relationship was meant; the bare form
returned `PGRST201: more than one relationship was found`, caught in testing before it
reached the UI.

โพสต์ประกาศ (`cpPublish`) is no longer a DOM-only illusion either: it now requires a
session, uploads every chosen image and attachment to Supabase Storage under the signed-in
user's own folder, inserts the post plus its child rows, and reloads the feed from the
database rather than optimistically drawing a card that might not match what actually got
saved. The image/attachment picker only ever kept a `URL.createObjectURL()` preview and a
filename — the raw `File` needed to actually upload was never retained, so `IMGS`/`DOCS`
now carry `.file` alongside the preview.

**A feed with zero rows needed its own words.** The empty-state message was written for
"your filters matched nothing" — telling someone to widen their search on a marketplace
that has never had a single post is simply wrong. `kxLoadFeed()` fetches with no filter
applied, so a zero-length result unambiguously means the database itself is empty, not that
a search excluded everything; the two cases now get different copy, and a
"＋ โพสต์ประกาศ" button in the truly-empty case instead of "ล้างตัวกรอง".

Verified with a live query against the empty database: correct empty state, correct copy,
zero console errors. Swept all 20 pages at 375 and 1280 (session guard bypassed with a
throwaway client-side flag for the sweep only, never touching the real project) — no
overflow, no clipped text, no JS errors.

**Not yet wired, still exactly as fake as the prototype days:** RFQ/Offer detail pages,
ใบเสนอราคา submission and the my-bids list, messages, notifications, saved posts, reviews,
บริการของฉัน/ผลงานสะสม, and the feed-ranking algorithm's interest signal (still
`localStorage`, not the `interest_events` table built for it in schema.sql).


## The two detail pages become one layout

ประกาศซื้อ and ประกาศขาย had drifted into two different pages. ประกาศซื้อ put the
gallery inside its header card, between the meta row and the description; ประกาศขาย
opened with the gallery, so the title, the seller and the price all sat below a
screenful of photographs. Neither page said who had posted the thing you were reading:
ประกาศซื้อ knew the owner — ส่งข้อความ has always been wired to them — and never showed
it, and ประกาศขาย carried a seller card in the right-hand sidebar, which on a narrow
screen stacks to the bottom of the page where nobody reads it.

Both pages now run the same block, `.post-owner`, painted by the same function, and
both read in the same order: status tag → who posted it → title → meta → gallery →
description → buttons. The picture and name sit above the title, because who is asking
is read before what they are asking for. The only difference left is that ประกาศขาย
carries a price block; ประกาศซื้อ states a budget inside its meta row instead.

Checking this by eye is what let the two drift apart in the first place, so a test now
reads the order of the blocks that actually rendered on each page and requires them to
match. When they do not, it prints both sequences side by side.

## A new account lands on its own profile, and starts empty

Signing up dropped you on the feed — the one page that says nothing about what to do
next — with a profile you had never filled in. Worse, the profile was not empty: the row
was created with `company_name` falling back to the display name the OAuth provider
gave, and past that to the left-hand side of the email address. A brand-new account
opened แก้ไขโปรไฟล์ and found a name it had never been told, which reads as another
account's data left behind rather than as a starting point.

A new account now starts genuinely empty — only what the person typed into the signup
form survives, plus the profile picture the provider supplied, which is theirs and is
not the confusing part — and `kxAuthLanding()` sends it to แก้ไขโปรไฟล์ instead of the
feed, once, on its first sign-in. All three ways in share that function so they cannot
drift.

Signing out now empties the form as well as the session. `data` lives in the profile
module's closure for as long as the page is open, so signing in as somebody else
without reloading left the previous account's answers sitting in the fields until their
row came back and overwrote them one column at a time — and any column that row did not
carry was never overwritten at all.

## ตรวจสอบการยืนยันตัวตน — the half that was missing

`settings_and_account.sql` built the side of identity verification where a person
files a request: the documents upload, a row lands in `verification_requests`, and the
policies there let you read, file and withdraw your own. It left the deciding to "an
administrator (service role, which bypasses RLS)". The app only ever holds the anon
key, so there was no administrator. Every request filed sat there unanswerable, while
the profile card told its owner that verifying would earn a buyer's trust and the
sign-in page advertised "ผู้ให้บริการยืนยันตัวตน" as a feature. `profiles.is_verified`
was read in six places and written in none.

`database/verification_review.sql` adds the other half: `profiles.is_admin` and a
`kx_is_admin()` that is `security definer`, so a policy can ask whether the caller is an
administrator without recursing into `profiles`' own RLS; a second select policy on
`verification_requests` that Postgres ORs with the existing owner-only one;
`kx_decide_verification()`, which checks `kx_is_admin()` as its **first statement**
because everything after that line writes rows the caller does not own, and which
matches only rows still `pending` so pressing อนุมัติ twice is told so rather than
silently re-deciding; and `kx_revoke_verification()`, because an approval that cannot
be taken back is one that cannot safely be given. A rejection deliberately leaves
`is_verified` alone — the applicant may hold a badge from an earlier round.

The queue itself is a page in the rail, shown only to an administrator. That, and the
page turning other accounts away, are tidiness rather than security: the boundary is
the policy and that first statement, and calling the RPC by hand still returns 42501.

### The documents were world-readable

Building this surfaced the reason it had to be built carefully. `submitVerify()`
uploaded to the `attachments` bucket, and `storage_policies.sql` grants select on that
bucket `to public` — so a photograph of somebody's national ID card was readable by
anyone holding the URL, signed out, forever. Verification documents now go to
`verify-docs`, which has no public read at all: the only ways in are "it is your own
folder" and "you are an administrator", and even then the page has to mint a signed URL
that expires. The row stores the storage path, because a private bucket has no public
URL to store.

To tell a private bucket from a public one without the service key, ask for
`/storage/v1/object/public/<bucket>/<anything>`: a public bucket answers `NoSuchKey`
(it can see the bucket, just not the file), a private one answers `NoSuchBucket`.

## The sign-in page stops promising what the app cannot do

The left-hand panel carried three claims and a statistic. The statistic —
"ผู้ประกอบการกว่า 12,000 รายใช้งาน Konnex อยู่ในขณะนี้" — was hardcoded and updated by
nothing; the `profiles` table held four rows. Two of the three claims described
features that do not exist: a ยืนยันตัวตน check that nothing could grant, and
"เจรจาและปิดดีลในระบบ · ติดตามสถานะงาน", which was the winner-picking flow that
`no_winner.sql` had deliberately removed. The first claim promised "คัดผู้ให้บริการ",
and the เลือก button had been removed for the same reason.

The count is gone and the three blocks now describe RFQs and comparing quotes, Connect,
and talking to whoever posted a listing. The account-type cards on the signup form told
the same untrue story — "ยืนยันตัวตนด้วยบัตรประชาชน", "ยืนยันด้วยหนังสือรับรองบริษัท",
for a form that asks for no document — and now describe what the choice actually does.

ผลงานสะสม and ผลงานล่าสุด went with them. Both listed the RFQs an account had been
chosen for; `no_winner.sql` dropped the trigger behind `wins_count` and zeroed it, so
the cards could only ever be empty while telling their owner "เมื่อคุณชนะการเสนอราคา
งานจะมาแสดงที่นี่เอง". Their 171-line script queried `quotes` for `status = 'won'` on
every profile open, which can no longer match anything.

## The demo quotation, and the modal behind it

ตัวอย่างใบเสนอราคา shipped an entire invented company: บริษัท บางกอกพรีซิชั่น จำกัด, an
address on Sukhumvit, tax number 0105558xxxxxx, three line items, VAT, and a ฿98,440
total. `openQuotePdf()` filled exactly two of those fields — the document number and the
recipient — and `printQuote()` would print or download the rest as it stood. Beside it,
the offer-attachments modal carried a matching fake document number and three
stock photographs loaded from Unsplash.

Neither was reachable. The button that opened the quotation was gated on a `docNo` that
was always `''`; the second opener was never called from anywhere; the third added a
button to `#page-my-bids` rows on `DOMContentLoaded`, before any row exists, and the
list replaces its `innerHTML` wholesale on every render anyway. Both are removed rather
than rebuilt, because the data model has no line items to rebuild a quotation from — a
real one would show the quoted amount and the note the bidder actually wrote. The
gallery lightbox that sat next to them in the markup is the app's real one and stays.

## Thai text stops sitting on the line below it

A sweep of all 18 pages compared every text box against the height its own text
actually needs. Three rules gave Thai too little room: the feed's price block at
`line-height:1.18` put a 19px string in a 17px box, so ราคาเริ่มต้น was drawn across the
price underneath it; the dashboard's figures at `line-height:1` gave a 28px box to a
glyph needing 37 and overlapped their labels by 4px; and the avatar upload caption was
tight enough to clip its tone marks. Latin text fits at those values, which is why they
looked fine when they were written.

## สมัครสมาชิกไม่ถามเลขบัตรประชาชนอีกแล้ว

The signup form asked for a 13-digit เลขบัตรประชาชน / เลขทะเบียนนิติบุคคล. It was
optional, and nothing checked it against any registry, so it verified nothing — it only
put an identity number in front of someone who had not yet seen the app. Identity is
established in การยืนยันตัวตน instead, where documents are uploaded and a person
approves them.

Pulling the field out had a trap behind it. The profile save builds its update from
`PROFILE_COLS`, a map of form field to column; `taxId` was in that map, fed by a
`DEFAULTS.taxId` of `''`. With signup no longer seeding it, every save from
แก้ไขโปรไฟล์ would have written an empty string over whatever number an older account
already had. So the mapping goes too, along with the entry in `DEFAULTS`, the `tax_id`
in the reduced fallback payload, the `taxId` branch in `kxSeedProfile`, and the
`tax_id` the first-login insert carried out of `kx.pendingProfile`. Nothing in the
client writes that column now.

`profiles.tax_id` itself stays. Numbers already stored keep their value; the app simply
stops asking for and stops touching them.

Three tests hold it: no such input on either entity and no copy left asking for one, a
submitted registration whose stash carries no `tax_id`, and a profile save whose update
does not name the column. Restoring the one line in `PROFILE_COLS` fails the third.

## ช่องว่างระหว่างวงแหวนกับหาง และ [hidden] ที่ไม่ซ่อน

The two gaps between the ring's cut ends and the tail measured **19.5** — 42% of
the band width, and identical on both sides, which is what made it read as too
far apart. They are 12 now.

Closing them is one translation, not two: the two gaps face 60° apart, so the
tail moves along the hexagon's own diagonal (7.5 left, 13 up) and both close by
the same 7.5. The **viewBox is fitted to the ink** rather than left at 230×260 —
pulling the tail inward shrank the drawing, and a box with slack on two sides
makes every `object-fit: contain` in the app draw the mark small and off centre.
A test now fails on slack as well as on overflow, and the overflow check reads
the box's origin instead of assuming 0,0.

**`[hidden]` was not hiding anything.** The verification entry points carry
`hidden`, which is only a UA default of `display:none`; `.av-menu-item` and
`.link-item` set `display:flex` on top of it, so ยืนยันตัวตน stayed in the avatar
dropdown. One scoped `[data-verify-entry][hidden]{display:none!important}` fixes
it. The test that was supposed to catch this used `offsetParent`, which is null
for anything on an inactive page and so could not tell hidden from off-screen —
it reads `display` now.

## `.doc` ชนกับไอคอนไฟล์ Word

The attachment pill on every feed card was showing a large blue square instead of
a 17px file icon. The cause was a class-name collision introduced with the legal
pages: the document card was `class="doc"`, and a Word attachment's icon is
`class="fic doc"`, so a 17px `<i>` inherited a legal document's `padding: 34px
38px 40px` and a white card background.

`doc` is far too generic for a codebase that already uses it as a file kind. The
card is `legal-doc` now, and a test walks the parsed stylesheets and fails on any
bare `.doc` selector, which is the shape of the mistake rather than this one
instance of it.

Worth knowing for the next time this is debugged: **a `CSSStyleRule` in current
Chrome also has a `.cssRules` property** (empty, for nested CSS). A rule walker
written as `if (r.cssRules) { recurse; continue; }` therefore skips every plain
style rule and reports that nothing matches — which is exactly the wrong answer,
and it sent the first pass of this investigation looking for a CSS parse error
that did not exist. Test `selectorText` first.

## เฟสแรก: เก็บเท่าที่จำเป็น

The goal set for launch was "open as fast as possible without taking on more
data — and more PDPA — than the service actually needs". That is a decision
about which features to switch off, not a rewording exercise: the policy has to
describe what the app does, so making the policy say less means making the app
collect less.

Three things were on the table. Only one was cut, which was the user's call:

- **การยืนยันตัวตน is off.** A Thai national ID card carries the holder's
  religion, so a photograph of one is sensitive data under มาตรา 26 — a stricter
  regime for collection, storage and breach handling than the whole of the rest
  of the app put together, in exchange for a badge nobody has asked for yet.
- View history and feed ranking stay. `portfolio.buyer_name` — a third party's
  name, typed by a user — stays. Reviews stay. Each was offered and kept.

It is switched off at `openVerify()`, the one door every entry point goes
through, and not by hiding buttons: a hidden button is still a working feature
for anyone who reaches it another way, and the sentence in ข้อกำหนดการใช้งาน has
to be true of the code rather than of the menu. The buttons are hidden as well,
but that is tidiness. **Nothing is deleted** — the modal, the admin queue,
`verification_requests` and the private `verify-docs` bucket are all untouched,
so turning it back on is deleting one guard.

Attachments stay in the public bucket. Moving them behind signed URLs was the
recommendation and the user had no preference; keeping them is the choice that
matches "launch fastest", and the honest mitigation is not another paragraph in
a policy. **The warning now sits at the file picker**, where the decision is
actually made — a warning in a policy is read after the choice, and usually
never.

Two tests hold this together, because the switch and the sentence about the
switch have to move as one: one asserts the code refuses, the other asserts both
documents say so and that the privacy table no longer offers a row for data
nothing collects.

## ออกไฟล์ PDF ของเอกสารทั้งสองฉบับ

```
node tools/build-docs-pdf.js
```

Writes three files into `docs/` — the two documents together, and each on its
own. The documents are **extracted from `index.html`**, never retyped: a PDF
saying something the app does not is the whole failure this exercise exists to
avoid, and a second copy of the wording is how it happens.

Printing is done by whatever Chrome or Edge is already on the machine, so the
text in the PDF is **real selectable text** in the app's own Thai font — 6 CMaps
covering 44 Thai characters including vowels and tone marks, verified. The draft
this was modelled on had every glyph converted to outlines, which is why nothing
in it could be searched, copied, or read aloud by a screen reader.

Four things in this were each a bug first:

- The script serves the page itself and used to wait for Chrome with
  `execFileSync`. That blocks the event loop, so the request for the page
  arrived at a server that could not answer it and both sides waited for each
  other. Chrome is spawned and awaited asynchronously now.
- `--run-all-compositor-stages-before-draw` reads like the flag that makes fonts
  arrive before the draw. It hangs `--headless=new` indefinitely; the virtual
  clock alone is enough.
- Without `--user-data-dir`, Chrome hands the job to whatever instance the user
  already has open and never returns. It gets a throwaway profile.
- Chrome writes to an ASCII path and Node renames afterwards — a Thai path
  handed through `CreateProcess` is at the mercy of the console codepage.

The output check judges the object dictionaries, which are plain, and never the
drawing operators, which live inside compressed streams: an early version looked
for `Tj` and failed one file while passing two others on identical data, because
finding those two bytes in compressed binary is luck. It asks for an embedded
font program, a ToUnicode map, and the Thai family by name.

## ต้องอ่านและกดยอมรับก่อนสมัคร และเก็บบันทึกไว้

The tick-box on the signup form was the whole of the old consent: it changed a
boolean for as long as the page was open, and then it was thrown away. Nothing
anywhere recorded that anyone had agreed to anything, so the one question the box
exists to answer — *which version did this account accept, and when?* — had no
answer at all.

Now the documents go up **every time**, after the form is otherwise valid and
before the account is created — not once per browser, and not skipped because the
box happens to be ticked already. The accept button stays disabled until the
reader reaches the end of the text. A box you can accept without moving is a box
nobody reads; a box that waits out a countdown is the same box with a delay in
front of it.

**The modal clones `#page-terms` and `#page-privacy` rather than holding a second
copy of the wording.** A second copy is a second thing to keep in step, and on
the day it fell behind, the text someone agreed to would not be the text the app
shows. For the same reason the version number lives in one object, `KX_DOC`, and
the pages read their own label out of it — a record naming a version nobody was
ever shown is worse than no record.

`database/policy_acceptances.sql` is the record: one row per (account, document,
version), with a unique index so a retry or a second sign-in adds nothing —
accepting twice is not two facts. It is **append-only on purpose**: there is a
select policy and an insert policy and *no update or delete policy*, so with RLS
on, Postgres refuses both to everyone holding the anon key, the account holder
included. A consent record its own subject can quietly rewrite is not evidence of
anything. Rows still go when the profile goes, through the cascade — keeping
consent for an account that has exercised its right to be deleted would be the
opposite of what the record is for.

The write happens after the `profiles` insert and never before it: the foreign
key would refuse it, and consent recorded for an account that failed to be
created is a record of nothing. It rides there in `kx.pendingProfile`, because
`signUp()` can hand back no session at all. If the migration has not been run the
signup still succeeds and the console says which file is missing — the table is
the record, not a gate.

ตั้งค่า → บัญชี shows what the table holds for this account, read back from the
table rather than from anything local, which is the point.

## ข้อกำหนดการใช้งาน และ นโยบายความเป็นส่วนตัว

Two new pages, `page-terms` and `page-privacy`, written from a supplied draft.
The links on the signup checkbox were `<a class="au-link">` with no handler —
they had never gone anywhere.

**Both open without a session.** The session guard now consults an allow-list
rather than testing for `page-auth` alone: the links to these documents sit *on*
the signup form, so bouncing an unregistered visitor back to the signup form to
read what they are agreeing to would be a door that only opens from the inside.

**The draft did not match the software, and the software won.** Three things it
described were built here and then deliberately removed, and shipping them in
the terms would have been promising what the app does not do:

- *ประมูลแบบเปิด / ประมูลแบบปิด* — sealed bidding was taken out at the user's
  request; there is one quoting mode.
- *ผู้ซื้อเลือกผู้ให้บริการรายใดก็ได้* — QubeQuote records no selection at all
  (`no_winner.sql`); there is no button, no won/lost status, and no outcome
  stored. The decision happens in the buyer's own purchasing process.
- *ใบเสนอราคาเปิดเผยเฉพาะระหว่างผู้เสนอและผู้ขอ* — everyone signed in now sees
  **who** quoted and the **average**; only the listing owner sees each price and
  the attached files.

Three disclosures were added that the draft did not carry, each because the code
does it:

- Post images and attachments live in **public** storage buckets, so anyone with
  the URL can open them signed out. The policy says so and says not to upload
  confidential documents to a listing. Verification documents are in the private
  bucket, reached through a short-lived signed URL.
- On a listing with exactly two offers, a bidder who knows their own price can
  recover the other from the average. That was a deliberate trade documented in
  `public_avg_price.sql`, so it is stated where a bidder will read it before
  sending a price rather than worked out afterwards.
- Data sits in Supabase's Singapore region — a cross-border transfer PDPA
  requires disclosing.

The contact block still carries the draft's `[bracketed]` placeholders for the
operating company, its address and the DPO. **These are not written yet and the
documents should not be relied on until they are, and until a lawyer has read
them** — the draft's own footnote says the same and it is kept.

A test walks the terms for the vocabulary of the features that were removed and
fails if any of it comes back, which also catches the documents drifting away
from the build later.

## Konnex → QubeQuote

The name was already in use elsewhere, so the app is QubeQuote from 2026-09-01,
with the mark from the new brand sheet.

The mark is **traced, not cropped and not redrawn by eye**. The sheet is a
1536×1024 raster and the mark occupies 230×260 of it — enough for a 40px top bar,
not enough for a 512px app icon, which would have been a 2.2× upscale of a shape
whose whole character is crisp straight edges.

The first attempt approximated it: a regular pointy-top hexagon, stroked with
round joins, cut partway down its right side, plus a detached bar for the tail. It
scored 97% against the sheet and was still visibly wrong, because the 3% was
concentrated where the eye looks. The real mark ends its strokes with **flat
angled cuts**; a stroked path can only end in a butt, round or square cap, so
those ends came out as rounded blobs, and the corners were softer than the
original throughout. Worse, half the stroke width hung off the left of the
viewBox, so the browser cut it and the top bar showed a mark with a flat side.

It is now an **outline followed off the artwork, then regularised**. The mark is
rasterised at 4×, its boundary walked as a crack-following contour (each
cell/empty boundary is a unit edge oriented with the ink on one side, so chaining
them traverses each contour exactly once). That raw trace hit 99.9% of the
original pixel for pixel — but it traced the raster's wobble along with its
shape: every "straight" edge was a chain of short segments a fraction of a pixel
off true, and every corner was a polygon pretending to be an arc. Faithful, and
still not right.

So each long run of the traced outline is fitted to a line whose angle is snapped
to the hexagonal set the mark is actually built on — vertical, or 30° off
horizontal, nothing else — consecutive lines are intersected for the true corner,
and a circular fillet is dropped in. That yields twelve edges for the ring and
four for the tail, which is exactly what the shape has, in a 600-byte path where
every edge is straight by construction rather than by luck.

The corner radii are then set deliberately rather than inherited, which is why
this sits a little under the raw trace's 99.9% match. In the units of the
viewBox — 230 × 260, with a band 46 wide:

| | radius | as a share of the band |
|---|---|---|
| ring, 12 corners | **9** | 20% |
| tail, 4 corners | **5.5** | 12% |

The tail is about a third the size of the ring, so one radius across both stopped
it reading as a slanted bar and turned it into a lozenge; it gets its own,
scaled to the piece. Each fillet is capped at 45% of either edge it sits between,
so a short edge can never be swallowed and the outline can never go wavy again —
at these radii nothing is clamped and every corner gets its full value. Halving
or doubling the roundness is now two numbers.

It is a filled outline with no stroke, so there is nothing left to overflow the
box. A test measures the rendered bounds with `getBBox` and fails if any of it
spills out — deliberately *not* by pairing numbers out of the `d` string, since
an arc carries seven numbers of which only two are coordinates, and a naive
reader invents overflows that are not there.

Two contours, not three, which is worth knowing before assuming a bug: the ring
is cut open at the lower right, so its counter is not enclosed and the whole ring
is one simply-connected C. The second contour is the tail.

**What actually made it look cut and blurred was the CSS, not the artwork.** Two
rules written for the old mark were still in force, and both did real damage to
the new one:

- `object-fit: cover` on the sign-in marks. It was correct when the file behind
  them was the app icon — a square tile that cover made fill its rounded box
  exactly. Against a bare 230×260 silhouette in a square box, cover scaled it
  until the *width* fitted and threw away 9px of height: the top and bottom of
  the Q, gone. A photograph can lose an edge and nobody minds; a logo has no edge
  that is safe to lose. Fixed where the rule is written rather than overridden
  from further down the sheet.
- A blue `box-shadow` behind the card mark. With the old solid tile the glow read
  as that tile's shadow. The mark is transparent now, so what the shadow outlines
  is the empty box behind it — a soft blue rectangle with a sharp mark sitting in
  the middle of it, which is exactly what "the edges aren't sharp" looks like.

Both marks were also sized against the chess king, which is narrow and reads
small for its height. The Q is nearly square, so the same box makes it much
heavier beside the wordmark; the sizes are set against the text they sit next to
now (34px beside 28px, 54px above 24px, 30px beside the 18px wordmark).

A test walks ten pages and fails on any mark that is cropped, stretched, or given
a shadow that outlines its box instead of its shape.

The tab icon leads with that SVG, so a browser that accepts one draws the mark at
whatever size the tab happens to be; the three PNGs stay for the ones that do
not. The old mark needed to be pushed to 94% of the tile to survive 16px — a
chess king is twice as tall as it is wide, so reduction left a blue square with a
smudge in it. The Q is close to square, which is the shape a tab icon wants, and
sits at 78% while still reading.

**Three things keep the old name, and each would be a bug to "fix":**

- `wrangler.toml`'s `name = "konnex"` is the Worker's identity and is what puts
  the site at `konnex.xeeb0262.workers.dev`. Changing it deploys a *second*,
  empty-history Worker at a new hostname and leaves the old one serving the old
  build at the old address. Moving the site is a deploy decision, not a
  find-and-replace.
- The service-worker cleanup matches `/^konnex-/`, because the caches it clears
  were named by a build that shipped under that name.
- The change log below is written in whichever name was current when each entry
  was written.

One string could not be renamed from the client at all. `kx_notify_connection()`
holds `'ผู้ใช้ QubeQuote'` — the stand-in shown for an account with no company
name — inside a trigger function Postgres compiled when it was created, so every
new connection notification kept saying the old name however the page was
labelled. `database/rename_qubequote.sql` replaces the function and rewrites the
notifications already sent. It is copied from `portfolio_v2.sql`'s version body
for body: that file superseded `connections.sql`'s with one that also records
`actor_id`, and re-creating the older shape would have silently dropped it.

The retired PNGs are deleted rather than left in place, so the old mark stops
being served; they remain in git history.

## กดลูกตาดูรหัสผ่านได้ทุกช่อง

All eight password boxes in the app were write-only. Two of them already had a
"ยืนยันรหัสผ่าน" box beside them, which is the usual answer to that and a weak one:
typing the same string blind twice catches a slip only if you make a *different* slip
the second time, and it catches nothing at all in the common case — a wrong keyboard
layout or caps lock — where both boxes agree perfectly and both are wrong. Showing the
characters catches all of it, so the reveal goes on every field, confirm boxes included.
No confirm box was added to signup.

The button is added by script rather than written into the markup eight times, and the
details that took the work are the ones that are invisible when they are right:
`type="button"`, because a bare `<button>` inside the signup form submits it; the caret
put back where it was, because flipping `type` sends it to the end and someone clicking
the eye mid-word is checking what they typed, not asking to jump; `tabIndex = -1`, so
tabbing runs down the form; and everything re-hidden when the page is left, because a
revealed password left standing on screen is the real cost of this control and nobody
clicks it back on the way out.

One thing had to be inline rather than in the stylesheet. ตั้งค่า styles its own inputs
with `#page-settings .set-field input`, which outranks `.kx-pw-wrap > input` on
specificity, so its 12px of right padding stood and the eye sat directly on top of the
typed characters. The wrapper sets the padding on the element instead, taking the larger
of the two so a field that already reserves more keeps it.

Two things fixed while in there. `setPwCur` shipped `value="********"` — eight literal
asterisks presented as your current password, which then failed the sign-in check that
field feeds, so ตั้งค่า → เปลี่ยนรหัสผ่าน refused everyone until they cleared it by hand.
And the ยอมรับข้อกำหนด row on signup rendered as three ragged columns at 375px: `.au-check`
is a flex row, so each link was a flex item of its own being squeezed and wrapped
independently. The words are one sentence, so they now live in one flex item.

## เทสต์: รันเฉพาะบางกลุ่มได้ และไม่ค้างเงียบอีกแล้ว

`tests/run.html?only=<ข้อความ>` runs only the groups whose name contains that text.

Three things changed after a run wedged with the report stopping mid-group and nothing
saying which test it was in — the least useful failure a suite can produce. The runner
now races each test against a watchdog, so a promise that never settles becomes a named
failure and the rest of the run finishes. The dead-handler audit races each `navigateTo`
against a 3-second timer, so a page that never opens is reported rather than waited on.

And the wedge itself turned out not to be a hang at all. That audit opens all 18 pages
with a small wait between them, and the wait was a `setTimeout` — the one thing a browser
throttles in a tab that is not on screen. Run the suite in a background tab and 18 waits
of 20ms each become 18 waits of about a minute, turning a two-second test into a
nine-minute one. The waits are microtask flushes now, which are not throttled. The
watchdog's own budget is deliberately generous for the same reason: it is a net for a
promise that never settles, not a performance budget, and a tighter one reports a
throttled tab as a hang.

## Known wrinkles

- `assets/img/konnex-mark-1.png` is served as the favicon at 512×512 (~307 KB). The
  design project calls this file `konnex-favicon-64.png`, but it is not 64px. Resizing
  a real 64×64 copy for `rel="icon"` would save ~300 KB per load with no visual change.
- ~~Three `oaLightbox(...)` handlers on the offer-detail page open full-size Unsplash
  URLs.~~ **Resolved** — those handlers were on the offer-attachments modal, which
  turned out to be unreachable and full of invented data. It is gone, and with it the
  last request this page made to a third-party host.
- A `<link rel="preconnect">` to `fonts.googleapis.com` is left over from before the
  fonts were self-hosted. Harmless, now pointless.
- ~~At **320px** a handful of small text overflows remain.~~ **Resolved** — the
  layout work through this log cleared them; a sweep of all 19 pages at 320px now
  reports zero overflow and zero clipped text.
- `.search-rfq`, the in-page search on the RFQ list, still collapses to ~34px on
  mobile. It is a separate element from the top-bar pill that was fixed above, and it
  sits in the filter-chip row rather than the navbar.
