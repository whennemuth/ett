import { PDFFont, PDFPage, PDFPageDrawTextOptions, StandardFonts, drawText } from "pdf-lib";
import { TextLine, ParsedItem } from "./TextLine";
import { Page } from "./Page";

const drawTextMock = jest.fn((text, options) => {
  console.log(`Drawing ${text}`);
})
const pdfPageMock = {
  drawText: (text:string, options:PDFPageDrawTextOptions) => {
    drawTextMock(text, options);
  }
} as PDFPage;

const pageMock = {
  basePage: pdfPageMock,
  getFont: async (name:StandardFonts|string):Promise<PDFFont> => {
    return { name, widthOfTextAtSize: (s:string, size:number) => 100 } as PDFFont;
  },
} as Page;

const getParsed = async (text:string):Promise<ParsedItem[]> => {
  const textline = new TextLine(pageMock, {
    font: { name: StandardFonts.Courier } as PDFFont
  } as PDFPageDrawTextOptions);
  const { parse } = textline;
  return parse(text);
}

type AssertParsedItemParms = {
  items:ParsedItem[], index:number, length:number, bold:boolean, italics:boolean, text:string
}
const assertParsedItem = (parms:AssertParsedItemParms) => {
  const { items, index, text, bold, italics, length } = parms;
  const item = items[index];
  expect(items.length).toEqual(length);
  expect(item.bold).toEqual(bold);
  expect(item.italics).toEqual(italics);
  expect(item.text).toEqual(text);
}

describe('Font Test', () => {

  it('Should treat text with no markup as expected', () => {
    const text = 'Draw this text with no markup';
    getParsed(text).then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:1, text, bold:false, italics:false, index:0});
    });
  });

  it('Should bold text with <b> markup as expected', () => {
    getParsed('<b>Draw this bolded text</b>').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:1, text:'Draw this bolded text', bold:true, italics:false, index:0});
    });

    getParsed('Draw this <b>bolded text</b>').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:2, text:'Draw this ', bold:false, italics:false, index:0});
      assertParsedItem({ items, length:2, text:'bolded text', bold:true, italics:false, index:1});
    });

    getParsed('<b>Draw this</b> bolded text').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:2, text:'Draw this', bold:true, italics:false, index:0});
      assertParsedItem({ items, length:2, text:' bolded text', bold:false, italics:false, index:1});
    });

    getParsed('Draw <b>this bolded</b> text').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:3, text:'Draw ', bold:false, italics:false, index:0});
      assertParsedItem({ items, length:3, text:'this bolded', bold:true, italics:false, index:1});
      assertParsedItem({ items, length:3, text:' text', bold:false, italics:false, index:2});
    });

    getParsed('Draw <b>this bolded</b> and <b>more bolded</b> text').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:5, text:'Draw ', bold:false, italics:false, index:0});
      assertParsedItem({ items, length:5, text:'this bolded', bold:true, italics:false, index:1});
      assertParsedItem({ items, length:5, text:' and ', bold:false, italics:false, index:2});
      assertParsedItem({ items, length:5, text:'more bolded', bold:true, italics:false, index:3});
      assertParsedItem({ items, length:5, text:' text', bold:false, italics:false, index:4});
    });
  });

  it('Should italisize text with <i> markup as expected', () => {
    getParsed('<i>Draw this italisized text</i>').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:1, text:'Draw this italisized text', italics:true, bold:false, index:0});
    });

    getParsed('Draw this <i>italisized text</i>').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:2, text:'Draw this ', italics:false, bold:false, index:0});
      assertParsedItem({ items, length:2, text:'italisized text', italics:true, bold:false, index:1});
    });

    getParsed('<i>Draw this</i> italisized text').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:2, text:'Draw this', italics:true, bold:false, index:0});
      assertParsedItem({ items, length:2, text:' italisized text', italics:false, bold:false, index:1});
    });

    getParsed('Draw <i>this italisized</i> text').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:3, text:'Draw ', italics:false, bold:false, index:0});
      assertParsedItem({ items, length:3, text:'this italisized', italics:true, bold:false, index:1});
      assertParsedItem({ items, length:3, text:' text', italics:false, bold:false, index:2});
    });

    getParsed('Draw <i>this italisized</i> and <i>more italisized</i> text').then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:5, text:'Draw ', italics:false, bold:false, index:0});
      assertParsedItem({ items, length:5, text:'this italisized', italics:true, bold:false, index:1});
      assertParsedItem({ items, length:5, text:' and ', italics:false, bold:false, index:2});
      assertParsedItem({ items, length:5, text:'more italisized', italics:true, bold:false, index:3});
      assertParsedItem({ items, length:5, text:' text', italics:false, bold:false, index:4});
    });
  });

  it('Should handle nested markup as expected', () => {

    let text = 'This is bolded and italisized text'
    let line = `<b><i>${text}</i></b>`;
    getParsed(line).then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:1, text, italics:true, bold:true, index:0});
    });

    line = 'This <b><i>is bolded and italisized</i></b> and this <i><b>is italisized and bolded</b></i>';
    getParsed(line).then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:4, text:'This ', italics:false, bold:false, index:0});
      assertParsedItem({ items, length:4, text:'is bolded and italisized', italics:true, bold:true, index:1});
      assertParsedItem({ items, length:4, text:' and this ', italics:false, bold:false, index:2});
      assertParsedItem({ items, length:4, text:'is italisized and bolded', italics:true, bold:true, index:3});
    });

    line = 'This <b>is bolded and<i>this is both</i></b> and <i>this is italisized <b>and this is both</b> and this is italisized</i>';
    getParsed(line).then((items:ParsedItem[]) => {
      assertParsedItem({ items, length:7, text:'This ', italics:false, bold:false, index:0});
      assertParsedItem({ items, length:7, text:'is bolded and', italics:false, bold:true, index:1});
      assertParsedItem({ items, length:7, text:'this is both', italics:true, bold:true, index:2});
      assertParsedItem({ items, length:7, text:' and ', italics:false, bold:false, index:3});
      assertParsedItem({ items, length:7, text:'this is italisized ', italics:true, bold:false, index:4});
      assertParsedItem({ items, length:7, text:'and this is both', italics:true, bold:true, index:5});
      assertParsedItem({ items, length:7, text:' and this is italisized', italics:true, bold:false, index:6});
    });
  });
})