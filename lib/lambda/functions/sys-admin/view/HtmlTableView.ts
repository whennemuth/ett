import { viewHtml } from "../../../Utils";
import { AbstractTableView } from "./AbstractTableView";

/**
 * This class converts an array of objects into an html table rowset
 */
export class HtmlTableView extends AbstractTableView {
  constructor(a?:any[]) {
    super();
    this.a = a;
    this.joinVal = "\n";
  }

  protected renderTable = (content:string): string => {
    const { joinVal:jv } = this;
    // const styles = {
    //   ['font-family']: 'helvetica',
    //   ['font-size']: '10px'
    // }
    // const style = Object.entries(styles).map(entry => `${entry[0]}:${entry[1]};`).join('');

    const style = `<style>
      table.dbTable, table.dbTable th, table.dbTable td {
        border: 1px solid black;
        border-collapse: collapse;
        font-size: 10px;
        font-family: helvetica;
      }
      table.dbTable th {
        color: white;
        background-color: black;
        border-left: 1px solid white;
        border-right: 1px solid white;
      }
      table.dbTable th:first-child {
        border-left: 1px solid black;
      }
      table.dbTable th:last-child {
        border-right: 1px solid black;
      }
      table.dbTable td, th {
        padding: 2px;
      }
      pre.dbTable:hover {
        cursor: pointer;
        font-weight: bold;  
      }
    </style>
    <script>
      function showHide() {
        const { children } = event.srcElement.parentElement;
        const hiding = children[0].innerText.includes('+');  
        children[0].innerText = hiding ? '-{...}' : '+{...}';
        children[1].style.display = hiding ? 'inline' : 'none';
      }
    </script>
    `;

    if(this.offset == 0) {
      return `${style}${jv}<table class='dbtable'>${jv}${content}${jv}</table>`;
    }
    else {
      return `${jv}<pre  class='dbtable' onclick='showHide();'>+{...}</pre><table style='display:none;' class='dbtable'>${jv}${content}${jv}</table>`;
    }  
  }

  protected renderRow = (content:string): string => {
    const { joinVal:jv } = this;
    return `<tr>${jv}${content}${jv}</tr>`;
  }

  protected renderCell = (content:string): string => {
    const padLeft = "  ".repeat(this.offset + 1);
    return `${padLeft}<td>${content ?? '&nbsp;'}</td>`
  }

  protected renderHeaderCell = (content:string): string => {
    const padLeft = "  ".repeat(this.offset + 1);
    return `${padLeft}<th style='text-align:center; font-weight:bold;'>${content}</th>`;
  }
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;

if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/sys-admin/view/HtmlTableView.ts')) {

  const getArray = (): any[] => {
    return [
      { 
        fruit: 'apple',
        vegetable: 'spinach',
        grain: 'wheat'
      },
      {
        grain: 'rye',
        meat: 'chicken',
        drink: 'beer'
      },
      {
        dessert: 'ice cream',
        fruit: 'orange',
      }
    ] as any[];
  } 

  const a = getArray();
  a[1].nested = getArray();
  a[1].nested[1].nested = getArray();

  const view = new HtmlTableView(a);
  const html = view.render();
  console.log(html);

  (async () => {
    await viewHtml(html);
  })();
}

