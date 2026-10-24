// Builds the Avyora technical manual (.docx) from chapters/*.md and facts.json.
// Markdown subset: # ## ### headings, paragraphs, - bullets, 1. numbers,
// | tables |, ``` code ```, > Note: callouts, **bold**, `code`, ::pagebreak, ::part Title.
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, TableOfContents, Header, Footer,
  PageNumber, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
} = require('docx');

const INK = '1F2A2E';
const ACCENT = '2F6F68'; // deep teal: Avyora's skincare palette
const MUTED = '5E6B6F';
const RULE = 'D5DEDC';
const TINT = 'EEF4F3';
const CODEBG = 'F3F5F5';
const FONT = 'Calibri';
const MONO = 'Consolas';

// A4 with 2.2 cm margins.
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1247;
const CONTENT_W = PAGE_W - 2 * MARGIN;

function runs(text, base = {}) {
  // **bold**, `code`
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: (base.size || 21) - 2, color: '3C4A4E', ...base, font: MONO }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function table(rows) {
  const cols = rows[0].length;
  // Width by content: longest cell per column, clamped.
  const len = Array.from({ length: cols }, (_, c) =>
    Math.min(60, Math.max(6, ...rows.map((r) => (r[c] || '').length)))
  );
  const total = len.reduce((a, b) => a + b, 0);
  const widths = len.map((l) => Math.floor((l / total) * CONTENT_W));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) =>
      new TableRow({
        tableHeader: i === 0,
        cantSplit: true,
        children: widths.map((w, c) =>
          new TableCell({
            width: { size: w, type: WidthType.DXA },
            borders: cellBorders,
            shading: i === 0 ? { fill: ACCENT, type: ShadingType.CLEAR, color: 'auto' } : i % 2 === 0 ? { fill: 'F7FAF9', type: ShadingType.CLEAR, color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0, line: 260 },
                children: runs(r[c] || '', i === 0 ? { bold: true, color: 'FFFFFF', size: 18 } : { size: 18 }),
              }),
            ],
          })
        ),
      })
    ),
  });
}

function callout(text) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT } },
            shading: { fill: TINT, type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            children: text.split('\n').map((t) => new Paragraph({ spacing: { after: 60 }, children: runs(t, { size: 20 }) })),
          }),
        ],
      }),
    ],
  });
}

function codeBlock(lines) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: CODEBG, type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: lines.map((l) => new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [new TextRun({ text: l || ' ', font: MONO, size: 17, color: '23312F' })] })),
          }),
        ],
      }),
    ],
  });
}

function parse(md) {
  const out = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let i = 0, para = [];
  const flush = () => {
    if (para.length) out.push(new Paragraph({ spacing: { after: 140, line: 300 }, children: runs(para.join(' ')) }));
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush();
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++; out.push(codeBlock(code)); out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      continue;
    }
    if (line.startsWith('::pagebreak')) { flush(); out.push(new Paragraph({ children: [new PageBreak()] })); i++; continue; }
    if (line.startsWith('::part ')) {
      flush();
      const title = line.slice(7).trim();
      out.push(new Paragraph({ spacing: { before: 720, after: 80 }, keepNext: true, children: [new TextRun({ text: `PART ${ROMAN[++partSeq]}`, size: 20, color: ACCENT, bold: true, characterSpacing: 60 })] }));
      out.push(new Paragraph({ spacing: { after: 160 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } }, children: [new TextRun({ text: title, size: 48, color: INK, font: 'Georgia' })] }));
      i++;
      const intro = [];
      while (i < lines.length && lines[i].trim() && !/^(#|::)/.test(lines[i])) intro.push(lines[i++]);
      if (intro.length) out.push(new Paragraph({ keepNext: true, spacing: { after: 240, line: 300 }, children: runs(intro.join(' '), { color: MUTED, size: 22, italics: true }) }));
      continue;
    }
    const h = line.match(/^(#{1,3}) (.*)/);
    if (h) {
      flush();
      const level = h[1].length;
      let text = h[2];
      const id = text.match(/\s*\{#([a-z]+)\}\s*$/);
      if (id) text = `${CHAPTERS[id[1]]}. ${text.slice(0, id.index).trim()}`;
      out.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1], children: [new TextRun(text)] }));
      i++; continue;
    }
    if (line.startsWith('> ')) {
      flush();
      const block = [];
      while (i < lines.length && lines[i].startsWith('> ')) block.push(lines[i++].slice(2));
      out.push(callout(block.join('\n'))); out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      continue;
    }
    if (line.startsWith('|')) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push(table(rows)); out.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
      continue;
    }
    const b = line.match(/^(\s*)- (.*)/);
    if (b) { flush(); out.push(new Paragraph({ numbering: { reference: 'bullets', level: b[1].length >= 2 ? 1 : 0 }, spacing: { after: 60, line: 290 }, children: runs(b[2]) })); i++; continue; }
    const n = line.match(/^(\s*)\d+\. (.*)/);
    if (n) { flush(); out.push(new Paragraph({ numbering: { reference: `num-${numberingSeq}`, level: 0 }, spacing: { after: 60, line: 290 }, children: runs(n[2]) })); i++;
      // A list continues past indented sub-bullets; anything else ends it.
      let j = i;
      while (j < lines.length && /^\s{2,}- /.test(lines[j])) j++;
      if (!/^\s*\d+\. /.test(lines[j] || '')) numberingSeq++;
      continue; }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return out;
}
let numberingSeq = 0;
let partSeq = 0;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// ---------- content ----------
const dir = path.join(__dirname, 'chapters');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
// Chapter numbers come from the order of `# Title {#id}` headings; `[[id]]` in the text becomes that number.
const sources = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
const CHAPTERS = {};
let chapterSeq = 0;
for (const src of sources) for (const m of src.matchAll(/^# .*\{#([a-z]+)\}\s*$/gm)) CHAPTERS[m[1]] = ++chapterSeq;
const resolve = (src) =>
  src.replace(/\[\[([a-z]+)\]\]/g, (_, id) => {
    if (!CHAPTERS[id]) throw new Error(`Unknown chapter reference [[${id}]]`);
    return String(CHAPTERS[id]);
  });
let body = [];
for (const src of sources) body = body.concat(parse(resolve(src)));
const appendix = require('./appendix.js')(parse);
body = body.concat(appendix);

const numberingConfigs = [
  {
    reference: 'bullets',
    levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
    ],
  },
  ...Array.from({ length: numberingSeq + 1 }, (_, k) => ({
    reference: `num-${k}`,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 320 } } } }],
  })),
];

const today = '21 October 2026';
const cover = [
  new Paragraph({ spacing: { before: 2600 }, children: [new TextRun({ text: 'AVYORA', size: 30, bold: true, color: ACCENT, characterSpacing: 120 })] }),
  new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun({ text: 'Technical and Operations Manual', size: 72, font: 'Georgia', color: INK })] }),
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } }, spacing: { after: 400 }, children: [new TextRun({ text: 'Architecture, features, security and day-to-day running of the Avyora skincare shop', size: 28, color: MUTED })] }),
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Version 1.0  ·  ${today}`, size: 22, color: MUTED })] }),
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'Covers the code on branch fix/payment-backout, built from main at ba7e5a3', size: 22, color: MUTED })] }),
  new Paragraph({ spacing: { before: 3200 }, children: [new TextRun({ text: 'For the owner, the staff who run the shop, and any developer who works on it next.', size: 22, italics: true, color: MUTED })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } }, children: [new TextRun({ text: 'Contents', font: 'Georgia', size: 40, color: INK })] }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: 'If the contents list is empty, right-click it in Word and choose Update Field.', size: 18, italics: true, color: MUTED })] }),
];

const doc = new Document({
  creator: 'Avyora',
  title: 'Avyora Technical and Operations Manual',
  description: 'Architecture, features, security and operations of the Avyora shop',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: INK } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: 'Georgia', size: 56, color: INK } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 36, color: INK }, paragraph: { spacing: { before: 520, after: 200 }, outlineLevel: 0, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: ACCENT }, paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true, color: INK }, paragraph: { spacing: { before: 220, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: { config: numberingConfigs },
  sections: [
    {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }, titlePage: true },
      headers: {
        default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } }, children: [new TextRun({ text: 'Avyora · Technical and Operations Manual', size: 16, color: MUTED }), new TextRun({ children: [new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.NONE }), today], size: 16, color: MUTED })] })] }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: MUTED })] })] }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: [...cover, ...body],
    },
  ],
});

const out = process.argv[2] || path.join(__dirname, 'Avyora-Technical-Manual.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  const words = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join(' ').split(/\s+/).length;
  console.log('wrote', out, (buf.length / 1024).toFixed(0) + ' KB', 'chapter words ~' + words);
});
