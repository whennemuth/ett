import { PDFPageDrawTextOptions } from "pdf-lib";
import { Page } from "./Page";
import { TextLine } from "./TextLine";
import { Margins } from "./Utils";

export type DrawWrappedTextParameters = {
  text:string, options:PDFPageDrawTextOptions, linePad:number, horizontalRoom?:number, padBottom?:number
}
export class Text {
  private page:Page;
  private pageMargins:Margins;

  constructor(page:Page, pageMargins:Margins) {
    this.page = page;
    this.pageMargins = pageMargins;
  }

  private drawTextLine = async (text:string, options:PDFPageDrawTextOptions):Promise<void> => {
    return new TextLine(this.page, options).drawFormattedText(text);
  }

  private getCombinedWidthOfText = async (text:string, options:PDFPageDrawTextOptions):Promise<number> => {
    return new TextLine(this.page, options).getCombinedWidthOfText(text);
  }

  /**
   * Draw one line of text.
   * @param text 
   * @param options 
   * @param padBottom optionally pad the bottom with some vertical space.
   */
  public drawText = async (text:string, options:PDFPageDrawTextOptions, padBottom?:number):Promise<void> => {
    const { page: { basePage }, drawTextLine } = this;
    await drawTextLine(text, options);
    basePage.moveDown(options.size!);
    basePage.moveDown(padBottom || 0);
  }

  public drawTextOffset = async (text:string|string[], options:PDFPageDrawTextOptions, getXOffset:Function, offsetY:number, padBottom?:number) => {
    const { page: { basePage }, drawTextLine } = this;
    const { lineHeight, size } = options;
    basePage.moveDown(offsetY);    
    const lines:string[] = text instanceof Array ? text : [ text ];
    for(var i=0; i<lines.length; i++) {
      var offsetX = await getXOffset(lines[i]);
      basePage.moveRight(offsetX);
      if(i > 0) {
        basePage.moveDown(lineHeight ?? size!);
      }
      await drawTextLine(lines[i], options);
      basePage.moveLeft(offsetX);
    }
    basePage.moveUp(offsetY);
  }

  /**
   * Draw one line of text on the page that is centered horizontally.
   * @param text 
   * @param options 
   */
  public drawCenteredText = async (text:string, options:PDFPageDrawTextOptions, padBottom?:number) => {
    const { page: { basePage }, drawTextLine, getCombinedWidthOfText } = this;
    const textWidth = await getCombinedWidthOfText(text, options);
    const centerX = (basePage.getWidth() - textWidth!) / 2;
    const newOptions = Object.assign({}, options);
    newOptions.x = centerX;
    await drawTextLine(text, newOptions);
    basePage.moveDown(options.size!);
    basePage.moveDown(padBottom || 0);
  }

  /**
   * Draw text that would extend beyond the right edge of the page if drawn as a single line.
   * Break up the text into multiple lines so that it can keep from passing the right margin.
   * @param text 
   * @param options 
   */
  public drawWrappedText = async (parms:DrawWrappedTextParameters) => {
    let { text, options, linePad, horizontalRoom, padBottom} = parms;
    const { page: { basePage }, pageMargins, drawText, getCombinedWidthOfText } = this;
    if( ! horizontalRoom) {

      horizontalRoom = basePage.getWidth() - (pageMargins.left + pageMargins.right) - (basePage.getX() - pageMargins.left);
    }
    const words:string[] = [...text.matchAll(/\s*[^\s]+/g)].map(a => a[0]);

    const tooWide = async (s:string) => {
      const textWidth = await getCombinedWidthOfText(s, options) || 0;
      return textWidth > (horizontalRoom || textWidth);
    }

    let line = '';
    const lines = [] as any[];

    /**
     * Formatting via markup inside the text is handled only for a single line of text. That is,
     * any given line that is to be formatted must have a complete block of markup (start AND end tags).
     * However, in the process of splitting text up into those lines in the process of wrapping text, 
     * the start and end tag pairings can get separated from each other on separate lines. Use of this 
     * function compensates for that by injecting addtional start tags on lines where they are missing.
     * @param tagname 
     */
    const checkTags = (tagname:string) => {
      const lastLine = lines[lines.length-1].text;
      const endTag = `</${tagname}>`;
      const startTag = `<${tagname}>`;
      let iLastStart = lastLine.lastIndexOf(startTag);
      if(startTag == '<a>' && iLastStart == -1) {
        iLastStart = lastLine.lastIndexOf('<a href=');
      }

      if(iLastStart > -1) {
        const iLastEnd = lastLine.lastIndexOf(endTag);
        if(iLastEnd == -1 || iLastStart > iLastEnd) {
          // The prior line ended having started a markup block without finishing it with its end tag
          // The current line does not "know" about this, so force it to by prepending it with the start tag.
          line = `${startTag}${line}`;
        }
      }
    };

    // Prepare an array of lines that results from wrapping text in the available horizontal
    // space, each element of which is properly formatted.
    for(let i=0; i<words.length; i++) {
      const word = words[i];
      const longerLine = line + word;
      if(await tooWide(longerLine)) {
        lines.push({ text:line, options, padBottom:linePad });
        line = word.trim();

        const tagnames = [ 'b', 'i', 'u', 'a', '1', '2', '3', '4', '5', '6', '7', '8', '9' ];
        tagnames.forEach(tagname => checkTags(tagname));
      }
      else {
        line = longerLine;
      }
    }
    lines.push({ text:line, options, padBottom });

    // Draw each line
    for(let i=0; i<lines.length; i++) {
      const { text, options, padBottom } = lines[i];
      await drawText(text, options, padBottom);
    }
  }

}