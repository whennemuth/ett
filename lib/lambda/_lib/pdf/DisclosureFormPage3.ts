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

    this.page.setLinkAnnotations();
  }

  private drawTable = async () => {
    const { drawParms, page, page: { basePage }, _return, font, boldfont } = this;
    _return();
    basePage.moveDown(60);

    const misconduct1 = [
      { id:'1a',
        name:'Rape', 
        tooltip:'meaning non-consensual sexual intercourse or other sexual bodily penetration' },
      { id:'1b',
        name:'Other sexual battery', 
        tooltip:'meaning unwelcome or non-consensual touching of a sexual nature' },
      { id:'1c',
        name:'Sexual assault', 
        tooltip:'meaning threatening rape or sexual battery' },
      { id:'1d',
        name:'Sexual coercion', 
        tooltip:'meaning using a power or influence differential, threat, or gaslighting to force a person to engage in sexual conduct or provide sexual favors (e.g., if you loved me—want my protection from)' },
      { id:'1e',
        name:'Quid pro quo sexual harassment', 
        tooltip:'meaning threats or rewards (re: educational or professional benefits, relationships, support, or status—e.g., grade, reference, role, seat in a program, funding, mentor) the avoidance or receipt of which is conditioned on sexual conduct or favors' },
      { id:'1f',
        name:'Exposing person(s) to sexual content unnecessary for the work', 
        tooltip:'sexual images, gestures, audio or visual recordings, or sexual innuendo, sounds or language' },
      { id:'1g',
        name:'Stereotyping, bias, exclusion based on sex or gender', 
        tooltip:'put-downs, insults, disrespect, or other marginalizing or exclusionary language or conduct (put-downs, not come-ons) based on sex, sexual orientation, or gender identity or expression' },
      { id:'1h',
        name:'Unwelcome sexual attention', 
        tooltip:'meaning unwelcome sexual attention (asking for dates, come-ons) that continues after rejection, no reciprocation, or warning to stop—or that is so severe once as to interfere with a reasonable person’s participation or performance in learning or work' },
      { id:'1i',
        name:'Sexual/gender discrimination', 
        tooltip:'Adverse treatment of a person, including but not limited to reducing or foreclosing opportunities, where the person’s sex, sexual orientation, or gender identity or expression was a contributing or determinative factor' },
      { id:'1j',
        name:'Other under your policy', 
        tooltip:'If desired, insert a link to your policy or brief description.' }
    ] as Misconduct[];

    const misconduct2 = [
      { id:'2a',
        name:'Stalking', 
        tooltip:'Repeated actions or speech directed at a person or repeatedly pursuing a person in a manner that would cause the person to reasonably feel afraid, abused, or intimidated' },
      { id:'2b',
        name:'Voyeurism or Invasion of Privacy', 
        tooltip:'Unconsented to viewing and/or audio or visual recording of a person in a locale or engaged in an activity when the person had a reasonable expectation of privacy — or unconsented to dissemination of an intimate or otherwise private recording of a person' },
      { id:'2c',
        name:'Other under your policy', 
        tooltip:'If desired, insert a link to your policy or brief description.' }
    ] as Misconduct[];
 
    const misconductGroup1 = new DisclosureItemsGroup(1, misconduct1, page, drawParms);

    const misconductGroup2 = new DisclosureItemsGroup(2, misconduct2, page, drawParms);
    

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
                page.addTooltips(misconduct1.map((mc) => mc.tooltip || 'No tooltip provided'));
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
                page.addTooltips(misconduct2.map((mc) => mc.tooltip || 'No tooltip provided'));                
                misconductGroup2.setMisconductItemIndex(misconductGroup1.getMisconductItemIndex());
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/pdf/DisclosureFormPage3.ts')) {

  new DisclosureFormPage3().writeToDisk('./lib/lambda/_lib/pdf/disclosureForm3.pdf')
  .then((bytes) => {
    console.log('done');
  })
  .catch(e => {
    console.error(e);
  });

}