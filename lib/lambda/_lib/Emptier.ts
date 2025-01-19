import { AttributeValue, BatchWriteItemCommand, BatchWriteItemCommandInput, DynamoDBClient, ScanCommand, ScanCommandInput, ScanCommandOutput, WriteRequest } from "@aws-sdk/client-dynamodb";
import { DeleteObjectsCommand, ListObjectsV2Command, ListObjectsV2CommandOutput, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { log } from "../Utils";

/**
 * Simple s3 bucket emptier. Run against any bucket with non-versioned content.
 */
export class BucketToEmpty {
  private Bucket:string;
  private region?:string;

  constructor(bucket:string, region?:string) {
    this.Bucket = bucket;
    if(region) {
      this.region = region;
    }
    this.region = process.env.REGION ?? process.env.AWS_REGION;
  }

  public empty = async (dryRun:boolean=true) => {
    const { Bucket, region } = this;
    if( ! region) {
      console.error(`Cannot empty ${Bucket} - Region is not specified!`);
    }
    let total:number = 0;
    let isTruncated = true;
    let ContinuationToken: string | undefined = undefined;
    const s3Client = new S3Client({ region });  // Replace with your bucket's region

    while(isTruncated) {
      // List objects in the bucket
      const listObjectsResponse = await s3Client.send(new ListObjectsV2Command({
        Bucket, ContinuationToken,
      })) as ListObjectsV2CommandOutput;
      
      // Create an array of just object keys to delete
      const objectsToDelete = listObjectsResponse.Contents?.map(object => ({
        Key: object.Key,
      }));

      if (objectsToDelete && objectsToDelete.length > 0) {
        if(dryRun) {
          log(objectsToDelete, `DRYRUN - Deleting the following objects from ${Bucket}`)
        }
        else {
          // Delete the objects in batches
          await s3Client.send(new DeleteObjectsCommand({
            Bucket, Delete: { Objects: objectsToDelete },
          }));
          log(objectsToDelete, `Deleted the following from ${Bucket}`)
        }
        total += objectsToDelete.length;
      }
      
      // Check if more objects are left to list
      isTruncated = listObjectsResponse.IsTruncated || false;
      ContinuationToken = listObjectsResponse.NextContinuationToken;
    }

    console.log(`${dryRun ? 'DRYRUN: ' : '' }${total} objects deleted from ${Bucket}`);
  }
}

export type EmptyDynamoDbTableParms = {
  TableName:string, partitionKey:string, sortKey?:string, dryRun?:boolean, region?:string
}

export type EmptyDynamoDbScanParms = {
  projectedFieldNames?:string,
  // Not filtering results using ScanCommandInput.FilterExpression because that is harder to implement generically.  
  filterFunction?:(item:Record<string, AttributeValue>) => boolean
}

/**
 * Simple dynamodb table emptier.
 */
export class DynamoDbTableToEmpty {
  private parms:EmptyDynamoDbTableParms;

  constructor(parms:EmptyDynamoDbTableParms) {
    if( ! parms.region) {
      parms.region = (process.env.REGION ?? process.env.AWS_REGION);
    }
    if( ! parms.region) {
      throw new Error('Region missing!');
    }
    this.parms = parms;
  }

  /**
   * Empty an entire dynamodb table
   * @param projectedFieldNames A comma-delimited list of fields to include in the scan made of items to delete.
   * @returns 
   */
  public empty = async (projectedFieldNames?:string) => {
    return this.removeItems({ projectedFieldNames});
  }

  /**
   * Remove from a dynamodb table all items that meet the criteria specified in the parms object.
   * @param parms 
   * @returns 
   */
  public prune = async (parms:EmptyDynamoDbScanParms) => {
    return this.removeItems(parms);
  }

  /**
   * Remove items from a dynamodb table - either all items or a subset of items defined by an optional filter function.
   * @returns 
   */
  private removeItems = async (parms:EmptyDynamoDbScanParms):Promise<Record<string, AttributeValue>[]> => {
    const { TableName, partitionKey, sortKey, region, dryRun } = this.parms;
    const { projectedFieldNames, filterFunction } = parms;
    const { getAliasedProjectionExpression, getExpressionAttributeNames } = this;
    const client = new DynamoDBClient({ region });
    const docClient = DynamoDBDocumentClient.from(client);
    const deletedItems = [] as Record<string, AttributeValue>[];
    let lastEvaluatedKey = undefined;
    do {
      // 1) Scan the table to retrieve all items
      const scanParams = { TableName, ExclusiveStartKey: lastEvaluatedKey } as ScanCommandInput;
      if(projectedFieldNames) {
        scanParams.ExpressionAttributeNames = getExpressionAttributeNames(projectedFieldNames);
        scanParams.ProjectionExpression = getAliasedProjectionExpression(projectedFieldNames);
      }
      const scanResult = await docClient.send(new ScanCommand(scanParams)) as ScanCommandOutput;
      const items = scanResult.Items || [];
      lastEvaluatedKey = scanResult.LastEvaluatedKey;

      // 2) Batch delete items (up to 25 at a time)
      while (items.length > 0) {
        let batch = items.splice(0, 25);
        if(filterFunction) {
          batch = batch.filter(filterFunction);
        }
        deletedItems.push(...batch);
        const deleteRequests = batch.map(item => {
          const Key = { [partitionKey]: item[partitionKey] };
          if(sortKey) {
            Key[sortKey] = item[sortKey];
          }
          return { DeleteRequest: { Key } } as WriteRequest;
        });

        const batchWriteParams = {
          RequestItems: {
            [TableName]: deleteRequests
          }
        } as BatchWriteItemCommandInput;

        if(dryRun) {
          console.log(batchWriteParams, `DRYRUN: Deleting`);
          continue;
        }
        console.log(batchWriteParams, 'Deleting');
        await docClient.send(new BatchWriteItemCommand(batchWriteParams));
      }

    } while (lastEvaluatedKey);

    return deletedItems;
  }

  private getExpressionAttributeNames = (projectionExpression:string):Record<string, string> => {
    const names = {} as Record<string, string>;
    projectionExpression.split(',').forEach(fldname => {
      names[`#${fldname.trim()}`] = fldname.trim();
    });
    return names;
  }

  private getAliasedProjectionExpression = (projectionExpression:string):string => {
    return projectionExpression.split(',').map(fldname => `#${fldname.trim()}`).join(', ');
  }
}