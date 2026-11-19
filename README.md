# 68W Sustainment

Medical readiness resource hub for 68W Combat Medic Specialists. It is a static web app (HTML, CSS and JavaScript) with no build step, and it works on desktop and phone.

**Live site:** https://keegantsmith-cs.github.io/68w-sustainment/

Want to help? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Run it locally
```
cd 68w-sustainment
python3 -m http.server 8000
```
Then open http://localhost:8000. You can also upload the folder to any static host, such as GitHub Pages, Netlify or an internal SharePoint/IIS web server.

## Add content
1. Put the file in the matching folder: `docs/fieldcraft`, `docs/ictl`, `docs/adtmc`, `docs/cpg`, `docs/drug-ref`, `docs/field-care` or `docs/guidelines`.
2. Add an entry to that resource's `documents` list in `js/data.js`. The format is described at the top of that file.
3. If the app is already installed on phones, bump `VERSION` in `sw.js`.

PDFs open inside the app. Other file types get Open and Download buttons.

## Replace the artwork
Add `image: "assets/your-photo.jpg"` to a resource in `js/data.js` and the card uses that photo instead of the illustration.

## Files
- `index.html`: page shell (header, menu, bottom nav)
- `css/styles.css`: theme and responsive layout
- `js/data.js`: all resources and documents (the file you edit)
- `js/art.js`: placeholder illustrations
- `js/app.js`: routing, saved items, search, downloads, profile
- `sw.js`, `manifest.webmanifest`: lets the app be installed on a phone home screen and keeps pages it has already opened available offline

## Combat Medic Specialist Fieldcraft textbook
The featured card at the top of the home page is the Fieldcraft textbook. Part 1 (Limited Primary Care) is laid out chapter by chapter from its table of contents. Chapters that don't have a file yet show as "Not yet added." To attach a chapter, put its PDF in `docs/fieldcraft/` and add the path as the last argument to its `chapter(...)` line in `js/data.js`.

The textbook's copyright page says some parts are copyrighted and that the book is intended for Department of Defense use. Host chapter files only where access is restricted to authorized users (for example, behind CAC login or on an internal server).
