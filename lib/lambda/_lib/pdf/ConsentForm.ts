import { writeFile } from "fs/promises";
import { IPdfForm, PdfForm } from "./PdfForm";
import { PDFDocument, PDFForm } from "pdf-lib";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Consenter, YN } from "../dao/entity";
import { ConsentFormPage1 } from "./ConsentFormPage1";
import { ConsentFormPage2 } from "./ConsentFormPage2";
import { ConsentFormPage3 } from "./ConsentFormPage3";
import { ConsentFormPage4 } from "./ConsentFormPage4";

export type ConsentFormData = {
  entityName:string, consenter:Consenter
};
export type ConsentFormDrawParms = {
  doc:PDFDocument, form:PDFForm, embeddedFonts:EmbeddedFonts
};

export class ConsentForm extends PdfForm implements IPdfForm {
  private data:ConsentFormData;

  constructor(data:ConsentFormData) {
    super();
    this.data = data;
  }

  /**
   * @returns The bytes for the entire pdf form.
   */
  public async getBytes(): Promise<Uint8Array> {

    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();

    const { doc, form, data, embeddedFonts } = this;

    await new ConsentFormPage1(data).draw({ doc, form, embeddedFonts });

    await new ConsentFormPage2().draw({ doc, form, embeddedFonts });

    await new ConsentFormPage3(data).draw({ doc, form, embeddedFonts });

    await new ConsentFormPage4().draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }  
}




const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENT_FORM') {

  new ConsentForm({
    entityName: 'Boston University',
    consenter: { 
      email: 'bugsbunny@warnerbros.com', firstname: 'Bugs', middlename: 'B', lastname: 'Bunny',
      phone_number: '617-333-5555', consented_timestamp: [ new Date().toISOString() ], active: YN.Yes
    } as Consenter
  } as ConsentFormData).writeToDisk('./lib/lambda/_lib/pdf/consentForm.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}