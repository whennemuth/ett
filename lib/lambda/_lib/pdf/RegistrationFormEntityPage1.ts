import { writeFile } from "fs/promises";
import { Color, PageSizes, PDFDocument, PDFFont, PDFPage, StandardFonts } from "pdf-lib";
import { roleFullName, Roles, User } from "../dao/entity";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Rectangle } from "./lib/Rectangle";
import { Align, Margins, rgbPercent, VAlign } from "./lib/Utils";
import { IPdfForm, PdfForm } from "./PdfForm";
import { getBlankData, getSampleData, RegistrationFormEntityData, RegistrationFormEntityDrawParms } from "./RegistrationFormEntity";

const blue = rgbPercent(47, 84, 150) as Color;
const lightblue = rgbPercent(180, 198, 231) as Color;
const red = rgbPercent(255, 0, 0);

type FieldSet = { fldName:string[], fldValue:string, fldNameWidth:number, fldWidth:number, height:number };
export class RegistrationFormEntityPage1 extends PdfForm implements IPdfForm {
  private data:RegistrationFormEntityData;
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(data:RegistrationFormEntityData) {
    super();
    this.data = data;
    this.pageMargins = { top: 35, bottom: 35, left: 40, right: 40 } as Margins;
  }

  public async getBytes(): Promise<Uint8Array> {
    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();
    const { doc, form, embeddedFonts, draw } = this;

    await draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

  public draw = async (drawParms:RegistrationFormEntityDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { pageMargins, drawLogo, drawTitle } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    const { page, drawSubTitle, drawOrg, drawUsers, drawDisclaimerPart1, drawDefinitions } = this;

    await drawLogo(page);

    await drawTitle();

    await drawSubTitle();

    await drawOrg();

    await drawUsers();

    await drawDisclaimerPart1();

    await drawDefinitions();
  }


  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font, _return } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('Entity Registration Form', { size:10, font }, 8);
    _return(16);
  }

  private drawSubTitle = async () => {
    const { page, font, _return, data: { create_timestamp, entity: { users } } } = this;
    let signedOn = new Date().toUTCString();
    if(create_timestamp) {
      const created = new Date(Date.parse(create_timestamp));
      signedOn = created.toUTCString();
    }
    await page.drawText(`<b>Entity Registration Form</b> <i>(digitally signed: <b>${signedOn}.</b>)</i>`, { size: 10, font }, 12);
    _return(24);
  }

  private drawOrg = async () => {
    const { data: { entity: { entity_name } }, page: { bodyWidth }, drawFieldSet, _return } = this;
    const fldNameWidth = 120;
    const fldWidth = bodyWidth - fldNameWidth;
    const fldName = [ 'Name of Organization', '<i>(no acronyms)</i>' ];
    await drawFieldSet({ fldName, fldValue:entity_name, fldNameWidth, fldWidth, height:32 })
    _return(30);
  }


  private drawUser = async (user:User, index:number, sup:number):Promise<void> => {
    const { page: { bodyWidth, drawText }, drawFieldSet, font, _return } = this;
    const { role, fullname='', email, phone_number='', title='' } = user;
    const fldNameWidth = 60;
    const fldWidth = (bodyWidth - (fldNameWidth * 2))/2;
    const height:number = 16;
    let rolename:string;

    // Determine the full name of the role
    switch(role) {
      case Roles.RE_ADMIN:
        rolename = `${roleFullName(Roles.RE_ADMIN)}<sup>${sup}</sup>:`;
        break;
      case Roles.RE_AUTH_IND:
        rolename = `${roleFullName(Roles.RE_AUTH_IND)} ${index}<sup>${sup}</sup>:`;
        break;
      default:
        rolename = `Contact for Disclosure Request Responses ${index}<sup>${sup}</sup>:`;
        break;
    }

    await drawText(rolename, { size: 10, font }, 8);
    _return(2);

    // Set the common field set parameters
    const parms = { fldNameWidth, fldWidth, height } as FieldSet;

    // Draw row 1
    await drawFieldSet({ ...parms, fldName: [ 'Name' ], fldValue:fullname });
    await drawFieldSet({ ...parms, fldName: [ 'Title' ], fldValue:title });
    _return(16);

    // Draw row 2
    await drawFieldSet({ ...parms, fldName: [ 'Email' ], fldValue:email });
    await drawFieldSet({ ...parms, fldName: [ 'Phone' ], fldValue:phone_number });
    _return(20);
  }

  private drawUsers = async () => {
    const { data, data: { entity: { users:otherUsers } }, drawUser } = this;
    const tommorow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const allUsers = [ ...otherUsers, data as User ];
    
    // Find the Administrative Support Professional
    let asp = allUsers.find(u => u.role === Roles.RE_ADMIN) ?? { role: Roles.RE_ADMIN } as User;   

    // Find the authorized individual who signed up first
    const ais = allUsers.filter(u => u.role === Roles.RE_AUTH_IND);
    const ai1 = ais.reduce((acc, u) => {
      const { create_timestamp: d1 } = u;
      const { create_timestamp: d2 } = acc;
      const date1 = new Date( d1 ?? tommorow);
      const date2 = new Date( d2 ?? tommorow);
      return date2 > date1 ? u : acc;
    }, { role:Roles.RE_AUTH_IND } as User) as User;

    // Find the other authorized individual
    const ai2 = ais.find(u => u.email !== ai1.email) ?? { role:Roles.RE_AUTH_IND } as User;

    // Find the delegate for the first authorized individual
    const delegate1 = ai1.delegate ?? {};

    // Find the delegate for the second authorized individual
    const delegate2 = ai2.delegate ?? {};

    await drawUser(asp, 0, 1);

    await drawUser(ai1, 1, 2);

    await drawUser(ai2, 2, 2);

    await drawUser(delegate1 as User, 1, 3);

    await drawUser(delegate2 as User, 2, 3);
  }

  /**
   * Draw a single table cell for a field title and another table cell adjacent to the right for the field value.
   * @param fldset 
   */
  private drawFieldSet = async (fldset:FieldSet) => {
    let size = 10;
    const { page, page: { basePage }, boldfont, font } = this;
    const { fldName, fldValue, fldNameWidth, fldWidth, height } = fldset;
    await new Rectangle({
      text: fldName,
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height },
      textOptions: { size, font:boldfont },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth);    
    
    await new Rectangle({
      text: fldValue,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    basePage.moveRight(fldWidth); 
  }

  private drawDisclaimerPart1 = async () => {
    const { page, boldfont, data: { privacyHref }, _return } = this;
    const size = 10;
    _return(16);
    const text = 
      `<i>Your organization’s representatives are its above-listed ${roleFullName(Roles.RE_ADMIN)}` +
      `and its ${roleFullName(Roles.RE_AUTH_IND)}s, who are also the contacts for responses to Disclosure Requests. ` +
      'Registering your organization to use ETT also means that in your official and personal capacities you ' +
      `have read and agree to the ETT Privacy Notice and Privacy Policy: ${privacyHref}, and consent on your own and ` +
      'your organization’s behalf to inclusion of your organization’s name, with or without its ' +
      'representative(s) name and contact information (as reflected above) on the ETT database and in ' +
      'ETT-related communications, factually stating that your organization is or was registered to use ' +
      'ETT or is or was an ETT-Registered Entity. This agreement and consent includes but is not limited ' +
      'to putting your organization’s name, with or without its representative(s)’ names and contact</i>';
    await page.drawWrappedText({
      text,
      options: { size, font:boldfont, color:red, lineHeight: 12 },
      linePad: 2
    });
    _return(16);
  }

  private drawDefinitions = async () => {
    const { page: { drawWrappedText, basePage, margins }, font, _return } = this;
    const defs = [
      `${roleFullName(Roles.RE_ADMIN)} who assists and directly works with one or both of the Authorized ` +
      'Individuals, is accustomed to maintaining confidential and sensitive information, and can ' +
      'administratively support the Registered Entity’s use of ETT, including submitting requests for ' +
      `disclosures when directed by an ${roleFullName(Roles.RE_AUTH_IND)}.`,

      'Person in a senior role that is accustomed to managing confidential and sensitive information, who ' +
      'will make Disclosure Requests and directly receive the completed Disclosure Form information on ' +
      'behalf of the Requesting Registered Entity and will decide who at the Registered Entity needs the ' +
      'information',

      'These are the contacts who will respond to Disclosure Requests from another ETT-Registered Entity ' +
      'when your organization is disclosing its findings of misconduct against a person who is being ' +
      'considered by the other ETT-Registered Entity. You may input “same as [specify Authorized ' +
      `Individuals or ${roleFullName(Roles.RE_ADMIN)}]” it these individuals will fulfill the ` +
      'Disclosure Response Contact role too'
    ]

    _return(2);

    basePage.drawLine({ 
      start: { x: margins.left, y: basePage.getY() + 12 }, 
      end: { x: 200, y: basePage.getY() + 12 }, 
      thickness: 1 
    });

    _return(2);

    for(let i=0; i<defs.length; i++) {
      const def = defs[i];
      await drawWrappedText({
        text: `<b><sup>${i+1}</sup></b> ${def}`, 
        options: { size: 8, font },
        linePad: 2
      });
      _return(8);
    }
  }

}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/RegistrationFormEntityPage1.ts')) {

  const outputfile = './lib/lambda/_lib/pdf/RegistrationFormEntityPage1.pdf';
  // const data = getSampleData();
  const data = getBlankData();

  new RegistrationFormEntityPage1(data).writeToDisk(outputfile)
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}