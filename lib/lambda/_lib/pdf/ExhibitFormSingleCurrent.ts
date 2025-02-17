import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
import { IContext } from '../../../../contexts/IContext';
import { log } from '../../Utils';
import { Configurations } from '../config/Config';
import { AffiliateTypes, ExhibitFormConstraint, ExhibitFormConstraints, FormType, FormTypes } from '../dao/entity';
import { blue, ExhibitForm, SampleExhibitFormParms } from './ExhibitForm';
import { IPdfForm, PdfForm } from './PdfForm';
import { Page } from './lib/Page';

/**
 * This class represents an exhibit pdf form that can be dynamically generated around the provided exhibit data.
 */
export class ExhibitFormSingleCurrent extends PdfForm implements IPdfForm {
  private baseForm:ExhibitForm
  private font:PDFFont;
  private boldfont:PDFFont;

  public static getBlankForm = (formType:FormType, constraint:ExhibitFormConstraint): IPdfForm => {
    return new ExhibitFormSingleCurrent(ExhibitForm.getBlankForm(formType, constraint));
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
    const { baseForm, drawLogo, drawTitle, drawIntro, drawAgreement, drawReadyForSubmission } = this;

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

    await drawAffiliateGroup(AffiliateTypes.EMPLOYER);

    await drawAgreement();

    await drawSignature('single exhibit Form');

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
    await page.drawCenteredText('Single-Entity Exhibit Form—Current Employer or Appointing Organization', { size:10, font }, 8);
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
      options: { size, font:boldfont }, linePad: 4, padBottom: 6 
    });

    await drawCenteredText(
      consentFormUrl, 
      { font:boldfont, size:8, color:blue, lineHeight:14 }
    );
    _return();

    basePage.moveDown(8);
    await drawWrappedText({ 
      text: `<u>I agree that my ETT Registration Form and Consent Form will remain in effect to authorize ` +
        `the Disclosure Form that the following entity completes and provides in response to the Disclosure Request ` +
        `sent with this Form</u>.  The definitions in the Consent Form also apply to this Single Entity ` +
        `Exhibit Form.  The following entity is one of my <u>Consent Recipients</u> (Affiliates) that is my ` +
        `current employer or appointing organization and is referenced in and covered by my Consent Form: `, 
      options: { size, font:boldfont }, linePad: 4, padBottom: 16 
    });
  }

  private drawAgreement = async () => {
    const { page: { 
      bodyWidth, drawWrappedText, nextPageIfNecessary 
    }, font, boldfont, _return } = this;
    let basePage = this.page.basePage;

    basePage = nextPageIfNecessary(32);

    _return(16);
    basePage = nextPageIfNecessary(60);
    await drawWrappedText({
      text: 'I agree that this electronic Single-Entity Exhibit Form and my electronic (digital) signature, ' +
        'and any copy will have the same effect as originals for all purposes. <b>I have had the time to ' + 
        'consider and consult anyone I wish on whether to provide this Single Entity Exhibit Form.  I am ' +
        'at least 18 years old and it is my knowing and voluntary decision to sign and deliver this Single ' +
        'Entity Exhibit Form.</b>', 
      options: { size:9, font }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    });

    basePage = nextPageIfNecessary(50);
    await drawWrappedText({
      text: '____Check if applicable:  I am the person known to you as __________________________ ' +
        '[insert Individual’s prior name] and I have signed this Single Entity Exhibit Form below and my ' +
        'linked Consent Form using my updated name.',
      options: { size:9, font:boldfont }, linePad: 6, padBottom: 16, horizontalRoom: bodyWidth - 20
    }); 
  }


  private drawReadyForSubmission = async () => {
    let { baseForm: { isBlankForm }, page: { basePage } } = this;
    if( ! isBlankForm) {
      return;
    }
    const { 
      page, page: { 
        drawCenteredText, drawWrappedText, drawText, nextPage, bodyWidth, margins
      }, 
      font, boldfont, _return, baseForm: { drawBulletedItem, drawBigRedButton }
    } = this;
    let horizontalRoom = bodyWidth - 20;

    basePage = nextPage();
    _return(16);

    await drawCenteredText(
      '------------------------------------------------------------',
      { size:10, font:{ name:StandardFonts.CourierBold } as PDFFont }, 14
    );

    await drawCenteredText('Ready for Submission', { size:16, font }, 16);

    await drawWrappedText({
      text: '<i>You have digitally signed your Current Employer(s) Exhibit Form—and, if you have ' +
        'more than one current employer and/or appointing organization, each of your related ' +
        'Single-Entity Exhibit Forms.</u>',
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
      paragraphs: [ { text: '<i>You may still rescind your ETT Registration Form and Consent Form to prevent ' +
        'their other use in the future; directions on how are here.</i>', 
      options: { size:9, font } 
    }] });

    await drawBulletedItem({
      paragraphs: [ { text: '<i>After submission, to correct your Exhibit Form, directions are here.</i>', 
      options: { size:9, font } 
    }] });

    await drawBigRedButton({
      text: 'SUBMIT',
      descriptionHeight: 16,
      description: 'Click the Submit Button to complete and submit your One Current Employer(s) Exhibit Form:'
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitFormSingleCurrent.ts')) {

  const testBlankForm = true;

  (async () => {

    // Load the app configs
    const context:IContext = await require('../../../../contexts/context.json');
    context.CONFIG.useDatabase = false;
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(context.CONFIG);
    process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';

    const create = async (baseForm:ExhibitForm) => {
      const form = new ExhibitFormSingleCurrent(baseForm);
      await form.writeToDisk('./lib/lambda/_lib/pdf/ExhibitFormSingleCurrent.pdf');
      console.log(`done`);
    }

    // If blank form, just create the blank form and return;
    if(testBlankForm) {
      await create(ExhibitForm.getBlankForm(FormTypes.SINGLE, ExhibitFormConstraints.CURRENT));
      return;
    }

    process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';
    const baseForm = new ExhibitForm(SampleExhibitFormParms(FormTypes.SINGLE, ExhibitFormConstraints.CURRENT));

    // Create the exhibit form
    await create(baseForm);
  })();

}







