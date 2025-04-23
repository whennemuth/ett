import { Color, PDFDocument, PDFFont, PDFPageDrawTextOptions, StandardFonts, rgb } from "pdf-lib";
import { Configurations, DurationType } from "../config/Config";
import { Affiliate, AffiliateType, AffiliateTypes, ConfigNames, Consenter, Entity, ExhibitFormConstraint, ExhibitFormConstraints, ExhibitForm as ExhibitFormData, FormType, FormTypes } from "../dao/entity";
import { PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Rectangle } from "./lib/Rectangle";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";
import { humanReadableFromSeconds } from "../timer/DurationConverter";
import { consentFormUrl } from "../../functions/consenting-person/ConsentingPersonUtils";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;
export const white = rgb(1, 1, 1) as Color;
export const red = rgbPercent(255, 0, 0);

export type ExhibitFormParms = {
  data:ExhibitFormData,
  entity:Entity,
  consenter:Consenter,
  consentFormUrl:string,
  affiliateEmail?:string
}

export type ItemParagraph = { text:string, options:PDFPageDrawTextOptions, estimatedHeight?:number };
export type ItemParms = { paragraphs:ItemParagraph[] };
export type BigRedButtonParms = { text:string, description:string, descriptionHeight:number };
export type DrawAffiliateGroupParms = { affiliateType:AffiliateType, orgHeaderLines:string[], title?:string };

/**
 * This is a baseline exhibit form. It is passed to variants to provide generalized function common to any variant.
 */
export class ExhibitForm extends PdfForm {

  // Default the parms to a blank object
  private parms:ExhibitFormParms;
  private blankForm:boolean = false;
  private staleEntityDays:number;
  private staleEntityPeriod:string;
  private secondReminderDays:number;
  private secondReminderPeriod:string;
  
  font:PDFFont;
  boldfont:PDFFont;
  
  constructor(parms:ExhibitFormParms) {
    super();
    this.parms = parms;
    this.pageMargins = { top: 35, bottom: 35, left: 50, right: 40 } as Margins;
  }

  public async initialize() {
    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.boldfont = await this.embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await this.embeddedFonts.getFont(StandardFonts.Helvetica);
  }

  public get data() {
    return this.parms.data;
  }

  public get entityId() {
    return this.parms.entity.entity_id;
  }

  public get entityName() {
    return this.parms.entity.entity_name;
  }

  public get consentFormUrl() {
    return this.parms.consentFormUrl;
  }
  public set consentFormUrl(url:string) {
    this.parms.consentFormUrl = url;
  }

  public get consenter() {
    return this.parms.consenter;
  }

  public get isBlankForm():boolean{
    return this.blankForm;
  }
  public set isBlankForm(blank:boolean) {
    this.blankForm = blank;
  }

  /**
   * Get the number of days after which an entity is considered stale from the app configuration.
   * @returns 
   */
  public getStaleEntityPeriod = async():Promise<string> => {
    if( ! this.staleEntityPeriod) {
      const { getAppConfig } = new Configurations();
      const { STALE_ASP_VACANCY, STALE_AI_VACANCY } = ConfigNames;
      const staleAI = await getAppConfig(STALE_AI_VACANCY)
      const staleASP = await getAppConfig(STALE_ASP_VACANCY);
      const seconds = staleAI.getDuration(DurationType.SECOND) + staleASP.getDuration(DurationType.SECOND);
      this.staleEntityPeriod = humanReadableFromSeconds(seconds);
    }
    return this.staleEntityPeriod;;
  }

  /**
   * Get the number of days after which a second reminder is sent to an affiliate from the app configuration.
   * @returns 
   */
  public getSecondReminderPeriod = async():Promise<string> => {
    if( ! this.secondReminderPeriod) {
      const { getAppConfig } = new Configurations();
      const { SECOND_REMINDER } = ConfigNames;
      const seconds = (await getAppConfig(SECOND_REMINDER)).getDuration(DurationType.SECOND);
      this.secondReminderPeriod = humanReadableFromSeconds(seconds);
    }
    return this.secondReminderPeriod;
  }

  /**
   * Draw a single affiliate.
   * @param a The affiliate data.
   * @param size The size of the font to be used.
   */
  public drawAffliate = async (a:Affiliate, size:number, orgHeaderLines:string[]) => {
    const { 
      page, page: { basePage }, font, boldfont, _return, markPosition, 
      returnToMarkedPosition: returnToPosition
    } = this;

    // Draw the organization row
    const lineHeight = 10;
    const height = 16 + (orgHeaderLines.length - 1) * lineHeight;
    const width = 150;

    // let height = 16;
    if(orgHeaderLines.length > 1) {
      _return(lineHeight);
    }

    _return();
    let rightMargin = 8;
    let xOffset = width - boldfont.widthOfTextAtSize(orgHeaderLines[0], size) - rightMargin;
    await new Rectangle({
      text:orgHeaderLines[0],
      page,
      align: Align.right,
      valign: VAlign.top,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width, height },
      textOptions: { size, font:boldfont },
      margins: { right:rightMargin, top:2 } as Margins
    }).draw();

    if(orgHeaderLines.length > 1) {
      xOffset = width - boldfont.widthOfTextAtSize(orgHeaderLines[1], size) - rightMargin;
      basePage.drawText(orgHeaderLines[1], { 
        x: basePage.getX() + xOffset, y: basePage.getY() + 6, size, font: boldfont 
      });
    }
    
    basePage.moveRight(width); 

    await new Rectangle({
      text: a.org, page,
      align: Align.left, valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - width), height },
      textOptions: { size, font },
      margins: { left: 8 } as Margins
    }).draw();
    _return(64);

    // Draw the point of contact rows
    const posId = markPosition();
    await new Rectangle({
      text: [ 'Point of', 'Contact' ],
      page,
      align: Align.center,
      valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:75, height:64 },
      textOptions: { size, font:boldfont },
    }).draw();
    returnToPosition(posId);
    basePage.moveUp(48);

    const items = [ [ 'Fullname', a.fullname ], [ 'Job Title', a.title ], [ 'Email', a.email ], [ 'Phone Nbr', a.phone_number ] ]
    for(let i=0; i<items.length; i++) {
      const item = items[i];
      _return();
      basePage.moveRight(75);
      await new Rectangle({
        text: item[0] || '',
        page,
        align: Align.right,
        valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:75, height:16 },
        textOptions: { size, font:boldfont },
        margins: { right: 8 } as Margins
      })
      .draw();
      basePage.moveRight(75);

      await new Rectangle({
        text: item[1] || '',
        page,
        align: Align.left,
        valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - width), height:16 },
        textOptions: { size, font },
        margins: { left: 8 } as Margins
      }).draw();
      basePage.moveDown(16);
    }
  }

  /**
   * Draw all affiliates of a specified type
   * @param affiliateType 
   * @param title 
   */
  public drawAffiliateGroup = async (parms:DrawAffiliateGroupParms) => {
    const { parms: { affiliateEmail }} = this;
    const { affiliateType, orgHeaderLines, title } = parms;
    const { page, page: { nextPageIfNecessary }, boldfont, data, _return, drawAffliate, markPosition, getPositionalChange } = this;
    let size = 9;

    const affiliates = (data.affiliates as Affiliate[]).filter(affiliate => {
      const { parms: { data: { formType }}} = this;
      const { affiliateType:affType } = affiliate;
      if(formType == FormTypes.SINGLE) {
        return affiliate.email == affiliateEmail
      }
      else {
        return affType == affiliateType
      }
    });

    if(affiliates.length > 0) {
      nextPageIfNecessary(150, () => _return(16));
    }

    if(title) {
      page.basePage.moveDown(16);
      await new Rectangle({
        text: title,
        page,
        align: Align.center,
        valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, color:blue, width:page.bodyWidth, height:16 },
        textOptions: { size, font:boldfont, color: white },
        margins: { left: 8 } as Margins
      }).draw();
      page.basePage.moveDown(16);
    }

    if(affiliates.length == 0) {
      return;
    }

    // Iterate over each affiliate and draw it. The height of each should be approximately the same.
    const posId = markPosition();
    let affiliateHeight = 0;
    for(let i=0; i<affiliates.length; i++) {
      const a = affiliates[i];
      await drawAffliate(a, size, orgHeaderLines);
      _return(4);
      if(affiliateHeight == 0) {
        // Get the height of the first affiliate to determine if the next affiliate will fit on the page.
        affiliateHeight = Math.abs(getPositionalChange(posId).y);
      }
      else {
        // Go to the next page if the remaining vertical space is insufficient to draw another affiliate.
        page.nextPageIfNecessary(affiliateHeight, () => _return(16));        
      }
    };
  }
  
  /**
   * Get the textual content for the organization column header for a given affiliate type.
   * @param affType 
   * @returns 
   */
  public getOrgHeaderLines = (affType:AffiliateType):string[] => {
    const { ACADEMIC, EMPLOYER, EMPLOYER_PRIMARY, EMPLOYER_PRIOR, OTHER } = AffiliateTypes;
    switch(affType) {
      case EMPLOYER_PRIMARY:
       return [ 'Primary Current Employer' ];
      case EMPLOYER:
        return [ 'Current Employer or Appointing /', 'Organization (no acronyms)' ];
      case EMPLOYER_PRIOR: case ACADEMIC: case OTHER:
        return [ 'Organization (no acronyms)' ];
    }
  }

  /**
   * Pick a constraint that best fits the affiliate type.
   * 
   * NOTE: This call is being made in the context of selecting the type of single exhibit form, by constraint,
   * for corrections. Currently, constraint is not a part of the file storage path naming methodology. Therefore, it
   * is not possible to determine what the original constraint was of the single exhbit form being corrected. 
   * Thus, it is possible that a single exhibit form originally derived from a "BOTH" full exhibit
   * form will be based on the "EMPLOYER" constraint - which means that the single exhbit form being corrected will
   * be rendered from the ExhibitFormSingleCurrent.ts file, not the ExhibitFormSingleBoth.ts file, which is ok 
   * for now because they do not differ enough to warrant adding further complexity to the file storage naming conventions.
   * @param affType 
   * @returns 
   */
  public static getConstraintFromAffiliateType = (affType:AffiliateType):ExhibitFormConstraint => {
    const { ACADEMIC, EMPLOYER, EMPLOYER_PRIMARY, EMPLOYER_PRIOR, OTHER } = AffiliateTypes;
    const { CURRENT, OTHER:OtherConstraint } = ExhibitFormConstraints;
    switch(affType) {
      case EMPLOYER_PRIMARY: case EMPLOYER:
        return CURRENT;
      case EMPLOYER_PRIOR: case ACADEMIC: case OTHER: default:
        return OtherConstraint;
    }
  }

  /**
   * Draw the signature textbox and related date, cellphone, and email textboxes.
   * @param formDescription 
   */
  public drawSignature = async (formDescription:string) => {
    const { 
      parms: { affiliateEmail, data: { formType, affiliates } },
      page, page: { bodyWidth, margins, drawRectangle, drawText, nextPageIfNecessary }, 
      getFullName, isBlankForm, font, boldfont, _return } = this;
    const { data: { sent_timestamp, signature }, consenter: { firstname, middlename, lastname, email, phone_number }} = this.parms;

    const basePage = nextPageIfNecessary(200);

    const getSignature = ():string => {
      let sig:string|undefined;
      if(formType == FormTypes.SINGLE) {
        sig = affiliates?.find(a => a.email == affiliateEmail)?.consenter_signature;
      }
      return sig ?? ( signature ?? getFullName(firstname, middlename, lastname));
    }

    _return(20);

    await drawText(`<i>Please type your full name (First Middle Last) to digitally sign this ${formDescription}</i>`,
    {
      size:12, font, color:grey
    });
    basePage.moveDown(50);

    await drawRectangle({
      text: [ 'Signature', '<-5>Click to digitally sign</-5>' ],
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { color:blue, width:120, height:50 },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    basePage.drawSquare({
      borderWidth:2, size:12, borderColor:white, color:blue, x:basePage.getX()+7, y:basePage.getY()+6
    });
    if( ! isBlankForm) {
      basePage.drawText('X', {
        color:white, size:10, font:boldfont, x:basePage.getX()+9.5, y:basePage.getY()+8
      })
    }

    await drawRectangle({
      text: getSignature(),
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 120), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: 240
      },
      textOptions: { size:12, font, color:grey }
    });
    await drawRectangle({
      text: 'Date',
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { 
        x:(margins.left + 360),
        y:basePage.getY(), 
        color:blue, 
        width:60, 
        height:50 
      },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });

    // Format the date into UTC and split it into two lines so that it fits in the box.
    let sigdate = [ '' ];
    if( ! isBlankForm) {
      const sigdateStr = sent_timestamp? new Date(sent_timestamp) : new Date();
      const sigdateUTC = sigdateStr.toUTCString().split(' ');
      sigdate = [ sigdateUTC.slice(0, 4).join(' '), sigdateUTC.slice(4).join() ];
    }

    await drawRectangle({
      text: sigdate,
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 420), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: (bodyWidth - 420)
      },
      textOptions: { size:12, font, color:grey }
    });

    _return(60);

    // Draw the cellphone field column
    await drawRectangle({
      text: 'Cell Phone:',
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { color:blue, width:120, height:50 },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    await drawRectangle({
      text: phone_number ?? '',
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 120), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: 120
      },
      textOptions: { size:12, font, color:grey }
    });

    // Draw the email field column
    await drawRectangle({
      text: 'Email:',
      page, margins: { left:0, top:6, bottom:0, right:6 },
      align: Align.right, valign: VAlign.middle,
      options: { 
        x:(margins.left + 240),
        y:basePage.getY(), 
        color:blue, 
        width:60, 
        height:50 
      },
      textOptions: { size:14, font:boldfont, color:white, lineHeight: 16 }
    });
    await drawRectangle({
      text: email ?? '',
      page, margins: { left:6, top:6, bottom:0, right:6 },
      align: Align.left, valign: VAlign.middle,
      options: {
        x: (margins.left + 300), 
        y:basePage.getY(), 
        color:grey, opacity:.2, 
        height: 50, 
        width: (bodyWidth - 300)
      },
      textOptions: { size:12, font, color:grey }
    });
  }
  
  private orderedItemCounter = { count: 0 };
  /**
   * Draw one of a set of paragraphs, ordered with lettering.
   * @param parms 
   */
  public drawOrderedItem = async (parms:ItemParms) => {
    const { page: { 
      bodyWidth, drawWrappedText, nextPageIfNecessary 
    }, boldfont, _return, orderedItemCounter } = this;    
    const { paragraphs } = parms;
    let basePage = this.page.basePage;
    const nextLetter = () => 'abcdefghijklmnopqrstuvwxyz'[orderedItemCounter.count++];

    for(let i=0; i<paragraphs.length; i++) {
      const { text, options, estimatedHeight } = paragraphs[i];
      basePage = nextPageIfNecessary(estimatedHeight ?? 60, () => _return(16));
      if(i == 0) {
        // Draw the line with the bullet
        basePage.moveRight(10);
        basePage.drawText(`(${nextLetter()}) `, { font:boldfont, size:12, lineHeight:14 });
        basePage.moveRight(18);
        basePage.moveUp(1);
      } 
      else {
        basePage.moveDown(16);
      }
      await drawWrappedText({ text, options, linePad:6, horizontalRoom:(bodyWidth - 30) });
    }
    basePage.moveLeft(28);
    basePage.moveDown(16);
  }

  /**
   * Draw one of a set of of bulleted paragraphs.
   * @param parms 
   */
  public drawBulletedItem = async (parms:ItemParms) => {
    const { page: { bodyWidth, drawWrappedText, nextPageIfNecessary }, boldfont, _return } = this;    
    const { paragraphs } = parms;
    let basePage = this.page.basePage;

    for(let i=0; i<paragraphs.length; i++) {
      const { text, options, estimatedHeight } = paragraphs[i];
      basePage = nextPageIfNecessary(estimatedHeight ?? 60, () => _return(16));
      if(i == 0) {
        basePage.moveRight(10);
        basePage.drawText('· ', { font:boldfont, size:24, lineHeight:14 });
        basePage.moveRight(10);
        basePage.moveUp(5);
      }
      else {
        basePage.moveDown(16);
      }
      await drawWrappedText({ text, options, linePad:4, horizontalRoom: bodyWidth - 20 });
    }
    basePage.moveLeft(20);
    basePage.moveDown(20);
  }

  /**
   * Draw a large red button with a white lable and a description to the right.
   * @param parms 
   */
  public drawBigRedButton = async (parms:BigRedButtonParms) => {
    const { text, description, descriptionHeight } = parms;
    const { _return, page, page: { drawRectangle, drawWrappedText, bodyWidth, basePage, margins }, boldfont, font } = this;

    const buttonHeight = 60;
    const textSize = 18;
    const textWidth = boldfont.widthOfTextAtSize(text, textSize);
    const buttonWidth = textWidth > (buttonHeight * 2) ? (textWidth + 12) : (buttonHeight * 2);
    const rightMargin = (buttonWidth - textWidth) / 2;

    _return(buttonHeight);

    // Draw the button
    await drawRectangle({
      text,
      page, margins: { left:0, top:0, bottom:0, right:rightMargin },
      align: Align.right, valign: VAlign.middle,
      options: { 
        x:(margins.left),
        y:basePage.getY(), 
        color:red, 
        width:buttonWidth, 
        height:buttonHeight 
      },
      textOptions: { size:textSize, font:boldfont, color:white, lineHeight: 16 }
    });

    // Jog back up and over to the right to draw the description centered and padded on the right side of the button.
    const padLeft = 8;
    const horizontalRoom = (bodyWidth - 20) - buttonWidth - padLeft;
    const textHeight = font.heightAtSize(9);
    basePage.moveRight(buttonWidth + padLeft);
    if(descriptionHeight > buttonHeight) {
      basePage.moveDown((descriptionHeight - buttonHeight) / 2);
    }
    else {
      basePage.moveUp(buttonHeight - ((buttonHeight - descriptionHeight) / 2) - textHeight);
    }
    await drawWrappedText({
      text:description, options: { size:9, font  }, linePad: 2, horizontalRoom
    });
  }

  /**
   * This set of parms will be used to render a "blank" version of the exhibit form.
   * @returns 
   */
  public static getBlankForm = (formType:FormType, affiliateTypes:AffiliateTypes[]):ExhibitForm => {
    const getBlankAffiliate = (affiliateType:AffiliateTypes):Affiliate => { 
      return { affiliateType, org: '', fullname: '', title: '', email: '', phone_number: '' } 
    };

    const parms = {
      data: { formType, affiliates: affiliateTypes.map(aType => getBlankAffiliate(aType)) } as ExhibitFormData,
      entity: { entity_id: '', entity_name: '' } as Entity,
      consenter: { firstname: '', middlename: '', lastname: '', email: '', phone_number: '' } as Consenter,
      consentFormUrl: consentFormUrl('[consenter_email]')
    }

    const form = new ExhibitForm(parms);
    form.isBlankForm = true;

    return form;
  }
}

export type SampleAffiliates = {
  employerPrimary:Affiliate, employer1:Affiliate, employer2:Affiliate, employerPrior:Affiliate, 
  academic1:Affiliate, academic2:Affiliate, other:Affiliate
}
export const getSampleAffiliates = ():SampleAffiliates => {
  const { EMPLOYER, EMPLOYER_PRIMARY, EMPLOYER_PRIOR, ACADEMIC, OTHER } = AffiliateTypes;
  const employerPrimary = {
    affiliateType: EMPLOYER_PRIMARY,
    org: 'The Actors Guild',
    fullname: 'Orson Welles',
    email: 'orson@the-guild.com',
    title: 'Lead actor',
    phone_number: '617-555-1212'
  };
  const employer1 = { 
    affiliateType: EMPLOYER,
    org: 'Warner Bros.', 
    fullname: 'Foghorn Leghorn', 
    email: 'foghorn@warnerbros.com',
    title: 'Lead animation coordinator',
    phone_number: '617-333-4444'
  };
  const employer2 = {
    affiliateType: EMPLOYER,
    org: 'Warner Bros',
    fullname: 'Daffy Duck',
    email: 'daffy@warnerbros.com',
    title: 'Deputy animation coordinator',
    phone_number: '781-555-7777'
  };
  const employerPrior = {
    affiliateType: EMPLOYER_PRIOR,
    email: "affiliate1@warhen.work",
    org: "My Neighborhood University",
    fullname: "Mister Rogers",
    title: "Daytime child television host",
    phone_number: "0123456789"
  };
  const academic1 = {
    affiliateType: ACADEMIC,
    org: 'Cartoon University',
    fullname: 'Bugs Bunny',
    email: 'bugs@cu.edu',
    title: 'Dean of school of animation',
    phone_number: '508-222-7777'
  };
  const academic2 = {
    affiliateType: ACADEMIC,
    org: 'Warner Bros.',
    fullname: 'Wile E. Coyote',
    email: 'wile@warnerbros.com',
    title: 'Professor of physics',
    phone_number: '508-321-5678'
  };
  const other = {
    affiliateType: OTHER,
    org: 'Cartoon University',
    fullname: 'Yosemite Sam',
    email: 'yosemite-sam@cu.edu',
    title: 'Professor animation studies',
    phone_number: '617-444-8888'
  }
  return { employerPrimary, employer1, employer2, employerPrior, academic1, academic2, other };
}

export const SampleExhibitFormParms = (affiliates:Affiliate[]):ExhibitFormParms => { 
  const entity_id = '27ba9278-4337-445b-ac5e-a58d3040c7fc';
  const entity = { entity_id, entity_name: 'The School of Hard Knocks' } as Entity;
  const email = 'porky@looneytunes.com';
  const consenter = { email, firstname: 'Porky', middlename: 'P', lastname: 'Pig', phone_number: '617-823-9051' } as Consenter
  const data = {
    formType: FormTypes.FULL, // Temporary default - may get reassigned
    constraint: ExhibitFormConstraints.CURRENT,
    entity_id: 'abc123',
    affiliates: [ ],
    sent_timestamp: new Date().toISOString()
  } as ExhibitFormData;

  data.affiliates = affiliates;

  return { consenter, entity, data, consentFormUrl: consentFormUrl(email) };
  
};




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/ExhibitForm.ts')) {

  (async () => {
    const ctx = await import('../../../../contexts/context.json');
    ctx.CONFIG.useDatabase = false;
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(ctx.CONFIG);
    const period = await new ExhibitForm({} as ExhibitFormParms).getStaleEntityPeriod();
    console.log(period);
  })();

}
