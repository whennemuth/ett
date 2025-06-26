import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { bugsbunny, daffyduck, yosemitesam } from "../../functions/authorized-individual/MockObjects";
import { roleFullName, Roles, User } from "../dao/entity";
import { DisclosureFormData, DisclosureFormDrawParms } from "./DisclosureForm";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Rectangle } from "./lib/Rectangle";
import { DrawWrappedTextParameters } from "./lib/Text";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";

const blue = rgbPercent(47, 84, 150) as Color;
const lightblue = rgbPercent(180, 198, 231) as Color;
const red = rgbPercent(255, 0, 0);
const grey = rgb(.1, .1, .1) as Color;
const white = rgb(1, 1, 1) as Color;

export class DisclosureFormPage1 extends PdfForm implements IPdfForm {
  private data:DisclosureFormData;
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(data:DisclosureFormData) {
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

  public draw = async (drawParms:DisclosureFormDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { pageMargins, drawLogo, drawTitle, drawConsenter, drawRequestingEntity, drawDisclosingEntity1 } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawTitle();

    await drawConsenter();

    await drawRequestingEntity();

    await drawDisclosingEntity1();
  }


  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('ETT Disclosure Form', { size:10, font }, 8);
  }
  
  /**
   * Draw the table for consenter information.
   */
  private drawConsenter = async () => {
    let size = 10;
    const {page, page: { basePage, bodyWidth }, boldfont, font, _return, getFullName, data } = this;
    const { consenter: { firstname, middlename, lastname, email, phone_number } } = data;

    basePage.moveDown(16);

    // Draw the table header row
    await new Rectangle({
      text: `Individual Who Consented to Disclosures via this Disclosure Form (“${roleFullName(Roles.CONSENTING_PERSON)}”):`,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:blue, width:bodyWidth, height:16 },
      textOptions: { size, font:boldfont, color: white },
      margins: { left: 8 } as Margins
    }).draw();
    _return();      
    basePage.moveDown(16);

    // Draw the consenter fullname row of the table
    let fldNameWidth = 105;
    let fldWidth = (bodyWidth - fldNameWidth);
    await new Rectangle({
      text: 'Full Name',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font:boldfont },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth);    

    await new Rectangle({
      text: getFullName(firstname, middlename, lastname),
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    _return();
    basePage.moveDown(16);

    // Draw the consenter email and phone row of the table
    fldWidth = (bodyWidth - fldNameWidth * 2)/2;
    await new Rectangle({
      text: 'Email Address',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font:boldfont },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth); 

    await new Rectangle({
      text: email,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    basePage.moveRight(fldWidth);

    await new Rectangle({
      text: 'Phone Number (cell)',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font:boldfont },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth);

    await new Rectangle({
      text: phone_number!,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    _return();
    basePage.moveDown(52);    
  }

  
  private drawAuthorizedIndividual = async (number:string, authInd:User, roleName:string) => {
    let size = 10;
    const { page, page: { basePage, bodyWidth }, font, _return } = this;
    const { delegate } = authInd;
    const rep = delegate ?? authInd;

    await new Rectangle({
      text: `${roleName} #${number}`,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { color:grey, opacity:.2, borderWidth:1, borderColor:blue, width:bodyWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 8 } as Margins
    }).draw();
    _return();
    basePage.moveDown(16);

    let fldNameWidth = 65;
    let fldWidth = (bodyWidth - fldNameWidth * 2)/2;
    await new Rectangle({
      text: 'Name',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth); 

    await new Rectangle({
      text: rep.fullname ?? '',
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    basePage.moveRight(fldWidth);

    await new Rectangle({
      text: 'Title',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth);

    await new Rectangle({
      text: rep.title!,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    _return();
    basePage.moveDown(16);

    await new Rectangle({
      text: 'Phone',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth); 

    await new Rectangle({
      text: rep.phone_number! || '',
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    basePage.moveRight(fldWidth);

    await new Rectangle({
      text: 'Email',
      page,
      align: Align.right,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:lightblue, width:fldNameWidth, height:16 },
      textOptions: { size, font },
      margins: { right: 4 } as Margins
    }).draw();
    basePage.moveRight(fldNameWidth);

    await new Rectangle({
      text: rep.email,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:fldWidth, height:16 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    _return();
    basePage.moveDown(16);
  }

  private drawRequestingEntity = async () => {
    let size = 10;
    const { page, page: { basePage, bodyWidth }, pageMargins, font, _return, data, drawAuthorizedIndividual } = this;
    const { requestingEntity } = data!;

    // Draw the table header row
    await new Rectangle({
      text: [ "<b>Requesting Entity —</b><i> ETT-Registered Entity requesting a</i>", "<i>completed Disclosure Form</i>" ],
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:blue, width:(bodyWidth/2 + 20), height:36 },
      textOptions: { size, font, color: white },
      margins: { left: 8 } as Margins
    }).draw();
    basePage.moveRight(bodyWidth/2 + 20);

    await new Rectangle({
      text: requestingEntity.name,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:(bodyWidth/2 - 20), height:36 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    _return();
    basePage.moveDown(36);

    await new Rectangle({
      text: [ 
        `<b>${roleFullName(Roles.RE_AUTH_IND)}(s) — </b><i>Person(s) in senior role(s) that deal with sensitive information, who will directly view the</i>`, 
        "<i>completed Disclosure Form on behalf of the Requesting Entity</i>" ],
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { color:lightblue, borderWidth:1, borderColor:blue, width:bodyWidth, height:36 },
      textOptions: { size, font },
      margins: { left: 8 } as Margins
    }).draw();
    _return();
    basePage.moveDown(16);


    // If there is no second authorized individual, add a blank one as a stand-in.
    if(requestingEntity.authorizedIndividuals.length == 1) {
      requestingEntity.authorizedIndividuals.push({
        fullname: '', email: '', phone_number: '', title: ''
      } as User)
    }

    await drawAuthorizedIndividual('1', requestingEntity.authorizedIndividuals[0], `${roleFullName(Roles.RE_AUTH_IND)}`);

    await drawAuthorizedIndividual('2 <i>(if any)</i>', requestingEntity.authorizedIndividuals[1], `${roleFullName(Roles.RE_AUTH_IND)}`);

    basePage.moveDown(80);
    await new Rectangle({
      text: [ 'The Requesting Entity may use disclosures made in this Disclosure Form <b>only</b> in connection with Privilege(s)',  
        ' or Honor(s), Employment or Role(s)'],
      page,
      align: Align.left,
      valign: VAlign.top,
      options: { color:grey, opacity:.2, borderWidth:1, borderColor:blue, width:bodyWidth, height:96 },
      textOptions: { size, font },
      margins: { left: 8, top:6 } as Margins
    }).draw();
    _return();

    basePage.moveUp(52);
    basePage.moveRight(8);    
    await page.drawWrappedText(
      { 
        text: '<i>Examples of <b>Privilege(s) or Honor(s)</b> include but are not limited to: elected fellow, ' + 
          'elected or life membership; recipient of an honor, award, or an emeritus or endowed ' + 
          'role; elected or appointed governance, committee, officer, or leadership role. However, ' + 
          'Privileges  <b>DO NOT</b> include basic membership in an academic, professional, or honorary ' + 
          'society at an individual’s initiative (i.e., when not elected or awarded).  Examples ' + 
          'of <b>Employment or Roles</b> include but are not limited to: employment; employee appointment ' + 
          'or assignment to a supervisory, evaluative, or mentoring role. Other Privileges or Honors (e.g., ' +
          'volunteer roles) and other Employment-related roles and decisions that an ETT-Registered Entity ' + 
          'identifies as affecting climate and culture may be included.</i>',
        options: { size: 8, font } as PDFPageDrawTextOptions,
        horizontalRoom: (basePage.getWidth() - pageMargins.left - pageMargins.right - 16),
        linePad: 0
      } as DrawWrappedTextParameters
    );
  }

  private drawDisclosingEntity1 = async () => {
    let size = 10;
    const { page, page: { basePage, bodyWidth }, font, boldfont, _return, data, drawAuthorizedIndividual } = this;
    const { disclosingEntity } = data!;

    _return();
    basePage.moveDown(56);   

    // Draw the table header row
    await new Rectangle({
      text: [ "<b>Disclosing Entity —</b> <i>Entity that completes this Disclosure</i>", "<i>Form</i>" ],
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:blue, width:(bodyWidth/2 + 20), height:36 },
      textOptions: { size, font, color: white },
      margins: { left: 8 } as Margins
    }).draw();
    basePage.moveRight(bodyWidth/2 + 20);

    await new Rectangle({
      text: disclosingEntity.name,
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:(bodyWidth/2 - 20), height:36 },
      textOptions: { size, font },
      margins: { left: 4 } as Margins
    }).draw();
    _return();
    basePage.moveDown(36);

    await new Rectangle({
      text: [ 
        "<b>Representative(s) — </b><i>Person(s) in senior role(s) that deal with sensitive information and have broad institutional</i>", 
        "<i>knowledge, who will fill out this Disclosure Form on behalf of the Disclosing Entity</i>" ],
      page,
      align: Align.left,
      valign: VAlign.middle,
      options: { color:lightblue, borderWidth:1, borderColor:blue, width:bodyWidth, height:36 },
      textOptions: { size, font },
      margins: { left: 8 } as Margins
    }).draw();
    _return();
    basePage.moveDown(16);


    // If there is no second authorized individual, add a blank one as a stand-in.
    if(disclosingEntity.representatives.length == 1) {
      disclosingEntity.representatives.push({
        fullname: '', email: '', phone_number: '', title: ''
      } as User)
    }

    await drawAuthorizedIndividual('1', disclosingEntity.representatives[0], 'Authorized Representative');

    await drawAuthorizedIndividual('2 <i>(if any)</i>', disclosingEntity.representatives[1], 'Authorized Representative');

    // Draw the "IMPORTANT" rectangle
    basePage.moveDown(110);
    await new Rectangle({
      text: "<b>IMPORTANT:</b>",
      page,
      align: Align.left,
      valign: VAlign.top,
      options: { color:grey, opacity:.2, borderWidth:1, borderColor:blue, width:bodyWidth, height:126 },
      textOptions: { size, font, color:red },
      margins: { top: 8, left: 8 } as Margins
    }).draw();
    _return();

    // Move back up to the top of the rectangle
    basePage.moveUp(92);
    basePage.moveRight(8);

    // Draw the first 3 items in the IMPORTANT rectangle
    const msgs = [
      '1) A Disclosing Entity need not be an ETT-Registered Entity. However, if the Disclosing Entity is also an',
      '    ETT-Registered Entity, its Authorized Representatives to make disclosures will be its Authorized',
      '    Individuals or Contacts for Disclosure Request Responses designated in its ETT Entity Registration Form.',
      '2) The Disclosing Entity’s response(s) in this form are based only on what its representative(s) (above) know,',
      '    as they confer with the offices that they know maintain the official records that they think are likely',
      '    to be most relevant. The representative(s) will not necessarily check all potential sources of such records',
      '    but rather the known repository of official records.',
      '3) Note that a Disclosing Entity will not necessarily have policies addressing all of the kinds of',
      '    misconduct listed on this Form.',
    ]
    for(let i=0; i<msgs.length; i++) {
      await page.drawText(msgs[i], { size:9.5, font:boldfont }, 0);
      _return;
      if(i < msgs.length -1 && /^\d+\)/.test(msgs[i+1])) {
        basePage.moveDown(4);
      }
    }
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/DisclosureFormPage1.ts')) {
  
  new DisclosureFormPage1(
    {
      consenter: { 
        email: 'foghorn@warnerbros.com', phone_number: '617-222-4444', 
        firstname: 'Foghorn', middlename: 'F', lastname: 'Leghorn' 
      },
      disclosingEntity: { name: 'Boston University', representatives: [ daffyduck, yosemitesam ] },
      requestingEntity: { name: 'Northeastern University', authorizedIndividuals: [ bugsbunny ] }
    } as DisclosureFormData).writeToDisk('./lib/lambda/_lib/pdf/disclosureForm1.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}