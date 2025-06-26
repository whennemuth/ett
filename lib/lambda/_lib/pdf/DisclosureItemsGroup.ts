import { Color, PDFFont, StandardFonts, rgb, setFontAndSize } from "pdf-lib";
import { rgbPercent } from "./lib/Utils";
import { PdfForm } from "./PdfForm";
import { DisclosureFormDrawParms } from "./DisclosureForm";
import { CellDef, RowDef, Table, TableDef } from "./lib/Table";
import { Page } from "./lib/Page";

const orange = rgbPercent(196, 89, 17);
const salmon = rgbPercent(247, 202, 172);
const blue = rgbPercent(47, 84, 150) as Color;

export type InnerTableParms = {
  raise:number, width:number, size?:number, borderWidth?:number, backgroundColor?:Color, borderColor?:Color
}

export type Misconduct = {
  id:string, name:string, tooltip?:string
}

export class DisclosureItemsGroup extends PdfForm {
  private font:PDFFont;
  private misconduct:Misconduct[];
  private drawParms:DisclosureFormDrawParms;
  private rowHeights:number[] = [];
  private index: number;
  private itemIndex = 0;

  constructor(index:number, misconduct:Misconduct[], page:Page, drawParms:DisclosureFormDrawParms) {
    super();
    this.index = index;
    this.page = page;
    this.misconduct = misconduct;
    this.drawParms = drawParms;
  }

  public static headerCells = ():CellDef[] => {
    const blue = rgbPercent(47, 84, 150) as Color;
    return [ 
      { backgroundColor:blue, borderColor:blue, width: 255, text: [ 
        '<b>Generic Type of Misconduct</b>', 
        '<-2>As defined by Disclosing Entity’s polic(ies). Check the</-2>',
        '<-2>box if a finding of responsibility for that misconduct type</-2>',
        '<-2>was made or adopted.</-2>' ] } as CellDef,
      { backgroundColor:blue, borderColor:blue, width: 140, text: [
        '<b>Year(s) of Findings</b>',
        '<-2>List each year a finding of a</-2>',
        '<-2>type was made or adopted</-2>' ] } as CellDef,
      { width: 255, text: [
        '<b>Examples of Included Types of Misconduct</b>',
        '<-2><b>(not an exhaustive list)</b></-2>',
        '<-2><b>OPTIONAL, but requested:</b> Also check all the</-2>',
        '<-2>examples that apply to the finding.</-2>' ] } as CellDef,
      {
        text: '<b>Year(s)</b>'
      }
    ]
  }

  public drawMisconductInnerTable = async (parms:InnerTableParms, otherTextBoxWidth=246) => {
    const { form, embeddedFonts } = this.drawParms;
    let { width, raise, size=12, borderWidth=1, backgroundColor=salmon, borderColor:bdrColor=orange } = parms;
    const borderColor = borderWidth==0 ? undefined : bdrColor

    // Set up the fonts used on this page
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    const { index, page, page: { basePage }, font, markPosition, returnToMarkedPosition } = this;
    let idx = 1;

    const drawOtherTextbox = (lowerExtra:number) => {
      const posId = markPosition();
      basePage.moveUp(4);
      basePage.moveLeft(4);
      const tbx = form.createTextField(`other-${index}-${idx++}`);
      const da = tbx.acroField.getDefaultAppearance() ?? '';
      const newDa = da + '\n' + setFontAndSize('Courier', 10).toString();
      tbx.acroField.setDefaultAppearance(newDa);
      tbx.enableMultiline();
      tbx.addToPage(basePage, { x: basePage.getX() + 8, y: basePage.getY() - lowerExtra, width: otherTextBoxWidth, height: 16 })  
      returnToMarkedPosition(posId);   
    };

    const drawCheckedItem = async (label:string, extraHeight?:number) => {
      const posId = markPosition();
      const chk = form.createCheckBox(`chk-${index}-${idx++}`);
      basePage.moveRight(4);
      basePage.moveUp(4 + (extraHeight || 0));
      chk.addToPage(basePage, {
        height: 12, width: 12, x:basePage.getX(), y:basePage.getY()
      });
      basePage.moveRight(16);
      basePage.moveUp(2);
      await page.drawWrappedText({
        text: label, options: { font, size }, linePad:0, horizontalRoom:(width - 24)
      })
      returnToMarkedPosition(posId);
    } 
    const getRows = async (size:number, font:PDFFont):Promise<RowDef[]> => {
      const { misconduct:mcDefs, rowHeights } = this;
      const rows = [] as RowDef[];
      const horizontalRoom = width - 24;
      for(let i=0; i<mcDefs.length; i++) {
        const mcdef = mcDefs[i];
        // const labelNoMarkup = mcdef.replace(/(<[^<>]+>)/g, '');
        const labelNoMarkup = mcdef.id + '. ' + mcdef.name;
        let fullLabel = `<b>${mcdef.id}.</b> ${mcdef.name}`;
        if(mcdef.tooltip) {
          fullLabel = `<b>${mcdef.id}.</b> <tooltip index="${this.itemIndex}">${mcdef.name}</tooltip>`;
        }
        this.itemIndex++; // Increment the index for the next misconduct item
        const contentTooWide = font.widthOfTextAtSize(labelNoMarkup, size) > horizontalRoom;
        const otherTextbox = mcdef.name.includes('Other under your policy') || mcdef.id == '11a';
        let height = 20;
        height = otherTextbox ? 40 : height;
        height = contentTooWide ? 30 : height;
        rowHeights.push(height);
        rows.push({ height, cells: [
          { drawContent: async (color:Color, size:number) => {
            await drawCheckedItem(fullLabel, (height - 20));
            if(otherTextbox) {
              const lowerExtra = mcdef.id == '11a' ? 22 : 0;
              drawOtherTextbox(lowerExtra);
            }
          }}
        ]});
      }
      return rows;
    }     
    const posId = markPosition();
    basePage.moveUp(raise);
    if(borderWidth == 0) {
      basePage.moveRight(1);
      width -= 2;
    }
    await new Table(this, {
      borderWidth, width, size, borderColor, backgroundColor, rows: await getRows(size, font)
    } as TableDef).draw();
    returnToMarkedPosition(posId);
  }

  public drawMisconductYearsInnerTable = async (parms:InnerTableParms) => {
    const { form, embeddedFonts } = this.drawParms;
    let { width, raise, size=12, borderWidth=1, backgroundColor=salmon, borderColor:bdrColor=orange } = parms;
    const borderColor = borderWidth==0 ? undefined : bdrColor

    // Set up the fonts used on this page
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    const { index, page: { basePage }, markPosition, returnToMarkedPosition } = this;
    let idx = 1;

    const drawTextbox = (raise?:number) => {
      const posId = markPosition();
      basePage.moveUp(2 + (raise || 0));
      basePage.moveLeft(2.5);
      const name = `years-${index}-${idx++}-item`;
      const tbx = form.createTextField(name);
      const da = tbx.acroField.getDefaultAppearance() ?? '';
      const newDa = da + '\n' + setFontAndSize('Courier', 10).toString();
      tbx.acroField.setDefaultAppearance(newDa);
      tbx.enableMultiline();
      tbx.addToPage(basePage, { x: basePage.getX() + 8, y: basePage.getY(), width: 50, height: 16 })  
      returnToMarkedPosition(posId);
    }

    const getRows = async ():Promise<RowDef[]> => {
      const rows = [] as RowDef[];
      const { misconduct:labels, rowHeights } = this;
      for(let i=0; i<labels.length; i++) {
        const height = rowHeights[i];
        const raise = height > 20 ? (height - 20)/2 : 0;
        rows.push({ height, cells: [{ 
          drawContent: async (color:Color, size:number) => { drawTextbox(raise); }
        }]})
      }
      return rows;
    };
    const posId = markPosition();
    basePage.moveUp(raise);
    if(borderWidth == 0) {
      basePage.moveRight(1);
      width -= 2;
    }
    await new Table(this, {
      borderWidth, width, size, borderColor, backgroundColor, rows: await getRows()
    } as TableDef).draw();
    returnToMarkedPosition(posId);
  }

  public drawYearsCell = async (raise:number, width:number, size:number, tbxWidth:number) => {   
    const { embeddedFonts, form } = this.drawParms;

    // Set up the fonts used on this page
    this.font = await embeddedFonts.getFont(StandardFonts.Helvetica);

    const { index, page: { basePage }, font, markPosition, returnToMarkedPosition } = this;
    let idx = 1;

    const drawYearsTextBox = (width:number) => {
      basePage.drawText(''); // Avoids strange bug - containing cell gets an orange border for some reason. 
      const tbx = form.createTextField(`years-${index}-${idx++}`);
      const da = tbx.acroField.getDefaultAppearance() ?? '';
      const newDa = da + '\n' + setFontAndSize('Courier', 10).toString();
      tbx.acroField.setDefaultAppearance(newDa);
      tbx.enableMultiline();
      tbx.addToPage(basePage, { x: basePage.getX() + 8, y: basePage.getY(), width, height: 36 })
    }
    const posId = markPosition();
    basePage.moveUp(raise);
    await new Table(this, {
      borderWidth: 0, width, font, size, format: { margins: { left: 8 }}, rows: [
        { height: 20, cells: [ { text: 'Year(s):'} ] },
        { height: 40, cells: [ { drawContent: async (color:Color, size:number) => {
          drawYearsTextBox(tbxWidth);
        }} ]}
      ]
    } as TableDef).draw();
    returnToMarkedPosition(posId);
  };

  public setMisconductItemIndex = (index:number):void => {
    this.itemIndex = index;
  }

  public getMisconductItemIndex = ():number => {
    return this.itemIndex;
  }
}