import { Color, PDFPage, PDFPageDrawRectangleOptions, PDFPageDrawTextOptions, rgb } from 'pdf-lib';


export type Margins = { top:number, bottom:number, left:number, right:number }

export type Position = { x:number, y:number };

export const rgbPercent = (r:number, g:number, b:number):Color => {
  return rgb(r / 255, g / 255, b / 255);
}