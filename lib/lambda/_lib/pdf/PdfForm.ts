import { Color, PDFDocument, PDFForm, StandardFonts, rgb } from "pdf-lib";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, Position, rgbPercent } from "./lib/Utils";
import { v4 as uuidv4 } from 'uuid';

export type IPdfForm = { getBytes():Promise<Uint8Array>, writeToDisk(path:string):Promise<void> };
type MarkedPosition = { id:string, position:Position }
export abstract class PdfForm {

  public static fullName = (first:string|undefined, middle:string|undefined, last:string|undefined):string => {
    const f = first ? `${first.trim()} ` : '';
    const m = middle ? `${middle.trim()} `: '';
    const l = last ? `${last.trim()}`: '';
    return `${f}${m}${l}`.trim();
  }

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

  /**
   * Get the change in position from the marked position.
   * @param id 
   * @returns 
   */
  public getPositionalChange = (id:string):Position => {
    const { markedPosition, page } = this;
    const { x, y } = markedPosition(id);
    const { basePage } = page;
    return { x:basePage.getX() - x, y:basePage.getY() - y };
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

  public getFullName = (first:string|undefined, middle:string|undefined, last:string|undefined):string => {
    return PdfForm.fullName(first, middle, last);
  }
}