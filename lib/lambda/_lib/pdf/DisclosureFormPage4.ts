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

export class DisclosureFormPage4 extends PdfForm implements IPdfForm {
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
        '<b>3a.</b> Race/ethnicity discrimination',
        '<b>3b.</b> Acts or threats of hate, violence, or intimidation based on race/ethnicity',
        '<b>3c.</b> Exposing people to racist content unnecessary for the work',
        '<b>3d.</b> Stereotyping, bias, exclusion based on race or ethnicity',
        '<b>3e.</b> Other under your policy:'
      ],
      [
        '<b>4a.</b> Fabrication, falsification, or plagiarism',
        '<b>4b.</b> Other failures to properly attributed authorship',
        '<b>4c.</b> Other research or scientific misconduct under the Disclosing Entity’s polic(ies)',
        '<b>4d.</b> Other under your policy:',
      ],
      [
        '<b>5a.</b> Breaching professional licensing standards or professional ethics',
        '<b>5b.</b> Other under your policy:',
      ]
    ]

    const misconductGroup1 = new DisclosureItemsGroup(4, misconduct[0], page, drawParms);

    const misconductGroup2 = new DisclosureItemsGroup(5, misconduct[1], page, drawParms);

    const misconductGroup3 = new DisclosureItemsGroup(6, misconduct[2], page, drawParms);

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
            height: 150, size: 12, backgroundColor: lightgrey, cells: [
              { width: 255, font:boldfont, text: [
                '3. Racial or Ethnic Harassment,', 'Discrimination, or Other Misconduct' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawYearsCell(55, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawMisconductInnerTable({ raise:130, width:255, size });
              }}  as CellDef,
              { borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawMisconductYearsInnerTable({ raise:130, width:62, size });
              }} as CellDef
            ]
          },
          {
            height: 120, size: 12, backgroundColor: bluegrey, cells: [
              { width: 255, font:boldfont, text: [
                '4. Research / Scientific Misconduct' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawYearsCell(55, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawMisconductInnerTable({ raise:100, width:255, size });
              }}  as CellDef,
              { borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawMisconductYearsInnerTable({ raise:100, width:62, size });
              }} as CellDef
            ]
          },
          {
            height: 70, size: 12, backgroundColor: lightgrey, cells: [
              { width: 255, font:boldfont, text: [
                '5. Professional Licensing / ', 'Ethics Misconduct' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup3.drawYearsCell(50, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup3.drawMisconductInnerTable({ raise:40, width:255, size });
              }}  as CellDef,
              { borderColor:orange, drawContent: async (color:Color, size:number) => {
                await misconductGroup3.drawMisconductYearsInnerTable({ raise:40, width:62, size });
              }} as CellDef
            ]
          },
        ]
      } as TableDef
    ).draw();
  }
}



const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_DISCLOSURE_FORM_PAGE_4') {

  new DisclosureFormPage4().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm4.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}