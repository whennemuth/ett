import { PDFFont, PDFPage, PDFPageDrawTextOptions, StandardFonts } from 'pdf-lib';
import { EmbeddedFonts } from './EmbeddedFonts';
import { Rectangle, RectangleOptions } from './Rectangle';
import { DrawWrappedTextParameters, Text } from './Text';
import { Margins } from './Utils';

/**
 * This class represents a pdf page
 */
export class Page {
  private page:PDFPage;
  private _margins:Margins;
  private text:Text;
  private embeddedFonts:EmbeddedFonts;
  
  constructor(page:PDFPage, margins:Margins, embeddedFonts:EmbeddedFonts) {
    this.page = page;
    this._margins = margins;
    this.embeddedFonts = embeddedFonts;
    this.text = new Text(this, margins);
    this.page.moveTo(margins.left, (page.getHeight() - margins.top));
  }

  public drawText = async (text:string, options:PDFPageDrawTextOptions, padBottom?:number) => {
    await this.text.drawText(text, options, padBottom);
  }
  public drawTextOffset = async (text:string|string[], options:PDFPageDrawTextOptions, getOffsetX:Function, offsetY:number, padBottom?:number) => {
    await this.text.drawTextOffset(text, options, getOffsetX, offsetY, padBottom);
  }
  public drawCenteredText = async (text:string, options:PDFPageDrawTextOptions, padBottom?:number) => {
    await this.text.drawCenteredText(text, options, padBottom);
  }
  public drawWrappedText = async (parms:DrawWrappedTextParameters) => {
    await this.text.drawWrappedText(parms);
  }
  public getFont = async (name:StandardFonts|string):Promise<PDFFont> => {
    return this.embeddedFonts.getFont(name);
  }

  public drawRectangle = async (options:RectangleOptions) => {
    await new Rectangle(options).draw();
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

  public nextPage = (dimensions?:[number, number], extra?:() => void):PDFPage => {
    const { page, margins: { left, top } } = this;
    dimensions ??= [page.getWidth(), page.getHeight()];
    this.page = page.doc.addPage(dimensions) as PDFPage;
    this.page.moveTo(left, (page.getHeight() - top));
    extra && extra();
    return this.page;
  }

  public nextPageIfNecessary = (requiredSpace:number, extra?:() => void):PDFPage => {
    if(this.remainingVerticalSpace < requiredSpace) {
      this.nextPage(undefined, extra);
    }
    return this.page;
  }
}
