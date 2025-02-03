import { writeFile } from "fs/promises";
import { PageSizes, PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions, StandardFonts } from "pdf-lib";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, rgbPercent } from "./lib/Utils";
import { IPdfForm, PdfForm } from "./PdfForm";
import { RegistrationFormEntityDrawParms } from "./RegistrationFormEntity";

const red = rgbPercent(255, 0, 0);

export class RegistrationFormEntityPage2 extends PdfForm implements IPdfForm {
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
    const { doc, form, embeddedFonts, draw } = this;

    await draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

  public draw = async (drawParms:RegistrationFormEntityDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { pageMargins,  } = this;

    // Create the page
    this.page = new Page(doc.addPage(PageSizes.Letter) as PDFPage, pageMargins, embeddedFonts); 

    // Set up the fonts used on this page
    this.boldfont = await embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    const { page, drawLogo, drawDisclaimerPart2, drawPurposes } = this;

    await drawLogo(page);

    await drawDisclaimerPart2();

    await drawPurposes();
  }

  private drawDisclaimerPart2 = async () => {
    const { page, page: { basePage }, boldfont, _return } = this;
    const size = 10;
    basePage.moveDown(16);
    const draw = async (text:string) => {
      await page.drawWrappedText({
        text,
        options: { size, font:boldfont, color:red, lineHeight: 12 },
        linePad: 2
      });
    }
    await draw( 
      '<i>information, on a list of ETT-Registered Entities that is made publicly available. Your organization’s ' +
      'and representatives’ information will be removed from lists of current ETT-Registered Entities upon ' +
      'termination of the organization’s registration. If there is a change in an ETT-Registered Entity’s ' +
      'Authorized Representative(s), the removed representative(s) will be removed from lists of current ' +
      'ETT-Registered Entities; successors will then be included. Lists of ETT-Registered Entities ' +
      '(with or without their representative(s) names and contact information) may be used to operate, ' +
      'publicize, and recruit additional entities to use ETT and to support ETT-Registered Entities’ ' +
      'ability to use ETT efficiently. Any such reference will not include an endorsement of ETT or state ' +
      'the specific way (within all the permitted ways) in which your organization is or was using ETT, ' +
      'unless an Authorized Individual gives additional written consent. (ETT may be abbreviated or spelled ' +
      'out as the Ethical Transparency Tool.)</i>'
    );

    _return(16);

    await draw(
      '<i>Mere listing of your organization and its representatives as an ETT-Registered Entity is not deemed ' +
      'an endorsement. ETT may communicate aggregated data on the way ETT-Registered Entities use ETT and ' +
      'the impact of the tool.</i>');

    _return(24);
  }

  private drawPurposes = async () => {
    const { page, page: { drawWrappedText }, font, _return } = this;
    const options = { size:10, font, lineHeight: 12 } as PDFPageDrawTextOptions;

    await drawWrappedText({
      text: 
        'For what purposes does your entity plan to use the Ethical Transparency Tool (ETT) during the ' + 
        'pilot  <i><-1>(check all that apply—this does not limit your organization to checked uses going forward):</-1></i>',
      options,
      linePad: 2
    });
    _return(8);

    const purposes = [
      'Honors', 
      'Awards', 
      'Governance positions', 
      'Leadership Positions', 
      'Employment', 
      'Privileges-Specify:________________', 
      'Other: ___________________'
    ] as string[];

    const drawPurpose = async (purpose:string) => {
      await page.drawText(`    [ ] ${purpose}`, options, 8);
    }

    for(const purpose of purposes) await drawPurpose(purpose);
  }
}



const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/RegistrationFormEntityPage2.ts')) {

  const outputfile = './lib/lambda/_lib/pdf/RegistrationFormEntityPage2.pdf';

  new RegistrationFormEntityPage2().writeToDisk(outputfile)
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}