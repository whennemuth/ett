import { writeFile } from "fs/promises";
import { PDFDocument, PDFName, PDFObject, PDFPageDrawTextOptions, PDFRef, PDFString, rgb, StandardFonts } from "pdf-lib";
import { EmbeddedFonts } from "./EmbeddedFonts";
import { Page } from "./Page";
import { TextLine } from "./TextLine";
import { Margins } from "./Utils";
import { log } from "console";

export type LinkOptions = {
  uri: string;
  text?: string;
  textOptions: PDFPageDrawTextOptions;
  border?: boolean;
  borderPadding?: number; // Padding around the text for the border
  customDrawText?:() => Promise<void>
};

/**
 * Represents a link annotation in a PDF document.
 * This class allows you to create a clickable link that can open a URI when clicked.
 */
export class Link {

  private doc:PDFDocument;
  private page:Page;

  constructor(doc:PDFDocument, page:Page) {
    this.doc = doc;
    this.page = page;
  }

  public async draw(options:LinkOptions): Promise<void> {
    // Unpack options
    const { uri, text=options.uri, textOptions, border=false, borderPadding=2, customDrawText } = options;
    const { page, page: { basePage }, doc } = this;
    let { x=basePage.getX(), y=basePage.getY() } = textOptions;

    // Draw the text of the link
    if(customDrawText) {
      await customDrawText();
    } 
    else {
      basePage.drawText(text, textOptions);
    }

    // Calculate the rectangle for the link annotation
    const width = await new TextLine(page, textOptions).getCombinedWidthOfText(text);
    x -= borderPadding;
    y -= borderPadding + 1;
    const X = x + width + (borderPadding * 2);
    const height = textOptions.font?.heightAtSize(textOptions.size ?? 24);
    const Y = y + (height ?? 24) + (borderPadding * 2) - 1;
    const Border = border ? [ 0, 0, 1 ] : [ 0, 0, 0 ]; // Border style: [horizontal, vertical, width]

    // Overlay the link annotation rectangle
    const linkAnnotation = doc.context.register(
      doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: [ x, y, X, Y ], 
        Border,
        C: [ 0, 0, 1 ], // Color: RGB (blue),
        A: {
          S: PDFName.of('URI'),
          URI: PDFString.of(uri),
          Type: PDFName.of('Action'),
        }
      }) as PDFObject
    ) as PDFRef;

    log(`Link annotation created at [${x}, ${y}, ${X}, ${Y}] with URI: ${uri}`);
    page.putLinkAnnotation(linkAnnotation);
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/lib/Link.ts')) {

  (async () => {
    const url = 'https://www.google.com/';
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const basePage = pdfDoc.addPage();
    const pageMargins = { top: 35, bottom: 35, left: 40, right: 40 } as Margins;
    const embeddedFonts = new EmbeddedFonts(pdfDoc);
    const page = new Page(basePage, pageMargins, embeddedFonts);

    basePage.moveTo(50, basePage.getHeight() - 50);
    const link = new Link(pdfDoc, page);
    await link.draw({
      uri: url,
      text: 'Click here to visit google',
      textOptions: {
        size: 20,
        font: helveticaFont,
        color: rgb(0.95, 0.1, 0.1),
      },
      border: true,
      borderPadding: 8,
    });

    basePage.moveDown(30);
    basePage.moveTo(pageMargins.left, basePage.getY()); 
    await page.drawWrappedText({ 
      text: 'Click <a href="https://www.google.com/">here</a> to visit google ' +
        'and this is a link to npmjs: <a>https://www.npmjs.com/</a>, and click the following: ' + 
        '<a href="https://www.npmjs.com/package/pdf-lib">pdf-lib</a>, to visit the pdf-lib package. ' +
        'This is a link to <b>the <a>https://github.com</a> homepage</b>, <2>and click ' +
        '<a href="https://www.google.com/finance/quote/.DJI:INDEXDJX">here</a> to see what the DOW looks like</2>. '
        , 
      options: {
        size: 14,
        font: helveticaFont,
        color: rgb(0.95, 0.1, 0.1),
      }, 
      linePad: 8
    });

    page.setLinkAnnotations();

    const pdfBytes = await pdfDoc.save();
    writeFile('./lib/lambda/_lib/pdf/Link.pdf', pdfBytes);
  })();
}

