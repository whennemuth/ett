import { writeFile } from "fs/promises";
import { Color, PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { DisclosureFormDrawParms } from "./DisclosureForm";
import { DisclosureItemsGroup, Misconduct } from "./DisclosureItemsGroup";
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
const salmon = rgbPercent(247, 202, 172);

export class DisclosureFormPage6 extends PdfForm implements IPdfForm {
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
  
    this.page.setLinkAnnotations();
  }

  private drawTable = async () => {
    const { drawParms, page, page: { basePage }, _return, font, boldfont } = this;
    _return();
    basePage.moveDown(60);

    const misconduct1 = [{ 
      id:'10a', 
      name:'Other under your policy:', 
      tooltip:'If desired, insert a link to your policy or brief description.' },
    ] as Misconduct[];

    const misconduct2 = [{ 
      id:'11a', 
      name:'Insert the number(s) listed above (optional but requested):', 
      tooltip:'Insert the number(s) listed above for applicable policy type(s) of violations that ' +
        'your organization doesn’t report or that aren’t covered by your policies (optional but requested).' },
    ] as Misconduct[];

    const misconductGroup1 = new DisclosureItemsGroup(11, misconduct1, page, drawParms);

    const misconductGroup2 = new DisclosureItemsGroup(12, misconduct2, page, drawParms);

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
            height: 70, size: 12, backgroundColor: bluegrey, cells: [
              { width: 255, font:boldfont, text: [
                '10. Optional: Other ethics', 'related-misconduct under your policy'
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawYearsCell(50, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                page.addTooltips(misconduct1.map((mc) => mc.tooltip || ''));
                await misconductGroup1.drawMisconductInnerTable({ raise:18, width:255, size, borderWidth:0 });
              }}  as CellDef,
              { borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawMisconductYearsInnerTable({ raise:10, width:62, size, borderWidth:0 });
              }} as CellDef
            ]
          },
          {
            height: 70, size: 12, backgroundColor: lightgrey, cells: [
              { width: 255, font:boldfont, text: [
                '11. The Disclosing Entity does not', 
                'report on these kinds of misconduct', 
                'or its policies do not cover them.' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawYearsCell(50, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                page.addTooltips(misconduct2.map((mc) => mc.tooltip || ''));                
                misconductGroup2.setMisconductItemIndex(misconductGroup1.getMisconductItemIndex());
                await misconductGroup2.drawMisconductInnerTable({ raise:28, width:255, size, borderWidth:0 });
              }}  as CellDef,
              { borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawMisconductYearsInnerTable({ raise:3, width:62, size, borderWidth:0 });
              }} as CellDef
            ]
          },
        ]
      } as TableDef
    ).draw();
  }
}



const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/DisclosureFormPage6.ts')) {

  new DisclosureFormPage6().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm6.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}