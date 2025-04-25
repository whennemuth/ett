import { Color, PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, rgb, StandardFonts } from "pdf-lib";
import { Consenter, ConsenterFields, roleFullName, Roles } from "../dao/entity";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Align, Margins, rgbPercent, VAlign } from "./lib/Utils";
import { writeFile } from "fs/promises";
import { Page } from "./lib/Page";
import { CellDef, Format, Table, TableDef } from "./lib/Table";

const blue = rgbPercent(47, 84, 150) as Color;
const white = rgb(1, 1, 1) as Color;
const red = rgbPercent(255, 0, 0);


export class CorrectionForm extends PdfForm implements IPdfForm {
  private oldConsenter:Consenter;
  private newConsenter:Consenter;
  font:PDFFont;
  boldfont:PDFFont;

  constructor(oldConsenter:Consenter, newConsenter:Consenter) {
    super();
    this.oldConsenter = oldConsenter;
    this.newConsenter = newConsenter;
    this.pageMargins = { top: 35, bottom: 35, left: 50, right: 40 } as Margins;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {
    const {drawTitle, drawIntro, drawLogo, drawBody } = this;

    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.boldfont = await this.embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await this.embeddedFonts.getFont(StandardFonts.Helvetica);
    this.form = this.doc.getForm();
    
    const { doc, form, embeddedFonts, pageMargins } = this;
    
    this.page = new Page(doc.addPage([620, 785]) as PDFPage, pageMargins, embeddedFonts);

    await drawLogo(this.page);

    await drawTitle();

    await drawIntro();

    await drawBody();

    const pdfBytes = await doc.save();
    return pdfBytes;
  }
  

  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { boldfont, font, page } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText(`${roleFullName(Roles.CONSENTING_PERSON)} Correction Form`, { size:10, font }, 8);
  }

  
  /**
   * Draw the introductory language
   */
  private drawIntro = async () => {
    const { font, boldfont, page, _return } = this;
    const size = 10;

    _return(8);
    await page.drawWrappedText({
      text: `The following ${roleFullName(Roles.CONSENTING_PERSON)} has made corrections to their name and/or contact information.`,
      options: { size, font },
      linePad: 4, 
      padBottom: 8
    });

    // Print variably formatted items on the same line.
    page.print('The corrected items are ', { font, size });
    page.print('highlighted ', { color:red, font:boldfont, size:12 });
    page.print('below.', { font, size });
  }

  private drawBody = async () => {
    const { font, boldfont, _return, newConsenter:n, oldConsenter:o } = this;
    _return(50);

    const { firstname, middlename, lastname, email, phone_number } = ConsenterFields;
    const getFont = (fldname:ConsenterFields) => o[fldname] == n[fldname] ? font : boldfont;
    const getColor = (fldname:ConsenterFields) => o[fldname] == n[fldname] ? undefined : red;

    await new Table(this, 
      {
        borderColor: blue, borderWidth: 1, font, 
        format: { align: Align.left, valign: VAlign.middle, margins: { left:8 } } as Format,
        rows: [
          {
            height: 30, font:boldfont, backgroundColor:blue, color:white, size:12, cells: [
              { width: 100, text: 'Item', format: { align: Align.center }} as CellDef,
              { text: 'Prior', format: { align: Align.center }} as CellDef,
              { text: 'Corrected', format: { align: Align.center }} as CellDef,
            ]
          },
          {
            height: 30, borderColor:blue, size:12, cells: [
              { width: 100, text: 'First Name', format: { align: Align.right, margins: { right:8 } } },
              { text: o.firstname },
              { text: n.firstname, font:getFont(firstname), color:getColor(firstname) },
            ]
          },
          {
            height: 30, borderColor:blue, size:12, cells: [
              { width: 100, text: 'Middle Name', format: { align: Align.right, margins: { right:8 } } },
              { text: o.middlename },
              { text: n.middlename, font:getFont(middlename), color:getColor(middlename) },
            ]
          },
          {
            height: 30, borderColor:blue, size:12, cells: [
              { width: 100, text: 'Last Name', format: { align: Align.right, margins: { right:8 } } },
              { text: o.lastname },
              { text: n.lastname, font:getFont(lastname), color:getColor(lastname) },
            ]
          },
          {
            height: 30, borderColor:blue, size:12, cells: [
              { width: 100, text: 'Email Address', format: { align: Align.right, margins: { right:8 } } },
              { text: o.email },
              { text: n.email, font:getFont(email), color:getColor(email) },
            ]
          },
          {
            height: 30, borderColor:blue, size:12, cells: [
              { width: 100, text: 'Cell Phone', format: { align: Align.right, margins: { right:8 } } },
              { text: o.phone_number },
              { text: n.phone_number, font:getFont(phone_number), color:getColor(phone_number) },
            ]
          },
        ]
      } as TableDef
    ).draw();
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

}





const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/CorrectionForm.ts')) {

  const oldConsenter = {
    email: 'bugs@warnerbros.com',
    firstname: 'Bugs',
    middlename: 'Bartholomew',
    lastname: 'Bunny',
    phone_number: '+1234567890',
    active: 'Y'
  } as Consenter;

  const newConsenter = {
    email: 'bugs@warnerbros.com',
    firstname: 'Bugs',
    middlename: 'Cornelius',
    lastname: 'Bunny',
    phone_number: '+1234567890',
    active: 'Y'
  } as Consenter;

  (async () => {
    await new CorrectionForm(oldConsenter, newConsenter).writeToDisk('./lib/lambda/_lib/pdf/CorrectionForm.pdf');
    console.log('done');
  })();
}