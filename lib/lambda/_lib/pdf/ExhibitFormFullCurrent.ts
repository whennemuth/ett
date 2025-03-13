import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
import { IContext } from '../../../../contexts/IContext';
import { log } from '../../Utils';
import { Configurations } from '../config/Config';
import { AffiliateTypes, ExhibitFormConstraints, FormTypes } from '../dao/entity';
import { blue, ExhibitForm, ExhibitFormParms, getSampleAffiliates, red, SampleExhibitFormParms } from './ExhibitForm';
import { IPdfForm, PdfForm } from './PdfForm';
import { Page } from './lib/Page';
import { Align, VAlign } from './lib/Utils';

/**
 * This class represents an exhibit pdf form that can be dynamically generated around the provided exhibit data.
 */
export class ExhibitFormFullCurrent extends PdfForm implements IPdfForm {
  private baseForm:ExhibitForm
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(baseForm:ExhibitForm) {
    super();
    this.baseForm = baseForm;
    this.page = baseForm.page;
  }

  public static getBlankForm = (): IPdfForm => {
    const { EMPLOYER_PRIMARY, EMPLOYER } = AffiliateTypes;
    return new ExhibitFormFullCurrent(ExhibitForm.getBlankForm(
      FormTypes.FULL, [ EMPLOYER_PRIMARY, EMPLOYER ]
    ));
  }

  public static getInstance = (parms:ExhibitFormParms): IPdfForm => {
    parms.data.constraint = ExhibitFormConstraints.CURRENT;
    parms.data.formType = FormTypes.FULL;
    return new ExhibitFormFullCurrent(new ExhibitForm(parms));
  }

  public set consentFormUrl(url:string) {
    this.baseForm.consentFormUrl = url;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {
    const { baseForm, drawTitle, drawIntro, drawLogo, drawRedBox, drawOrderedItems, drawReadyForSubmission } = this;

    await baseForm.initialize();

    const { doc, embeddedFonts, pageMargins, font, boldfont, drawAffiliateGroup, drawSignature } = baseForm;
    
    this.doc = doc;
    this.embeddedFonts = embeddedFonts;
    this.pageMargins = pageMargins;
    this.font = font;
    this.boldfont = boldfont;
    this.page = new Page(doc.addPage([620, 785]) as PDFPage, this.pageMargins, this.embeddedFonts);
    baseForm.page = this.page;
    
    await drawLogo(this.page);

    await drawTitle();

    await drawIntro();

    await drawAffiliateGroup({ 
      affiliateType:AffiliateTypes.EMPLOYER_PRIMARY, 
      title:'Current Employer(s) and Appointing Organizations<sup>1</sup>',
      orgHeaderLines: [ 'Primary Current Employer' ]
    });

    await drawAffiliateGroup({ 
      affiliateType:AffiliateTypes.EMPLOYER, 
      orgHeaderLines: [ 
        'Other Current Employer /',
        'Appointing Organization'
      ]
    });

    await drawRedBox();

    await drawOrderedItems();

    await drawSignature('full exhibit Form');

    await drawReadyForSubmission();

    const pdfBytes = await doc.save();
    return pdfBytes;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('Current Employer(s) Exhibit Form – Consent Recipient(s)/Affiliate(s)', { size:10, font }, 8);
  }

  /**
   * Draw the introductory language
   */
  private drawIntro = async () => {
    const { 
      baseForm: { consentFormUrl, consenter: { firstname, middlename, lastname } }, 
      page: { basePage, drawWrappedText, drawCenteredText }, font, boldfont, _return, getFullName 
    } = this;
    let fullname = getFullName(firstname, middlename, lastname);
    fullname = fullname ? `my <i>(${fullname})</i>` : 'my';
    const size = 9;

    await drawWrappedText({ 
      text: `<b>This Current Employer(s) Exhibit Form is incorporated into ${fullname} Consent Form, at:</b>`, 
      options: { size, font }, linePad: 4, padBottom: 6 
    });

    await drawCenteredText(
      consentFormUrl, 
      { font:boldfont, size:8, color:blue, lineHeight:14 }
    );
    _return();

    basePage.moveDown(8);
    await drawWrappedText({ 
      text: `<b>This Exhibit Form provides an up-to-date list of the name(s) and ` +
        `contact(s) for my known Current Employers and other Organizations where I hold appointments on ` +
        `the date of this Exhibit.  They are among my <u>Consent Recipients (also called Affiliates).</u> ` +
        `The definitions in the Consent Form also apply to this Exhibit Form.</b>   <u>My known Consent Recipients ` +
        `that are my <b>Current</b> Employer(s) and Appointing Organization(s) are:</u>`, 
      options: { size, font }, linePad: 4 
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
    const { page: { 
      basePage, bodyWidth, drawTextOffset, drawWrappedText, drawCenteredText 
    }, font, boldfont, _return } = this;
    const size = 9;
    const horizontalRoom = bodyWidth - 32;

    await drawTextOffset('<b><sup>1</sup></b>List your <b>current</b> employer(s). ',
      { size, font }, () => 8, 16);

    _return(36);
    basePage.moveRight(8);
    await drawWrappedText({
      text: 'Also list organizations where you <b>currently</b> hold emeritus/emerita, visiting, or other ' +
        'teaching, research, or administrative appointments one two three four five six seven. ',
      options: { size, font }, linePad: 2, padBottom: 14, horizontalRoom
    });

    await drawWrappedText({
      text: 'For each one, list up to date contacts of the type (e.g., HR, supervisor, department head) ' +
        'specified by the ETT-Registered Entity (“Registered Entity”) that is considering you for a ' + 
        '<u>Privilege or Honor</u>, <u>Employment or Role</u> at this time. ',
      options: { size, font }, linePad: 2, padBottom: 20, horizontalRoom
    });

    await drawCenteredText(
      'Do <u>not</u> list your <u>prior</u> employer(s) or appointing organization(s) on this form.',
      { size:13, font:boldfont }    
    );

    _return();
  }

  private drawRedBox = async () => {
    const { drawRedBoxBorder, fillRedBox, page: { nextPageIfNecessary } } = this;
    const boxHeight = 130;
    nextPageIfNecessary(boxHeight);
    await drawRedBoxBorder(boxHeight, 0);
    await fillRedBox();
  }

  private drawOrderedItems = async () => {
    const { page: { 
      bodyWidth, drawWrappedText, drawText, nextPageIfNecessary 
    }, font, boldfont, _return, baseForm: { entityName, getStaleEntityPeriod, getSecondReminderPeriod, drawOrderedItem } } = this;
    let basePage = this.page.basePage;

    basePage = nextPageIfNecessary(32);

    _return(40);
    await drawText(
      'I direct the Ethical Transparency Tool (“ <u>ETT</u>”) to do the following and consent to it doing so:', 
      { size:9, font:boldfont }, 16);

    await drawOrderedItem({
      paragraphs: [ { text: 'Transmit this “Current Employer(s) Exhibit Form” on my behalf to my private page on ETT.   ' +
        'If I have more than one current employer and/or appointing organization, also transmit my ' + 
        '<u>“Single-Entity Exhibit Form”</u> for each of them to my private page on ETT. ',
      options: { size:9, font:boldfont } } ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: `<b>Also transmit this Current Employer(s) Exhibit Form on my behalf to</b> ` +
        `${entityName}, which is the ETT-Registered Entity that requested it (“ <u>Registered Entity</u>”) ` +
        `in connection with considering me for a Privilege or Honor, Employment or Role at this time.`,
      options: { size:9, font:boldfont } } ],
    });

    await drawOrderedItem({
      paragraphs: [
        {
          text: `<b><u>Within the next ${await getStaleEntityPeriod()}</u>—if the Registered Entity ` +
            'initiates transmittal(s) via ETT to my listed  Consent Recipient(s)/Affiliates, asking them ' +
            'to complete Disclosure Forms about me (“<u>Disclosure Request(s)</u>”), transmit the ' +
            'Disclosure Request(s),</b> copying the Registered Entity and me.  Each Disclosure Request ' +
            'will include my Consent Form and a blank Disclosure Form.',
          options: { size:9, font }
        },
        {
          text: 'If I have <u>only one</u> current employer or appointing authority and no others, the Disclosure ' +
            'Request will also include this Current Employer(s) Exhibit Form. If I have <u>more than one</u>, ' +
            'then instead of this Exhibit Form, each Disclosure Request will also include the relevant ' +
            'Single-Entity Exhibit Form (listing only the entity that is receiving it) so one employer or ' +
            'appointing entity is not notified of the others.',
          options: { size:9, font }
        },
        {
          text: `<b><u>Within the ${await getSecondReminderPeriod()} after sending the initial ` +
            'Disclosure Request(s)</u>—resend the Registered Entity’s Disclosure Request(s) twice ' +
            '(as reminders) to my Consent Recipients (current employer(s) and appointing organization(s)) ' + 
            'listed in this Exhibit Form,</b> copying the Registered Entity and me. <b>Then promptly ' +
            'delete the Disclosure Request(s), my Current Employer(s) Exhibit Form and any related ' +
            'Single Entity Exhibit Forms from ETT (as ETT will have completed its transmittal role).</b>',
          options: { size:9, font }
        }
      ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: '<u>I agree that my ETT Registration Form and Consent Form will remain in effect ' +
        'for use with these particular Disclosure Requests and the completed Disclosure Forms that my Consent ' +
        'Recipient(s) provide in response (even if my ETT Registration and Consent otherwise expire or are ' +
        'rescinded).</u>', 
        options: { size:9, font:boldfont } } ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: '<u>I agree that ETT has the right to identify me as the person who provided ' +
        'and authorized use of the name, title, email and phone number of the contacts I’ve listed for my ' +
        'Affiliates.</u>', 
        options: { size:9, font:boldfont } } ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: `If the Registered Entity does not initiate Disclosure Requests within the ` + 
        `${await getStaleEntityPeriod()} period provided, delete all of these Exhibit Forms from ETT.`, 
        options: { size:9, font:boldfont } } ]
    });

    _return(16);
    basePage = nextPageIfNecessary(60);
    await drawWrappedText({
      text: 'I agree that this electronic Current Employer(s) Exhibit Form and my electronic (digital) ' +
        'signature, and any copy will have the same effect as originals for all purposes. <b>I have had the ' +
        'time to consider and consult anyone I wish on whether to provide this Current Employer(s) ' +
        'Exhibit Form.  I am at least 18 years old and it is my knowing and voluntary decision to sign ' +
        'and deliver this Exhibit Form.</b>', 
      options: { size:9, font }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    });

    basePage = nextPageIfNecessary(50);
    await drawWrappedText({
      text: '____Check if applicable: My name has changed since my affiliation with one or more of ' +
        'the listed Consent Recipients/Affiliates above.  My prior name(s) known to them ' +
        'were:__________________________________________________________________ [insert names].',
      options: { size:9, font:boldfont }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    }); 
  }

  private drawReadyForSubmission = async () => {
    const { baseForm: { isBlankForm, drawBigRedButton }, page: { nextPageIfNecessary }, _return } = this;
    if( ! isBlankForm) {
      return;
    }

    let basePage = nextPageIfNecessary(100);
    _return(16);

    await drawBigRedButton({
      text: 'NEXT',
      descriptionHeight: 56,
      description: 'Click the Next Button to create, review, date, and digitally sign a Single-Entity ' +
        'Exhibit Form for each of your listed Consent Recipients (current employers and other current ' +
        'appointing organizations). If you have more than one current employer and/or appointing ' +
        'organization, you will not be able to submit any of your Current Employer(s) Exhibit Forms until ' +
        'you digitally sign all of them.'
    });

    const { 
      page: { 
        drawText, drawCenteredText, drawWrappedText, bodyWidth, margins
      }, 
      font, boldfont, baseForm: { drawBulletedItem }
    } = this;
    let horizontalRoom = bodyWidth - 20;
    basePage = nextPageIfNecessary(300);
    _return(32);

    await drawWrappedText({
      text: '<i>If you only have only one current employer (and no other appointing organizations) ' +
      'proceed to Ready for Submission.</i>',
      options: { size:9, font:boldfont, color:red  }, linePad: 6, padBottom: 18, horizontalRoom
    });

    _return(32);
    await drawCenteredText(
      '------------------------------------------------------------',
      { size:10, font:{ name:StandardFonts.CourierBold } as PDFFont }, 14
    );

    await drawCenteredText('Ready for Submission', { size:16, font }, 16);

    await drawWrappedText({
      text: '<i>You have digitally signed your Current Employer(s) Exhibit Form.</i>',
      options: { size:9, font:boldfont }, linePad: 6, padBottom: 20, horizontalRoom
    });

    await drawText('<u>NOTE: When you click “Submit”:</u>', { size:9, font:boldfont }, 16);

    await drawBulletedItem({
      paragraphs: [ { text: 'Your ETT Registration Form and Consent Form will not expire and you will ' +
        'not be able to rescind them or your Current Employer(s) or related Single Entity Exhibit Form(s) ' +
        'in connection with the Privilege or Honor, Employment or Role for which the listed ETT Registered ' +
        'Entity is considering you at this time.  Your Consent Recipients (Affiliates) will be relying on ' +
        'these forms to make disclosures to the Registered Entity.  Contact the Registered Entity directly ' +
        'if you want to withdraw from their consideration.', 
      options: { size:9, font:boldfont } 
    }] });

    await drawBulletedItem({
      paragraphs: [ { text: 'You may still rescind your ETT Registration Form and Consent Form to prevent ' +
        'their other use in the future; directions on how are here.', 
      options: { size:9, font } 
    }] });

    await drawBulletedItem({
      paragraphs: [ { text: 'After submission, to correct your Exhibit Form, directions are here.', 
      options: { size:9, font } 
    }] });

    await drawBigRedButton({
      text: 'SUBMIT',
      descriptionHeight: 26,
      description: 'Click the Submit Button to complete and submit your Current Employer(s) and any ' +
        'related Single Entity Exhibit Forms:'
    });
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

  public async readFromDisk(path:string) {
    const buf:Buffer = await readFile(path);
    const pdf = await PDFDocument.load(buf) as PDFDocument;
    log(pdf.catalog);
  }
}

const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitFormFullCurrent.ts')) {

  const testBlankForm = true;

  (async () => {

    // Load the app configs
    const context:IContext = await require('../../../../contexts/context.json');
    context.CONFIG.useDatabase = false;
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(context.CONFIG);
    process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';

    const form = testBlankForm ?
      ExhibitFormFullCurrent.getBlankForm() :
      ExhibitFormFullCurrent.getInstance(SampleExhibitFormParms([
        getSampleAffiliates().employerPrimary, 
        getSampleAffiliates().employer1,
        getSampleAffiliates().employer2
      ]));

    await form.writeToDisk('./lib/lambda/_lib/pdf/ExhibitFormFullCurrent.pdf');
    console.log(`done`);

  })();

}







