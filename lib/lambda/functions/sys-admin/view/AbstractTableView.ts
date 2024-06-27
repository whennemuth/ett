import { View } from "./View";

/**
 * This abstract class performs the boilerplate tasks of iterating an array of objects to convert it
 * into a tabular view. While this class builds the basic structure and order of the table for row and
 * cell content, implementers of this class will inject the markup for how those rows and cells are defined.  
 */
export abstract class AbstractTableView implements View {
  protected a?:any[];
  protected header:Set<string> = new Set<string>;
  protected joinVal = "";
  protected offset:number = 0;
  
  protected abstract renderTable(content:string):string
  protected abstract renderRow(content:string):string
  protected abstract renderCell(content:string|null):string
  protected abstract renderHeaderCell(content:string):string

  /**
   * Build a set that compiles each key of each object found in the main array of objects.
   * All attributes are accounted for, but - as a set - only once. The distinct nature of
   * the set is appropriate for the header.
   */
  private buildHeader = () => {
    const { a=[], header } = this;
    for(let i=0; i<a.length; i++) {
      const obj = a[i];
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          header.add(key)          
        }
      }
    }
  }

  /**
   * @param _a 
   * @returns The rendered output, a conversion of the supplied array of objects into a tabluar view. 
   */
  public render = (_a?:any[]): string => {
    this.a = _a ?? (this.a ?? []);
    const { buildHeader, render, renderTable, renderRow, renderCell, renderHeaderCell, a, header, joinVal } = this;

    buildHeader();

    const renderedRows:string[] = [];
    let renderedCells:string[] = [];

    // Render the header row
    for(const key of header) {
      renderedCells.push(renderHeaderCell(key));
    }
    renderedRows.push(renderRow(renderedCells.join(joinVal)));

    // Render the remaining rows
    for(let i=0; i<a.length; i++) {
      const obj = a[i];
      renderedCells = [] as string[];    
      for(const key of header) {
        const fldval = obj[key];
        if(typeof fldval === 'object') {
          let content = null;
          this.offset++;
          if(fldval instanceof Array) {
            content = render(fldval);
          }
          else {
            content = render([fldval]);
          }
          this.offset--;
          renderedCells.push(renderCell(content));
        }
        else {
          renderedCells.push(renderCell(fldval as string ?? null));
        }
      }
      renderedRows.push(renderRow(renderedCells.join(joinVal)));
    }
    
    return renderTable(renderedRows.join(joinVal));
  }
}