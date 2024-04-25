import { PDFPageDrawRectangleOptions, PDFPageDrawTextOptions } from "pdf-lib";
import { Margins } from "./Utils";
import { Page } from "./Page";

export enum Align { left, right, center };
export enum VAlign { top, bottom, middle };

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

  public draw(reposition:any) {
    const { page, text, options } = this.options;
    page.basePage.drawRectangle(options);
    if(text) {
      this.drawInnerText();
    }
    reposition();
  }

  private drawInnerText() {
    const { page, text, textOptions } = this.options;
    const lines:string[] = text instanceof Array ? text : [ text ];
    page.drawTextOffset(lines, textOptions, this.getXOffset(lines[0]), this.getYOffset(text));
  }

  private getXOffset(text:string):number {
    const { options, textOptions, align=Align.left, margins } = this.options;
    const { left=0, right=0 } = margins || {};
    const { font, size } = textOptions;
    const textWidth:number = font?.widthOfTextAtSize(text as string, size!) || 0;
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