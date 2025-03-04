import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from "@aws-sdk/client-sesv2";
import { IPdfForm } from "../_lib/pdf/PdfForm";
import { bytesToBase64, error, log } from "../Utils";
import { v4 as uuidv4 } from 'uuid';

export type PdfAttachment = { pdf:IPdfForm, id?:string, name:string, description:string }
export type PngAttachment = { pngBase64:string, id:string, name:string, description:string }
export type EmailParms = { 
  from:string, to:string[], cc?:string[], bcc?:string[], subject:string, message:string, 
  pdfAttachments?:PdfAttachment|PdfAttachment[]
  pngAttachments?:PngAttachment|PngAttachment[]
};

export const sendEmail = async (parms:EmailParms):Promise<boolean> => {
  
  const { subject, to, cc=[], bcc=[], message, from, pdfAttachments=[], pngAttachments=[] } = parms;

  log({ subject, to, cc, bcc, from }, 'Sending email');

  const mainBoundary = uuidv4();
  const mainBoundaryStart=`--${mainBoundary}`;
  const mainBoundaryEnd=`${mainBoundaryStart}--`;

  const altBoundary = uuidv4();
  const altBoundaryStart=`--${altBoundary}`;
  const altBoundaryEnd=`${altBoundaryStart}--`;

  const _pdfAttachments:PdfAttachment[] = pdfAttachments instanceof Array ? pdfAttachments : [ pdfAttachments ];
  const _pngAttachments:PngAttachment[] = pngAttachments instanceof Array ? pngAttachments : [ pngAttachments ];

  let attachmentDataStrings = '';
  for(let i=0; i<_pdfAttachments.length; i++) {
    attachmentDataStrings += await getPdfAttachmentDataString(_pdfAttachments[i], mainBoundaryStart);
  }
  for(let i=0; i<_pngAttachments.length; i++) {
    attachmentDataStrings += await getPngAttachmentDataString(_pngAttachments[i], mainBoundaryStart);
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
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

${message}

${altBoundaryStart}
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html>
<head></head>
<body>
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
    error(e);
    return false;
  }
  return messageId ? true : false;
}

const getPdfAttachmentDataString = async (attachment:PdfAttachment, mainBoundaryStart:string) => {
  const { pdf, description, name, id=`${uuidv4()}` } = attachment;

  const pdfBase64 = bytesToBase64(await pdf.getBytes());

return `
${mainBoundaryStart}
Content-Type: application/pdf; name="${name}"
Content-Description: ${description}
Content-Disposition: attachment;filename="${name}";creation-date="${new Date().toUTCString()}";
Content-Transfer-Encoding: base64
Content-ID: <${id}>

${pdfBase64}
`;
}

const getPngAttachmentDataString = async (attachment:PngAttachment, mainBoundaryStart:string) => {
  const { pngBase64, description, name, id } = attachment;

return `
${mainBoundaryStart}
Content-Type: image/png; name="${name}"
Content-Description: ${description}
Content-Disposition: inline
Content-Transfer-Encoding: base64
Content-ID: <${id}>

${pngBase64}
`;

}