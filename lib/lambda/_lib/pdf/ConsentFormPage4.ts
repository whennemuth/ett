import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts, rgb } from "pdf-lib";
import { ConsentFormData, ConsentFormDrawParms, getSampleData } from "./ConsentForm";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, rgbPercent } from "./lib/Utils";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;

export class ConsentFormPage4 extends PdfForm implements IPdfForm {
  private font:PDFFont;
  private boldfont:PDFFont;
  private data:ConsentFormData;

  constructor(data:ConsentFormData) {
    super();
    this.data = data;
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
    const { page, pageMargins, drawLogo, drawBody } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawBody();

    this.page.setLinkAnnotations();
  }

  private drawBody = async () => {
    let { data: {
      exhibitFormLink, disclosureFormLink, entityInventoryLink, registrationHref
    }, page, page: { basePage, drawWrappedText, drawText }, boldfont, font } = this;
    
    const size = 11;

    basePage.moveDown(16);

    await drawText('<u>Appendix A (Definitions)</u>', { size, font:boldfont }, 20);

    const options = { size, font };
    const linePad = 6;
    const padBottom = 16;
    const definitions = [

      '<sup>1</sup><b><u>Ethical Transparency Tool</u>  (or <u>ETT</u>)</b> means a tool that enables each ' +
      'Consent Recipient to provide a completed Disclosure Form (or its information) about a person who ' +
      'has signed and delivered a <u>Consent Form</u> (this form) to ETT. Each ETT-Registered Entity (RE) ' +
      'retains its independence in policymaking and decision-making (e.g., on when to use the ETT, how to ' +
      'respond to disclosures, who’s qualified or selected). Before completing a Consent Form, an ' + 
      `individual completes an ETT <b>“<u>Registration Form</u>”</b> at <u><a href="${registrationHref}">this link</a></u> ` +
      'to receive their ETT account. Individuals do so proactively—or when it is a condition to being ' +
      'considered for Privilege(s) or Honor(s), Employment or Role(s) by any ETT-Registered Entit(ies).',

      '<sup>2</sup><b><u>Principles</u></b> mean the statements in “Part A. FUNDAMENTAL PRINCIPLES” of the ' +
      'Consent Form.',

      '<sup>3</sup><b><u>Privilege(s) or Honor(s)</u></b> — Examples include but are not limited to: elected ' +
      'fellow, elected or life membership; recipient of an honor, award, or an emeritus or endowed role; ' +
      'elected or appointed governance, committee, officer, or leadership role. However, Privilege(s) ' +
      'or Honor(s)  <3><b>do not</b></3> include basic membership in an academic, professional, or honorary society ' +
      'at an individual’s initiative (i.e., when not elected or awarded).  Other Privilege(s) or Honor(s) ' +
      'that an ETT-Registered Entity identifies as affecting climate, culture or enterprise risk may ' +
      'be included (e.g., volunteer roles).',

      '<sup>4</sup><b><u>Employment or Role(s)</u></b> — Examples include but are not limited to: employment; ' +
      'employee appointment or assignment to a supervisory, evaluative, or mentoring role. May include ' + 
      'other employment related roles or decisions that an ETT-Registered Entity identifies as affecting ' +
      'climate, culture or enterprise risk.',

      '<sup>5</sup><b><u>Consent Recipient(s)</u></b> (also called <u>Affiliate(s)</u>) mean the entities ' +
      'referenced in Part B. 1, 2, 3, 4 of the Consent Form.  A Consent Recipient (Affiliate) is the ' +
      '<b><u>“Disclosing Entity”</u></b> that completes a Disclosure Form when requested.  For up-to-date ' +
      'information, the person who submits a Consent Form also provides a list of the names of their ' +
      'Consent Recipients (Affiliates), with contacts, using <b><u>"Exhibit Forms"</u></b> at ' +
      `<u><a href="${exhibitFormLink}">this link</a></u> each time any ETT-Registered Entity is considering the ` +
      'person for a Privilege or Honor, Employment or Role and is anticipating using ETT to make a ' + 
      'Disclosure Request about a person who has completed a Consent Form.',

      `<sup>6</sup>The <b><u>Disclosure Form</u></b> is the form at <u><a href="${disclosureFormLink}">this link</a></u>.` +
      '  <b><u>"Finding of Responsibility"</u></b> is a finding of any one or more of the generic types ' +
      'of misconduct listed or referenced on the Disclosure Form; it is defined by the Consent Recipient ' +
      '(Affiliate) that made or adopted the finding under its own policy (see the Disclosure Form for ' +
      'details).  A Disclosure Form is completed when a Consent Recipient checks the Finding(s) of ' +
      'Responsibility that it has made or adopted against a person or when it checks “No Finding of ' +
      'Responsibility” or “Will Not Be Responding” — and gives the completed Disclosure Form or its ' +
      'information to a Registered Entity that requested it.',

      '<b><sup>7</sup><u>ETT-Registered Entit(ies)</u> or <u>“RE”</u></b> mean the entities and ' +
      'organizations now or in the future registered to use the Ethical Transparency Tool by completing ' +
      `an  <b>“ETT Registration Form”</b> at this <u><a href="${registrationHref}">link</a></u>.  ` +
      `See <u><a href="${entityInventoryLink}">this link</a></u> for a list, which will be updated over ` +
      'time. ETT-Registered Entities are the only entities that may request completed Disclosure Forms from ' +
      'Consent Recipients (Affiliates).',

      'When directed by both a person who has completed a Consent Form and Exhibit Forms and a Registered ' +
      'Entity (RE), ETT sends a <b>separate <u>Disclosure Request</u></b> on behalf of the RE to each Affiliate of a ' +
      'person, which includes PDFs of the person’s Consent Form, a Single Entity Exhibit Form naming ' + 
      'that Affiliate as a Consent Recipient, a blank Disclosure Form, and instructions to respond ' +
      '<b>directly</b> to the RE.  ETT does NOT receive completed Disclosure Forms or any conduct information.',

      '<sup>8</sup><b><u>ETT Sponsors</u></b> mean the owner(s), designer(s), developer(s), host(s), ' +
      'administrator(s), operator(s), governing bod(ies), sponsor(s), funder(s), and/or advisor(s) for the Ethical ' +
      'Transparency Tool.',
      
      '<b>(ETT-related Forms may be amended for amplification, clarity, or operations ' +
      'over time and re-posted.)</b>'

    ] as string[];

    for(let i=0; i<definitions.length; i++) {
      const text = definitions[i];
      const y1 = basePage.getY();
      basePage = page.nextPageIfNecessary(80);
      const y2 = basePage.getY();
      if(y2 > y1) {
        // A new page was created, so we need to move down to create the top page margin.
        basePage.moveDown(32);
      }
      await drawWrappedText({ text, options, linePad, padBottom });
    }
  }
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ConsentFormPage4.ts')) {

  new ConsentFormPage4(getSampleData()).writeToDisk('./lib/lambda/_lib/pdf/consentForm4.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}