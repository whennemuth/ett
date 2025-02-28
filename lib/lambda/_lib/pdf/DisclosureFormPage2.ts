import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { FieldAppearanceOptions } from "pdf-lib/cjs/api/form/PDFField";
import { DisclosureFormDrawParms } from "./DisclosureForm";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { Margins, rgbPercent } from "./lib/Utils";
import { roleFullName, Roles } from "../dao/entity";

const blue = rgbPercent(47, 84, 150) as Color;
const orange = rgbPercent(196, 89, 17);
const red = rgbPercent(255, 0, 0);
const grey = rgb(.1, .1, .1) as Color;

export class DisclosureFormPage2 extends PdfForm implements IPdfForm {
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

  public draw = async (drawParms:DisclosureFormDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { drawLogo, drawTitle, drawInstructionsBox, drawIfNothingBox, pageMargins } = this;
    
    // Create the page - use Letter size, but flipped on its side (Landscape)
    this.page = new Page(this.doc.addPage([792.0, 612.0]) as PDFPage, pageMargins, embeddedFonts);

    // Set up the fonts used on this page
    this.boldfont = await this.embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await this.embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawTitle();

    await drawInstructionsBox();

    await drawIfNothingBox();
  };

  private drawTitle = async () => {
    const { page, boldfont } = this;
    this._return();
    await page.drawCenteredText('DISCLOSURE FORM', { size: 13, font:boldfont }, 4);
  }

  private drawInstructionsBox = async () => {
    const { page, page: { basePage, bodyWidth }, boldfont, font } = this;

    const drawTitle = async () => {
      this._return();
      basePage.moveRight(16);
      basePage.moveDown(16);
      await page.drawCenteredText('INSTRUCTIONS TO DISCLOSING ENTITIES', { size: 12, font:boldfont }, 4);
    }

    const drawBlueBoxInstructions = async () => {
      let boxLabel = 'BLUE BOXES: ';
      basePage.drawText(boxLabel, { size: 12, font:boldfont, color:blue }, );
      const labelOffset = boldfont.widthOfTextAtSize(boxLabel, 12)
      basePage.moveRight(labelOffset); 
      basePage.drawText('Check the box(es) for all listed generic types of misconduct ' + 
        'for which your organization made or adopted a',
        { size: 12, font }
      );
      basePage.moveLeft(labelOffset);  
      basePage.moveDown(14);
      await page.drawWrappedText(
        {
          text: `finding of responsibility against the ${roleFullName(Roles.CONSENTING_PERSON)} under your policy. (Apply the ` +
            'substance of the generic descriptions, even if your organization’s policy terminology differs.)',
          options: { size: 12, font },
          horizontalRoom: (bodyWidth - 40),
          linePad: 2
        }
      );
    };

    const drawOrangeBoxInstructions = async () => {
      basePage.moveDown(6);
      let boxLabel = 'ORANGE BOXES: ';
      basePage.drawText(boxLabel, { size: 12, font:boldfont, color:orange }, );
      const labelOffset = boldfont.widthOfTextAtSize(boxLabel, 12)
      basePage.moveRight(labelOffset); 
      basePage.drawText('Provide examples of various types of misconduct that may be included in the ' + 
        'broad categories reflected',
        { size: 12, font }
      );
      basePage.moveLeft(labelOffset);  
      basePage.moveDown(14);
      await page.drawWrappedText(
        {
          text: 'in the blue boxes that you check. Feel free to also check the appropriate orange boxes ' +
            'to provide more detail about the type of misconduct found.  This information is optional, ' +
            'but helpful and requested.',
          options: { size: 12, font },
          horizontalRoom: (bodyWidth - 40),
          linePad: 2
        }
      );

    }

    await drawTitle();

    basePage.drawRectangle({
      borderWidth:2, borderColor:grey, borderOpacity:.2, width:bodyWidth, height:230, 
      x: basePage.getX() - 16, y:basePage.getY() - 196
    });

    await drawBlueBoxInstructions();

    await drawOrangeBoxInstructions();

    basePage.moveDown(8);
    await page.drawText('A “finding of responsibility” is defined by each Disclosing Entity’s own policies, ' + 
      'but may include, e.g.:',
      { size: 12, font }
    );

    basePage.moveDown(6);
    const bullet = '    •   ';
    const bulletWidth = font.widthOfTextAtSize(bullet, 12);
    await page.drawText(`${bullet}When the Disclosing Entity makes or adopts a final determination that a person violated its polic(ies), with all`,
      { size: 12, font }
    );
    basePage.moveRight(bulletWidth);
    await page.drawText('internal rights of appeal concluded or expired; or', { size: 12, font });
    basePage.moveLeft(bulletWidth);
    
    basePage.moveDown(6);
    await page.drawText(`${bullet}When the Disclosing Entity imposes – or a person agrees to accept – “discipline” (as defined by your organization’s`,
      { size: 12, font }
    );
    basePage.moveRight(bulletWidth);
    await page.drawText('policy) related to concerning conduct.', { size: 12, font });
    basePage.moveLeft(bulletWidth);

    basePage.moveDown(6);
    await page.drawWrappedText({
      text: 'A finding of responsibility is “adopted” by the Disclosing Entity if, as permitted by its ' +
        'own policy, the Disclosing Entity relied on a third party’s finding or action.',
        options: { size: 12, font },
        horizontalRoom: (bodyWidth - 40),
        linePad: 2    
    })
  }

  private drawIfNothingBox = async () => {
    const { page, page: { basePage, bodyWidth }, font, form, markPosition, markedPosition, returnToMarkedPosition, _return } = this;

    basePage.moveDown(32);
    basePage.drawRectangle({
      borderWidth:2, borderColor:blue, width:bodyWidth, height:90, 
      x: basePage.getX() - 16, y:basePage.getY() - 68
    });

    const rdoIfNothingReason = form.createRadioGroup('if.nothing.reason');
    await page.drawText(
      '<b>IF NOTHING</b> is checked on the list (#1-8) below, check one of the following:',
      { size: 12, font, color:red }
    );
    const posId = markPosition();

    basePage.moveTo(700, markedPosition(posId).y);
    rdoIfNothingReason.addOptionToPage('reset', basePage, 
    { x: basePage.getX() - 20, y: markedPosition(posId).y + 12, height: 15, width: 15, borderWidth: 0
    } as FieldAppearanceOptions );
    basePage.moveUp(16);
    await page.drawText('<i>reset</i>', { size: 12, font });

    returnToMarkedPosition(posId);
    rdoIfNothingReason.addOptionToPage('no.finding', basePage, 
      { x: basePage.getX(), y: markedPosition(posId).y - 30, height: 20, width: 20, borderWidth: 0
      } as FieldAppearanceOptions );
    basePage.moveDown(16);
    basePage.moveRight(26);
    await page.drawWrappedText(
      {
        text: '<b>No Finding of Responsibility</b> <i>(No finding of responsibility ' +
          'was identified of the types covered by this Disclosure Form)</i>',
        options: {size: 12, font },
        linePad: 2,
        horizontalRoom: 300
      }
    );

    basePage.moveTo(basePage.getX() + 340, markedPosition(posId).y);
    rdoIfNothingReason.addOptionToPage('not.responding', basePage, 
    { x: basePage.getX(), y: markedPosition(posId).y - 30, height: 20, width: 20, borderWidth: 0
    } as FieldAppearanceOptions );
    basePage.moveDown(16);
    basePage.moveRight(26);
    await page.drawWrappedText(
      {
        text: '<b>Will Not Be Responding</b> <i>(Not saying one way or the other ' +
          'whether there is a finding of responsibility)</i>',
        options: {size: 12, font },
        linePad: 2,
        horizontalRoom: 300
      }
    );
    

  }
}



const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/DisclosureFormPage2.ts')) {

  new DisclosureFormPage2().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm2.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}