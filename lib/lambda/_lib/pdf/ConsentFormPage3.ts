import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts, drawRectangle, rgb } from "pdf-lib";
import { ConsentFormData, ConsentFormDrawParms } from "./ConsentForm";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";
import { Consenter, YN } from "../dao/entity";

const blue = rgbPercent(47, 84, 150) as Color;
const grey = rgb(.1, .1, .1) as Color;
const white = rgb(1, 1, 1) as Color;

export class ConsentFormPage3 extends PdfForm implements IPdfForm {
  private data:ConsentFormData;
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(data:ConsentFormData) {
    super();
    this.data = data;
    this.pageMargins = { top: 35, bottom: 35, left: 40, right: 40 } as Margins;
  }

  public async getBytes(): Promise<Uint8Array> {
    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();
    const { doc, form, embeddedFonts } = this;

    await this.draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

  public draw = async (drawParms:ConsentFormDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { pageMargins, drawLogo, drawBody } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawBody();
  }

  private drawBody = async () => {
    const { page, page: { basePage, bodyWidth, margins, drawRectangle, drawText }, boldfont, font, getFullName,
      data: { consenter: { firstname, middlename, lastname, phone_number, email, consented_timestamp } }, _return } = this;

    basePage.moveDown(50);
    
    // Draw Fullname field row
    await drawRectangle({
      text: [ 'Full Name:', '<-2>(First Middle Last)</-2>' ],
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.top,
      options: { color:blue, width:120, height:50 },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    await drawRectangle({
      text: getFullName(firstname, middlename, lastname),
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 120), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: (bodyWidth - 120)
      },
      textOptions: { size:12, font, color:grey }
    });

    _return(80);

    // Draw the cellphone field column
    await drawRectangle({
      text: 'Cell Phone:',
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { color:blue, width:120, height:50 },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    await drawRectangle({
      text: phone_number ?? 'unknown',
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 120), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: 120
      },
      textOptions: { size:12, font, color:grey }
    });

    // Draw the email field column
    await drawRectangle({
      text: 'Email:',
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { 
        x:(margins.left + 240),
        y:basePage.getY(), 
        color:blue, 
        width:60, 
        height:50 
      },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    await drawRectangle({
      text: email ?? 'unknown',
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 300), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: (bodyWidth - 300)
      },
      textOptions: { size:12, font, color:grey }
    });

    _return(40);

    await drawText('<i>Please type your full name (First Middle Last) to digitally sign this Consent Form</i>',
    {
      size:12, font, color:grey
    });
    basePage.moveDown(50);

    await drawRectangle({
      text: [ 'Signature', '<-5>Click to digitally sign</-5>' ],
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { color:blue, width:120, height:50 },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    basePage.drawSquare({
      borderWidth:2, size:12, borderColor:white, color:blue, x:basePage.getX()+7, y:basePage.getY()+6
    });
    basePage.drawText('X', {
      color:white, size:10, font:boldfont, x:basePage.getX()+9.5, y:basePage.getY()+8
    })

    await drawRectangle({
      text: getFullName(firstname, middlename, lastname),
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 120), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: 240
      },
      textOptions: { size:12, font, color:grey }
    });
    await drawRectangle({
      text: 'Date',
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { 
        x:(margins.left + 360),
        y:basePage.getY(), 
        color:blue, 
        width:60, 
        height:50 
      },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    await drawRectangle({
      text: consented_timestamp ? new Date(consented_timestamp).toLocaleDateString() : 'unknown',
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 420), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: (bodyWidth - 420)
      },
      textOptions: { size:12, font, color:grey }
    });

  }
}




const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENT_FORM_PAGE_3') {

  new ConsentFormPage3({
    entityName: 'Boston University',
    consenter: { 
      email: 'bugsbunny@warnerbros.com', firstname: 'Bugs', middlename: 'B', lastname: 'Bunny',
      phone_number: '617-333-5555', consented_timestamp: new Date().toISOString(), active: YN.Yes
    } as Consenter
  } as ConsentFormData).writeToDisk('./lib/lambda/_lib/pdf/consentForm3.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}