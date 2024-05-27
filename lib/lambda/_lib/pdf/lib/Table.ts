import { Color, PDFFont } from "pdf-lib";
import { PdfForm } from "../PdfForm";
import { Margins, Align, VAlign, Position } from "./Utils";
import { Rectangle } from "./Rectangle";

export type Format = { margins:Margins, align:Align, valign:VAlign }
export type CellDef = {
  borderWidth?:number, borderColor?:Color, backgroundColor?:Color, color?:Color, size?:number, font?:PDFFont,  
  format?:Format, width?:number, drawContent?:Function, text?:string|string[] 
}
export type RowDef = { 
  borderWidth?:number, borderColor?:Color, backgroundColor?:Color, color?:Color, size?:number, font?:PDFFont,
  format?:Format, cells:CellDef[], height:number, width?:number
}
export type TableDef = { 
  borderWidth?:number, borderColor?:Color, backgroundColor?:Color, color?:Color, size?:number, font?:PDFFont,
  format?:Format, rows:RowDef[], width?:number
}

export class Table {
  private pdfForm: PdfForm;
  private def: TableDef;
  private startPosition:Position;
  private currentRow:RowDef;

  constructor(pdfForm:PdfForm, def:TableDef) {
    this.def = def;
    const posId = pdfForm.markPosition();
    this.startPosition = pdfForm.markedPosition(posId);
    this.pdfForm = pdfForm;
  }

  public draw = async () => {
    const { drawRows } = this;

    await drawRows();
  }

  private drawRows = async (rows?:RowDef[]) => {
    const { drawRow } = this;

    rows = rows ?? this.def.rows;
    for(let i=0; i<rows.length; i++) {
      await drawRow(rows[i], i);
    }
  }

  private drawRow = async (row:RowDef, rowIndex:number) => {
    const { cells, height } = row;
    const { drawCell, nextLine, pdfForm: { page: { basePage }} } = this;
    this.currentRow = row;
    if(rowIndex > 0) {
      basePage.moveDown(height);
    }
    for(let i=0; i<cells.length; i++) {
      await drawCell(cells[i], height);
    }
    nextLine(basePage.getY());
  }

  private drawCell = async (cell:CellDef, height:number) => {
    const { 
      getCellWidth, getBorderWidth, getBorderColor, getBackgroundColor, getColor, getSize, getFont, getFormat,
      pdfForm: { page: { basePage }, page }
    } = this;
    const { drawContent, text } = cell;
    const width = getCellWidth(cell);
    const borderWidth = getBorderWidth(cell);
    const borderColor = getBorderColor(cell);
    const backgroundColor = getBackgroundColor(cell);
    const color = getColor(cell);
    const size = getSize(cell);
    const font = getFont(cell);
    const format = getFormat(cell);

    if(drawContent) {
      basePage.drawRectangle({
        x:basePage.getX(), y:basePage.getY(), height, width, borderWidth, borderColor, color:backgroundColor
      })
      await drawContent(color, size);
    }
    else {
      await new Rectangle({
        text: text || '',
        page,
        align: format?.align,
        valign: format?.valign,
        options: { borderWidth, borderColor, color:backgroundColor, width, height },
        textOptions: { size, font, color },
        margins: format?.margins
      }).draw();
    }

    basePage.moveRight(width);
  }

  private getCellWidth = (cell:CellDef):number => {
    const { width } = cell;
    if(width) return width;
    const { currentRow, currentRow: { cells }, getRowWidth } = this; 
    const combinedCellWidth:number = cells.reduce((a, c) => a + (c.width ?? 0), 0);
    const rowWidth = getRowWidth(currentRow);
    const leftover = rowWidth - combinedCellWidth;
    if(leftover == 0) {
      return rowWidth/cells.length;
    }
    // Distribute remaining width of the row evenly among any of its cells that do not specify their own width. 
    const widthlessCells:number = cells.reduce((a, c) => a + (c.width ? 0 : 1), 0);
    return leftover/widthlessCells;
  }

  private nextLine = (y:number) => {
    const { pdfForm: { page: { basePage }}, startPosition } = this;
    basePage.moveTo(startPosition.x, y)
  }

  private getTableWidth = ():number => {
    const { def: { width }, pdfForm: { page: { bodyWidth } } } = this;
    return width ?? bodyWidth;
  }

  private getRowWidth = (row:RowDef):number => {
    const { width, cells } = row;
    return width ?? this.getTableWidth();
  }

  private getBorderWidth = (cell:CellDef) => {
    if(cell.borderWidth) return cell.borderWidth;
    const { currentRow, def } = this;
    if(currentRow.borderWidth) return currentRow.borderWidth;
    return def.borderWidth;
  }

  private getBorderColor = (cell:CellDef) => {
    if(cell.borderColor) return cell.borderColor;
    const { currentRow, def } = this;
    if(currentRow.borderColor) return currentRow.borderColor;
    return def.borderColor;
  }

  private getBackgroundColor = (cell:CellDef) => {
    if(cell.backgroundColor) return cell.backgroundColor;
    const { currentRow, def } = this;
    if(currentRow.backgroundColor) return currentRow.backgroundColor;
    return def.backgroundColor;
  }

  private getColor = (cell:CellDef) => {
    if(cell.color) return cell.color;
    const { currentRow, def } = this;
    if(currentRow.color) return currentRow.color;
    return def.color;
  }

  private getSize = (cell:CellDef) => {
    if(cell.size) return cell.size;
    const { currentRow, def } = this;
    if(currentRow.size) return currentRow.size;
    return def.size;
  }

  private getFont = (cell:CellDef) => {
    if(cell.font) return cell.font;
    const { currentRow, def } = this;
    if(currentRow.font) return currentRow.font;
    return def.font;
  }

  private getFormat = (cell:CellDef) => {
    if(cell.format) return cell.format;
    const { currentRow, def } = this;
    if(currentRow.format) return currentRow.format;
    return def.format;
  }
}

