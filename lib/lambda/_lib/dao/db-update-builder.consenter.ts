import { AttributeValue, UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { Affiliate, Consenter, ConsenterFields, ExhibitForm, ExhibitFormFields } from "./entity";
import { Builder, utils } from "./db-update-builder-utils";

const { getBlankItem, getFldSetStatement, getFldAppendStatement, wrap } = utils;

/**
 * Drill down into a consenter record for the affiliates associated with a particular exhibit form 
 * identified by a specified entity_id.
 * @param consenter 
 * @returns 
 */
const getAffiliates = ((consenter:Consenter, entity_id:string):Affiliate[] => {
  const { exhibit_forms } = consenter;
  if( ! exhibit_forms) return [];
  if( exhibit_forms.length == 0) return [];
  const form:ExhibitForm|undefined = exhibit_forms.find((f:ExhibitForm) => f.entity_id == entity_id);
  if( ! form) return [];
  if( ! form.affiliates) return [];
  if( form.affiliates.length == 0) return [];
  return form.affiliates;
});

const changedAffiliates = (newaffs:Affiliate[], oldaffs:Affiliate[]):Affiliate[] => {
  const changed = [] as Affiliate[];
  newaffs.forEach((affnew:Affiliate) => {
    const match:Affiliate|undefined = oldaffs.find((affold:Affiliate) => affnew.email == affold.email );
    if(match) changed.push(affnew);
  });
  return changed;
}

const addedAffiliates = (newaffs:Affiliate[], oldaffs:Affiliate[]):Affiliate[] => {
  const added = [] as Affiliate[];
  newaffs.forEach((affnew:Affiliate) => {
    const match:Affiliate|undefined = oldaffs.find((affold:Affiliate) => affnew.email == affold.email );
    if( ! match) added.push(affnew);
  });
  return added;
}

const deletedAffiliates = (newaffs:Affiliate[], oldaffs:Affiliate[]):Affiliate[] => {
  const deleted = [] as Affiliate[];
  oldaffs.forEach((affold:Affiliate) => {
    const match:Affiliate|undefined = newaffs.find((affnew:Affiliate) => affnew.email == affold.email );
    if( ! match) deleted.push(affold);
  });
  return deleted;
}

const addExhibitFormChangesToUpdateItem = (_new:Consenter, old:Consenter, item:UpdateItemCommandInput, fieldset:any) => {
  
  (_new.exhibit_forms || []).forEach((form:ExhibitForm) => {
    const { entity_id } = form;
    const oldaffs = getAffiliates(old, entity_id);
    const newaffs = getAffiliates(_new, entity_id);

    const fld = ConsenterFields.exhibit_forms;
    let exhibitFld: keyof typeof ExhibitFormFields;

    const getExhibitForms = (consenter:Consenter): ExhibitForm[] => {
      if( ! consenter[fld]) return [] as ExhibitForm[];
      return consenter[fld];
    };

    const getExhibitFormIndex = (consenter:Consenter, entity_id:string): number => {
      return consenter.exhibit_forms!.findIndex((f:ExhibitForm) => f.entity_id == entity_id);
    }

    getExhibitForms(_new).forEach((newform:ExhibitForm) => {
      const oldformIdx = getExhibitFormIndex(old, newform.entity_id);
      if(oldformIdx >= 0) {
        const oldform = old.exhibit_forms![oldformIdx];
        for(exhibitFld in ExhibitFormFields) {
          if(exhibitFld == ExhibitFormFields.affiliates) {
            // TODO: Create expressions and fieldset addition append, update, or remove affiliate.
          }
          else if(newform![exhibitFld] != oldform![exhibitFld]) {
            // TODO: Not sure if this is correct.
            const fldId = `${fld}${oldformIdx}`;
            item.ExpressionAttributeValues![`:${fldId}-${exhibitFld}`] = wrap(newform![exhibitFld]);
            item.ExpressionAttributeNames![`#${fldId}-${exhibitFld}`] = `${fld}[${oldformIdx}].${exhibitFld}`;
            fieldset.nonExhibit.push({ [`#${fldId}`]: `:${fldId}`});              
          }    
        }
      }
      else {
        // TODO: Create expressions and fieldset addition to append a new exhibit form.
      }
    });

    changedAffiliates(newaffs, oldaffs).forEach((a:Affiliate) => {
      const index = oldaffs.findIndex((a2:Affiliate) => a.email == a2.email);
      const affFld = `${fld}.${ExhibitFormFields.affiliates}[${index}]`;
      const affFldAlias = `#aff${index}`;
      const affFldNewVal = wrap(a);
      const affFldNewValAlias = `:aff${index}`;
      item.ExpressionAttributeValues![affFldNewValAlias] = affFldNewVal;
      item.ExpressionAttributeNames![affFldAlias] = affFld;
      fieldset.exhibit.update.push({ [affFldAlias]: affFldNewValAlias});
      // --update-expression "SET #pr.#5star[1] = :r5, #pr.#3star = :r3"
    });

    let i=0;
    addedAffiliates(newaffs, oldaffs).forEach((a:Affiliate) => {
      const affArrayFld = `${fld}.${ExhibitFormFields.affiliates}`;
      const affArrayFldAlias = `#affs`;
      const affFldNewVal = wrap(a);
      const affFldNewValAlias = `:newaff${++i}`;
      item.ExpressionAttributeValues![affFldNewValAlias] = affFldNewVal;
      item.ExpressionAttributeNames![affArrayFldAlias] = affArrayFld;
      fieldset.exhibit.update.push({ [affArrayFldAlias]: affFldNewValAlias});
      // item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatementFunc(o)(o); }).join(', ')}`;
    });

    i=0;
    deletedAffiliates(newaffs, oldaffs).forEach((a:Affiliate) => {
      const index = oldaffs.findIndex((a2:Affiliate) => a.email == a2.email);
      const affArrayFld = `${fld}.${ExhibitFormFields.affiliates}`;
      fieldset.exhibit.delete.push(`${affArrayFld}[${index}]`);
      // --update-expression "REMOVE RelatedItems[1], RelatedItems[2]"
    });
  });
}


/**
 * Modify an existing consenter in the target table by adding, removing, or updating fields at 
 * the top level, and/or the exhibit_form level, and/or the affiliate level.
 * @param TableName 
 * @param _new 
 * @param old 
 * @returns 
 */
export const consenterUpdate = (TableName:string, _new:Consenter, old:Consenter={} as Consenter):Builder => {

  const buildUpdateItem = () => {
    if( ! _new.update_timestamp) {
      _new.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ ConsenterFields.email ]: { S: _new.email }
    } as Record<string, AttributeValue>;
    const item = getBlankItem(TableName, key);
    const fieldset = {
      nonExhibit: [] as any[],
      exhibit: {
        update: [] as any[],
        append: [] as any[],
        delete: [] as any[]
      }
    }
    let fld: keyof typeof ConsenterFields;
    for(fld in ConsenterFields) {
      if(key[fld]) continue;
      if( ! _new[fld]) continue;
      if(fld == ConsenterFields.exhibit_forms) {

      }
      else {
        if(_new[fld] != old[fld]) { // Add to expressions only if the field has changed in value.
          item.ExpressionAttributeValues![`:${fld}`] = wrap(_new[fld]);
          item.ExpressionAttributeNames![`#${fld}`] = fld;
          fieldset.nonExhibit.push({ [`#${fld}`]: `:${fld}`});
        }
      }
    }

    const { nonExhibit, exhibit: { append, delete:Delete, update }} = fieldset;

    let updateExpr = '';
    if(nonExhibit.length > 0) {
      updateExpr = `SET ${nonExhibit.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`;
    };

    let affUpdateExpr = '';
    if(update.length > 0) {
      affUpdateExpr = `SET ${update.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`;
    };

    let affAppendExpr = '';
    if(append.length > 0) {
      affAppendExpr = `SET ${update.map((o:any) => { return getFldAppendStatement(o); }).join(', ')}`;
    }

    let affDeleteExpr = '';
    if(Delete.length > 0) {
      affDeleteExpr = `REMOVE ${Delete.join(', ')}`;
    }

    updateExpr = updateExpr ? `${updateExpr} ${affUpdateExpr}` : affUpdateExpr;
    updateExpr = updateExpr ? `${updateExpr} ${affAppendExpr}` : affAppendExpr;
    updateExpr = updateExpr ? `${updateExpr} ${affDeleteExpr}` : affDeleteExpr;     
    item.UpdateExpression = updateExpr.trim();

    return item;
  }  
  return { buildUpdateItem } as Builder;
}
