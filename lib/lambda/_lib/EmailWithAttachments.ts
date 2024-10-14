import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from "@aws-sdk/client-sesv2";
import { IPdfForm } from "../_lib/pdf/PdfForm";
import { bytesToBase64 } from "../Utils";
import { v4 as uuidv4 } from 'uuid';

export type Attachment = { pdf:IPdfForm, name:string, description:string }
export type EmailParms = { 
  from:string, to:string[], cc?:string[], bcc?:string[], subject:string, message:string, attachments:Attachment|Attachment[] 
};

export const sendEmail = async (parms:EmailParms):Promise<boolean> => {
  
  const { subject, to, cc=[], bcc=[], message, from, attachments } = parms;

  const mainBoundary = uuidv4();
  const mainBoundaryStart=`--${mainBoundary}`;
  const mainBoundaryEnd=`${mainBoundaryStart}--`;

  const altBoundary = uuidv4();
  const altBoundaryStart=`--${altBoundary}`;
  const altBoundaryEnd=`${altBoundaryStart}--`;

  const _attachments:Attachment[] = attachments instanceof Array ? attachments : [ attachments ];

  let attachmentDataStrings = '';
  for(let i=0; i<_attachments.length; i++) {
    attachmentDataStrings += await getAttachmentDataString(_attachments[i], mainBoundaryStart, mainBoundaryEnd);
  }

  const toLine = `To: ${to.join(', ')}`
  const ccLine = cc.length == 0 ? '' : `\nCc: ${cc?.join(', ')}`;
  // NOTE: If using a proxy to reroute emails to one email address, the bcc email will NOT arrive.
  const bccLine = bcc.length == 0 ? '' : `\nBcc: ${bcc?.join(', ')}`;
  const destinations = `${toLine}${ccLine}${bccLine}`

  const rawDataString = 
`From: "Ethical Transparency Tool (ETT)" <${from}>
${destinations}
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

${attachmentDataStrings}

${mainBoundaryEnd}
`;

  const client = new SESv2Client({
    region: process.env.REGION
  });

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: to,
      CcAddresses: cc,
      BccAddresses: bcc
    },
    FromEmailAddress: from,
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

const getAttachmentDataString = async (attachment:Attachment, mainBoundaryStart:string, mainBoundaryEnd:string) => {
  const { pdf, description, name } = attachment;

  const pdfBase64 = bytesToBase64(await pdf.getBytes());

return `
${mainBoundaryStart}
Content-Type: application/pdf; name="${name}"
Content-Description: ${description}
Content-Disposition: attachment;filename="${name}";creation-date="${new Date().toUTCString()}";
Content-Transfer-Encoding: base64

${pdfBase64}
`;
}