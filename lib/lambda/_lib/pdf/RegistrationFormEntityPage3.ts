import { writeFile } from "fs/promises";
import { Color, PageSizes, PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, rgb, StandardFonts } from "pdf-lib";
import { roleFullName, Roles } from "../dao/entity";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Align, drawButton, Margins, rgbPercent, VAlign } from "./lib/Utils";
import { IPdfForm, PdfForm } from "./PdfForm";
import { RegistrationFormEntityDrawParms } from "./RegistrationFormEntity";

export type RegistrationFormEntityPage3Parms = {
  termsHref:string,
  dashboardHref:string,
  signedDateISOString?:string,
  registrationSignature?:string
}

const red = rgbPercent(255, 0, 0);
const white = rgb(1, 1, 1) as Color;


export class RegistrationFormEntityPage3 extends PdfForm implements IPdfForm {
  private font:PDFFont;
  private boldfont:PDFFont;
  private parms:RegistrationFormEntityPage3Parms;

  constructor(parms:RegistrationFormEntityPage3Parms) {
    super();
    this.parms = parms;;
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
    const { pageMargins,  } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    const { page, drawLogo, drawOuterBox, drawOuterBoxContent, drawInnerBox, drawInnerBoxContent, drawDefinitions } = this;

    await drawLogo(page);

    await drawOuterBox();

    await drawOuterBoxContent();

    await drawInnerBox();

    await drawInnerBoxContent();

    await drawDefinitions();

    this.page.setLinkAnnotations();
  }

  private drawBox = async (boxHeight:number, marginOverflow:number, borderWidth:number) => {
    const { page, page: { bodyWidth, margins }, font, _return } = this;

    _return(boxHeight);

    const x = margins.left - marginOverflow;
    const width = bodyWidth + 2 * marginOverflow;

    await page.drawRectangle({
      text:'',
      page,
      margins: { left:6, top:6, bottom:6, right:6 },
      align: Align.center,
      valign: VAlign.top,
      options: { x, borderWidth, borderColor:red, width, height:boxHeight },
      textOptions: { size:10, font, lineHeight:14 },
    });

    _return(-boxHeight);
  }

  private drawOuterBox = async () => {
    await this.drawBox(630, 8, 2);
  }

  private drawInnerBox = async () => {  
    await this.drawBox(76, 0, 1)
  }

  private drawOuterBoxContent = async () => {
    const { parms: { termsHref }, page, page: { basePage, bodyWidth }, font, boldfont, _return } = this;

    _return(16);
    await page.drawCenteredText(
      '<u>IMPORTANT TERMS OF USE FOR ENTITIES REGISTERING TO USE ETT</u>',
      { font:boldfont, size:10, lineHeight:14 }
    )

    _return(4);
    await page.drawCenteredText(
      `<i>(Also posted at <u><a>${termsHref}</a></u>)</i>`,
      { font, size:8, lineHeight:14 }
    )

    _return(4);

    type BulletParms = { 
      header:string, 
      headerOptions:PDFPageDrawTextOptions, 
      body:string, 
      bodyOptions:PDFPageDrawTextOptions 
    };

    const drawBulletedItem = async (parms:BulletParms) => {
      const { header, headerOptions, body, bodyOptions } = parms;
      _return(16);

      // Draw the line with the bullet
      basePage.moveRight(10);
      basePage.drawText('· ', { font:boldfont, size:24, lineHeight:14 });
      basePage.moveRight(10);
      basePage.moveUp(4);
      await page.drawWrappedText({ text:header, options:headerOptions, linePad: 8, horizontalRoom: bodyWidth - 20 });
      basePage.moveDown(2);

      // Draw the line(s) directly below the bulleted line.
      await page.drawWrappedText({ text:body, options:bodyOptions, linePad: 2, horizontalRoom: bodyWidth - 40 });
    }

    await drawBulletedItem({
      header: 'EACH ETT-REGISTERED ENTITY MUST MAKE INDEPENDENT DECISIONS AND POLICIES.',
      headerOptions: { font:boldfont, color:red, size:9, lineHeight:14 },
      body: 
        'ETT is just an automation tool that any ETT-Registered Entity may use, in its discretion, to ' +
        'get individuals’ consents to disclosures of findings of misconduct about them and to make ' +
        'disclosures requests to the entities that may have made or adopted findings. ETT does <b>not</b> ' +
        'receive any disclosures or conduct records.  It is <b>not</b> a policy and does <b>not</b> dictate or guide ' +
        'decisions or policies, including, e.g., for which Privileges or Honors, Employment or Role(s) ' +
        '<sup>4</sup> ETT is used, how to weigh findings, or who is qualified or should be selected.'
      ,
      bodyOptions: { font, size:9, lineHeight:12 }
    });

    await drawBulletedItem({
      header: 
        `${roleFullName(Roles.RE_AUTH_IND)}s (AIs) and any Contacts for Disclosure Request Responses ` +
        'should be in senior institutional roles,',
      headerOptions: { font, size:9, lineHeight:14 },
      body: 
        'accustomed to managing sensitive and confidential information, and knowledgeable about the ' +
        `ETT-Registered Entity. ${roleFullName(Roles.RE_ADMIN)}s (ASPs) should also be accustomed to ` +
        'managing sensitive and confidential information. An ETT-Registered Entity determines these roles/people.',
      bodyOptions: { font, size:9, lineHeight:12 }
    });

    await drawBulletedItem({
      header: 
        'Either ETT-Registered Entity’s AI may update who is an AI or ASP. However, ETT will send ' +
        'a copy of the',
      headerOptions: { font, size:9, lineHeight:14 },
      body: 
        'change to the other AI and ASP (at least one) serving at the time ' +
        'for security of the information. ETT will also copy the removed AI or ASP.'
      ,
      bodyOptions: { font, size:9, lineHeight:12 }
    });

    await drawBulletedItem({
      header: 
        'The ASP may initiate Disclosure Requests in ETT only when directed by an AI. ASPs will be ' +
        'blind copied',
      headerOptions: { font, size:9, lineHeight:14 },
      body: 
        'on Disclosure Requests to aid AIs in tracking. <b>Only</b> AIs are visibly copied on Disclosure  ' +
        'Requests and should be the <b>direct recipients</b> of completed Disclosure Forms from other entities. ' +
        'AIs will decide who within the ETT-Registered Entity needs the disclosed information ' +
        '(or will confer with the person who has that authority). <b>Each ETT-Registered Entity ' +
        'creates its internal processes to satisfy all terms of use.</b>'
      ,
      bodyOptions: { font, size:9, lineHeight:12 }
    });

    await drawBulletedItem({
      header: 
        'Completed Consent Forms, Exhibit Forms, and Disclosure Forms must be used by an ETT-Registered ' +
        'Entity <b>only</b>',
      headerOptions: { font, size:9, lineHeight:14 },
      body: 'in connection with Privilege(s) or Honor(s), Employment or Role(s). <sup>4</sup>',
      bodyOptions: { font, size:9, lineHeight:12 }
    });

    await drawBulletedItem({
      header: 
        'ETT-Registered Entities must not share <b>completed</b> Registration, Consent, Exhibit, or Disclosure ' +
        'Forms (or the information',
      headerOptions: { font, size:9, lineHeight:14 },
      body: 
        'called for under the Disclosure Form) that they <b>receive or access</b> with other ' +
        'entities (third parties). ETT-Registered Entities may access Consent Forms on ETT, while a ' +
        'Consent is in effect.'
      ,
      bodyOptions: { font, size:9, lineHeight:12 }
    });

    await drawBulletedItem({
      header: 
        '<b>No warranties of any kind are made concerning ETT.</b> Each ETT-Registered Entity determines ' +
        'the uses of',
      headerOptions: { font, size:9, color:red, lineHeight:14 },
      body: 
        'ETT that are operationally and legally appropriate for it and waives and releases all claims and liabilities ' +
        'of every kind (except intentional harm) that are associated with ETT, against the Societies ' +
        'Consortium to End Harassment in STEMM, EducationCounsel LLC, the American Association for ' +
        'the Advancement of Science (AAAS), and each owner, designer, developer, host, sponsor, ' +
        'advisor, agent, contractor, administrator and/or operator of ETT, their respective ' +
        'predecessors, successors, and assigns (and their respective current, former, and future ' +
        'directors/trustees/managers, officers, members/stockholders/partners, personnel, agents, ' +
        'contractors, and representatives). <b>ETT’s owner (AAAS) or its designee, or an ETT-Registered ' +
        'Entity, may terminate the ETT-Registered Entity’s participation in ETT, with or without ' +
        'cause, upon written notice by the terminating party to the other party</b>'
      ,
      bodyOptions: { font, size:9, color:red, lineHeight:12 }
    });
  }

  private drawInnerBoxContent = async () => {
    const { 
      page, page: { basePage }, font, boldfont, _return, 
      parms: { signedDateISOString= new Date().toISOString(), dashboardHref, registrationSignature='' } 
    } = this;

    if( ! registrationSignature) {
      return this.drawBlankInnerBoxContent();
    }

    // Cannot use the signature and the signed date because this form might be used in the context of an 
    // email attachment, where these value are for the last person to register, but the form is being copied
    // to all entity members. This can only be corrected if we stop CC'ing and send priviate emails to each
    // person who registers, which is not the current design.
    const signedDate = new Date(signedDateISOString).toUTCString();
    const signature = registrationSignature ? `<u>  ${registrationSignature}     </u>` : '____________________';

    _return(16);

    await page.drawCenteredText(
      'Signed, dated and submitted',
      { font:boldfont, size:10, color:red, lineHeight:14, }
    );

    basePage.moveDown(8);
    await page.drawCenteredText(
      'This signature confirms your agreement on behalf of yourself and the Registered Entity to these terms',
      { font, size:10, color:red, lineHeight:14, }
    );

    basePage.moveDown(2);
    await page.drawCenteredText(
      'and your authority to do so.',
      { font, size:10, color:red, lineHeight:14, }
    );

    basePage.moveDown(8);
    await page.drawCenteredText(
      `You may terminate this registration at any time <u><a href="${dashboardHref}">here</a></u>`,
      { font:boldfont, size:10, color:red, lineHeight:14, }
    );
  }

  private drawBlankInnerBoxContent = async () => {
    const { page, page: { basePage }, font, boldfont, _return, parms: { dashboardHref } } = this;

    _return(16);
    await page.drawCenteredText(
      `<b>[  ] Check here, type your name below, and submit, to digitally sign this Registration Form</b> on behalf`,
      { font, size:10, color:red, lineHeight:14, }
    );

    basePage.moveDown(2);
    await page.drawCenteredText(
      'of the Registered Entity and to agree on its and your behalf to these terms, register and your authority to do so.',
      { font, size:10, color:red, lineHeight:14, }
    );

    basePage.moveDown(8);
    await page.drawCenteredText(
      `Sign, date, and click on SUBMIT: ____________________`,
      { font:boldfont, size:10, color:red, lineHeight:14, }
    );

    basePage.moveDown(8);
    await page.drawCenteredText(
      `You may terminate this registration at any time <u><a href="${dashboardHref}">here</a></u>`,
      { font:boldfont, size:10, color:red, lineHeight:14, }
    );

    await drawButton(this, {
      text: 'SUBMIT',
      buttonHeight: 30,
      textSize: 12,
      font,
      boldfont,
      color: red,
      textColor: white,
      newline: false,
      x: basePage.getWidth() - 106,
      y: basePage.getY() + 4,
      lineHeight: 4,
    });
  }

  private drawDefinitions = async () => {
    const { page: { drawWrappedText, basePage, margins }, font, _return } = this;

    _return(28);

    basePage.drawLine({ 
      start: { x: margins.left, y: basePage.getY() + 12 }, 
      end: { x: 200, y: basePage.getY() + 12 }, 
      thickness: 1 
    });

    const def = 'Examples of <b>Privilege(s) or Honor(s)</b> include but are not limited to: elected fellow, ' +
      'elected or life membership; recipient of an honor, award, or an emeritus or endowed role; ' +
      'elected or appointed governance, committee, officer, or leadership role. However, Privileges or Honors ' +
      ' <b><u>do not</u></b> include basic membership in an academic, professional, or honorary society at an ' +
      'individual’s initiative (i.e., when not elected or awarded). Examples of <b>Employment or Roles</b> ' +
      'include but are not limited to: employment; employee appointment or assignment to a ' +
      'supervisory, evaluative, committee, or mentoring role. Other privileges (e.g., volunteer roles) ' +
      'and employment-related roles and decisions that the Requesting Entity identifies as affecting ' +
      'climate and culture may be included.'

    await drawWrappedText({
      text: `<b><sup>4</sup></b> ${def}`, 
      options: { size: 8, font },
      linePad: 2
    });
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/RegistrationFormEntityPage3.ts')) {

  const outputfile = './lib/lambda/_lib/pdf/RegistrationFormEntityPage3.pdf';
  const termsHref = `https://d227na12o3l3dd.cloudfront.net/terms`;
  const dashboardHref = `https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm?action=start-login&selected_role=${Roles.CONSENTING_PERSON}`;
  
  const blankForm = true;
  const parms = { termsHref, dashboardHref } as RegistrationFormEntityPage3Parms;
  if( ! blankForm ) {
    parms.signedDateISOString = (new Date().toISOString());
    parms.registrationSignature = 'My Signature';
  }
  new RegistrationFormEntityPage3(parms).writeToDisk(outputfile)
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}