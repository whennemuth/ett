import { QueryCommandInput } from "@aws-sdk/client-dynamodb";

export enum DataType {
  S = 'S', N = 'N', B = 'B', BOOL = 'BOOL', NULL = 'NULL', 
  L = 'L', M = 'M', SS = 'SS', NS = 'NS', BS = 'BS'
}

/**
 * This class offers a few rudimentary expression options to apply to or extend the 
 * QueryCommandInput.FilterExpression value in order to narrow down the values returned by a query operation.
 */
export class FilterExpression {
  private name:string;
  private value:any;
  private comparator: '=' | '<>' | '>' | '>=' | '<' | '<=';
  private dataType:DataType;

  constructor(name:string, value:any, dataType:DataType=DataType.S) {
    this.name = name;
    this.value = value;
    this.dataType = dataType;
  }

  public equalsMutator = (): ((input: QueryCommandInput) => void) => {
    this.comparator = '=';
    return this.equalsFilterExpression();
  }

  public notEqualsMutator = (): ((input: QueryCommandInput) => void) => {
    this.comparator = '<>';
    return this.equalsFilterExpression();
  }

  private equalsFilterExpression = (): ((input: QueryCommandInput) => void) => {
    const { name, value, comparator } = this;
    type AliasParms = { prefix:string, attributesFldName:string, attributesFldValue:any, input:QueryCommandInput };
  
    const setAlias = (parms: AliasParms):string => {
      const { attributesFldName, attributesFldValue, input, prefix } = parms;
      let i=0;
      while(true) {
        const alias = `${prefix}${++i}`;
        const attributes = Object.entries(input).find(kv => kv[0] == attributesFldName)?.[1] as Record<string, any>|undefined;
        if(attributes) {
          const entry = attributes[alias];
          if( ! entry) {
            attributes[alias] = attributesFldValue;
            return alias;
          }
        }
        else {
          Object.assign(input, { [attributesFldName]: { [alias]: attributesFldValue } });
          return alias;
        }
      }
    }
    
    const setNameAlias = (input: QueryCommandInput) => setAlias({
      attributesFldName:'ExpressionAttributeNames', attributesFldValue:name, prefix:`#${name}`, input
    });
    
    const setValueAlias = (input: QueryCommandInput) => setAlias({
      attributesFldName:'ExpressionAttributeValues', attributesFldValue: { S: value }, prefix:`:${name}`, input
    });
    
    return (input: QueryCommandInput) => {
      const nameAlias = setNameAlias(input);
      const valueAlias = setValueAlias(input);
      const expression = `${nameAlias} ${comparator} ${valueAlias}`;
      if(input.FilterExpression) {
        input.FilterExpression = `${input.FilterExpression} AND ${expression}`
      }
      else {
        input.FilterExpression = expression;
      }
    }
  }

}
