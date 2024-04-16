import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { Affiliate, AffiliateType, AffiliateTypes, ExhibitData, ExhibitForm, blue, white } from './ExhibitForm';
import { Align, Rectangle, VAlign } from './lib/Rectangle';
import { Margins } from './lib/Utils';

/**
 * This class represents an exhibit pdf form that can be dynamically generated around the provided exhibit data.
 */
export class ExhibitFormFull {
  private baseForm:ExhibitForm

  constructor(baseForm:ExhibitForm) {
    this.baseForm = baseForm;
  }

  public async getBytes():Promise<Uint8Array> {
    const { baseForm, drawTitle, drawIntro, drawAffiliateGroup } = this;

    await baseForm.initialize();

    const { doc, drawLogo } = baseForm;

    drawLogo();

    drawTitle();

    drawIntro();

    drawAffiliateGroup(AffiliateTypes.EMPLOYER, 'Employers');

    drawAffiliateGroup(AffiliateTypes.ACADEMIC, 'Academic / Professional Societies & Organizations');

    drawAffiliateGroup(AffiliateTypes.OTHER, 'Other Affiliated Organizations');

    const pdfBytes = await doc.save();
    return pdfBytes;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = () => {
    const { page, boldfont, font } = this.baseForm;
    page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    page.drawCenteredText('Full Exhibit Form – Consent Recipients/Affiliates', { size:10, font }, 8);
  }

  /**
   * Draw the introductory language
   */
  private drawIntro = () => {
    const { page, boldfont, data } = this.baseForm;
    const size = 10;
    page.drawWrappedText(`This Full Exhibit Form was prepared by ${data.fullname} and provides ` + 
      `an up-to-date list of the names and contacts for their known Consent Recipients on the ` +
      `date of this Exhibit.  The definitions in their Consent Form also apply to this Full ` + 
      `Exhibit Form.`,
      { size, font:boldfont }, 4, 8
    );
    page.drawWrappedText('Each consent recipient below has received a copy of this form with ' +
      'the details of the other recipients redacted.',
      { size, font:boldfont }, 4, 8);
    page.drawText('Full known Consent Recipient(s) list:', { size, font:boldfont }, 16);
  }

  /**
   * Draw all affiliates of a specified type
   * @param affiliateType 
   * @param title 
   */
  private drawAffiliateGroup = (affiliateType:AffiliateType, title:string) => {
    const { page, font, boldfont, data, _return, drawAffliate } = this.baseForm;
    let size = 10;

    new Rectangle({
      text: title,
      page,
      align: Align.center,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:blue, width:page.bodyWidth, height:16 },
      textOptions: { size, font:boldfont, color: white },
      margins: { left: 8 } as Margins
    }).draw(() => {
      page.basePage.moveDown(16);
      const affiliates = (data.affiliates as Affiliate[]).filter(affiliate => affiliate.type == affiliateType);
      affiliates.forEach(a => {
        drawAffliate(a, size);
        _return(4);
      });
      if(affiliates.length == 0) {
        new Rectangle({
          text: 'None',
          page,
          align: Align.center, valign: VAlign.middle,
          options: { borderWidth:1, borderColor:blue, width:page.bodyWidth, height:16 },
          textOptions: { size, font }
        }).draw(() => {});
      }
      _return(16);
    });
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

  public async readFromDisk(path:string) {
    const buf:Buffer = await readFile(path);
    const pdf = await PDFDocument.load(buf) as PDFDocument;
    console.log(JSON.stringify(pdf.catalog, Object.getOwnPropertyNames(pdf.catalog), 2));
  }
}

const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY') {

  const baseForm = new ExhibitForm({
    email: 'applicant@gmail.com',
    fullname: 'Porky Pig',
    phone: '617-234-5678',
    affiliates: [
      { 
        type: AffiliateTypes.EMPLOYER,
        organization: 'Warner Bros.', 
        fullname: 'Foghorn Leghorn', 
        email: 'foghorn@warnerbros.com',
        title: 'Lead animation coordinator',
        phone: '617-333-4444'
      },
      {
        type: AffiliateTypes.ACADEMIC,
        organization: 'Cartoon University',
        fullname: 'Bugs Bunny',
        email: 'bugs@cu.edu',
        title: 'Dean of school of animation',
        phone: '508-222-7777'
      },
      {
        type: AffiliateTypes.EMPLOYER,
        organization: 'Warner Bros',
        fullname: 'Daffy Duck',
        email: 'daffy@warnerbros.com',
        title: 'Deputy animation coordinator',
        phone: '781-555-7777'
      },
      {
        type: AffiliateTypes.ACADEMIC,
        organization: 'Cartoon University',
        fullname: 'Yosemite Sam',
        email: 'yosemite-sam@cu.edu',
        title: 'Professor animation studies',
        phone: '617-444-8888'
      }
    ]
  } as ExhibitData);
  
  new ExhibitFormFull(baseForm).writeToDisk('./lib/lambda/_lib/pdf/outputFull.pdf')
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}







