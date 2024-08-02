import { AttributeValue, UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { convertToApiObject, wrap } from './db-object-builder';
import { Builder, deepEqual, getBlankCommandInput, getFldSetStatement, getListAppendStatement } from "./db-update-builder-utils";
import { Consenter, ConsenterFields } from "./entity";

/**
 * Modify an existing consenter in the target table by adding, removing, or updating fields at 
 * the top level, and/or the exhibit_form level.
 * 
 * NOTE: Any modified exhibit form is treated as something that the original must be swapped with in its 
 * entirety - the originals are never edited in place at the field level. Thus, in order to edit an exhibit
 * form, the unmodified fields must also be RETAINED if one intends for them to survive the edit.
 * @param TableName 
 * @param _new 
 * @param old 
 * @returns 
 */
export const consenterUpdate = (TableName:string, _new:Consenter, old:Consenter={} as Consenter):Builder => {

  const buildUpdateItemCommandInput = () => {
    if( ! _new.update_timestamp) {
      _new.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ ConsenterFields.email ]: { S: _new.email }
    } as Record<string, AttributeValue>;
    const input = getBlankCommandInput(TableName, key);
    const fieldset = {
      nonExhibit: [] as any[],
      exhibit: {
        updates: [] as any[],
        appends: [] as any[],
        deletes: [] as any[]
      }
    }
    let fld: keyof typeof ConsenterFields;
    for(fld in ConsenterFields) {
      if(key[fld]) continue;
      if(fld == ConsenterFields.exhibit_forms) {
        const newForms = _new.exhibit_forms ?? [];
        const oldForms = old.exhibit_forms ?? [];
        let newFormApis = [] as any[];
        // Find any new exhibit forms:
        for(let i=0; i<newForms.length; i++) {
          const { entity_id } = newForms[i];
          const oldMatch = oldForms.find(f => f.entity_id == entity_id);
          if( ! oldMatch) {
            // This is a new exhibit form
            newFormApis.push({ M: convertToApiObject(newForms[i]) });
            fieldset.exhibit.appends.push({ [`#${fld}`]: `:${fld}`});
          }
        };
        if(newFormApis.length > 0) {
          input.ExpressionAttributeNames![`#${fld}`] = fld;
          input.ExpressionAttributeValues![`:${fld}`] = { L: newFormApis }
        }

        // Find any edited exhibit forms:
        for(let i=0; i<newForms.length; i++) {
          const { entity_id } = newForms[i];
          const oldMatch = oldForms.find(f => f.entity_id == entity_id);
          const fldItem = fld.replace(/s$/, ''); // Depluralize the exhibit_forms field name
          if(oldMatch && ! deepEqual(newForms[i], oldMatch)) {
            // This is an edited exhibit form
            input.ExpressionAttributeValues![`:${fldItem}${i}`] = { M: convertToApiObject(newForms[i]) };
            input.ExpressionAttributeNames![`#${fld}`] = fld;
            fieldset.exhibit.updates.push({ [`#${fld}[${i}]`]: `:${fldItem}${i}` });
          }
        }

        // Find any removed exhibit forms:
        for(let i=0; i<oldForms.length; i++) {
          const { entity_id } = oldForms[i];
          const newMatch = newForms.find(f => f.entity_id == entity_id);
          if( ! newMatch) {
            // This is a removed exhibit form
            fieldset.exhibit.deletes.push(`${fld}[${i}]`);
          }
        };
      }
      else {
        if( ! _new[fld]) continue;
        if(_new[fld] != old[fld]) { // Add to expressions only if the field has changed in value.
          input.ExpressionAttributeValues![`:${fld}`] = wrap(_new[fld]);
          input.ExpressionAttributeNames![`#${fld}`] = fld;
          fieldset.nonExhibit.push({ [`#${fld}`]: `:${fld}`});
        }
      }
    }

    const { nonExhibit, exhibit: { appends, deletes, updates }} = fieldset;

    let updateExpr = 'SET';

    if(nonExhibit.length > 0) {
      updateExpr = `${updateExpr} ${nonExhibit.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`;
    };

    if(updates.length > 0) {
      updateExpr = updateExpr == 'SET' ? updateExpr : updateExpr + ',';
      updateExpr = `${updateExpr} ${updates.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`;
    };

    if(appends.length > 0) {
      updateExpr = updateExpr == 'SET' ? updateExpr : updateExpr + ',';
      updateExpr = `${updateExpr} ${appends.map((o:any) => { return getListAppendStatement(o); }).join(', ')}`;
    }

    const inputs = [] as UpdateItemCommandInput[];

    if(deletes.length > 0) {
      if(updates.length > 0 || appends.length > 0) {
        // Cannot combine two types (SET & REMOVE) of operations to the same list in the same 
        // update command input, so create an additional one.
        const removeItem = getBlankCommandInput(TableName, key);
        const updateFld = ConsenterFields.update_timestamp;
        removeItem.ExpressionAttributeValues![`:${updateFld}`] = wrap(_new[updateFld]);
        removeItem.ExpressionAttributeNames![`#${updateFld}`] = updateFld;
        removeItem.UpdateExpression = `REMOVE ${deletes.join(', ')} SET #${updateFld} = :${updateFld}`;
        inputs.push(removeItem);
      }
      else {
        // It is safe to combine the SET and REMOVE operations into one expression
        updateExpr = `${updateExpr} REMOVE ${deletes.join(', ')}`;
      }
    }

    if(updateExpr && updateExpr != 'SET #update_timestamp = :update_timestamp') {
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
