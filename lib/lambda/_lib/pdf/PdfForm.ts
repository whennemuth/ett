import { PDFDocument, PDFFont } from "pdf-lib";
import { Page } from "./lib/Page";
import { Margins, Position } from "./lib/Utils";

export type IPdfForm = { getBytes():Promise<Uint8Array> };

export abstract class PdfForm {

  doc:PDFDocument;
  pageMargins:Margins;
  page:Page;
  font:PDFFont;
  boldfont:PDFFont;
  markedPosition:Position;
  
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
  public markPosition = () => {
    const { basePage } = this.page;
    this.markedPosition = { x:basePage.getX(), y:basePage.getY() };
  }

  /**
   * Return to a previously marked position.
   */
  public returnToPosition = () => {
    const { x, y } = this.markedPosition;
    const { basePage } = this.page;
    basePage.moveTo(x, y);
  }
}