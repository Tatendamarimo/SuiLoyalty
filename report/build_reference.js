/**
 * Build a pandoc reference-doc template for the SuiLoyalty final-year report.
 *
 * Run with:
 *   cd report && node build_reference.js
 *
 * Produces reference.docx — a styled empty document whose styles pandoc
 * will copy when it converts the markdown chapters into the final report.
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Footer,
  AlignmentType, PageNumber, HeadingLevel, LevelFormat,
} = require('docx');

const doc = new Document({
  creator: 'Tatenda Marimo',
  title: 'SuiLoyalty Final Project Report',
  description: 'BSc (Hons) Computer Science Final Year Project — DMU CTEC3451D',

  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 24 }, // 12pt body
        paragraph: { spacing: { line: 360, before: 0, after: 120 } }, // 1.5 line spacing
      },
    },
    paragraphStyles: [
      // Title — used once on the cover page
      {
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 56, bold: true, font: 'Calibri' }, // 28pt
        paragraph: {
          spacing: { before: 0, after: 240 },
          alignment: AlignmentType.CENTER,
        },
      },
      // Heading 1 — chapter titles
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 36, bold: true, font: 'Calibri' }, // 18pt
        paragraph: {
          spacing: { before: 480, after: 240, line: 360 },
          outlineLevel: 0,
        },
      },
      // Heading 2 — section titles
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, font: 'Calibri' }, // 14pt
        paragraph: {
          spacing: { before: 360, after: 180, line: 360 },
          outlineLevel: 1,
        },
      },
      // Heading 3 — subsection titles
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true, italics: true, font: 'Calibri' }, // 12pt italic bold
        paragraph: {
          spacing: { before: 240, after: 120, line: 360 },
          outlineLevel: 2,
        },
      },
      // Code block — used by pandoc for ```fenced``` blocks
      {
        id: 'SourceCode',
        name: 'Source Code',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font: 'Consolas', size: 20 }, // 10pt monospace
        paragraph: { spacing: { line: 280, before: 60, after: 60 } },
      },
      // Block quote
      {
        id: 'BlockText',
        name: 'Block Text',
        basedOn: 'Normal',
        next: 'Normal',
        paragraph: {
          indent: { left: 720, right: 720 },
          spacing: { line: 320 },
        },
        run: { italics: true },
      },
    ],
  },

  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'numbers',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },

  sections: [{
    properties: {
      page: {
        // A4: 11906 x 16838 DXA (210mm x 297mm). UK academic standard.
        size: { width: 11906, height: 16838 },
        // 2.5cm margins all round = 1417 DXA. Standard UK academic.
        margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ children: [PageNumber.CURRENT], size: 20 }),
          ],
        })],
      }),
    },
    children: [
      // The reference doc only needs styles to be defined; the body is replaced
      // by pandoc when it converts markdown. A single placeholder paragraph
      // with each style ensures pandoc keeps them all in the output.
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Reference Doc')] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Chapter Heading')] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Section Heading')] }),
      new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun('Subsection Heading')] }),
      new Paragraph({ children: [new TextRun('Body text in Calibri 12pt with 1.5 line spacing.')] }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('reference.docx', buffer);
  console.log('Wrote reference.docx');
});
