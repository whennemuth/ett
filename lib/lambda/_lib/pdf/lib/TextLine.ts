import { PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, StandardFonts } from "pdf-lib";
import { EmbeddedFonts } from "./EmbeddedFonts";
import { Page } from "./Page";
import { Margins } from "./Utils";

/** Represents, within the line of text, a segment with its own formatting */
export type ParsedItem = { 
  text:string, italics:boolean, bold:boolean, underline:boolean, newfont:PDFFont, width:number, 
  fontSize:number, yOffset:number 
};

/**
 * This class represents a line of text, which can have some rudimentary markup in it as an inline way
 * of reformatting parts of the text. For example, "Text that is <b>bolded</b> and <i>italizized</i>".
 * By reformatting is meant that the baseline formatting is extended with bolding and/or italics.
 */
export class TextLine {
  private page:Page;
  private options:PDFPageDrawTextOptions;
  private combinedWidthOfTextAtSize:number = 0;

  constructor(page:Page, options:PDFPageDrawTextOptions) {
    this.page = page;
    this.options = options;
  }

  /**
   * Draw the line of text with any inline markup properly formatted.
   * @param text
   * 
   */
  public drawFormattedText = async (text:string):Promise<void> => {
    const { page: { basePage }, options, options: { font:originalFont }, parse, getFont } = this;
    const parsed = await parse(text);
    let movedRight:number = 0;
    let { x } = options;

    const moveRight = (width:number) => {
      basePage.moveRight(width);
      movedRight += width;
      if(x) {
        x += width; // Centered or offset text will have x set in options, so advance it.
      }
    }

    const drawUnderline = (width:number, opts:PDFPageDrawTextOptions) => {
      const { x, y, size } = opts;
      const Y = (y ?? basePage.getY()) - (size ? size/4 : 0);
      const xStart = x ?? basePage.getX();
      const xEnd = xStart + (width ?? 0);
      basePage.drawLine({
        start: { x:xStart, y:Y },
        end: { x:xEnd, y:Y },
        thickness:1,
      });  
    }

    const drawText = (item:ParsedItem, opts:PDFPageDrawTextOptions) => {
      const { text, width, underline } = item;
      basePage.drawText(text, opts);
      if(underline) {
        drawUnderline(width, opts)
      }
    }

    let newopts = Object.assign({}, options);
    for(let i=0; i<parsed.length; i++) {
      const item = parsed[i];
      const newfont = await getFont(originalFont!, item);
      
      const addopts = {
        font: newfont,
        size: item.fontSize
      } as PDFPageDrawTextOptions;

      if(x) {
        addopts.x = x;
      }

      newopts = Object.assign(newopts, addopts);

      // "Jog" up or down for subscript or superscript
      if(item.yOffset > 0) {
        basePage.moveUp(item.yOffset)
      }
      if(item.yOffset < 0) {
        basePage.moveDown(item.yOffset);
      }

      drawText(item, newopts);

      // "Unjog" up or down for subscript or superscript
      if(item.yOffset > 0) {
        basePage.moveDown(item.yOffset)
      }
      if(item.yOffset < 0) {
        basePage.moveUp(item.yOffset);
      }

      if(i+1 < parsed.length) {
        moveRight(item.width);
      }
    };
    basePage.moveLeft(movedRight);
  }

  /**
   * Break apart the line of text into its separately formatted parts. 
   * @param text 
   * @returns 
   */
  public parse = async (text:string):Promise<ParsedItem[]> => {
    const { options: { font:originalFont, size }, getFont } = this;
    const tagRegex = /(<[^<>]+>)/g; // Match an element like <i> or </i>
    // Since the split separator is a regex, the separators are included in the output array.
    const items = text.split(tagRegex); 
    let italics = false, bold = false, underline = false, sizeDiff = 0, subSizeDiff = 0, yOffset = 0;
    const parsedItems = [] as ParsedItem[];

    for(let i=0; i<items.length; i++) {
      const item = items[i];
      switch(item) {
        case '<i>': italics = true; break;
        case '<b>': bold = true; break;
        case '</i>': italics = false; break;
        case '</b>': bold = false; break;
        case '<u>': underline = true; break;
        case '</u>': underline = false; break;
        case '<sub>': subSizeDiff = -2; yOffset = 4; break;
        case '<sup>': subSizeDiff = -2; yOffset = 4; break;
        case '</sub>': subSizeDiff = 0; yOffset = 0; break;
        case '</sup>': subSizeDiff = 0; yOffset = 0; break
        default:
          if(`${item}`.trim().length > 0 || /^\x20+$/.test(item)) {
            const matchesSizeChange = /^<\/?(\-?\d{1,2})>$/.exec(item);
            if(matchesSizeChange) {
              sizeDiff = item.includes('/') ? 0 : parseInt(matchesSizeChange[1]);
            }
            else {
              const parsed = { text:item, bold, italics, underline, yOffset } as ParsedItem;
              const newfont = await getFont(originalFont!, parsed);
              parsed.newfont = newfont;
              const width = newfont.widthOfTextAtSize(item, (size! + sizeDiff));
              parsed.fontSize = (size! + sizeDiff + subSizeDiff);
              parsed.width = width;
              this.combinedWidthOfTextAtSize += width;
              parsedItems.push(parsed);   
            }                 
          }
      }
    };
    return parsedItems;
  }

  /**
   * Since a line of text does not have to be homogenous with respect to is formatting all the way through,
   * the total width taken up by line of text will be a sum of the separately computed widths of all its
   * constituent and separately formatted segments.
   * @param text 
   * @returns 
   */
  public getCombinedWidthOfText = async (text:string) => {
    const { parse } = this;
    if(this.combinedWidthOfTextAtSize == 0) {
      await parse(text);
    }
    return this.combinedWidthOfTextAtSize;
  }

  /**
   * Get a modified version of specified PDFFont that incorporates additional properties like bolding and
   * italics that are reflected by a specified ParsedItem object. Thus, if the original font is "Courier",
   * and the ParsedItem is { text: "some text", bold:true, italics:true }, then the output PDFFont is
   * "CourierBold"
   * @param originalFont 
   * @param item 
   * @returns 
   */
  private getFont = async (originalFont:PDFFont, item:ParsedItem):Promise<PDFFont> => {
    const { page } = this;
    
    // Split the original font name into its formatting parts.
    const regex = /(Courier)|(Helvetica)|(TimesRoman)|(Bold)|(Oblique)|(Italic)/g;
    let parts = (originalFont.name.match(regex) || []) as string[];
    const { bold, italics } = item;

    // Extend the formatting parts with any new formats
    if(bold && ! parts.includes('Bold')) {
      parts.push('Bold');
    }
    switch(parts[0]) {
      case 'Courier': case 'Helvetica':
        if(italics && ! parts.includes('Oblique')) {
          parts.push('Oblique');
        }
        break;
      case 'TimesRoman':
        if(italics && ! parts.includes('Italic')) {
          parts.push('Italic');
        }
        break;
    }

    // The parts array needs to be sorted in the order of font name, bold, (oblique|italic)
    const sorting = [ 'Courier', 'Helvetica', 'TimesRoman', 'Bold', 'Oblique', 'Italic' ];
    parts.sort((a, b) => {
      return sorting.indexOf(a) - sorting.indexOf(b);
    });

    // Form the font name, create it, and return it.
    const newFontName = parts.length == 1 ? parts[0] : `${parts[0]}-${parts.slice(1).join('')}`;
    const newFont = await page.getFont(newFontName);
    return newFont ? newFont : originalFont;
  }
}





const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_TEXTLINE') {

  let doc:PDFDocument;
  let page:Page;
  let pg:PDFPage;

  PDFDocument.create()
  .then((_doc:PDFDocument) => {
    doc = _doc;
    return _doc.addPage([620, 785]) as PDFPage;
  })
  .then((_pg:PDFPage) => {
    pg = _pg;
    page = new Page(pg, { top: 35, bottom: 35, left: 50, right: 40 } as Margins, new EmbeddedFonts(doc) );
    return page.getFont(StandardFonts.Helvetica);
  })
  .then((helvetica:PDFFont) => {
    const textline = new TextLine(page, {
      font: helvetica,
      size: 10,
    } as PDFPageDrawTextOptions);
    // return textline.parse('Draw this <i>italisized <b>and < bolded</b> text</i> now');
    return textline.parse(
      'Draw this <i><b>italisized and < bolded text</b></i> now with ' +
      'one<sup>1</sup> superscript and one<sub>2</sub> subscript'
    );
  })
  .then((parsed:ParsedItem[]) => {
    const own = Object.getOwnPropertyNames(parsed[0]);
    console.log(JSON.stringify(parsed, (key, val) => {
      return key == 'newfont' ? val.name : val;
    }, 2));
  });
}
