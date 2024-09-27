import { writeFile } from "fs/promises";
import { IPdfForm, PdfForm } from "./PdfForm";
import { Consenter, YN } from "../dao/entity";
import { Color, PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { ConsentFormData, ConsentFormDrawParms } from "./ConsentForm";
import { Page } from "./lib/Page";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;

export class ConsentFormPage1 extends PdfForm implements IPdfForm {
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
    const { pageMargins, drawLogo, drawTitle, drawBody } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawTitle();

    await drawBody();
  }


  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT) <sup>1</sup>', { size: 14, font:boldfont }, 4);
    await page.drawCenteredText('ETT Consent Form', { size:10, font }, 28);
  }

  /**
   * Draw the body of the page
   */
  private drawBody = async () => {
    const { page, page: { bodyWidth }, boldfont, font, data } = this;
    const { entityName } = data;

    await page.drawText('A. FUNDAMENTAL PRINCIPLES ( <u>Principles</u>): <sup>2</sup>', { size:10, font:boldfont }, 6);
    await page.drawWrappedText({
      text: `${entityName} is committed to providing a climate and culture where all are welcome and ` + 
      `able to thrive, for the sake of our community members and to advance our integrity, excellence, ` + 
      `and earned public trust. While people found responsible for misconduct may learn lessons, change ` + 
      `conduct, and regain trust, transparency is important.  Not knowing about findings of sexual, ` + 
      `gender, and racial/ethnic misconduct, along with certain other types of misconduct, prevents us ` + 
      `from achieving the climate and culture we value.`,
      options: { size:10, font },
      linePad: 8,
      padBottom: 26
    });

    await page.drawText('B. GIVE YOUR CONSENT:', { size:10, font:boldfont }, 6);
    await page.drawWrappedText({
      text: 'This <u>Consent Form</u><sup>1</sup> is part of the <u>Ethical Transparency Tool</u>, <sup>1</sup> which is a tool ' +
      'to advance the <u>Principles</u>.<sup>2</sup>',
      options: { size:10, font },
      linePad: 8,
      padBottom: 8
    });
    await page.drawWrappedText({
      text: `As a condition to being considered by ${entityName} for <u>Privileges or Honors</u>,<sup>3</sup> ` +
      `<u>Employment or Roles</u>,<sup>4</sup> now or in the future, and by submitting this <u>Consent Form</u>,` +
      `<sup>1</sup> I give my consent to any Consent Recipient(s) <sup>5</sup> to complete a <u>Disclosure ` +
      `Form</u><sup>6</sup> about me and to provide it to any <u>ETT-Registered Entit(ies)</u> <sup>7</sup> that ` +
      `make(s) a request during the life of this Consent Form.`,
      options: { size:10, font },
      linePad: 8,
      padBottom: 8
    });

    page.basePage.moveDown(200);
    await page.drawRectangle({
      text: [
        '<u>Consent Recipient(s)</u><sup>5</sup> are my :', '',
        '1.  Current employers and former employers (the look-back period for former employers will be ' +
        'determined by each',
        '<u>ETT-Registered Entity</u><sup>7</sup> at the time it uses this Consent ' +
        'Form to request a disclosure);', '',
        '2. Current and former academic, professional, and field-related honorary and membership ' +
        'societies and organizations', '(same look-back period as in #1);', '',
        '3. Current and former entities and organizations where I have or had emeritus/emerita, visiting, or other teaching,', 
        'research, or administrative appointments or that have given me an honor or award (same look-back period as in #1);',
        'and', '',
        '4. The entities and organizations where I have any of the above-listed kinds of affiliations in the future. '
      ],
      page,
      margins: { left:6, top:6, bottom:6, right:6 },
      align: Align.left,
      valign: VAlign.top,
      options: { borderWidth:2, borderColor:blue, color:grey, opacity:.2, width:bodyWidth, height:200 },
      textOptions: { size:10, font, lineHeight:14 },
    });
    
    page.basePage.moveDown(26);
    await page.drawWrappedText({
      text: 'To provide an up-to-date list, <b>I will submit Exhibit Forms<sup>5</sup> listing the name and a ' +
      'contact for each of my Consent Recipients each time any ETT-Registered Entity<sup>7</sup></b>makes a request.' + 
      '  (See Process Diagram.)',
      options: { size:10, font },
      linePad: 8,
    });
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENT_FORM_PAGE_1') {

  new ConsentFormPage1({
    entityName: 'Boston University',
    consenter: { 
      email: 'bugsbunny@warnerbros.com', firstname: 'Bugs', middlename: 'B', lastname: 'Bunny',
      phone_number: '617-333-5555', consented_timestamp: [ new Date().toISOString() ], active: YN.Yes
    } as Consenter
  } as ConsentFormData).writeToDisk('./lib/lambda/_lib/pdf/consentForm1.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}