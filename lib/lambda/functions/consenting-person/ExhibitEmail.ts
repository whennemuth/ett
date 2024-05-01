import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from "@aws-sdk/client-sesv2";
import { v4 as uuidv4 } from 'uuid';
import { AffiliateTypes, Entity, YN, ExhibitForm as ExhibitFormData, Consenter } from "../../_lib/dao/entity";
import { ExhibitForm, IExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormFull } from "../../_lib/pdf/ExhibitFormFull";
import { ExhibitFormSingle } from "../../_lib/pdf/ExhibitFormSingle";


export const enum FormTypes { FULL = 'full', SINGLE = 'single' };
export type FormType = FormTypes.FULL | FormTypes.SINGLE;

/**
 * This class represents an email issued by the system on behalf of a consenting individual to either 
 *   1) An authorized individual, where the email contains a pdf attachment that includes all affiliates 
 *      provided by the consenting individual. 
 *   2) An affliate where the email contains a pdf attachment that includes the details of the recipient
 *      only, as excerpted from the full exhibit form.
 */
export class ExhibitEmail {
  private data:ExhibitFormData;
  private formType:FormType;
  private entity:Entity;
  private consenter:Consenter;

  /**
   * @param data The data to build the exhibit form from.
   * @param formType Full or single
   */
  constructor(data:ExhibitFormData, formType:FormType, entity:Entity, consenter:Consenter) {
    this.data = data;
    this.formType = formType;
    this.entity = entity;
    this.consenter = consenter;
  }

  public send = async (emailAddress:string):Promise<boolean> => {
    const { data, formType, entity, consenter, consenter: { fullname } } = this;
    const { entity_name } = entity;
    switch(formType) {
      case FormTypes.FULL:
        return await sendEmail({
          subject: 'ETT Exhibit Form Submission',
          message: `Consenting individual ${fullname} is forwarding you their full affliate list via ETT`,
          emailAddress,
          pdf: new ExhibitFormFull(new ExhibitForm(data), consenter)
        });
      case FormTypes.SINGLE:
        return await sendEmail({
          subject: 'ETT Notice of Consent',
          message: `Consenting individual ${fullname} has named you as an affilate for disclosure to ${entity_name}`,
          emailAddress,
          pdf: new ExhibitFormSingle(new ExhibitForm(data), consenter)
        });
    }
  }
}

type EmailParms = { emailAddress:string, subject:string, message:string, pdf:IExhibitForm };

const sendEmail = async (parms:EmailParms):Promise<boolean> => {
  
  const { subject, message, emailAddress, pdf } = parms;

  const mainBoundary = uuidv4();
  const mainBoundaryStart=`--${mainBoundary}`;
  const mainBoundaryEnd=`${mainBoundaryStart}--`;

  const altBoundary = uuidv4();
  const altBoundaryStart=`--${altBoundary}`;
  const altBoundaryEnd=`${altBoundaryStart}--`;

  const pdfBase64 = bytesToBase64(await pdf.getBytes());

  const rawDataString = 
`From: "Ethical Transparency Tool (ETT)" <${emailAddress}>
To: ${emailAddress}
Subject: ${subject}
Content-Type: multipart/mixed; boundary="${mainBoundary}"

${mainBoundaryStart}
Content-Type: multipart/alternative; boundary="${altBoundary}"

${altBoundaryStart}
Content-Type: text/plain; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

${message}

${altBoundaryStart}
Content-Type: text/html; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

<html>
<head></head>
<body>
<h2>Greetings!</h2>
<p>${message}</p>
</body>
</html>

${altBoundaryEnd}

${mainBoundaryStart}
Content-Type: application/pdf; name="exhibit-form.pdf"
Content-Description: exhibit-form.pdf
Content-Disposition: attachment;filename="exhibit-form.pdf";creation-date="${new Date().toUTCString()}";
Content-Transfer-Encoding: base64

${pdfBase64}

${mainBoundaryEnd}
`;

  const client = new SESv2Client({
    region: process.env.REGION
  });

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: [ emailAddress ]
    },
    FromEmailAddress: emailAddress,
    Content: {
      Raw: {
        Data: Buffer.from(rawDataString, 'utf8')
      }
    }
  } as SendEmailCommandInput);

  let messageId:string|undefined;
  try {
    const response:SendEmailResponse = await client.send(command);
    messageId = response?.MessageId;
  } 
  catch (e:any) {
    console.log(e);
    return false;
  }
  return messageId ? true : false;
}

const bytesToBase64 = (bytes:Uint8Array) => {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}




/**
 * RUN MANUALLY: Modify the task, landscape, email, role, & entity_id as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY') {
  const email = process.env.PDF_RECIPIENT_EMAIL;

  if( ! email) {
    console.log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  const entity = {
    entity_id: 'abc123',
    description: 'Boston University',
    entity_name: 'Boston University',
    active: YN.Yes,
  } as Entity;

  const data = {
    email: 'applicant@gmail.com',
    entity_id: 'abc123',
    fullname: 'Porky Pig',
    phone: '617-234-5678',
    affiliates: [
      { 
        affiliateType: AffiliateTypes.EMPLOYER,
        org: 'Warner Bros.', 
        fullname: 'Foghorn Leghorn', 
        email: 'foghorn@warnerbros.com',
        title: 'Lead animation coordinator',
        phone_number: '617-333-4444'
      },
      {
        affiliateType: AffiliateTypes.ACADEMIC,
        org: 'Cartoon University',
        fullname: 'Bugs Bunny',
        email: 'bugs@cu.edu',
        title: 'Dean of school of animation',
        phone_number: '508-222-7777'
      },
      {
        affiliateType: AffiliateTypes.EMPLOYER,
        org: 'Warner Bros',
        fullname: 'Daffy Duck',
        email: 'daffy@warnerbros.com',
        title: 'Deputy animation coordinator',
        phone_number: '781-555-7777'
      },
      {
        affiliateType: AffiliateTypes.ACADEMIC,
        org: 'Cartoon University',
        fullname: 'Yosemite Sam',
        email: 'yosemite-sam@cu.edu',
        title: 'Professor animation studies',
        phone_number: '617-444-8888'
      }
    ]
  } as ExhibitFormData;
  
  new ExhibitEmail(data, FormTypes.FULL, entity, { fullname:'Porky Pig' } as Consenter).send(email)
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });

}