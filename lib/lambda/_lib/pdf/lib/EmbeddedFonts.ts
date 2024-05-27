import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";

type Embedded = { name:string, font:PDFFont };

/**
 * Create embedded fonts, but also cache them for subsequent calls for embedding of the same font.
 */
export class EmbeddedFonts {
  private doc:PDFDocument;
  private cache = [] as Embedded[];

  constructor(doc:PDFDocument) {
    this.doc = doc;
  }

  public getFont = async (name:StandardFonts|string):Promise<PDFFont> => {
    const { cache, doc } = this;
    let cached = cache.find((_cached:Embedded) => {
      return _cached.name == name;
    });
    if( ! cached) {
      const font = await doc.embedFont(name as StandardFonts);
      cached = { name, font };
      cache.push(cached);
    }
    return cached.font;
  }
}