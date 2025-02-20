import { Color, PDFDocument, PDFFont, PDFPageDrawTextOptions, StandardFonts, rgb } from "pdf-lib";
import { Configurations, DurationType } from "../config/Config";
import { Affiliate, AffiliateType, AffiliateTypes, ConfigNames, Consenter, Entity, ExhibitFormConstraint, ExhibitFormConstraints, ExhibitForm as ExhibitFormData, FormType, FormTypes } from "../dao/entity";
import { PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Rectangle } from "./lib/Rectangle";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";
import { consentFormUrl } from "../../functions/consenting-person/ConsentingPerson";

export const blue = rgbPercent(47, 84, 150) as Color;
export const grey = rgb(.1, .1, .1) as Color;
export const white = rgb(1, 1, 1) as Color;
export const red = rgbPercent(255, 0, 0);

export type ExhibitFormParms = {
  data:ExhibitFormData,
  entity:Entity,
  consenter:Consenter,
  consentFormUrl:string
}

export type ItemParagraph = { text:string, options:PDFPageDrawTextOptions, estimatedHeight?:number };
export type ItemParms = { paragraphs:ItemParagraph[] };
export type BigRedButtonParms = { text:string, description:string, descriptionHeight:number };

/**
 * This is a baseline exhibit form. It is passed to variants to provide generalized function common to any variant.
 */
export class ExhibitForm extends PdfForm {

  // Default the parms to a blank object
  private parms:ExhibitFormParms;
  private blankForm:boolean = false;
  private staleEntityDays:number;
  private secondReminderDays:number;
  
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

  public getStaleEntityDays = async():Promise<number> => {
    if( ! this.staleEntityDays) {
      const { getAppConfig } = new Configurations();
      const { STALE_ASP_VACANCY, STALE_AI_VACANCY } = ConfigNames;
      const staleAI = await getAppConfig(STALE_AI_VACANCY)
      const staleASP = await getAppConfig(STALE_ASP_VACANCY);
      this.staleEntityDays = staleAI.getDuration(DurationType.DAY) + staleASP.getDuration(DurationType.DAY);    
    }
    return this.staleEntityDays;
  }

  public getSecondReminderDays = async():Promise<number> => {
    if( ! this.secondReminderDays) {
      const { getAppConfig } = new Configurations();
      const { SECOND_REMINDER } = ConfigNames;
      this.secondReminderDays = (await getAppConfig(SECOND_REMINDER)).getDuration(DurationType.DAY);
    }
    return this.secondReminderDays;
  }

  /**
   * Draw a single affiliate.
   * @param a The affiliate data.
   * @param size The size of the font to be used.
   */
  public drawAffliate = async (a:Affiliate, size:number) => {
    const { BOTH } = ExhibitFormConstraints;
    const { 
      page, page: { basePage }, font, boldfont, _return, markPosition, 
      returnToMarkedPosition: returnToPosition, parms: { data: { formType, constraint=BOTH } }
    } = this;
    const { EMPLOYER_PRIMARY, EMPLOYER, EMPLOYER_PRIOR, ACADEMIC, OTHER } = AffiliateTypes;
    const isCurrentSingle = (a:Affiliate) => {
      return formType == FormTypes.SINGLE && (a.affiliateType == EMPLOYER || a.affiliateType == EMPLOYER_PRIMARY);
    }

    // Draw the organization row
    let text = 'Organization (no acronyms)';
    let height = 16;
    let margins = { right: 8, top:2 } as Margins;
    if(isCurrentSingle(a) && constraint != BOTH) {
      text = 'Current Employer or Appointing /';
      height = 26;
      margins.right = 4;
      _return(10);
    }
    else if(constraint != BOTH) {
      if(a.affiliateType == EMPLOYER_PRIMARY) {
        text = 'Primary Current Employer';
      }
      else if(a.affiliateType == EMPLOYER) {
        text = 'Other Current Employer /';
        height = 26;
        _return(10);
      }
    }

    _return();
    await new Rectangle({
      text,
      page,
      align: Align.right,
      valign: VAlign.top,
      options: { borderWidth:1, borderColor:blue, color:grey, opacity:.2, width:150, height },
      textOptions: { size, font:boldfont },
      margins
    }).draw();

    if(isCurrentSingle(a) && constraint != BOTH) {
      basePage.drawText('Organization (no acronyms)', { 
        x: basePage.getX() + 28, y: basePage.getY() + 6, size, font: boldfont 
      });
    }
    else if(constraint != BOTH && a.affiliateType == EMPLOYER) {
      basePage.drawText('Appointing Organization', { 
        x: basePage.getX() + 32, y: basePage.getY() + 6, size, font: boldfont 
      });
    }
    
    basePage.moveRight(150); 

    await new Rectangle({
      text: a.org, page,
      align: Align.left, valign: VAlign.middle,
      options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - 150), height },
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
        options: { borderWidth:1, borderColor:blue, width:(page.bodyWidth - 150), height:16 },
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
  public drawAffiliateGroup = async (affiliateType:AffiliateType, title?:string) => {
    const { BOTH } = ExhibitFormConstraints;
    const { 
      page, font, boldfont, data, data: { constraint=BOTH }, 
      _return, drawAffliate, markPosition, getPositionalChange 
    } = this;
    const { EMPLOYER, EMPLOYER_PRIMARY, EMPLOYER_PRIOR } = AffiliateTypes;
    let size = 9;

    if(title) {
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

    const affiliates = (data.affiliates as Affiliate[]).filter(affiliate => {
      const { parms: { data: { formType }}} = this;
      const { affiliateType:affType } = affiliate;
      if(formType == FormTypes.SINGLE) {
        return true;
      }
      if(affiliateType == EMPLOYER) {
        const empTypes = [ EMPLOYER, EMPLOYER_PRIMARY ];
        if(constraint == BOTH) {
          empTypes.push(EMPLOYER_PRIOR);
        }
        return empTypes.includes(affType);
      }
      return affType == affiliateType
    });

    // Iterate over each affiliate and draw it. The height of each should be approximately the same.
    const posId = markPosition();
    let affiliateHeight = 0;
    for(let i=0; i<affiliates.length; i++) {
      const a = affiliates[i];
      await drawAffliate(a, size);
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

    if(affiliates.length == 0) {
      await new Rectangle({
        text: 'None',
        page,
        align: Align.center, valign: VAlign.middle,
        options: { borderWidth:1, borderColor:blue, width:page.bodyWidth, height:16 },
        textOptions: { size, font }
      }).draw();
    }
    _return(16);
  }

  public drawSignature = async (formDescription:string) => {
    const {  
      page, page: { bodyWidth, margins, drawRectangle, drawText, nextPageIfNecessary }, 
      getFullName, isBlankForm, font, boldfont, _return } = this;
    const { data: { sent_timestamp }, consenter: { firstname, middlename, lastname, email, phone_number }} = this.parms;

    const basePage = nextPageIfNecessary(200);

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
      text: getFullName(firstname, middlename, lastname),
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
    await drawRectangle({
      text: sent_timestamp? new Date(sent_timestamp).toDateString() : '',
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
  public static getBlankForm = (formType:FormType, constraint:ExhibitFormConstraint):ExhibitForm => {
    const { BOTH:both, CURRENT:current, OTHER:other } = ExhibitFormConstraints;
    const { ACADEMIC, EMPLOYER, EMPLOYER_PRIMARY, EMPLOYER_PRIOR, OTHER } = AffiliateTypes;
    const getBlankAffiliate = (affiliateType:AffiliateTypes):Affiliate => { 
      return { affiliateType, org: '', fullname: '', title: '', email: '', phone_number: '' } 
    };

    const parms = {
      data: { formType, affiliates: [] as Affiliate[] } as ExhibitFormData,
      entity: { entity_id: '', entity_name: '' } as Entity,
      consenter: { firstname: '', middlename: '', lastname: '', email: '', phone_number: '' } as Consenter,
      consentFormUrl: consentFormUrl('[consenter_email]')
    }

    switch(constraint) {
      case current:
        switch(formType) {
          case FormTypes.FULL:
            parms.data.affiliates = [
              getBlankAffiliate(EMPLOYER_PRIMARY),
              getBlankAffiliate(EMPLOYER)
            ];
            break;
          case FormTypes.SINGLE:
            parms.data.affiliates = [ 
              getBlankAffiliate(EMPLOYER)
            ];
            break;            
        }
        break;
      case other:
        switch(formType) {
          case FormTypes.FULL:
            parms.data.affiliates = [
              getBlankAffiliate(EMPLOYER_PRIOR),
              getBlankAffiliate(ACADEMIC),
              getBlankAffiliate(OTHER)
            ];
        }
      case both:
        switch(formType) {
          case FormTypes.FULL:
            parms.data.affiliates = [
              getBlankAffiliate(EMPLOYER_PRIMARY),
              getBlankAffiliate(ACADEMIC),
              getBlankAffiliate(OTHER)
            ];
            break;
          case FormTypes.SINGLE:
            parms.data.affiliates = [
              getBlankAffiliate(ACADEMIC)
            ];
            break;
        }
    }

    const form = new ExhibitForm(parms);
    form.isBlankForm = true;

    return form;
  }
}


export const SampleExhibitFormParms = (formType:FormType, constraint:ExhibitFormConstraint=ExhibitFormConstraints.BOTH) => { 
  const { ACADEMIC, EMPLOYER, EMPLOYER_PRIMARY, EMPLOYER_PRIOR, OTHER } = AffiliateTypes;
  const entity_id = '27ba9278-4337-445b-ac5e-a58d3040c7fc';
  const entity = { entity_id, entity_name: 'The School of Hard Knocks' } as Entity;
  const email = 'porky@looneytunes.com';
  const consenter = { email, firstname: 'Porky', middlename: 'P', lastname: 'Pig', phone_number: '617-823-9051' } as Consenter
  const data = {
    formType: FormTypes.FULL,
    constraint: constraint,
    entity_id: 'abc123',
    affiliates: [ ],
    sent_timestamp: new Date().toISOString()
  } as ExhibitFormData;
  
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

  switch(constraint) {
    case ExhibitFormConstraints.CURRENT:
      switch(formType) {
        case FormTypes.FULL:
          data.affiliates!.push(employer1, employer2);
          break;
        case FormTypes.SINGLE:
          data.affiliates = [ employer1 ];
          break;
      }
      break;
    case ExhibitFormConstraints.OTHER:
      switch(formType) {
        case FormTypes.FULL:
          data.affiliates = [ employerPrior, academic1, academic2, other ];
          break;
        case FormTypes.SINGLE:
          data.affiliates = [ academic1 ];
          break;
      }
      break;
    case ExhibitFormConstraints.BOTH:
      switch(formType) {
        case FormTypes.FULL:
          data.affiliates = [ employer1, employer2, employerPrior, academic1, other ];
          break;
        case FormTypes.SINGLE:
          data.affiliates = [ employer1 ];
          break;
      }
  }

  data.constraint = constraint;
  data.formType = formType;

  return { formType:FormTypes.FULL, consenter, entity, data, consentFormUrl: consentFormUrl(email) };
};