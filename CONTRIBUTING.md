# Contributing to 68W Sustainment

Thanks for helping build this resource hub for Combat Medic Specialists.

## Ground rules
- **Never commit copyrighted, FOUO/CUI, or restricted documents.** This repository and its website are public. PDFs and Office files under `docs/` are blocked by `.gitignore` on purpose. Host those files somewhere access-controlled and link to them with `url` in `js/data.js`.
- **No personal information.** Don't commit names, DoD ID numbers, unit rosters or patient information.
- **Clinical content must cite its source** (CPG, ADTMC, textbook chapter and page) and match current, command-approved guidance.

## Run it locally
```
python3 -m http.server 8000
```
Open http://localhost:8000. No build step or installs are needed.

## Common changes
| You want to… | Edit |
|---|---|
| Add or change a document, link or in-app page | `js/data.js` (format is explained at the top) |
| Add a textbook chapter | the `chapter(...)` lines in `js/data.js` |
| Change colors, spacing or the phone layout | `css/styles.css` |
| Swap the card illustrations | `js/art.js`, or set `image:` on a resource in `js/data.js` |
| Change pages, search or saving | `js/app.js` |

After changing any app file, bump `VERSION` in `sw.js` so installed phones pick up the update.

## Submitting changes
1. Create a branch, or fork the repository if you aren't a collaborator.
2. Make your change and check it on both a desktop browser and a phone-sized window.
3. Open a pull request that describes what changed and cites the source for any clinical content.
