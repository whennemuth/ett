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
export class ExhibitFormFullBoth extends PdfForm implements IPdfForm {
  private baseForm:ExhibitForm
  private font:PDFFont;
  private boldfont:PDFFont;

  public static getBlankForm = (): IPdfForm => {
    const { EMPLOYER, ACADEMIC, OTHER } = AffiliateTypes;
    return new ExhibitFormFullBoth(ExhibitForm.getBlankForm(
      FormTypes.FULL, [ EMPLOYER, ACADEMIC, OTHER ]
    ));
  }

  public static getInstance = (parms:ExhibitFormParms): IPdfForm => {
    parms.data.constraint = ExhibitFormConstraints.BOTH;
    parms.data.formType = FormTypes.FULL;
    return new ExhibitFormFullBoth(new ExhibitForm(parms));
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
    const { EMPLOYER_PRIMARY, EMPLOYER, EMPLOYER_PRIOR, ACADEMIC, OTHER } = AffiliateTypes;
    
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
      affiliateType:EMPLOYER_PRIMARY, 
      title:'Current and Prior Employers1<sup>1</sup>',
      orgHeaderLines: [ 'Organization (no acronyms)' ] 
    });

    await drawAffiliateGroup({ 
      affiliateType:EMPLOYER, 
      orgHeaderLines: [ 'Organization (no acronyms)' ] 
    });

    await drawAffiliateGroup({ 
      affiliateType:EMPLOYER_PRIOR, 
      orgHeaderLines: [ 'Organization (no acronyms)' ] 
    });

    await drawAffiliateGroup({ 
      affiliateType:ACADEMIC, 
      title:'Current and Prior Academic / Professional Societies & Organizations<sup>2</sup>', 
      orgHeaderLines: [ 'Organization (no acronyms)' ] 
    });

    await drawAffiliateGroup({ 
      affiliateType:OTHER, 
      title:'Other Organizations Where You Currently or Formerly Had Appointments<sup>3</sup>', 
      orgHeaderLines: [ 'Organization (no acronyms)' ] 
    });

    await drawRedBox();

    await drawOrderedItems();

    await drawSignature('Full Exhibit Form');

    await drawReadyForSubmission();

    this.page.setLinkAnnotations();

    const pdfBytes = await doc.save();
    return pdfBytes;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('Full Exhibit Form – All Consent Recipients/Affiliates', { size:10, font }, 8);
  }

  /**
   * Draw the introductory language
   */
  private drawIntro = async () => {
    const { 
      baseForm: { consentFormUrl, isBlankForm, consenter: { firstname, middlename, lastname }, _return }, 
      page: { basePage, drawWrappedText, drawCenteredText }, font, boldfont, getFullName 
    } = this;
    let fullname = getFullName(firstname, middlename, lastname);
    fullname = fullname ? `my <i>(${fullname})</i>` : 'my';
    const size = 9;

    await drawWrappedText({ 
      text: isBlankForm ?
      `<b>This Full Exhibit Form is incorporated into ${fullname} Consent Form, at:</b>` :
      `<b>This Full Exhibit Form is incorporated into ${fullname} Consent Form, attached to this Exhibit Form</b>.`, 
      options: { size, font }, linePad: 4, padBottom: 6 
    });

    if(isBlankForm) {
      await drawCenteredText(
        consentFormUrl, 
        { font:boldfont, size:8, color:blue, lineHeight:14 }
      );
      _return();
    }

    basePage.moveDown(8);
    await drawWrappedText({ 
      text: '<b>This Exhibit Form provides an up-to-date list of the name(s) and contact(s) for my ' +
        'known <u>Consent Recipients</u> (also called Affiliates) on the date of this Exhibit Form. ' +
        'The definitions in the Consent Form also apply to this Exhibit Form.</b> <u>My known Consent ' +
        'Recipient(s)</u> are:', 
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
    const { page: { basePage, bodyWidth, drawWrappedText }, font, _return } = this;
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
      text: '<sup><b>3</b></sup>List the organizations where you <b>currently have or formerly had</b> ' +
        'emeritus/emerita, visiting, or other teaching, research, or administrative appointments ' +
        '(same period and type of contact as under <sup><b>1</b></sup> above).',
      options: { size, font }, linePad: 2, padBottom: 40, horizontalRoom
    });

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
    const { 
      page: { 
        bodyWidth, drawWrappedText, drawText, nextPageIfNecessary, nextPage 
      }, font, boldfont, _return, 
      baseForm: { 
        entityName='[entity/organization]', getStaleEntityPeriod, getFirstReminderPeriod, getSecondReminderPeriod, 
        getSecondReminderOffsetPeriod, drawOrderedItem 
      } 
    } = this;
    let basePage = this.page.basePage;

    basePage = nextPageIfNecessary(32);

    _return(40);
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
        `${entityName}, which is the ETT-Registered Entity that requested it (“<u>Registered Entity</u>”) ` +
        `in connection with considering me for a Privilege or Honor, Employment or Role at this time.`,
      options: { size:9, font:boldfont } } ],
    });

    await drawOrderedItem({
      paragraphs: [
        {
          text: `<b><u>Within the next ${await getStaleEntityPeriod()}</u> - if the Registered Entity ` +
            'initiates transmittals via ETT to my listed  Consent Recipients/Affiliates, asking them ' +
            'to complete Disclosure Forms about me (“<u>Disclosure Requests</u>”), transmit the ' +
            'Disclosure Requests.</b>  Each Disclosure Request will include my consent form, the ' +
            'relevant Single-Entity Exhibit Form (listing only the Consent Recipient/Affiliate that is ' +
            'receiving it - so one Consent Recipient is not notified of the others), ' +
            'and a blank Disclosure Form.  Copy the Registered Entity and me on the Disclosure Requests.',
          options: { size:9, font }
        },
        {
          // TODO: Perhaps suggest an alternative wording - There are no disclosure requests to delete, and it seems like the implication is that they are being stored for 21 days.
          text: `<b><u>Within ${await getSecondReminderPeriod()} after sending these initial Disclosure ` +
            `Request(s)</u> (${await getFirstReminderPeriod()} after, and ` +
            `${await getSecondReminderOffsetPeriod()} after that) — resend the Registered Entity’s ` +
            `Disclosure Request(s) twice (as reminders) separately to each of my Consent Recipients ` +
            `(Affiliates) listed in this Exhibit Form,</b> copying the Registered Entity and me. <b>Then `+
            `promptly delete the Disclosure Requests, my Full Exhibit Form and all related Single Entity ` +
            `Exhibit Forms from ETT (as ETT will have completed its transmittal role).</b>`,
          options: { size:9, font }
        }
      ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: '<u>I agree that my ETT Registration Form and Consent Form will remain in effect ' +
        'for use with these particular Disclosure Requests and my Consent Recipient(s)’ disclosures in ' +
        'response (even if my ETT Registration and Consent otherwise expire or are rescinded).</u>', 
        options: { size:9, font:boldfont } } ]
    });

    await drawOrderedItem({
      paragraphs: [ { text: '<u>I agree that ETT has the right to identify me as the person who provided ' +
        'and authorized use of the name, title, email and phone number of the contacts I’ve listed for my ' +
        'Consent Recipients (Affiliates).</u>', 
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
      text: 'I agree that this electronic Full Exhibit Form and my electronic (digital) ' +
        'signature, and any copy will have the same effect as originals for all purposes. <b>I have had the ' +
        'time to consider and consult anyone I wish on whether to provide this Full ' +
        'Exhibit Form.  I am at least 18 years old and it is my knowing and voluntary decision to sign ' +
        'and deliver this Exhibit Form.</b>', 
      options: { size:9, font }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    });

    // basePage = nextPageIfNecessary(50, () => _return(16));
    // await drawWrappedText({
    //   text: '____Check if applicable: My name has changed since my affiliation with one or more of ' +
    //     'the listed Consent Recipients/Affiliates above.  My prior name(s) known to them ' +
    //     'were:__________________________________________________________________ [insert names].',
    //   options: { size:9, font:boldfont }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    // });
    nextPage();
  }

  private drawReadyForSubmission = async (includeSubmit:boolean=false) => {
    const { baseForm: { isBlankForm, drawBigRedButton }, _return, page: { nextPageIfNecessary } } = this;
    if( ! isBlankForm) {
      return;
    }

    let basePage = nextPageIfNecessary(100);
    _return(16);

    await drawBigRedButton({
      text: 'NEXT',
      descriptionHeight: 32,
      description: 'Click the Next button to create, review, date, and digitally sign a Single-Entity Exhibit ' +
        'Form for each of your listed Consent Recipients (Affiliates). You will not be able to submit any of your ' +
        'Exhibit Forms until you digitally sign all of them.'
    });

    if( ! includeSubmit) {
      return; // Apparently, the remaining content is not to be shown per client request.
    }

    _return(32);

    const { 
      page: { drawText, drawCenteredText, drawWrappedText, bodyWidth }, 
      font, boldfont, baseForm: { drawBulletedItem }
    } = this;
    let horizontalRoom = bodyWidth - 20;
    basePage = nextPageIfNecessary(300);

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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitFormFullBoth.ts')) {

  const testBlankForm = true;

  (async () => {

    // Load the app configs
    const context:IContext = await require('../../../../contexts/context.json');
    context.CONFIG.useDatabase = false;
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(context.CONFIG);
    process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';

    const form = testBlankForm ?
      ExhibitFormFullBoth.getBlankForm() :
      ExhibitFormFullBoth.getInstance(SampleExhibitFormParms([
        getSampleAffiliates().employerPrimary,
        getSampleAffiliates().employer1, 
        getSampleAffiliates().employer2, 
        getSampleAffiliates().employerPrior, 
        getSampleAffiliates().academic1,
        getSampleAffiliates().other
      ]));

    await form.writeToDisk('./lib/lambda/_lib/pdf/ExhibitFormFullBoth.pdf');
    console.log(`done`);

  })();

}







