import { Color, PageSizes, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { Consenter, Roles } from "../dao/entity";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Align, Margins, rgbPercent, VAlign } from "./lib/Utils";
import { writeFile } from "fs/promises";
import { Page } from "./lib/Page";
import { Rectangle } from "./lib/Rectangle";
import { IndividualRegistrationFormData } from "../../functions/consenting-person/RegistrationEmail";


const blue = rgbPercent(47, 84, 150) as Color;
const lightblue = rgbPercent(180, 198, 231) as Color;
const red = rgbPercent(255, 0, 0);

export class RegistrationFormIndividual extends PdfForm implements IPdfForm {
  private data:IndividualRegistrationFormData;
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(data:IndividualRegistrationFormData) {
    super();
    this.data = data;
    this.pageMargins = { top: 35, bottom: 35, left: 40, right: 40 } as Margins;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {
    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();

    const { doc, embeddedFonts, pageMargins, drawLogo, drawTitle, drawConsenter, drawCorrectionMessage, drawRedBox } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawTitle();

    await drawConsenter();

    await drawCorrectionMessage();

    await drawRedBox();

    this.page.setLinkAnnotations();

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  private isBlankForm = ():boolean => {
    const { data: { consenter } } = this;
    return !consenter || Object.keys(consenter).length === 0;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('Individual Registration Form', { size:10, font }, 8);
  }
  
  /**
   * Draw the table for consenter information.
   */
  private drawConsenter = async () => {
    let size = 10;
    const { page, page: { basePage, bodyWidth }, boldfont, font, _return, data: { consenter, privacyHref }, isBlankForm } = this;
    const { firstname='', middlename='', lastname='', email='', phone_number='', create_timestamp='' } = consenter;

    basePage.moveDown(16);

    if( ! isBlankForm()) {
      await page.drawText('Thank you for completing this Registration Form and the accompanying Consent Form.', 
        { size, font:boldfont }, 2);
    }

    await page.drawWrappedText({
      text: '<i>Registering on ETT means that you agree to participate in ETT,  have read and agree to the ' +
        `ETT Privacy Notice and Privacy Policy (available <u><a href="${privacyHref}">here</a></u>), and ` +
        'consent to inclusion of your name and contacts (as you reflect them above) on the ETT database ' +
        'and in ETT-related communications made in the ETT process.**<i>',
      options: { size, font:boldfont, color:red },
      linePad: 2,
    });

    basePage.moveDown(30);

    // Draw the consenter first, middle, & last names row
    let fldNameWidth = 60;
    let fldWidth = (bodyWidth - (fldNameWidth * 3))/3;
    type FieldSet = { fldName:string[], fldValue:string, fldNameWidth:number, fldWidth:number };
    const drawFieldSet = async (fldset:FieldSet) => {
      const { fldName, fldValue, fldNameWidth, fldWidth } = fldset;
      await new Rectangle({
        text: fldName,
        page,
        align: Align.right,
        valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:32 },
        textOptions: { size, font:boldfont },
        margins: { right: 4 } as Margins
      }).draw();
      basePage.moveRight(fldNameWidth);    
      
      await new Rectangle({
        text: fldValue,
        page,
        align: Align.left,
        valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, width:fldWidth, height:32 },
        textOptions: { size, font },
        margins: { left: 4 } as Margins
      }).draw();
      basePage.moveRight(fldWidth); 
    }

    await drawFieldSet({ fldName:['Full First', 'Name(s)*'], fldValue:firstname, fldNameWidth, fldWidth });

    await drawFieldSet({ fldName:['Full Middle', 'Name(s)*'], fldValue:middlename, fldNameWidth, fldWidth });

    await drawFieldSet({ fldName:['Full Last', 'Name(s)*'], fldValue:lastname, fldNameWidth, fldWidth });

    _return(32);

    fldWidth = (bodyWidth - (fldNameWidth * 2))/2;

    await drawFieldSet({ fldName:['Email', 'Address*'], fldValue:email, fldNameWidth, fldWidth });

    await drawFieldSet({ fldName:['Phone nbr', '(cell)*'], fldValue:phone_number, fldNameWidth, fldWidth });

    _return(24);

    await page.drawText('* Required field: Name, email and phone number will be used to authenticate your account.', { size, font }, 8);

    if( ! isBlankForm()) {
      _return(16);

      const created = new Date(Date.parse(create_timestamp || new Date().toISOString()));
      await page.drawWrappedText({
        text: `Your registration was digitally signed <i>(having the same effect as a handwritten signature)</i> ` +
          `and your account created on: <b>${created.toUTCString()}.</b>`,
        options: { size, font },
        linePad: 4,
      });
    }
  }

  private drawCorrectionMessage = async () => {
    let size = 10;
    const { page, font, _return, data: { dashboardHref } } = this;
    
    let correctionMsg = `To modify your registration, or to withdraw or renew your consent, log into your account`;
    if(dashboardHref) {
      correctionMsg += `  <u><b><1><a href="${dashboardHref}">here</a></1></b></u>`;
    }
    else {
      correctionMsg += ' and access the relevant change features.';
    }

    _return(16);
    
    await page.drawWrappedText({
      text: correctionMsg,
      options: { size, font },
      linePad: 4,
    });
  }


  private drawRedBoxBorder = async (boxHeight:number, marginOverflow:number) => {
    const { page, page: { bodyWidth, margins, drawRectangle }, font, _return } = this;

    _return(boxHeight - 10);

    const x = margins.left - marginOverflow;
    const width = bodyWidth + 2 * marginOverflow;

    await drawRectangle({
      text:'',
      page,
      margins: { left:6, top:6, bottom:6, right:6 },
      align: Align.center,
      valign: VAlign.top,
      options: { x, borderWidth:2, borderColor:red, width, height:boxHeight },
      textOptions: { size:10, font, lineHeight:14 },
    });

    _return(-boxHeight);
  }

  private fillRedBox = async () => {
    const { data: { dashboardHref }, page: { 
      basePage, bodyWidth, drawTextOffset, drawWrappedText, }, font, boldfont, _return } = this;
    const size = 10;
    const horizontalRoom = bodyWidth - 32;

    _return(24);
    basePage.moveRight(8);

    const dashboardLink = `<u><b><1><a href="${dashboardHref}">here</a></1></b></u>`;

    await drawWrappedText({
      text: '**This Registration Form enables you to complete an ETT Consent Form so that any ETT Registered ' +
        'Entities (ETT-registered colleges, universities, societies, or other organizations — see the ' +
        `periodically updated list at ${dashboardLink}) — can use ETT to obtain disclosures about <b>whether ` +
        'or not there are findings (not allegations)</b> of sex/gender, race/ethnicity, financial, research, ' +
        'or licensure related misconduct about you for transparency when considering you for certain ' +
        'Privileges, Honors, Employment or Roles. You will also be able to complete Exhibit Forms listing ' +
        'your professionally affiliated entities (past and present) at the times when you’re being ' +
        'considered, to affirm your consent to your professional affiliates making such disclosures directly ' +
        'to the ETT Registered Entity that is considering you.  <b>ETT never receives the disclosures or ' +
        'any conduct records about you and cannot create a central record.  ETT is a tool, not a policy, ' +
        'and does not dictate who is qualified or should be selected for any privilege, honor, employment ' +
        'or role; those are the decisions for each ETT Registered Entity to make independently under its ' +
        'own policy and process.<b>',
      options: { size, font:boldfont, color:red },
      linePad: 4, padBottom: 14, horizontalRoom
    });

    await drawWrappedText({
      text: 'You will be able to rescind your ETT Consent Form at any time (except in connection with any ' +
      'disclosure requests that have been made at the time). Once your consent expires (after 10 years) or ' +
      'is rescinded, your ETT registration will also end.<b><red><i>The Consent Form provides information on ' +
      'how to rescind your Consent Form. When the period of your Consent Form ends for all purposes — ' +
      'your registration will also end automatically.</i></red></b>',
      options: { size, font },
      linePad: 4, padBottom: 14, horizontalRoom
    });
  }
  
  
  private drawRedBox = async () => {
    const { drawRedBoxBorder, fillRedBox, page: { nextPageIfNecessary }, _return } = this;
    _return(24);
    const boxHeight = 280;
    nextPageIfNecessary(boxHeight);
    await drawRedBoxBorder(boxHeight, 0);
    await fillRedBox();
  }



  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/RegistrationFormIndividual.ts')) {

  const consenter = { 
    email: 'foghorn@warnerbros.com', 
    phone_number: '617-222-4444',
    firstname: 'Foghorn',
    middlename: 'F',
    lastname: 'Leghorn',
    exhibit_forms: [] as any,
    title: 'Lead animation coordinator',
    create_timestamp: new Date().toISOString(),
  } as Consenter;

  const dashboardHref = `https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm?action=start-login&selected_role=${Roles.CONSENTING_PERSON}`;
  const privacyHref = `https://d227na12o3l3dd.cloudfront.net/privacy`;

  const testBlankForm = false;

  (async () => {
    await new RegistrationFormIndividual({ 
      consenter: testBlankForm ? {} as Consenter : consenter,
      entityName: 'Warner Bros', 
      dashboardHref, 
      privacyHref 
    }).writeToDisk('./lib/lambda/_lib/pdf/RegistrationFormIndividual.pdf');
  })();
}