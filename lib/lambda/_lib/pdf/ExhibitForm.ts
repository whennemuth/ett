
export type IExhibitForm = { getBytes():Promise<Uint8Array> };
export const enum AffiliateTypes { EMPLOYER = 'EMPLOYER', ACADEMIC = 'ACADEMIC', OTHER = 'OTHER' };
export type AffiliateType = AffiliateTypes.EMPLOYER | AffiliateTypes.ACADEMIC | AffiliateTypes.OTHER;
export type Affiliate = { type: AffiliateType, organization: string, fullname: string, title: string, email: string, phone: string };
export type ExhibitData = { 
  affiliates: Affiliate|Affiliate[], 
  entity_id:string, 
  fullname?: string, 
  email?: string, 
  phone?: string, 
  timestamp?: string 
};

import { Color, PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { Margins, Position, rgbPercent } from "./lib/Utils";
import { Page } from "./lib/Page";
import { Align, Rectangle, VAlign } from "./lib/Rectangle";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;
export const white = rgb(1, 1, 1) as Color;

/**
 * This is a baseline exhibit form. It is passed to variants to provide generalized function common to any variant.
 * 
 * TODO: Add new page creation that is triggered when the available vertical space left on a page is less than 
 * the height of the next item to be drawn.
 */
export class ExhibitForm {
  private _data:ExhibitData;
  doc:PDFDocument;
  pageMargins:Margins;
  page:Page;
  font:PDFFont;
  boldfont:PDFFont;
  markedPosition:Position;

  constructor(data:ExhibitData) {
    this._data = data;
    this.pageMargins = { top: 35, bottom: 35, left: 50, right: 40 } as Margins;
  }

  public async initialize() {
    this.doc = await PDFDocument.create();
    this.page = new Page(this.doc.addPage([620, 785]) as PDFPage, this.pageMargins);
    this.boldfont = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
  }

  public get data() {
    return this._data;
  }

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

  /**
   * Draw the upper left corner branding label
   */
  public drawLogo = () => {
    const { page, boldfont } = this;
    const size = 10;
    page.drawText('ETHICAL', { size, color: blue, font:boldfont });
    page.drawText('TRANSPARENCY', { size, color: grey, opacity:.2, font:boldfont });
    page.drawText('TOOL', { size, color: blue, font:boldfont }, 16);
  }

  /**
   * Draw a single affiliate.
   * @param a The affiliate data.
   * @param size The size of the font to be used.
   */
  public drawAffliate = (a:Affiliate, size:number) => {
    const { page, font, boldfont, _return, markPosition, returnToPosition } = this;
    // Draw the organization row
    _return();
    new Rectangle({
      text: 'Organization',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:150, height:16 },
      textOptions: { size, font:boldfont },
      margins: { right: 8 } as Margins
    }).draw(() => { 
      page.basePage.moveRight(150); 
      new Rectangle({
        text: a.organization, page,
        align: Align.left, valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - 150), height:16 },
        textOptions: { size, font },
        margins: { left: 8 } as Margins
      }).draw(() => { _return(64); });
    });

    // Draw the point of contact rows
    markPosition();
    new Rectangle({
      text: [ 'Point of', 'Contact' ],
      page,
      align: Align.center,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:75, height:64 },
      textOptions: { size, font:boldfont },
    }).draw(() => {
      returnToPosition();
      page.basePage.moveUp(48);
      [ [ 'Fullname', a.fullname ], [ 'Job Title', a.title ], [ 'Email', a.email ], [ 'Phone Nbr', a.phone ] ]
      .forEach(item => {
          _return();
          page.basePage.moveRight(75);
          new Rectangle({
            text: item[0],
            page,
            align: Align.right,
            valign: VAlign.middle,
            options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:75, height:16 },
            textOptions: { size, font:boldfont },
            margins: { right: 8 } as Margins
          })
          .draw(() => {
            page.basePage.moveRight(75);
            new Rectangle({
              text: item[1],
              page,
              align: Align.left,
              valign: VAlign.middle,
              options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - 150), height:16 },
              textOptions: { size, font },
              margins: { left: 8 } as Margins
            }).draw(() => {
              page.basePage.moveDown(16);
            })
          });
      })
    });    
  }


}