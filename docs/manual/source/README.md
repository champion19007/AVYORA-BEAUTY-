# Manual source

The Avyora Technical and Operations Manual (`../Avyora-Technical-Manual.docx`) is built from these files.

- `chapters/*.md`: the written chapters, in order.
- `extract.mjs`: reads the code (schema, routes, settings, migrations, tests) into `facts.json`, so the appendices always match what is built.
- `appendix.js`: turns `facts.json` into Appendices A to E.
- `build.js`: assembles the Word document.

To rebuild after the code changes (from this folder):

    npm install --no-save docx@9.5.1
    node extract.mjs
    node build.js ../Avyora-Technical-Manual.docx

Then open the file in Word, right-click the contents list and choose Update Field. `extract.mjs` finds the project three folders up, so keep this folder at `docs/manual/source`.

To add a chapter, add a Markdown file in `chapters/` (files are read in name order). A heading written `# Title {#label}` is numbered automatically, and the label written inside double square brackets anywhere in the text becomes that chapter's number.
