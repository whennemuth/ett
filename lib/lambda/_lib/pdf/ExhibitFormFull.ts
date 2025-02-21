import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { log } from '../../Utils';
import { AffiliateTypes } from '../dao/entity';
import { ExhibitForm, getSampleAffiliates, SampleExhibitFormParms } from './ExhibitForm';
import { IPdfForm, PdfForm } from './PdfForm';
import { Page } from './lib/Page';

/**
 * This class represents an exhibit pdf form that can be dynamically generated around the provided exhibit data.
 */
export class ExhibitFormFull extends PdfForm implements IPdfForm {
  private baseForm:ExhibitForm
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor(baseForm:ExhibitForm) {
    super();
    this.baseForm = baseForm;
    this.page = baseForm.page;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {
    const { baseForm, drawTitle, drawIntro, drawLogo } = this;

    await baseForm.initialize();

    const { doc, embeddedFonts, pageMargins, font, boldfont, drawAffiliateGroup } = baseForm;
    const { EMPLOYER, EMPLOYER_PRIOR, ACADEMIC, OTHER } = AffiliateTypes;
    
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
      affiliateType: EMPLOYER, 
      title: 'Current Employer(s)',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
    });

    await drawAffiliateGroup({ 
      affiliateType: EMPLOYER_PRIOR, 
      title: 'Prior Employers',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
    });

    await drawAffiliateGroup({ 
      affiliateType: ACADEMIC, 
      title: 'Academic / Professional Societies & Organizations',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
    });

    await drawAffiliateGroup({ 
      affiliateType: OTHER, 
      title: 'Other Affiliated Organizations',
      orgHeaderLines: [ 'Organization (no acronyms)' ]
    });

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
    const { baseForm: { consenter: { firstname, middlename, lastname } }, page, boldfont, getFullName } = this;
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

  process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';
  const baseForm = new ExhibitForm(SampleExhibitFormParms([
    getSampleAffiliates().employerPrimary,
    getSampleAffiliates().employer1, 
    getSampleAffiliates().employer2, 
    getSampleAffiliates().employerPrior, 
    getSampleAffiliates().academic1,
    getSampleAffiliates().other
  ]));
  
  new ExhibitFormFull(baseForm).writeToDisk('./lib/lambda/_lib/pdf/outputFull.pdf')
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}







