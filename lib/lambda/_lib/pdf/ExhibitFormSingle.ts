import { writeFile } from "node:fs/promises";
import { PDFFont, PDFPage } from "pdf-lib";
import { Affiliate, AffiliateTypes, Consenter, ExhibitForm as ExhibitFormData } from "../dao/entity";
import { ExhibitForm } from './ExhibitForm';
import { IPdfForm, PdfForm } from './PdfForm';
import { Page } from "./lib/Page";

export class ExhibitFormSingle extends PdfForm implements IPdfForm {
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

    await drawLogo(this.page);

    await drawTitle();

    await drawIntro();

    await drawAffliate(data.affiliates![0] as Affiliate, 10);

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
    const { consenter, page, font} = this;
    const size = 10;
    await page.drawWrappedText(
      {
        text: `This Single Exhibit Form was prepared by <b>${consenter.fullname}</b> as part of ` + 
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
if(args.length > 2 && args[2] == 'RUN_MANUALLY_EXHIBIT_FORM_SINGLE') {

  const baseForm = new ExhibitForm({
    entity_id: 'abc123',
    affiliates: [{ 
      affiliateType: AffiliateTypes.EMPLOYER,
      org: 'Warner Bros.', 
      fullname: 'Foghorn Leghorn', 
      email: 'foghorn@warnerbros.com',
      title: 'Lead animation coordinator',
      phone_number: '617-333-4444'
    }]
  } as ExhibitFormData);
  
  new ExhibitFormSingle(baseForm, { fullname:'Porky Pig' } as Consenter).writeToDisk('./lib/lambda/_lib/pdf/outputSingle.pdf')
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}
