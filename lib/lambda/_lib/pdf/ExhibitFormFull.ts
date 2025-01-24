import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { Affiliate, AffiliateType, AffiliateTypes, Consenter, ExhibitForm as ExhibitFormData } from '../dao/entity';
import { ExhibitForm, blue, white } from './ExhibitForm';
import { IPdfForm, PdfForm } from './PdfForm';
import { Page } from './lib/Page';
import { Rectangle } from './lib/Rectangle';
import { Align, Margins, VAlign } from './lib/Utils';
import { log } from '../../Utils';

/**
 * This class represents an exhibit pdf form that can be dynamically generated around the provided exhibit data.
 */
export class ExhibitFormFull extends PdfForm implements IPdfForm {
  private baseForm:ExhibitForm
  private consenter:Consenter;
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(baseForm:ExhibitForm, consenter:Consenter) {
    super();
    this.baseForm = baseForm;
    this.consenter = consenter;
    this.page = baseForm.page;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {
    const { baseForm, drawTitle, drawIntro, drawAffiliateGroup, drawLogo } = this;

    await baseForm.initialize();

    const { doc, embeddedFonts, pageMargins, font, boldfont } = baseForm;
    
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

    await drawAffiliateGroup(AffiliateTypes.EMPLOYER, 'Current Employer(s)');

    await drawAffiliateGroup(AffiliateTypes.EMPLOYER_PRIOR, 'Prior Employers');

    await drawAffiliateGroup(AffiliateTypes.ACADEMIC, 'Academic / Professional Societies & Organizations');

    await drawAffiliateGroup(AffiliateTypes.OTHER, 'Other Affiliated Organizations');

    const pdfBytes = await doc.save();
    return pdfBytes;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { page, boldfont, font } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('Full Exhibit Form – Consent Recipients/Affiliates', { size:10, font }, 8);
  }

  /**
   * Draw the introductory language
   */
  private drawIntro = async () => {
    const { consenter: {firstname, middlename, lastname }, page, boldfont, getFullName } = this;
    const fullname = getFullName(firstname, middlename, lastname);
    const size = 10;
    await page.drawWrappedText(
      {
        text: `This Full Exhibit Form was prepared by ${fullname} and provides ` + 
          `an up-to-date list of the names and contacts for their known Consent Recipients on the ` +
          `date of this Exhibit.  The definitions in their Consent Form also apply to this Full ` + 
          `Exhibit Form.`,
        options: { size, font:boldfont },
        linePad: 4,
        padBottom: 8
      });
    await page.drawWrappedText(
      {
        text: 'Each consent recipient below has received a copy of this form with ' +
          'the details of the other recipients redacted.',
        options: { size, font:boldfont },
        linePad: 4,
        padBottom: 8
      });
      
    await page.drawText('Full known Consent Recipient(s) list:', { size, font:boldfont }, 16);
  }

  /**
   * Draw all affiliates of a specified type
   * @param affiliateType 
   * @param title 
   */
  private drawAffiliateGroup = async (affiliateType:AffiliateType, title:string) => {
    const { page, font, boldfont, baseForm: { data, _return, drawAffliate } } = this;
    let size = 10;

    await new Rectangle({
      text: title,
      page,
      align: Align.center,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:blue, width:page.bodyWidth, height:16 },
      textOptions: { size, font:boldfont, color: white },
      margins: { left: 8 } as Margins
    }).draw();
    page.basePage.moveDown(16);

    const affiliates = (data.affiliates as Affiliate[]).filter(affiliate => affiliate.affiliateType == affiliateType);
    for(let i=0; i<affiliates.length; i++) {
      const a = affiliates[i];
      await drawAffliate(a, size);
      _return(4);
    };

    if(affiliates.length == 0) {
      await new Rectangle({
        text: 'None',
        page,
        align: Align.center, valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, width:page.bodyWidth, height:16 },
        textOptions: { size, font }
      }).draw();
    }
    _return(16);
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitFormFull.ts')) {

  const baseForm = new ExhibitForm({
    entity_id: 'abc123',
    affiliates: [
      { 
        affiliateType: AffiliateTypes.EMPLOYER,
        org: 'Warner Bros.', 
        fullname: 'Foghorn Leghorn', 
        email: 'foghorn@warnerbros.com',
        title: 'Lead animation coordinator',
        phone_number: '617-333-4444'
      },
      {
        affiliateType: AffiliateTypes.ACADEMIC,
        org: 'Cartoon University',
        fullname: 'Bugs Bunny',
        email: 'bugs@cu.edu',
        title: 'Dean of school of animation',
        phone_number: '508-222-7777'
      },
      {
        affiliateType: AffiliateTypes.EMPLOYER,
        org: 'Warner Bros',
        fullname: 'Daffy Duck',
        email: 'daffy@warnerbros.com',
        title: 'Deputy animation coordinator',
        phone_number: '781-555-7777'
      },
      {
        affiliateType: AffiliateTypes.ACADEMIC,
        org: 'Cartoon University',
        fullname: 'Yosemite Sam',
        email: 'yosemite-sam@cu.edu',
        title: 'Professor animation studies',
        phone_number: '617-444-8888'
      },
      {
        affiliateType: AffiliateTypes.EMPLOYER_PRIOR,
        email: "affiliate1@warhen.work",
        org: "My Neighborhood University",
        fullname: "Mister Rogers",
        title: "Daytime child television host",
        phone_number: "0123456789"
      }
    ]
  } as ExhibitFormData);
  
  new ExhibitFormFull(baseForm, { 
    firstname: 'Porky', middlename: 'P', lastname: 'Pig'
  } as Consenter).writeToDisk('./lib/lambda/_lib/pdf/outputFull.pdf')
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}







