import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { DisclosureFormDrawParms } from "./DisclosureForm";
import { DisclosureItemsGroup } from "./DisclosureItemsGroup";
import { IPdfForm, PdfForm } from "./PdfForm";
import { EmbeddedFonts } from "./lib/EmbeddedFonts";
import { Page } from "./lib/Page";
import { CellDef, Format, Table, TableDef } from "./lib/Table";
import { Align, Margins, VAlign, rgbPercent } from "./lib/Utils";

const white = rgb(1, 1, 1) as Color;
const blue = rgbPercent(47, 84, 150) as Color;
const orange = rgbPercent(196, 89, 17);
const lightgrey = rgbPercent(242, 242, 242);
const bluegrey = rgbPercent(213, 220, 228);

export class DisclosureFormPage3 extends PdfForm implements IPdfForm {
  private font:PDFFont;
  private boldfont:PDFFont;
  private drawParms:DisclosureFormDrawParms;

  constructor() {
    super();
    this.pageMargins = { top: 35, bottom: 35, left: 40, right: 40 } as Margins;
  }

  public async getBytes(): Promise<Uint8Array> {

    this.doc = await PDFDocument.create();
    this.embeddedFonts = new EmbeddedFonts(this.doc);
    this.form = this.doc.getForm();
    const { doc, form, embeddedFonts } = this;

    await this.draw({ doc, form, embeddedFonts });

    const pdfBytes = await this.doc.save();
    return pdfBytes;
  }

  public async writeToDisk(path:string) {
    writeFile(path, await this.getBytes());
  }

  public draw = async (drawParms:DisclosureFormDrawParms) => {
    const { doc, embeddedFonts, form } = drawParms;
    this.drawParms = drawParms;
    this.doc = doc;
    this.form = form;
    this.embeddedFonts = embeddedFonts;
    const { pageMargins, drawLogo, drawTable } = this;
    
    // Create the page - use Letter size, but flipped on its side (Landscape)
    this.page = new Page(this.doc.addPage([792.0, 612.0]) as PDFPage, pageMargins, embeddedFonts);

    // Set up the fonts used on this page
    this.boldfont = await this.embeddedFonts.getFont(StandardFonts.HelveticaBold);
    this.font = await this.embeddedFonts.getFont(StandardFonts.Helvetica);

    await drawLogo(this.page);

    await drawTable();
  }

  private drawTable = async () => {
    const { drawParms, page, page: { basePage }, _return, font, boldfont } = this;
    _return();
    basePage.moveDown(60);
 
    const misconduct = [
      [
        '<b>1a.</b> Rape',
        '<b>1b.</b> Other sexual battery',
        '<b>1c.</b> Sexual assault',
        '<b>1d.</b> Sexual coercion',
        '<b>1e.</b> Quid pro quo sexual harassment',
        '<b>1e.</b> Exposing person(s) to sexual content unnecessary for the work',
        '<b>1g.</b> Stereotyping, bias, exclusion based on sex or gender',
        '<b>1h.</b> Unwelcome sexual attention',
        '<b>1i.</b> Sexual/gender discrimination',
        '<b>1j.</b> Other under your policy: ',
      ],
      [
        '<b>2a.</b> Stalking', 
        '<b>2b.</b> Voyeurism or Invasion of Privacy',  
        '<b>2c.</b> Other under your policy: ',
      ]
    ]

    const misconductGroup1 = new DisclosureItemsGroup(1, misconduct[0], page, drawParms);

    const misconductGroup2 = new DisclosureItemsGroup(2, misconduct[1], page, drawParms);

    await new Table(this, 
      {
        borderColor: blue, borderWidth: 1, font, 
        format: { align: Align.left, valign: VAlign.middle, margins: { left:8 } } as Format,
        rows: [
          {
            height: 70, backgroundColor:orange, borderColor:orange, color:white, size:12,
            cells: DisclosureItemsGroup.headerCells()
          },
          {
            height: 240, size: 12, backgroundColor: lightgrey, cells: [
              { width: 255, font:boldfont, text: [
                '1. Sexual or Gender Harassment,', 'Discrimination, or Other Misconduct' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawYearsCell(140, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawMisconductInnerTable({ raise:220, width:255, size });
              }}  as CellDef,
              { borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawMisconductYearsInnerTable({ raise:220, width:62, size });
              }} as CellDef
            ]
          },
          {
            height: 80, size: 12, backgroundColor: bluegrey, cells: [
              { width: 255, font:boldfont, text: [
                '2. Stalking, Voyeurism, or Invasion of', 'Privacy (in-person or virtually)' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawYearsCell(55, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawMisconductInnerTable({ raise:60, width:255, size });
              }}  as CellDef,
              { borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawMisconductYearsInnerTable({ raise:60, width:62, size });
              }} as CellDef
            ]
          },
        ]
      } as TableDef
    ).draw();
  }

}



const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_DISCLOSURE_FORM_PAGE_3') {

  new DisclosureFormPage3().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm3.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}