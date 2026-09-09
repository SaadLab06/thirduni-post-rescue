# Safari iOS port

Goal: run the existing extension in Safari on iPhone and iPad without forking it.
Not a redesign, not a rewrite, and not a second implementation to keep in sync.

## What actually had to change

Safari 15+ supports the same web-extension platform, and this extension is unusually
easy to port because it calls **no extension API at all** — no `chrome.*`, no
`browser.*`, no background script, no storage, no messaging. It is a content script
that talks to `fetch` and the DOM. So there is nothing to polyfill.

What did need work was iOS itself: touch, the keyboard, the toolbars, and the
clipboard. All of it went into the shared `fix.js`, so Chrome and Firefox get the
same fixes.

### Viewport

`#td-rescue` is `position:fixed; inset:0`. On iOS a fixed layer is laid out against
the large viewport, so Safari's bottom toolbar sits on top of the last few rows of
content. Now the overlay is `height:100dvh` with a `100vh` fallback, and the
bottom padding adds `env(safe-area-inset-bottom)`. Left and right padding add the
matching insets so landscape on a notched iPhone does not clip the card.

`overscroll-behavior:contain` stops a scroll that reaches the end of the overlay from
scrolling the Thirduni page underneath it.

### Layout on a phone

The old rule set had `.td-main{min-width:320px}` inside a wrapper with 32px of padding
on each side. On a 375pt iPhone that is 384pt of content in a 375pt window, which is a
horizontally scrolling page. Under `max-width:640px` the wrapper is now a block, both
columns drop their minimum widths, and the sidebar stacks under the post:

```
Post → Actions → Composer → Replies → Cohort pulse → Trending topics → Top contributors
```

Between 641px and 1100px the column minimums are trimmed instead, because an iPad
in landscape is 1024pt wide and the original 620 + 320 + 28 gap did not fit: it stacked
like a phone while having room for both columns. It is now two columns from about
900px. Portrait still stacks. The desktop layout above 1100px is untouched.

### Touch targets and hover

Icon buttons were about 18pt tall. Under `@media (pointer:coarse)` the post actions
are 44pt and reply actions and text buttons 40pt, with negative margins so nothing
visibly shifts. Keyed off the pointer rather than the width, so an iPad in portrait —
which is 768pt wide and would miss a phone breakpoint — gets them too.

`:hover` rules are wrapped in `@media (hover:hover)`. On a touch screen a hover state
sticks after a tap, so a liked-looking button stays dark after you tap something else.

### The keyboard

Both the composer and the inline editor were 14.5px. iOS Safari zooms the whole page in
when you focus a field under 16px, and it does not zoom back out. They are 16px on any
touch pointer. On phones the Reply button goes full width under the field instead of
sitting beside it, which is also what makes it a comfortable tap, and the composer gets
a taller minimum so its placeholder is not clipped at 16px.

### Clipboard

`navigator.clipboard.writeText` is not reliable inside a content script on iOS. Copy
link now tries the async API, falls back to a selection copy with
`document.execCommand`, and either way says what happened on screen. That matters more
than it sounds: the old code reported failures by setting a `title` attribute, and a
phone has no tooltips. Like and delete failures now surface the same way.

### Cookies

`fetch` calls are same-origin relative paths, so they already carried the session. They
now pass `credentials: "same-origin"` explicitly rather than relying on the default,
because that default is the one thing here that has historically differed between
engines.

## Deliberately unchanged

- **The endpoint fallbacks.** Like, reply, edit and delete still walk a list of
  candidate URLs, methods and payload shapes. The real routes were never observed, and
  a miss is a harmless 404. Nothing about Safari makes it safe to guess.
- **`textContent` everywhere.** No user-authored string is ever parsed as markup. URLs
  in a body become real anchors, but they are built as elements, not as HTML.
- **The `history.pushState` / `replaceState` patch.** A content script runs in its own
  world, so patching history there does not intercept the page's own calls — in Safari
  or in Chrome. SPA navigation is caught by the `MutationObserver`, which is what has
  been doing the work all along. The patch is cheap and harmless, so it stays.
- **Silent failure.** A dead endpoint leaves the real Thirduni page alone. A failed
  like restores the previous state. Missing replies or sidebar data still render the post.

## Permissions

The Safari manifest has no `permissions` and no `host_permissions`. The only site it
can touch is the one content-script match, `https://thirduni.com/course/*`. Safari asks
the user about thirduni.com and nothing else.

The Firefox `browser_specific_settings` block is not in the Safari manifest; it is
Firefox-only and Safari would warn about it. That is the only divergence between the
two manifests, and `safari/build.sh` warns if name, version, description or the match
patterns drift apart.

## Packaging

Apple's own converter, driven by `safari/build.sh`:

```bash
xcrun safari-web-extension-converter safari/.build/extension \
  --project-location safari --app-name "Thirduni Post Rescue" --swift --copy-resources
```

The script stages `safari/resources/*` plus the repo-root `fix.js` into
`safari/.build/extension` first, so the JavaScript has exactly one home. Output is an
Xcode project with an app target and a Safari Web Extension target for each platform.

## Testing matrix

Build and install steps are in [safari/README.md](safari/README.md). Xcode is required;
the Command Line Tools alone cannot build or convert.

iPhone, Safari:

- [ ] a post that loads normally is left completely alone
- [ ] a post showing Page not found is rescued
- [ ] arriving from a notification link is rescued
- [ ] like a post, like a reply, post a reply
- [ ] edit and delete your own post and your own reply
- [ ] copy link, with and without clipboard permission
- [ ] Back to feed, and the browser's own back and forward
- [ ] feed → post → another post, with no second overlay and no reload loop
- [ ] no horizontal scrolling, nothing hidden behind the bottom toolbar
- [ ] the keyboard does not zoom the page when the composer is focused

iPad: the same list in portrait and in landscape.

macOS Safari: normal post, 404 post, like, reply, navigation.

The layout half of this was checked before the port went near a device, by serving the
rescued view against a stubbed API at 375, 768, 1024 and 1440pt: no horizontal overflow
at any of them, 44pt actions and 16px fields on touch, the sidebar stacked on phone and
iPad portrait and beside the post in iPad landscape, and desktop byte-identical to
before. Everything above that line — real cookies, the real clipboard, the real
toolbars — still has to be checked on hardware.
