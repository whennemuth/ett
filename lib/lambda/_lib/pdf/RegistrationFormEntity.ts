import { writeFile } from "fs/promises";
import { PDFDocument, PDFForm } from "pdf-lib";
import { Delegate, Roles, User } from "../dao/entity";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { IPdfForm, PdfForm } from "./PdfForm";
import { RegistrationFormEntityPage1 } from "./RegistrationFormEntityPage1";
import { RegistrationFormEntityPage2 } from "./RegistrationFormEntityPage2";
import { RegistrationFormEntityPage3 } from "./RegistrationFormEntityPage3";
import { EntityInfo, UserInfo } from "../../functions/signup/EntityLookup";

export type RegistrationFormEntityData = UserInfo & { 
  termsHref?:string,
  dashboardHref?:string,
  privacyHref?:string
}

export type RegistrationFormEntityDrawParms = {
  doc:PDFDocument, form:PDFForm, embeddedFonts:EmbeddedFonts
};

export class RegistrationFormEntity extends PdfForm implements IPdfForm {
  private data:RegistrationFormEntityData

  constructor(data:RegistrationFormEntityData=getBlankData()) {
    super();
    this.data = data;
  }

  public async getBytes(): Promise<Uint8Array> {

    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();

    let { doc, form, embeddedFonts, data, data: { create_timestamp, dashboardHref, termsHref } } = this;
    termsHref = termsHref ?? '[ ETT terms web address ]';
    dashboardHref = dashboardHref ?? '[ ETT login web address ]';

    await new RegistrationFormEntityPage1(data).draw({ doc, form, embeddedFonts });

    await new RegistrationFormEntityPage2().draw({ doc, form, embeddedFonts });

    await new RegistrationFormEntityPage3(termsHref, dashboardHref, create_timestamp!).draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }
}

/**
 * Return data for use in rendering a "blank" form.
 * @returns 
 */
export const getBlankData = ():RegistrationFormEntityData => {
  const blankDelegate = { email:'', title:'', fullname:'', phone_number:'' } as Delegate;
  const blankUser = { ...blankDelegate, delegate:blankDelegate } as User
  const blankEntityInfo = {
    description:'', entity_name:'', totalUserCount:3, users: [
      { ...blankUser, role:Roles.RE_AUTH_IND }, { ...blankUser, role:Roles.RE_AUTH_IND }
    ]
  } as EntityInfo
  return { ...blankUser, role:Roles.RE_ADMIN, entity:blankEntityInfo } as RegistrationFormEntityData;
}

export const getSampleData = ():RegistrationFormEntityData => {

  const entityName = 'Acme Corporation';
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now()-DAY).toISOString();

  const yosemitesam = {
    email: 'yosemite@warnerbros.com',
    phone_number: '617-222-5555',
    role: Roles.RE_ADMIN,
    fullname: 'Yosemite Sam',
    title: 'Gunslinger',
    create_timestamp: new Date().toISOString(),
  } as User;

  const foghorn = { 
    email: 'foghorn@warnerbros.com', 
    phone_number: '617-222-4444',
    role: Roles.RE_AUTH_IND,
    fullname: 'Foghorn Leghorn',
    title: 'Rooster',
    create_timestamp: yesterday,
    delegate: {
      email: 'wile@warnerbros.com',
      phone_number: '617-222-7777',
      fullname: 'Wile E. Coyote',
      title: 'Road Runner Catcher',
    } as Delegate
  } as User;

  const sylvester = {
    email: 'sylvester@warnerbros.com',
    phone_number: '617-222-3333',
    role: Roles.RE_AUTH_IND,
    fullname: 'Sylvester J. Pussycat Sr.',
    title: 'Mouse Catcher',
    create_timestamp: today,
  } as User;

  return {
    ...foghorn,
    entity: {
      entity_name: entityName,
      entity_name_lower: entityName.toLowerCase(),
      description: 'A company that makes stuff',
      totalUserCount: 3,
      pendingInvitations: [],
      users: [ yosemitesam, sylvester ],
      create_timestamp: today,
      update_timestamp: today,
      entity_id: '12345',
    } as EntityInfo,
    dashboardHref: 'https://www.example.com/login',
    termsHref: 'https://www.example.com/terms',
    privacyHref: 'https://www.example.com/privacy',
  } as RegistrationFormEntityData
}





const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/RegistrationFormEntity.ts')) {

  const outputfile = './lib/lambda/_lib/pdf/RegistrationFormEntity.pdf';
  // const data = getSampleData();
  const data = getBlankData();

  new RegistrationFormEntity(data).writeToDisk(outputfile)
    .then((bytes) => {
      console.log('done');
    })
    .catch(e => {
      console.error(e);
    });
}