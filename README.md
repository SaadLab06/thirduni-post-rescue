# Thirduni Post Rescue

Opening a community post on Thirduni often shows **Page not found**, even though the
post is right there. Reload enough times and it eventually loads. This extension
stops the reload lottery.

When the 404 appears, it fetches the post from Thirduni's own API and draws the page:
the post, its replies, and the Cohort pulse / Trending topics / Top contributors
sidebar. You can like and reply from it too.

If a post loads normally, the extension does nothing at all.

## Install on Chrome, Edge, Brave, Opera

1. Download this repo: green **Code** button at the top of this page, then **Download ZIP**.
2. Unzip it somewhere you will not delete by accident.
3. Open a new tab and go to `chrome://extensions`
4. Turn on **Developer mode** with the switch in the top right.
5. Click **Load unpacked** and pick the unzipped folder.
6. Done. Open any Thirduni post.

It stays installed after you close the browser.

## Install on Firefox, Zen, LibreWolf

1. Download and unzip, same as steps 1 and 2 above.
2. Open a new tab and go to `about:debugging`
3. Click **This Firefox** in the left sidebar (it may say **This Zen**).
4. Click **Load Temporary Add-on...**
5. Pick the **`manifest.json`** file inside the unzipped folder.
6. Done. Open any Thirduni post.

Firefox drops temporary add-ons when you close the browser, so you have to repeat
steps 2 to 5 each time you restart. That is a Firefox rule for unsigned add-ons,
not a bug here. Chrome does not have that limitation.

## Install on Safari, iPhone and iPad

Safari will not load a folder the way Chrome does; the extension has to be wrapped in
an app built with Xcode. Everything needed for that is in [`safari/`](safari/), and it
runs the same `fix.js` as every other browser:

```bash
./safari/build.sh
```

Then open the generated project in Xcode, run it on your iPhone, and turn the extension
on in Settings → Safari → Extensions. Full steps, including the Mac build, are in
[safari/README.md](safari/README.md); what the port changed is in
[SPEC_SAFARI_IOS.md](SPEC_SAFARI_IOS.md).

## What it can access

Only `thirduni.com`. It reads the page to notice the 404 and calls the same API
your browser already calls when you are logged in. No servers, no tracking, no data
leaves your machine.

## Why the bug happens

Their post page and their community feed load at the same time. When the feed
finishes first, the post view gets replaced by the not-found screen, even though
the post request came back `200 OK` with the full post in it. It is a race, which
is why reloading sometimes works and sometimes does not.

This extension does not fix the race. It works around it by asking the API directly,
which answers correctly every time. The real fix belongs to the Thirduni team.

## If something looks wrong

The post, replies, and Top contributors come from confirmed endpoints. The Trending
topics panel and the "learners active this week" count are inferred, so those are
the most likely to be off. Open an issue with a screenshot.

## Licence

MIT. Do whatever you like with it.
