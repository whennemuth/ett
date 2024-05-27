import { Color, PDFDocument, PDFForm, StandardFonts, rgb } from "pdf-lib";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, Position, rgbPercent } from "./lib/Utils";
import { v4 as uuidv4 } from 'uuid';

export type IPdfForm = { getBytes():Promise<Uint8Array> };
type MarkedPosition = { id:string, position:Position }
export abstract class PdfForm {

  doc:PDFDocument;
  form:PDFForm;
  embeddedFonts:EmbeddedFonts;
  pageMargins:Margins;
  page:Page;

  // private _markedPosition:Position;
  private markedPositions:MarkedPosition[] = [];
  
  /**
   * Move to the left side of the page, just to the right of the left margin
   * @param descend How far to move down after returning to the edge of the left margin.
   */
  public _return = (descend:number=0) => { 
    const { basePage, margins } = this.page;
    basePage.moveDown(descend);
    basePage.moveTo(margins.left, basePage.getY()); 
  };

  /**
   * Mark the current position on the form so it can be returned to later.
   */
  public markPosition = ():string => {
    const { basePage } = this.page;
    const id = uuidv4();
    this.markedPositions.push({ id, position: { x:basePage.getX(), y:basePage.getY() }});
    return id;
  }

  public markedPosition = (id:string):Position => {
    return this.markedPositions.find(p => p.id == id)!.position
  }

  /**
   * Return to a previously marked position.
   */
  public returnToMarkedPosition = (id:string) => {
    const { markedPositions, page } = this;
    const { x, y } = markedPositions.find(p => p.id == id)!.position
    const { basePage } = page;
    basePage.moveTo(x, y);
  }

  public getDoc = () => {
    return this.doc;
  }

  public getPage = () => {
    return this.page;
  }

  /**
   * Draw the upper left corner branding label
   */
  public drawLogo = async (page:Page) => {
    const blue = rgbPercent(47, 84, 150) as Color;
    const grey = rgb(.1, .1, .1) as Color;
    const boldfont = await this.embeddedFonts.getFont(StandardFonts.HelveticaBold);
    const size = 10;
    await page.drawText('ETHICAL', { size, color: blue, font:boldfont });
    await page.drawText('TRANSPARENCY', { size, color: grey, opacity:.2, font:boldfont });
    await page.drawText('TOOL', { size, color: blue, font:boldfont }, 16);
  }
}