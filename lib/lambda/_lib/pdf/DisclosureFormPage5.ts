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

export class DisclosureFormPage5 extends PdfForm implements IPdfForm {
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
      id:'6a', 
      name:'Bribery', 
      tooltip:'improperly offering financial or other inducements to an internal or external person or entity to obtain a favor, benefit, decision, or other action'},
    { 
      id:'6b', 
      name:'Extortion', 
      tooltip:'obtaining funding or other valuable resources by threats or force'},
    { 
      id:'6c', 
      name:'Theft', 
      tooltip:'Knowingly improperly appropriating another’s property'},
    { 
      id:'6d', 
      name:'False Claim', 
      tooltip:'Intentionally or recklessly filing a false claim for or misapplying/misusing funding or other valuable resources '},
    { 
      id:'6e', 
      name:'Reporting Errors', 
      tooltip:'Negligent (unreasonably careless) errors that fail to properly report on funding or other valuable resources'},
    { 
      id:'6f', 
      name:'Other under your policy:', 
      tooltip:'If desired, insert a link to your policy or brief description.'},
    ] as Misconduct[];

    const misconduct2 = [{ 
      id:'7a', 
      name:'Other under your policy:', 
      tooltip:'If desired, insert a link to your policy or brief description.'},
    ] as Misconduct[];

    const misconduct3 = [{ 
      id:'8a', 
      name:'Other under your policy:', 
      tooltip:'If desired, insert a link to your policy or brief description.'},
    ] as Misconduct[];

    const misconduct4 = [{ 
      id:'9a', 
      name:'Other under your policy:', 
      tooltip:'If desired, insert a link to your policy or brief description.'},
    ] as Misconduct[];

    const misconductGroup1 = new DisclosureItemsGroup(7, misconduct1, page, drawParms);

    const misconductGroup2 = new DisclosureItemsGroup(8, misconduct2, page, drawParms);

    const misconductGroup3 = new DisclosureItemsGroup(9, misconduct3, page, drawParms);

    const misconductGroup4 = new DisclosureItemsGroup(10, misconduct4, page, drawParms);

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
            height: 140, size: 12, backgroundColor: bluegrey, cells: [
              { width: 255, font:boldfont, text: [
                '6. Financial or Financial Reporting', 'Misconduct' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawYearsCell(55, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                page.addTooltips(misconduct1.map((mc) => mc.tooltip || ''));
                await misconductGroup1.drawMisconductInnerTable({ raise:120, width:255, size });
              }}  as CellDef,
              { borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                await misconductGroup1.drawMisconductYearsInnerTable({ raise:120, width:62, size });
              }} as CellDef
            ]
          },
          {
            height: 70, size: 12, backgroundColor: lightgrey, cells: [
              { width: 255, font:boldfont, text: [
                '7. Bullying' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawYearsCell(50, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                page.addTooltips(misconduct2.map((mc) => mc.tooltip || ''));                
                misconductGroup2.setMisconductItemIndex(misconductGroup1.getMisconductItemIndex());
                await misconductGroup2.drawMisconductInnerTable({ raise:18, width:255, size, borderWidth:0 });
              }}  as CellDef,
              { borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                await misconductGroup2.drawMisconductYearsInnerTable({ raise:10, width:62, size, borderWidth:0 });
              }} as CellDef
            ]
          },
          {
            height: 70, size: 12, backgroundColor: bluegrey, cells: [
              { width: 255, font:boldfont, text: [
                '8. Retaliation' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup3.drawYearsCell(50, 130, size, 100);
              }}  as CellDef,
              { width: 255, borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                page.addTooltips(misconduct3.map((mc) => mc.tooltip || ''));                
                misconductGroup3.setMisconductItemIndex(misconductGroup2.getMisconductItemIndex());
                await misconductGroup3.drawMisconductInnerTable({ raise:18, width:255, size, borderWidth:0 });
              }}  as CellDef,
              { borderColor:orange, backgroundColor:salmon, drawContent: async (color:Color, size:number) => {
                await misconductGroup3.drawMisconductYearsInnerTable({ raise:10, width:62, size, borderWidth:0 });
              }} as CellDef
            ]
          },
          {
            height: 70, size: 12, backgroundColor: lightgrey, cells: [
              { width: 255, font:boldfont, text: [
                '9. Making a Known False Report of a', 'type of misconduct listed on this form.' 
              ]} as CellDef,
              { width: 140, drawContent: async (color:Color, size:number) => {
                await misconductGroup4.drawYearsCell(50, 130, size, 100);
              }}  as CellDef,
              { drawContent: async (color:Color, size:number) => {
                page.addTooltips(misconduct4.map((mc) => mc.tooltip || ''));                
                misconductGroup4.setMisconductItemIndex(misconductGroup3.getMisconductItemIndex());
                await misconductGroup4.drawMisconductInnerTable({ 
                  raise:18, width:255, size, borderWidth:0, backgroundColor:lightgrey 
                }, 306);
              }} as CellDef
            ]
          },
        ]
      } as TableDef
    ).draw();
  }
}



const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/DisclosureFormPage5.ts')) {

  new DisclosureFormPage5().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm5.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}