import { Color, PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { Affiliate, ExhibitForm as ExhibitFormData } from "../dao/entity";
import { PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Rectangle } from "./lib/Rectangle";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;
export const white = rgb(1, 1, 1) as Color;

/**
 * This is a baseline exhibit form. It is passed to variants to provide generalized function common to any variant.
 * 
 * TODO: Add new page creation that is triggered when the available vertical space left on a page is less than 
 * the height of the next item to be drawn.
 */
export class ExhibitForm extends PdfForm {
  private _data:ExhibitFormData;
  font:PDFFont;
  boldfont:PDFFont;
  
  constructor(data:ExhibitFormData) {
    super();
    this._data = data;
    this.pageMargins = { top: 35, bottom: 35, left: 50, right: 40 } as Margins;
  }

  public async initialize() {
    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.boldfont = await this.embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await this.embeddedFonts.getFont(StandardFonts.Helvetica);
  }

  public get data() {
    return this._data;
  }

  /**
   * Draw a single affiliate.
   * @param a The affiliate data.
   * @param size The size of the font to be used.
   */
  public drawAffliate = async (a:Affiliate, size:number) => {
    const { page, font, boldfont, _return, markPosition, returnToMarkedPosition: returnToPosition } = this;
    // Draw the organization row
    _return();
    await new Rectangle({
      text: 'Organization',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:150, height:16 },
      textOptions: { size, font:boldfont },
      margins: { right: 8 } as Margins
    }).draw();
    page.basePage.moveRight(150); 

    await new Rectangle({
      text: a.org, page,
      align: Align.left, valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - 150), height:16 },
      textOptions: { size, font },
      margins: { left: 8 } as Margins
    }).draw();
    _return(64);

    // Draw the point of contact rows
    const posId = markPosition();
    await new Rectangle({
      text: [ 'Point of', 'Contact' ],
      page,
      align: Align.center,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:75, height:64 },
      textOptions: { size, font:boldfont },
    }).draw();
    returnToPosition(posId);
    page.basePage.moveUp(48);

    const items = [ [ 'Fullname', a.fullname ], [ 'Job Title', a.title ], [ 'Email', a.email ], [ 'Phone Nbr', a.phone_number ] ]
    for(let i=0; i<items.length; i++) {
      const item = items[i];
        _return();
        page.basePage.moveRight(75);
        await new Rectangle({
          text: item[0] || '',
          page,
          align: Align.right,
          valign: VAlign.middle,
          options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:75, height:16 },
          textOptions: { size, font:boldfont },
          margins: { right: 8 } as Margins
        })
        .draw();
        page.basePage.moveRight(75);

        await new Rectangle({
          text: item[1] || '',
          page,
          align: Align.left,
          valign: VAlign.middle,
          options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - 150), height:16 },
          textOptions: { size, font },
          margins: { left: 8 } as Margins
        }).draw();
        page.basePage.moveDown(16);

    }

  }


}