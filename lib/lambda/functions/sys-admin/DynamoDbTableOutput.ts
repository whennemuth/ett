import { AttributeValue, DynamoDBClient, ScanCommand, ScanInput, ScanOutput } from "@aws-sdk/client-dynamodb";
import { View } from "./view/View";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { convertFromApiObject } from "../../_lib/dao/db-object-builder";
import { DynamoDbConstruct, TableBaseNames } from "../../../DynamoDb";
import { HtmlTableView } from "./view/HtmlTableView";
import { viewHtml } from "../../Utils";
import { TableBase } from "aws-cdk-lib/aws-dynamodb";

/**
 * Output a "display" of the entire content of the specified dynamodb table that is based on the
 * output of the particular view provided.
 */
export class DynamoDbTableOutput {
  private view: View;

  constructor(view:View) {
    this.view = view;
  }

  /**
   * Get the entire dynamodb table content as 
   * @param TableName 
   * @returns 
   */
  private getTableScan = async (TableName:string):Promise<ScanOutput> => {
    const dbclient = new DynamoDBClient({ region: process.env.REGION });
    const docClient = DynamoDBDocumentClient.from(dbclient);
    const command = new ScanCommand({ TableName, Limit: 200 } as ScanInput);
    return docClient.send(command);
  }

  /**
   * Convert the dynamodb table items into an html table.
   * @param tableName 
   * @returns 
   */
  public getDisplay = async (tableName:string):Promise<string> => {
    const { view, getTableScan } = this;
    const scanOutput = await getTableScan(tableName);
    const converted = scanOutput.Items?.map((item:Record<string, AttributeValue>) => {
      return convertFromApiObject(item, false);
    });
    return view.render(converted);
  }
}



/**
 * RUN MANUALLY:
 */
const { argv:args } = process;

if(args.length > 2 && args[2] == 'RUN_MANUALLY_DYNAMODB_DISPLAY') {
  const table = args[3];
  const { getTableName } = DynamoDbConstruct;
  const { USERS, ENTITIES, INVITATIONS, CONSENTERS } = TableBaseNames;

  let tableName;
  switch(table) {
    case 'user': tableName = getTableName(USERS); break;
    case 'entity': tableName = getTableName(ENTITIES); break;
    case 'invitation': tableName = getTableName(INVITATIONS); break;
    case 'cp': tableName = getTableName(CONSENTERS); break;
  }

  if( ! tableName) {
    console.error('Missing tableName parameter');
    process.exit(0);
  }

  (async () => {
    
    const html = await new DynamoDbTableOutput(
      new HtmlTableView()
    ).getDisplay(tableName);

    console.log(html)
    
    await viewHtml(html);
  })();

}