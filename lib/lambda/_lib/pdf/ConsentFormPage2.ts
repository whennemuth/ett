import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { ConsentFormDrawParms } from "./ConsentForm";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, rgbPercent } from "./lib/Utils";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;

export class ConsentFormPage2 extends PdfForm implements IPdfForm {
  private font:PDFFont;
  private boldfont:PDFFont;

  constructor() {
    super();
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

  public draw = async (drawParms:ConsentFormDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { pageMargins, drawLogo, drawBody } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawBody();
  }

  private drawBody = async () => {
    const { page, page: { basePage, drawWrappedText, drawText }, boldfont, font } = this;

    basePage.moveDown(16);
    await drawWrappedText({
      text: 'This <u>Consent Form</u>,<sup>1</sup> any <u>Exhibit Forms</u><sup>5</sup> and ' +
      'any completed <u>Disclosure Form</u><sup>6</sup> about me may only be used in connection ' +
      'with <u>Privileges or Honors</u><sup>3</sup> and <u>Employment or Roles</u>.<sup>4</sup>  ' +
      'Other policies or laws may provide for additional disclosures (beyond those covered by ' +
      'the <u>Ethical Transparency Tool</u> <sup>1</sup>).',
      options: { size:10, font },
      linePad: 8
    });

    basePage.moveDown(40);
    await drawWrappedText({
      text: 'To the maximum extent that law allows me to knowingly give a waiver/release:',
      options: { size:10, font:boldfont },
      linePad: 8,
      padBottom: 16
    });

    basePage.moveRight(20);
    await drawWrappedText({
      text: '(1) I waive any non-disclosure, non-disparagement, confidentiality and other ' +
        'limitations that would otherwise apply to a completed <u>Disclosure Form</u><sup>6</sup> ' +
        'about me which are imposed by—',
      options: { size:10, font:boldfont },
      linePad: 8,
      padBottom: 16
    });

    basePage.moveRight(20);
    await drawText('•  any current or future agreement or', { size:10, font }, 16);
    await drawText(
      '•  any law or policy in effect when a completed <u>Disclosure Form</u><sup>6</sup> is provided; ', 
      { size:10, font }, 16);
    basePage.moveLeft(20);

    await drawText('and', { size:10, font:boldfont }, 16);

    await drawWrappedText({
      text: '<b>(2) I waive and release all claims and liabilities of every kind, that are ' +
        'associated with this <u>Consent Form</u>,<sup>1</sup> any <u>Exhibit Forms</u>,<sup>5</sup> ' + 
        'or the disclosures and use of disclosures to which I am consenting, against any <u>Consent ' +
        'Recipient(s)</u>,<sup>5</sup> <u>ETT-Registered Entit(ies)</u>,<sup>7</sup> and/or ' +
        'developer(s), host(s), administrator(s), operator(s), governing bodies, sponsor(s), or ' +
        'advisor(s) for the <u>Ethical Transparency Tool</u> <sup>1</sup></b> (and their respective ' +
        'prior, current, and future directors/trustees/managers, officers, partners/members/stockholders, ' +
        'personnel, agents, and representatives).',
      options: { size:10, font },
      linePad: 8,
      padBottom: 26
    });

    basePage.moveLeft(20);
    await drawWrappedText({
      text: 'I agree that a copy of this <u>Consent Form</u><sup>1</sup> may be given at any time to ' +
        'any <u>Consent Recipient(s)</u><sup>5</sup> and <u>ETT-Registered Entit(ies)</u>.<sup>7</sup> ' +
        'I agree that this electronic <u>Consent Form</u>,<sup>1</sup> my electronic (digital) ' +
        'signature, and any copy will have the same effect as originals for all purposes. <b>I have read ' +
        'this <u>Consent Form</u><sup>1</sup> (including the definitions) and read and agree to the ' +
        'ETT Privacy Policy [link]. I have had the time to consider and consult anyone I wish on ' +
        'whether to provide this <u>Consent Form</u><sup>1</sup>  I am at least 18 years old and it ' +
        'is my knowing and voluntary decision to sign and deliver this <u>Consent Form</u>.<sup>1</sup></b>',
      options: { size:10, font },
      linePad: 8,
      padBottom: 16
    })

  }
}




const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENT_FORM_PAGE_2') {

  new ConsentFormPage2().writeToDisk('./lib/lambda/_lib/pdf/consentForm2.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}