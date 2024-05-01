import { writeFile } from "node:fs/promises";
import { Affiliate, AffiliateTypes, Consenter, ExhibitForm as ExhibitFormData } from "../dao/entity";
import { ExhibitForm, IExhibitForm } from "./ExhibitForm";

export class ExhibitFormSingle implements IExhibitForm {
  private baseForm:ExhibitForm;
  private consenter:Consenter;

  constructor(baseForm:ExhibitForm, consenter:Consenter) {
    this.baseForm = baseForm;
    this.consenter = consenter;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {
    const { baseForm, drawTitle, drawIntro } = this;

    await baseForm.initialize();

    const { doc, data, drawLogo, drawAffliate } = baseForm;

    drawLogo();

    drawTitle();

    drawIntro();

    drawAffliate(data.affiliates![0] as Affiliate, 10);

    const pdfBytes = await doc.save();
    return pdfBytes;
  }

  /**
   * Draw the title and subtitle
   */
  private drawTitle = () => {
    const { page, boldfont, font } = this.baseForm;
    page.drawCenteredText('ETHICAL TRANSPARENCY TOOL (ETT)', { size: 12, font:boldfont }, 4);
    page.drawCenteredText('Single Exhibit Form – Consent Recipients/Affiliates', { size:10, font }, 8);
  }

  /**
   * Draw the introductory language
   */
  private drawIntro = () => {
    const { consenter, baseForm: { page, boldfont }} = this;
    const size = 10;
    page.drawWrappedText(`This Single Exhibit Form was prepared by ${consenter.fullname} as part of ` + 
      `an exhibit form provided to an ETT authorized individual listing you as a known Consent Recipient. ` +
      `The definitions in their Consent Form also apply to this single Exhibit Form.`,
      { size, font:boldfont }, 4, 8
    );
    page.drawWrappedText('Yours may be one of a number of consent recipients provided to the ETT authorized individual.',
      { size, font:boldfont }, 4, 8);
    page.drawText('Your full details as Consent Recipient:', { size, font:boldfont }, 16);
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
