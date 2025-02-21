import { writeFile } from "node:fs/promises";
import { PDFFont, PDFPage } from "pdf-lib";
import { ExhibitForm, getSampleAffiliates, SampleExhibitFormParms } from './ExhibitForm';
import { IPdfForm, PdfForm } from './PdfForm';
import { Page } from "./lib/Page";

export class ExhibitFormSingle extends PdfForm implements IPdfForm {
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
    
    const { doc, data, embeddedFonts, pageMargins, font, boldfont, drawAffliate } = baseForm;

    this.doc = doc;
    this.embeddedFonts = embeddedFonts;
    this.pageMargins = pageMargins;
    this.font = font;
    this.boldfont = boldfont;
    this.page = new Page(doc.addPage([620, 785]) as PDFPage, pageMargins, embeddedFonts);
    baseForm.page = this.page;
    const { affiliates=[] } = data

    if(affiliates.length == 0) {
      throw new Error(`Error: No affiliates found for single exhibit form`);
    }

    await drawLogo(this.page);

    await drawTitle();

    await drawIntro();

    await drawAffliate(affiliates[0], 10, [
      'Current Employer or Appointing /',
      'Organization (no acronyms)'
    ]);

    const pdfBytes = await doc.save();
    return pdfBytes;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = async () => {
    const { boldfont, font, page } = this;
    await page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    await page.drawCenteredText('Single Exhibit Form – Consent Recipients/Affiliates', { size:10, font }, 8);
  }

  /**
   * Draw the introductory language
   */
  private drawIntro = async () => {
    const { baseForm: { consenter: { firstname, middlename, lastname }}, page, font, getFullName } = this;
    const fullname = getFullName(firstname, middlename, lastname);
    const size = 10;
    await page.drawWrappedText(
      {
        text: `This Single Exhibit Form was prepared by <b>${fullname}</b> as part of ` + 
          `an exhibit form provided to an ETT authorized individual listing you as a known Consent Recipient. ` +
          `The definitions in their Consent Form also apply to this single Exhibit Form.`,
        options: { size, font },
        linePad: 4,
        padBottom: 8
      });

    await page.drawWrappedText(
      {
        text: `Yours may be one of a number of consent recipients provided to the ETT authorized individual.`,
        options: { size, font },
        linePad: 4,
        padBottom: 8
      })
      ;
      await page.drawText('Your full details as Consent Recipient:', { size, font }, 16);
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }
}

const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitFormSingle.ts')) {
  
  process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';
  const baseForm = new ExhibitForm(SampleExhibitFormParms([ getSampleAffiliates().employerPrimary ]));
  
  new ExhibitFormSingle(baseForm).writeToDisk('./lib/lambda/_lib/pdf/outputSingle.pdf')
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}
