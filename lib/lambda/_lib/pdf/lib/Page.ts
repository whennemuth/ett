import { PDFPage, PDFPageDrawTextOptions } from 'pdf-lib';
import { Rectangle, RectangleOptions } from './Rectangle';
import { Text } from './Text';
import { Margins } from './Utils';

export class Page {
  private page:PDFPage;
  private _margins:Margins;
  private text:Text;

  constructor(page:PDFPage, margins:Margins) {
    this.page = page;
    this._margins = margins;
    this.text = new Text(page, margins);
    this.page.moveTo(margins.left, (page.getHeight() - margins.top));
  }

  public drawText(text:string, options:PDFPageDrawTextOptions, padBottom?:number) {
    this.text.drawText(text, options, padBottom);
  }
  public drawTextOffset(text:string|string[], options:PDFPageDrawTextOptions, offsetX:number, offsetY:number, padBottom?:number) {
    this.text.drawTextOffset(text, options, offsetX, offsetY, padBottom);
  }
  public drawCenteredText(text:string, options:PDFPageDrawTextOptions, padBottom?:number) {
    this.text.drawCenteredText(text, options, padBottom);
  }
  public drawWrappedText(text:string, options:PDFPageDrawTextOptions, linePad:number, padBottom?:number) {
    this.text.drawWrappedText(text, options, linePad, padBottom);
  }

  public drawRectangle(options:RectangleOptions) {
    new Rectangle(options)
  }

  public get basePage():PDFPage {
    return this.page
  }
  public get bodyWidth(): number {
    return this.page.getWidth() - this.margins.left - this.margins.right;
  }
  public get margins(): Margins {
    return this._margins;
  }
  public get remainingVerticalSpace():number {
    return this.page.getY() - this.margins.bottom;
  }
}
