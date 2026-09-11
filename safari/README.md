# Safari on iPhone, iPad and Mac

Safari does not load unpacked extensions the way Chrome does. It wants the extension
inside an app, and on iOS that app has to come from Xcode. So this folder holds the
few Safari-specific pieces, and Apple's own converter turns them plus the `fix.js`
from the repo root into an Xcode project.

Nothing here forks the extension. `fix.js` is copied out of the repo root at build
time, so Chrome, Firefox and Safari all run the same file.

```
safari/
├── build.sh                 stages the extension, runs Apple's converter
├── resources/
│   ├── manifest.json        Safari manifest (no Firefox-only keys)
│   ├── images/icon-*.png    extension icons
│   └── app-icon-1024.png    app icon, if you want to replace the generated one
└── Thirduni Post Rescue/    the Xcode project, once you have built it
```

## Build it

You need Xcode, not just the Command Line Tools. Install it from the App Store, then:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Then, from the repo root:

```bash
./safari/build.sh
```

That writes `safari/Thirduni Post Rescue/Thirduni Post Rescue.xcodeproj` with two
targets per platform: the container app and the Safari Web Extension.

Options:

- `./safari/build.sh --ios-only` — iPhone and iPad only.
- `BUNDLE_ID=com.you.postrescue ./safari/build.sh` — use your own identifier. Do this
  if you are installing on a real device; `com.example.*` will not sign.

Converter flags move between Xcode releases. If one is rejected, `xcrun
safari-web-extension-converter --help` lists what your version accepts, and the script
prints the exact command it ran so you can adjust it.

## Run it on an iPhone

1. Open the generated project in Xcode.
2. Select the iOS app target, then Signing & Capabilities, and pick your Apple ID team.
3. Pick your iPhone as the run destination and press Run. The app installs; it is only
   a container, so there is nothing to do inside it.
4. On the iPhone: Settings → Safari → Extensions → Thirduni Post Rescue → turn it on.
5. Still there, set thirduni.com to **Allow**. Without that the content script never runs.
6. Open a Thirduni community post.

On a free Apple ID the app expires after seven days and has to be run from Xcode again.
A paid developer account lasts a year.

## Run it on a Mac

Same project. Select the macOS app target, Run, then Safari → Settings → Extensions and
tick it. Safari also needs Develop → Allow Unsigned Extensions if the build is not signed
with a Developer ID.

## What it can reach

`https://thirduni.com/course/*`, and nothing else. There are no `permissions` and no
`host_permissions` in the manifest beyond that one content-script match, so Safari only
ever asks the user about thirduni.com.
