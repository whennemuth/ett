import { PDFPageDrawRectangleOptions, PDFPageDrawTextOptions } from "pdf-lib";
import { Align, Margins, VAlign } from "./Utils";
import { Page } from "./Page";
import { TextLine } from "./TextLine";

export type RectangleOptions = {
  page: Page,
  options: PDFPageDrawRectangleOptions, 
  text: string|string[], 
  textOptions: PDFPageDrawTextOptions,
  margins?: Margins,
  align?: Align,
  valign?: VAlign
}

export class Rectangle {
  private options:RectangleOptions;

  constructor(options:RectangleOptions) {
    this.options = options;
  }

  public draw = async () => {
    const { page, text, options } = this.options;
    page.basePage.drawRectangle(options);
    if(text) {
      await this.drawInnerText();
    }
  }

  private drawInnerText = async () => {
    const { page, page: { basePage }, text, textOptions } = this.options;
    const startY = page.basePage.getY();
    const lines:string[] = text instanceof Array ? text : [ text ];
    // const xOffset = await this.getXOffset(lines[0]);
    const yOffset = this.getYOffset(text);
    const getXOffsetForLine = async (line:string) => {
      return this.getXOffset(line);
    }
    await page.drawTextOffset(lines, textOptions, getXOffsetForLine, yOffset);
    basePage.moveTo(basePage.getX(), startY);
  }

  private getXOffset = async (text:string):Promise<number> => {
    const { page, options, textOptions, align=Align.left, margins } = this.options;
    const { left=0, right=0 } = margins || {};
    const textWidth = await new TextLine(page, textOptions).getCombinedWidthOfText(text);
    switch(align) {
      case Align.left:
        return left;
      case Align.right:
        return options.width! - textWidth - right;
      case Align.center:
        return (options.width! - textWidth) / 2;
    }
  }

  private getYOffset(text:string|string[]):number {
    const { textOptions, options, valign=VAlign.middle, margins } = this.options;
    const { top=0, bottom=0 } = margins || {};
    const { font, size } = textOptions;
    const lines:string[] = text instanceof Array ? text : [ text ];
    const textHeight:number = font?.heightAtSize(size!) || 0;
    const fullHeight = textHeight * lines.length;
    switch(valign) {
      case VAlign.top:
        return 0 - (options.height! - (fullHeight + top));
      case VAlign.bottom:
        return 0 - bottom;
      case VAlign.middle:
        return 0 - (fullHeight + ((options.height! - fullHeight) / 2) - textHeight);
    }
  }
}