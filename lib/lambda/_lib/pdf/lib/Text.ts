import { PDFPage, PDFPageDrawTextOptions } from "pdf-lib";
import { Margins } from "./Utils";

export class Text {
  private page:PDFPage;
  private pageMargins:Margins;

  constructor(page:PDFPage, pageMargins:Margins) {
    this.page = page;
    this.pageMargins = pageMargins;
  }

  /**
   * Draw one line of text.
   * @param text 
   * @param options 
   * @param padBottom optionally pad the bottom with some vertical space.
   */
  public drawText(text:string, options:PDFPageDrawTextOptions, padBottom?:number) {
    this.page.drawText(text, options);
    this.page.moveDown(options.size!);
    this.page.moveDown(padBottom || 0);
  }

  public drawTextOffset(text:string|string[], options:PDFPageDrawTextOptions, offsetX:number, offsetY:number, padBottom?:number) {
    this.page.moveRight(offsetX);
    this.page.moveDown(offsetY);    
    const lines:string[] = text instanceof Array ? text : [ text ];
    for(var i=0; i<lines.length; i++) {
      if(i > 0) {
        this.page.moveDown(options.size!);
      }
      this.page.drawText(lines[i], options);
    }
    this.page.moveLeft(offsetX);
    this.page.moveUp(offsetY);
  }

  /**
   * Draw one line of text on the page that is centered horizontally.
   * @param text 
   * @param options 
   */
  public drawCenteredText(text:string, options:PDFPageDrawTextOptions, padBottom?:number) {
    const { font, size } = options;
    const textWidth = font?.widthOfTextAtSize(text, size!);
    const centerX = (this.page.getWidth() - textWidth!) / 2;
    const newOptions = Object.assign({}, options);
    newOptions.x = centerX;
    this.page.drawText(text, newOptions);
    this.page.moveDown(options.size!);
    this.page.moveDown(padBottom || 0);
  }

  /**
   * Draw text that would extend beyond the right edge of the page if drawn as a single line.
   * Break up the text into multiple lines so that it can keep from passing the right margin.
   * @param text 
   * @param options 
   */
  public drawWrappedText(text:string, options:PDFPageDrawTextOptions, linePad:number, padBottom?:number) {
    const { font, size } = options;
    const horizontalRoom = this.page.getWidth() - this.pageMargins.left - this.pageMargins.right;
    const words:string[] = [...text.matchAll(/\s*[^\s]+/g)].map(a => a[0]);

    const tooWide = (s:string) => (font?.widthOfTextAtSize(s, size!) || 0) > horizontalRoom;
    
    let line = '';
    words.forEach(word => {
      const longerLine = line + word;
      if(tooWide(longerLine)) {
        this.drawText(line, options, linePad);
        line = word.trim();
      }
      else {
        line = longerLine;
      }
    });
    this.drawText(line, options, padBottom);
  }

}