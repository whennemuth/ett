import { writeFile } from "node:fs/promises";
import { PDFDocument, PDFForm } from "pdf-lib";
import { bugsbunny, daffyduck, yosemitesam } from '../../functions/authorized-individual/MockObjects';
import { Consenter, User } from "../dao/entity";
import { DisclosureFormPage1 } from "./DisclosureFormPage1";
import { DisclosureFormPage2 } from "./DisclosureFormPage2";
import { DisclosureFormPage3 } from "./DisclosureFormPage3";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { DisclosureFormPage4 } from "./DisclosureFormPage4";
import { DisclosureFormPage5 } from "./DisclosureFormPage5";

export type RequestingEntity = {
  name:string, authorizedIndividuals:User[]
};
export type DisclosingEntity = {
  name:string, representatives:User[]
};
export type DisclosureFormData = {
  consenter:Consenter,
  requestingEntity:RequestingEntity,
  disclosingEntity:DisclosingEntity
};
export type DisclosureFormDrawParms = {
  doc:PDFDocument, form:PDFForm, embeddedFonts:EmbeddedFonts
};

export class DisclosureForm extends PdfForm implements IPdfForm{
  private data:DisclosureFormData;

  constructor(data:DisclosureFormData) {
    super();
    this.data = data;
  }
  
  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes():Promise<Uint8Array> {

    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();

    const { doc, form, data, embeddedFonts } = this;

    await new DisclosureFormPage1(data).draw({ doc, form, embeddedFonts });

    await new DisclosureFormPage2().draw({ doc, form, embeddedFonts });

    await new DisclosureFormPage3().draw({ doc, form, embeddedFonts });

    await new DisclosureFormPage4().draw({ doc, form, embeddedFonts });

    await new DisclosureFormPage5().draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }
}





const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_DISCLOSURE_FORM') {

  new DisclosureForm({
    consenter: { 
      email: 'foghorn@warnerbros.com', phone_number: '617-222-4444', fullname: 'Foghorn Leghorn' },
      disclosingEntity: { name: 'Boston University', representatives: [ daffyduck, yosemitesam ] },
      requestingEntity: { name: 'Northeastern University', authorizedIndividuals: [ bugsbunny ]
    }
  } as DisclosureFormData).writeToDisk('./lib/lambda/_lib/pdf/disclosureForm.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });
}