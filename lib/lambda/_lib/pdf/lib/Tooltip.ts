import { writeFile } from "fs/promises";
import { PDFDocument, PDFName, PDFObject, PDFPageDrawTextOptions, PDFRef, PDFString, rgb, StandardFonts } from "pdf-lib";
import { log } from "../../../Utils";
import { EmbeddedFonts } from "./EmbeddedFonts";
import { Page } from "./Page";
import { Margins } from "./Utils";

export type TooltipType = 'Comment' | 'Popup';

export type TooltipCoord = { x:number; y:number; }

export type TooltipOptions = {
  coord?: TooltipCoord; // Optional coordinates for the tooltip, if not provided, it will use the current page position
  tooltipLabel: string; // Label for the tooltip, displayed as text on the page
  tooltipText: string; // Text to display in the tooltip (not used in PDF, but for reference)
  textOptions: PDFPageDrawTextOptions; // Options for drawing the tooltip label text, including font, size, color, etc.
  border?: boolean;
  borderPadding?: number; // Padding around the text for the border
  customDrawText?:() => Promise<void>
}; 

export class Tooltip {
  
  private doc:PDFDocument;
  private page:Page;

  constructor(doc:PDFDocument, page:Page) {
    this.doc = doc;
    this.page = page;
  }

  public async draw(options:TooltipOptions, tooltipType:TooltipType='Comment'): Promise<void> {
    // Unpack options
    const { 
      tooltipLabel, tooltipText, textOptions, textOptions: { font, lineHeight, size }, 
      border=false, coord={} as TooltipCoord, customDrawText 
    } = options;
    const fontHeight = lineHeight ?? (font?.heightAtSize(size!) || 12);
    const { page: { basePage }, putCommentAnnotation, putPopupAnnotation } = this;
    const _x = coord.x ?? basePage.getX();
    const _y = coord.y ?? basePage.getY();
    const cubeSize = 15; // Size of the tooltip rectangle

    /**
     * Calculate the rectangle for the tooltip annotation:
     * -----------------------------------------------------
     * x: The lower-left x-coordinate of the rectangle.
     * y: The lower-left y-coordinate of the rectangle.
     * X: The upper-right x-coordinate of the rectangle.
     * Y: The upper-right y-coordinate of the rectangle.
     * [x, y] = lower-left corner
     * [X, Y] = upper-right corner
     */

    // Lower-left coordinates of the rectangle
    const x = _x - cubeSize; 
    const y = _y + fontHeight;

    // Upper-right coordinates of the tooltip rectangle
    const X = _x;
    const Y = y + cubeSize;

    // Draw the text of the tooltip
    if(customDrawText) {
      await customDrawText();
    } 
    else {
      basePage.drawText(tooltipLabel, textOptions);
    }

    // Choose one of the methods to create the tooltip
    switch(tooltipType) {
      case 'Comment':
        putCommentAnnotation([x, y, X, Y], PDFString.of(tooltipText));
        // basePage.drawRectangle( { x, y, width:(X - x), height:(Y - y), borderWidth: 1 });
        log(`Comment annotation created at [${x}, ${y}, ${X}, ${Y}]: "${tooltipLabel}"`);
        break;
      case 'Popup':
        putPopupAnnotation([x, y, X, Y], PDFString.of(tooltipText));
        log(`Popup  annotation created at [${x}, ${y}, ${X}, ${Y}]: "${tooltipLabel}"`);
        break;
    }
  }
  

  private putCommentAnnotation = (Rect:any[], Contents:PDFString):void => {
    const { doc, page } = this;

    // Overlay the tooltip annotation rectangle
    const annotation = doc.context.register(
      doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'),
        Rect, 
        Contents,
        Name: PDFName.of('Comment'), // Icon name for the tooltip
        Open: false // Whether the tooltip is open by default
      }) as PDFObject
    ) as PDFRef;

    page.putLinkAnnotation(annotation);
  }

  private putPopupAnnotation = (Rect:any[], Contents:PDFString):void => {
    const { doc, page } = this;

    const popupAnnotation = doc.context.register(
      doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Popup'),
        Rect, // Position and size of the popup,
        Contents,
        Name: PDFName.of('Comment'), // Icon name for the tooltip
        Open: false // Initially not visible
      }) as PDFObject
    ) as PDFRef;

    const tooltipAnnotation = doc.context.register(
      doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'), // This creates the "sticky note" icon
        Rect, // Same area as your link was
        Contents,
        T: PDFString.of('Tooltip'), // Title
        C: [1, 1, 0], // Yellow color
        Open: false,
        Popup: popupAnnotation,
        Name: PDFName.of('Comment') // Shows a comment icon
      }) as PDFObject
    ) as PDFRef;

    page.putLinkAnnotation(popupAnnotation);

    page.putLinkAnnotation(tooltipAnnotation);
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/lib/Tooltip.ts')) {

  (async () => {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const basePage = pdfDoc.addPage();
    const pageMargins = { top: 35, bottom: 35, left: 40, right: 40 } as Margins;
    const embeddedFonts = new EmbeddedFonts(pdfDoc);
    const page = new Page(basePage, pageMargins, embeddedFonts);

    basePage.moveDown(20);
    basePage.moveTo(pageMargins.left, basePage.getY());

    const link1 = new Tooltip(pdfDoc, page);
    await link1.draw({
      tooltipText: 'This is the first tooltip text.',
      tooltipLabel: 'Tooltip-1',
      textOptions: {
        size: 20,
        font: helveticaFont,
        color: rgb(0.95, 0.1, 0.1),
      },
    });

    basePage.moveDown(50);
    basePage.moveTo(pageMargins.left, basePage.getY()); 

    const link2 = new Tooltip(pdfDoc, page);
    await link2.draw({
      tooltipText: 'This is the second tooltip text. ',
      tooltipLabel: 'Tooltip-2',
      textOptions: {
        size: 20,
        font: helveticaFont,
        color: rgb(0.95, 0.1, 0.1),
      },
    });

    basePage.moveDown(50);
    basePage.moveTo(pageMargins.left, basePage.getY());
    
    page.setTooltips([
      'This is the 3rd tooltip text.',

      'I am another tooltip with a larger font',

      'This is a tooltip with really big text, This is a tooltip with really big text, This is a tooltip ' +
      'with really big text, This is a tooltip with really big text, This is a tooltip with really big ' +
      'text, This is a tooltip with really big text, This is a tooltip with really big text, This is a ' +
      'tooltip with really big text, This is a tooltip with really big text, This is a tooltip with really ' +
      'big text, This is a tooltip with really big text, This is a tooltip with really big text, This is ' +
      'a tooltip with really big text, This is a tooltip with really big text, This is a tooltip with ' +
      'really big text, This is a tooltip with really big text, This is a tooltip with really big text, ' +
      'This is a tooltip with really big text.'
    ]);

    const text = 'Hello, here is a <u><tooltip index="0">tool-tip</tooltip></u> ' +
      'example within a paragraph. Hover over the word "tool-tip" to see more information. And ' +
      'this is a <1><b><u><tooltip index="1">tool-tip</tooltip> in larger font</u></b></1>, and now back to normal. ' +
      'And this is a <u><tooltip index="2">really big tooltip</tooltip></u> example.';

    await page.drawWrappedText({ 
      text,
      options: {
        size: 14,
        font: helveticaFont,
        color: rgb(0.95, 0.1, 0.1),
      }, 
      linePad: 8
    });

    page.setLinkAnnotations();

    const pdfBytes = await pdfDoc.save();
    writeFile('./lib/lambda/_lib/pdf/Tooltip.pdf', pdfBytes);
  })();
}