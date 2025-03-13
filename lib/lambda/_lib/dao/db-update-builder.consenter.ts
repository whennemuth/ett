import { AttributeValue, UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { deepClone, deepEqual, fieldsAreEqual } from '../../Utils';
import { convertToApiObject, wrap } from './db-object-builder';
import { Builder, getBlankCommandInput, getFldSetStatement, MergeParms } from "./db-update-builder-utils";
import { Consenter, ConsenterFields, ExhibitForm } from "./entity";

/**
 * Modify an existing consenter in the target table by adding, removing, or updating fields at 
 * the top level, and/or the exhibit_form level.
 * 
 * NOTE (1): Any modified exhibit form is treated as something that the original must be swapped with in its 
 * entirety - the originals are never edited in place at the field level. Thus, in order to edit an exhibit
 * form, the unmodified fields must also be RETAINED if one intends for them to survive the edit.
 * 
 * NOTE (2): Any removed exhibit forms are deleted from the target item. If it is preferrable NOT to 
 * treat missing exhibit forms as a call to delete them, call consenterUpdate with merge=true
 * 
 * @param TableName 
 * @param _new 
 * @param old 
 * @returns 
 */
export const consenterUpdate = (TableName:string, _new:Consenter, old:Consenter={} as Consenter):Builder => {

  const buildUpdateItemCommandInput = (mergeParms:MergeParms={ fieldName: ConsenterFields.exhibit_forms, merge:false }) => {
    const { fieldName, merge } = mergeParms
    if(fieldName == ConsenterFields.exhibit_forms && merge) {
      _new = mergeExhibitFormLists(_new, old);
    }
    if( ! _new.update_timestamp) {
      _new.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ ConsenterFields.email ]: { S: _new.email.toLowerCase() }
    } as Record<string, AttributeValue>;
    const input = getBlankCommandInput(TableName, key);
    let fld: keyof typeof ConsenterFields;
    const updates = [] as any[];
    for(fld in ConsenterFields) {
      if(key[fld]) continue;
      switch(fld) {

        case ConsenterFields.exhibit_forms:
          const newForms = _new.exhibit_forms ?? [];
          const oldForms = old.exhibit_forms ?? [];
          if( ! deepEquals(newForms, oldForms)) {
            input.ExpressionAttributeNames![`#${fld}`] = fld;
            input.ExpressionAttributeValues![`:${fld}`] = convertToApiObject(newForms);
            updates.push({ [`#${fld}`]: `:${fld}`});
          }
          else if(newForms.length == 0) {
            input.ExpressionAttributeNames![`#${fld}`] = fld;
            input.ExpressionAttributeValues![`:${fld}`] = { L: [] }; // Prefer an empty array over an empty object
            updates.push({ [`#${fld}`]: `:${fld}`});
          }
          break;

        case ConsenterFields.consented_timestamp:
        case ConsenterFields.renewed_timestamp:
        case ConsenterFields.rescinded_timestamp:
          if( ! _new[fld]) continue;
          input.ExpressionAttributeNames![`#${fld}`] = fld;
          let converted = convertToApiObject(_new[fld]);
          if( ! converted || Object.keys(converted).length == 0) {
            converted = { L: [] }; // Prefer an empty array over an empty object
          }
          input.ExpressionAttributeValues![`:${fld}`] = converted;
          updates.push({ [`#${fld}`]: `:${fld}`});
          break;

        default:
          if( ! _new[fld]) continue;
          const newval = fld == ConsenterFields.email ? _new[fld].toLowerCase() : _new[fld];
          const oldval = fld == ConsenterFields.email ? old[fld].toLowerCase() : old[fld];
          if( ! fieldsAreEqual(newval, oldval)) { // Add to expressions only if the field has changed in value.
            input.ExpressionAttributeNames![`#${fld}`] = fld;
            input.ExpressionAttributeValues![`:${fld}`] = wrap(newval);
            updates.push({ [`#${fld}`]: `:${fld}`});
          }
          break;
      }
    }

    let updateExpr = `SET ${updates.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`;

    const inputs = [] as UpdateItemCommandInput[];

    if(updateExpr != 'SET #update_timestamp = :update_timestamp') {
      // To add the SET input, it must be for the update timestamp, AND at least one other field
      input.UpdateExpression = updateExpr.trim();
      inputs.push(input);
    }

    if(inputs.length == 1) {
      return inputs[0];
    }

    return inputs;
  }  
  return { buildUpdateItemCommandInput } as Builder;
}

/**
 * Accomodate the business case that modifications carried by a new consenter object do NOT apply to 
 * exhibit forms that seem to have been omitted. That is, do NOT treat an omitted exhibit form as a
 * call to delete that form. This requires a "merge" between old and new consenter with respect to 
 * their exhibit forms.
 * @param _new 
 * @param old 
 */
export const mergeExhibitFormLists = (_new:Consenter, old:Consenter={} as Consenter):Consenter => {
  const { exhibit_forms:newforms=[]} = _new;
  const { exhibit_forms:oldforms=[]} = old;
  const orphans = oldforms.filter(oldform => {
    const match = newforms.find(newform => {
      return newform.entity_id == oldform.entity_id;
    });
    return match == undefined;
  }) as ExhibitForm[];
  const merged = deepClone(_new) as Consenter;
  if( ! merged.exhibit_forms) {
    merged.exhibit_forms = [];
  }
  merged.exhibit_forms?.push(...orphans);
  return merged;
}

/**
 * Sort two exhibit form lists by the entity_id values of their members.
 */
const exhibitFormSorter = (ef1:ExhibitForm, ef2:ExhibitForm) => {
  if(ef1.entity_id == ef2.entity_id) return 0;
  return ef1.entity_id > ef2.entity_id ? 1 : -1;
}; 

/**
 * Equating two consenters will result in inequality if those consenters have the same exhibit forms
 * but in different order that would otherwise be equal. This function sorts both exhibit_forms arrays 
 * before equating the consenters overall.
 * @param exhibit_forms1 
 * @param exhibit_forms2 
 * @param parm 
 * @returns 
 */
export const deepEquals = (exhibit_forms1:ExhibitForm[], exhibit_forms2:ExhibitForm[], parm?:'log.console'|'log.temp'|'alt'):boolean => {
  if(exhibit_forms1.length != exhibit_forms2.length) {
    return false;
  }
  exhibit_forms1?.sort(exhibitFormSorter);
  exhibit_forms2?.sort(exhibitFormSorter);
  return deepEqual(exhibit_forms1, exhibit_forms2, parm);
}

/**
 * Equating two exhibit form lists will result in inequality if those lists have "equal" content, but 
 * in different order. The lists need to be sorted first before applying the assert.deepEqual function.
 * @param consenter1 
 * @param consenter2 
 * @param parm 
 * @returns 
 */
export const deepEquivalent = (consenter1:Consenter, consenter2:Consenter, parm?:'log.console'|'log.temp'|'alt'):boolean => {
  consenter1.exhibit_forms?.sort(exhibitFormSorter);
  consenter2.exhibit_forms?.sort(exhibitFormSorter);
  return deepEqual(consenter1, consenter2, parm);
}
