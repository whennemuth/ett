import { PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, StandardFonts } from "pdf-lib";
import { EmbeddedFonts } from "./EmbeddedFonts";
import { Page } from "./Page";
import { Margins } from "./Utils";

/** Represents, within the line of text, a segment with its own formatting */
export type ParsedItem = { text:string, italics:boolean, bold:boolean, newfont:PDFFont, width:number, fontSize:number };

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

    for(let i=0; i<parsed.length; i++) {
      const item:ParsedItem = parsed[i];
      const newfont = await getFont(originalFont!, item);
      
      const addopts = {
        font: newfont,
        size: item.fontSize
      } as PDFPageDrawTextOptions;

      let newopts = Object.assign({}, options);
      newopts = Object.assign(newopts, addopts);
      basePage.drawText(item.text, newopts);
      if(i+1 < parsed.length) {
        basePage.moveRight(item.width);
        movedRight += item.width;
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
    let italics = false, bold = false, sizeDiff = 0;
    const parsedItems = [] as ParsedItem[];

    for(let i=0; i<items.length; i++) {
      const item = items[i];
      switch(item) {
        case '<i>': italics = true; break;
        case '<b>': bold = true; break;
        case '</i>': italics = false; break;
        case '</b>': bold = false; break;
        default:
          if(`${item}`.trim().length > 0 || /^\x20+$/.test(item)) {
            const matches = /^<\/?(\-?\d{1,2})>$/.exec(item);
            if(matches) {
              sizeDiff = item.includes('/') ? 0 : parseInt(matches[1]);
            }
            else {
              const parsed = { text:item, bold, italics } as ParsedItem;
              const newfont = await getFont(originalFont!, parsed);
              parsed.newfont = newfont;
              const width = newfont.widthOfTextAtSize(item, (size! + sizeDiff));
              parsed.fontSize = (size! + sizeDiff);
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
    const parts = (originalFont.name.match(regex) || []) as string[];

    // Extend the formatting parts with any new formats
    if(item.bold && ! parts.includes('Bold')) {
      parts.push('Bold');
    }
    switch(parts[0]) {
      case 'Courier': case 'Helvetica':
        if(item.italics && ! parts.includes('Oblique')) {
          parts.push('Oblique');
        }
        break;
      case 'TimesRoman':
        if(item.italics && ! parts.includes('Italic')) {
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
    return textline.parse('Draw this <i><b>italisized and < bolded text</b></i> now');
  })
  .then((parsed:ParsedItem[]) => {
    const own = Object.getOwnPropertyNames(parsed[0]);
    console.log(JSON.stringify(parsed, (key, val) => {
      return key == 'newfont' ? val.name : val;
    }, 2));
  });
}
