import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { ConsentFormDrawParms } from "./ConsentForm";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, rgbPercent } from "./lib/Utils";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;

export class ConsentFormPage4 extends PdfForm implements IPdfForm {
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
    const size = 11;

    basePage.moveDown(16);

    await drawText('<u>End Notes (Definitions)</u>', { size, font:boldfont }, 20);

    const options = { size, font };
    const linePad = 6;
    const padBottom = 16;
    const definitions = [

      '<sup>1</sup><u>Ethical Transparency Tool</u> (or E<u>TT</u>) means a tool that enables each ' +
      'Consent Recipient to provide a completed Disclosure Form about a person who has signed and ' +
      'delivered a <u>Consent Form</u> (this form), to any ETT-Registered Entit(ies) that make(s) ' +
      'a request.  Each entity retains its independence in policymaking and decision-making (e.g., ' +
      'when to use the ETT and how to respond to disclosures).',

      '<sup>2</sup><u>Principles</u> mean the statements in “Part A. FUNDAMENTAL PRINCIPLES” of the ' +
      'Consent Form.',

      '<sup>3</sup><u>Privilege(s) or Honor(s)</u> — Examples include but are not limited to: elected ' +
      'fellow, elected or life membership; recipient of an honor, award, or an emeritus or endowed role; ' +
      'elected or appointed governance, committee, officer, or leadership role. However, Privilege(s) ' +
      'or Honor(s)  <3><b>do not</b></3> include basic membership in an academic, professional, or honorary society ' +
      'at an individual’s initiative (i.e., when not elected or awarded).  Other Privilege(s) or Honor(s) ' +
      'that an ETT-Registered Entity identifies as affecting climate and culture or enterprise risk may ' +
      'be included (e.g., volunteer roles).',

      '<sup>4</sup><u>Employment or Role(s)</u> — Examples include but are not limited to: employment; ' +
      'employee appointment or assignment to a supervisory, evaluative, or mentoring role. Other employment ' +
      'related roles or decisions that an ETT-Registered Entity identifies as affecting climate and culture ' +
      'or enterprise risk may be included.',

      '<sup>5</sup><u>Consent Recipient(s)</u> mean the entities referenced in Part B. 1, 2, 3, 4 of the ' +
      'Consent Form.  A Consent Recipient is the “Disclosing Entity” that completes a Disclosure Form when ' +
      'requested.  For up-to-date information, the person who submits a Consent Form also provides a list ' +
      'of the names of their Consent Recipients, with contacts, using <u>Exhibit Forms</u> at this link ' +
      'each time any ETT-Registered Entity is considering the person for a Privilege or Honor, Employment ' +
      'or Role and makes a request. (The Exhibit Forms template may be amended for amplification or clarity ' +
      'over time and re-posted.)',

      '<sup>6</sup>The <u>Disclosure Form</u> is the form at this link (and may be amended for amplification ' +
      'or clarity over time and re-posted).  <u>Finding of Responsibility</u> is a finding of any one or more ' +
      'of the generic types of misconduct listed/referenced on the Disclosure Form.  A <u>Finding of ' +
      'Responsibility</u> is defined by the Consent Recipient that made or adopted the finding under its own ' +
      'policy (see the Disclosure Form for details).  A Disclosure Form is completed when a Consent Recipient ' +
      'checks one or more Finding(s) of Responsibility that it has made or adopted against a person or when ' +
      'it checks “No Finding of Responsibility” or “Will Not Be Responding”.',

      '<sup>7</sup><u>ETT-Registered Entit(ies)</u> mean the entities and organizations now or in the future ' +
      'registered to use the Ethical Transparency Tool.  See this [link] for a list, which will be updated over ' +
      'time. ETT-Registered Entities are the only entities that may request completed Disclosure Forms from ' +
      'Consent Recipients.',
    ] as string[];

    for(let i=0; i<definitions.length; i++) {
      const text = definitions[i];
      await drawWrappedText({ text, options, linePad, padBottom });
    }
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENT_FORM_PAGE_4') {

  new ConsentFormPage4().writeToDisk('./lib/lambda/_lib/pdf/consentForm4.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}