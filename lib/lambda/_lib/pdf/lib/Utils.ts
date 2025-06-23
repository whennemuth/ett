import { Color, PDFFont, rgb } from 'pdf-lib';
import { PdfForm } from '../PdfForm';


export type Margins = { top:number, bottom:number, left:number, right:number }

export type Position = { x:number, y:number };

export const rgbPercent = (r:number, g:number, b:number):Color => {
  return rgb(r / 255, g / 255, b / 255);
}

export enum Align { left, right, center };
export enum VAlign { top, bottom, middle };

export type ButtonParms = { 
  text:string,
  buttonHeight:number, 
  textSize:number,
  font:PDFFont,
  boldfont:PDFFont,
  color:Color,
  textColor:Color,
  newline?:boolean,
  description?:string, 
  descriptionHeight?:number,
  lineHeight:number,
  x?:number,
  y?:number
};

export const drawButton = async (form:PdfForm, parms:ButtonParms) => {
  const { _return, page, page: { drawRectangle, drawWrappedText, bodyWidth, basePage, margins } } = form;

  let { 
    text, description='', descriptionHeight=0, buttonHeight, textSize, boldfont, font, 
    color, textColor, newline=true, lineHeight, x=margins.left, y 
  } = parms;
  const textWidth = boldfont.widthOfTextAtSize(text, textSize);
  const buttonWidth = textWidth > (buttonHeight * 2) ? (textWidth + 12) : (buttonHeight * 2);
  const rightMargin = (buttonWidth - textWidth) / 2;

  if(newline) {
    // Move down to the next line
    _return(buttonHeight);
  }

  // Draw the button
  await drawRectangle({
    text,
    page, margins: { left:0, top:0, bottom:0, right:rightMargin },
    align: Align.right, valign: VAlign.middle,
    options: { 
      x,
      y:y ?? basePage.getY(), 
      color, 
      width:buttonWidth, 
      height:buttonHeight 
    },
    textOptions: { size:textSize, font:boldfont, color:textColor, lineHeight }
  });

  if(descriptionHeight <= 0) {
    // No description, so just return.
    return;
  }

  // Jog back up and over to the right to draw the description centered and padded on the right side of the button.
  const padLeft = 8;
  const horizontalRoom = (bodyWidth - 20) - buttonWidth - padLeft;
  const textHeight = font.heightAtSize(9);
  basePage.moveRight(buttonWidth + padLeft);
  if(descriptionHeight > buttonHeight) {
    basePage.moveDown((descriptionHeight - buttonHeight) / 2);
  }
  else {
    basePage.moveUp(buttonHeight - ((buttonHeight - descriptionHeight) / 2) - textHeight);
  }
  await drawWrappedText({
    text:description, options: { size:9, font  }, linePad: 2, horizontalRoom
  });
}
