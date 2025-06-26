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
  
    this.page.setLinkAnnotations();
}

  private drawTable = async () => {
    const { drawParms, page, page: { basePage }, _return, font, boldfont } = this;
    _return();
    basePage.moveDown(60);

    const misconduct1 = [
      { id:'3a',
        name:'Race/ethnicity discrimination',
        tooltip:'Adverse treatment of a person, including but not limited to reducing or foreclosing opportunities, where the person’s race/ethnicity was a contributing or determinative factor' },
      { id:'3b',
        name:'Acts or threats of hate, violence, or intimidation based on race/ethnicity' },
      { id:'3c',
        name:'Exposing people to racist content unnecessary for the work',
        tooltip:'e.g., images, language/message, sounds', },
      { id:'3d',
        name:'Stereotyping, bias, exclusion based on race or ethnicity',
        tooltip:'put-downs, insults, disrespect, or other marginalizing or exclusionary conduct based on race/ethnicity' },
      { id:'3e',
        name:'Other under your policy:',
        tooltip:'If desired, insert a link to your policy or brief description.' },
    ] as Misconduct[];

    const misconduct2 = [
      { id:'4a',
        name:'Fabrication, falsification, or plagiarism', },
      { id:'4b',
        name:'Other failures to properly attributed authorship', },
      { id:'4c',
        name:'Other research or scientific misconduct under the Disclosing Entity’s polic(ies)', },
      { id:'4d',
        name:'Other under your policy:',
        tooltip:'If desired, insert a link to your policy or brief description.' }
    ] as Misconduct[];

    const misconduct3 = [
      { id:'5a',
        name:'Breaching professional licensing standards or professional ethics',
        tooltip:'e.g., medical, other health professions, mental health, legal, etc. ' },
      { id:'5b',
        name:'Other under your policy:',
        tooltip:'If desired, insert a link to your policy or brief description.' }
    ] as Misconduct[];


    const misconductGroup1 = new DisclosureItemsGroup(4, misconduct1, page, drawParms);

    const misconductGroup2 = new DisclosureItemsGroup(5, misconduct2, page, drawParms);

    const misconductGroup3 = new DisclosureItemsGroup(6, misconduct3, page, drawParms);

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
                page.addTooltips(misconduct1.map((mc) => mc.tooltip || ''));
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
                page.addTooltips(misconduct2.map((mc) => mc.tooltip || ''));                
                misconductGroup2.setMisconductItemIndex(misconductGroup1.getMisconductItemIndex());
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
                page.addTooltips(misconduct3.map((mc) => mc.tooltip || ''));                
                misconductGroup3.setMisconductItemIndex(misconductGroup2.getMisconductItemIndex());
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/DisclosureFormPage4.ts')) {

  new DisclosureFormPage4().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm4.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}