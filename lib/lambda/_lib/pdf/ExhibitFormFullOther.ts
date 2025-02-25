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
export class ExhibitFormFullOther extends PdfForm implements IPdfForm {
  private baseForm:ExhibitForm
  private font:PDFFont;
  private boldfont:PDFFont;

  public static getBlankForm = (): IPdfForm => {
    const { EMPLOYER_PRIOR, ACADEMIC, OTHER } = AffiliateTypes;
    return new ExhibitFormFullOther(ExhibitForm.getBlankForm(
      FormTypes.FULL, [ EMPLOYER_PRIOR, ACADEMIC, OTHER ]
    ));
  }

  public static getInstance = (parms:ExhibitFormParms): IPdfForm => {
    parms.data.constraint = ExhibitFormConstraints.OTHER;
    parms.data.formType = FormTypes.FULL;
    return new ExhibitFormFullOther(new ExhibitForm(parms));
  }

  constructor(baseForm:ExhibitForm) {
    super();
    this.baseForm = baseForm;
    this.page = baseForm.page;
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
    const { EMPLOYER_PRIOR, ACADEMIC, OTHER } = AffiliateTypes;
    
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
      affiliateType:EMPLOYER_PRIOR, 
      title: 'Prior Employers<sup>1</sup>',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
    });

    await drawAffiliateGroup({
      affiliateType:ACADEMIC, 
      title: 'Current and Prior Academic / Professional Societies & Organizations<sup>2</sup>',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
    });

    await drawAffiliateGroup({
      affiliateType:OTHER, 
      title: 'Other Organizations Where You Formerly Had Appointments<sup>3</sup>',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
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
    await page.drawCenteredText('Full Exhibit Form – Consent Recipients/Affiliates (<u>OTHER THAN</u> Current Employer(s))', { size:10, font }, 8);
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
      text: '<b>This Exhibit Form provides an up-to-date list of the names and contacts for my known ' +
      '<u>Consent Recipients</u> (also called Affiliates) on the date of this Exhibit Form—but NOT <u>my ' +
      'current employers and appointing organizations</u>.  The definitions in the Consent Form also apply ' +
      'to this Exhibit Form.</b> <u>My known Consent Recipient(s)</u> of the types covered by this form are:', 
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
      basePage, bodyWidth, drawWrappedText, drawCenteredText 
    }, font, boldfont, _return } = this;
    const size = 9;
    const horizontalRoom = bodyWidth - 32;

    _return(20);
    basePage.moveRight(8);
    await drawWrappedText({
      text: '<sup><b>1</b></sup>List your <b>former employers</b> for the period specified by the ETT-Registered ' +
        'Entity that requested this Exhibit Form (“Registered Entity”) and is considering you for ' +
        'a <u>Privilege or Honor</u>, <u>Employment or Role</u> at this time.   List up to date contacts of the ' +
        'type (e.g., HR, supervisor, department head) specified by that Registered Entity.',
      options: { size, font }, linePad: 2, padBottom: 14, horizontalRoom
    });

    await drawWrappedText({
      text: '<sup><b>2</b></sup>List your <b>current and former</b> academic, professional, and field-related ' +
        'honorary and membership societies and organizations, as well as organizations from which you ' +
        'have received an honor or award (same look-back period for former societies and organizations, ' +
        'as under <sup><b>1</b></sup> above).  Contact should be the Executive Director/CEO.',
      options: { size, font }, linePad: 2, padBottom: 20, horizontalRoom
    });

    await drawWrappedText({
      text: '<sup><b>3</b></sup>List the organizations where you <b>formerly</b> had — <b><u>but no longer</u></b> ' +
        'have—emeritus/emerita, visiting, or other teaching, research, or administrative appointments ' +
        '(same period and type of contact as under <sup><b>1</b></sup> above).',
      options: { size, font }, linePad: 2, padBottom: 40, horizontalRoom
    });

    await drawCenteredText(
      'Do <u>not</u> list your <u>current</u> employer(s) or <u>current</u> other appointing organizations on this form.',
      { size:13, font:boldfont }    
    );

    _return();
  }

  private drawRedBox = async () => {
    const { drawRedBoxBorder, fillRedBox, page: { nextPageIfNecessary }, _return } = this;
    const boxHeight = 140;
    nextPageIfNecessary(boxHeight);
    _return(16);
    await drawRedBoxBorder(boxHeight, 0);
    await fillRedBox();
  }

  private drawOrderedItems = async () => {
    const { page: { 
      bodyWidth, drawWrappedText, drawText, nextPageIfNecessary 
    }, font, boldfont, _return, baseForm: { entityName, getStaleEntityDays, getSecondReminderDays, drawOrderedItem } } = this;
    let basePage = this.page.basePage;

    basePage = nextPageIfNecessary(32);

    _return(20);
    await drawText(
      'I direct the Ethical Transparency Tool (“ <u>ETT</u>”) to do the following and consent to it doing so:', 
      { size:9, font:boldfont }, 16);

    await drawOrderedItem({
      paragraphs: [ { text: 'Transmit this “<u>Full Exhibit Form</u>” and my accompanying ' +
        '“<u>Single-Entity Exhibit Forms</u>” on my behalf to my private page on ETT. ',
      options: { size:9, font:boldfont } } ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: `<b>Also transmit this Full Exhibit Form on my behalf to</b> ` +
        `${entityName}, which is the ETT-Registered Entity that requested it (“ <u>Registered Entity</u>”) ` +
        `in connection with considering me for a Privilege or Honor, Employment or Role at this time.`,
      options: { size:9, font:boldfont } } ],
    });

    await drawOrderedItem({
      paragraphs: [
        {
          text: `<b><u>Within the next ${await getStaleEntityDays()} days</u>—if the Registered Entity ` +
            'initiates transmittals via ETT to my listed  Consent Recipients/Affiliates, asking them ' +
            'to complete Disclosure Forms about me (“<u>Disclosure Requests</u>”), transmit the ' +
            'disclosure Requests.</b>  Each Disclosure Request will include the relevant Single-Entity ' +
            'Exhibit Form (so one Consent Recipient is not notified of the others), my Consent Form, ' +
            'and a blank Disclosure Form.  Copy the Registered Entity and me on the Disclosure Requests.',
          options: { size:9, font }
        },
        {
          text: `<b><u>Within the ${await getSecondReminderDays()} days after sending these initial ` +
            `Disclosure Request(s)</u>—resend the Registered Entity’s Disclosure Request(s) twice ` +
            `(as reminders) to my Consent Recipients (Affiliates) listed in this Exhibit Form,</b> copying ` +
            `the Registered Entity and me. <b>Then promptly delete the Disclosure Requests, my Full Exhibit ` +
            `Form and all related Single Entity Exhibit Forms from ETT (as ETT will have completed its ` +
            `transmittal role).</b>`,
          options: { size:9, font }
        }
      ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: '<u>I agree that my ETT Registration Form and Consent Form will remain in effect ' +
        'for use with these particular Disclosure Requests and completed Disclosure Forms that my Consent ' +
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
        `${await getStaleEntityDays()}-day period provided, delete all of these Exhibit Forms from ETT.`, 
        options: { size:9, font:boldfont } } ]
    });

    _return(16);
    basePage = nextPageIfNecessary(60);
    await drawWrappedText({
      text: 'I agree that this electronic Full Exhibit Form and my electronic (digital) ' +
        'signature, and any copy will have the same effect as originals for all purposes. <b>I have had the ' +
        'time to consider and consult anyone I wish on whether to provide this Current Employer(s) ' +
        'Exhibit Form.  I am at least 18 years old and it is my knowing and voluntary decision to sign ' +
        'and deliver this Exhibit Form.</b>', 
      options: { size:9, font }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    });

    basePage = nextPageIfNecessary(50, () => _return(16));
    await drawWrappedText({
      text: '____Check if applicable: My name has changed since my affiliation with one or more of ' +
        'the listed Consent Recipients/Affiliates above.  My prior name(s) known to them ' +
        'were:__________________________________________________________________ [insert names].',
      options: { size:9, font:boldfont }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    }); 
  }

  private drawReadyForSubmission = async () => {
    const { baseForm: { isBlankForm, drawBigRedButton }, _return, page: { nextPageIfNecessary } } = this;
    if( ! isBlankForm) {
      return;
    }

    let basePage = nextPageIfNecessary(100);
    _return(16);

    await drawBigRedButton({
      text: 'NEXT',
      descriptionHeight: 32,
      description: 'Click the Next button to create, review, date, and sign a Single-Entity Exhibit ' +
        'Form for each of your listed Consent Recipients. You will not be able to submit any of your ' +
        'Exhibit Forms until you digitally sign all of them.'
    });
    _return(32);

    const { 
      page: { drawText, drawCenteredText, drawWrappedText, bodyWidth }, 
      font, boldfont, baseForm: { drawBulletedItem }
    } = this;
    let horizontalRoom = bodyWidth - 20;
    basePage = nextPageIfNecessary(300);

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
      text: '<i>You have digitally signed your Full Exhibit Form and each of your Single-Entity Exhibit Forms.</i>',
      options: { size:9, font:boldfont }, linePad: 6, padBottom: 20, horizontalRoom
    });

    await drawText('<u>NOTE: When you click “Submit”:</u>', { size:9, font:boldfont }, 16);

    await drawBulletedItem({
      paragraphs: [ { text: 'Your ETT Registration Form and Consent Form will not expire and you will not ' +
        'be able to rescind them or your Full or Single Entity Exhibit Forms in connection with the ' +
        'Privilege or Honor, Employment or Role for which the listed Registered Entity is considering you ' +
        'at this time.  Your Consent Recipients will be relying on these forms to make disclosures to the ' +
        'Registered Entity.  Contact the Registered Entity directly if you want to withdraw from their ' +
        'consideration.', 
      options: { size:9, font:boldfont } 
    }] });

    await drawBulletedItem({
      paragraphs: [ { text: '<i>You may still rescind your ETT Registration Form and Consent Form to ' +
        'prevent their other use in the future; directions on how are here.</i>', 
      options: { size:9, font } 
    }] });

    await drawBulletedItem({
      paragraphs: [ { text: 'After submission, to correct your Exhibit Form, directions are here.', 
      options: { size:9, font } 
    }] });

    await drawBigRedButton({
      text: 'SUBMIT',
      descriptionHeight: 26,
      description: 'Click the Submit Button to complete and submit your Full and Single Entity Exhibit Forms'
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitFormFullOther.ts')) {

  const testBlankForm = false;

  (async () => {

    // Load the app configs
    const context:IContext = await require('../../../../contexts/context.json');
    context.CONFIG.useDatabase = false;
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(context.CONFIG);
    process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';

    const form = testBlankForm ?
      ExhibitFormFullOther.getBlankForm() :
      ExhibitFormFullOther.getInstance(SampleExhibitFormParms([
        getSampleAffiliates().employerPrior, 
        getSampleAffiliates().academic1, 
        getSampleAffiliates().academic2, 
        getSampleAffiliates().other
      ]));

    await form.writeToDisk('./lib/lambda/_lib/pdf/ExhibitFormFullOther.pdf');
    console.log(`done`);

  })();

}







