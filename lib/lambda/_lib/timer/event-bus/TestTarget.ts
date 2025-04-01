import { AttachRolePolicyCommand, CreateRoleCommand, DeleteRoleCommand, DetachRolePolicyCommand, IAMClient } from '@aws-sdk/client-iam';
import { CreateFunctionCommand, CreateFunctionCommandInput, DeleteFunctionCommand, LambdaClient, Runtime } from '@aws-sdk/client-lambda';
import { CloudWatchLogsClient, CreateLogGroupCommand, DeleteLogGroupCommand, DeleteLogStreamCommand, DescribeLogStreamsCommand, PutRetentionPolicyCommand } from '@aws-sdk/client-cloudwatch-logs';
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as archiver from "archiver";
import * as stream from "stream";

export type SetupParms = {
  region: string,
  lambdaFunctionName: string,
}

/**
 * Create a lambda function that simply outputs to the console and then deletes the rule and target that called it.
 * @param parms 
 */
export const getTestLambdaFunction = (parms:SetupParms) => {
  const { region, lambdaFunctionName } = parms;
  // Underscores and uppercase letters are not allowed in bucket names
  const S3Bucket = `${lambdaFunctionName.replace('_', '-').toLowerCase()}-bucket`; 
  const S3Key = 'code.zip';
  const logGroupName = `/aws/lambda/${lambdaFunctionName}`;

  const create = async ():Promise<string> => {

    // 1) Create the IAM role for the Lambda function   
    const Role = await createRole();

    // // 2) Create the s3 bucket for the lambda function code zip file
    // await createS3Bucket();

    // 2) Create the log group for the lambda function
    await createLambdaFunctionLogGroup();

    // 3) Create the Lambda function
    const lambdaArn = await createLambdaFunction(Role);
    
    return lambdaArn;
  }

  const destroy = async ():Promise<void> => {

    // 1) Delete the lambda function
    await deleteLambdaFunction();

    // 2) Delete the IAM role
    await deleteRole();

    await deleteLambdaFunctionLogGroup();

    // // 3) Delete the s3 bucket created for the lambda functions code zip file.
    // await deleteS3Bucket();
  }


  /**
   * Create an s3 bucket to store the lambda function code zip file
   * @param parms 
   * @returns 
   */
  const createS3Bucket = async ():Promise<string> => {
    const s3Client = new S3Client({ region });
    const createBucketCommand = new CreateBucketCommand({ Bucket: S3Bucket });
    await s3Client.send(createBucketCommand);
    console.log('Created S3 bucket:', S3Bucket);
    return S3Bucket;
  }

  const deleteS3Bucket = async () => {
    const s3Client = new S3Client({ region });
    try {
      // 1) Remove the S3Key object from the bucket first so that it can be deleted (can only delete empty buckets)
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3Bucket, Key: S3Key }));
      console.log('Deleted S3 object:', S3Key);

      // 2) Delete the bucket
      await s3Client.send(new DeleteBucketCommand({ Bucket: S3Bucket }));
      console.log('Deleted S3 bucket:', S3Bucket);
    }
    catch (error) {
      console.error('Failed to delete S3 bucket:', S3Bucket, error);
    }
  }

  const createLambdaFunction = async (Role:string):Promise<string> => {
    const lambdaClient = new LambdaClient({ region });

    // 1) Create a zip stream of the lambda function code
    const zipStream = new stream.PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(zipStream);
    archive.append(`
      exports.handler = async (event) => {
        console.log("Event received:", JSON.stringify(event, null, 2));
        try {
          const { lambdaInput, eventBridgeRuleName, targetId } = event;
          return { statusCode: 200, body: "Success" };
        }
        catch (error) {
          console.error("Error processing event:", error);
          return { statusCode: 500, body: "Error" };
        }
        finally {
          // Use the SDK to delete the rule and target 
          const eventBridge = new EventBridgeClient({ region: process.env.AWS_REGION });
          try {
            // Delete the target associated with the rule
            await eventBridge.send(new RemoveTargetsCommand({
              Rule: eventBridgeRuleName,
              Ids: [targetId]
            }));
            console.log('Deleted target: ' + targetId + ' from rule: ' + eventBridgeRuleName);

            // Delete the rule after the target is removed
            await eventBridge.send(new DeleteRuleCommand({
              Name: eventBridgeRuleName,
              Force: true,
            }));
            console.log('Deleted EventBridge rule: ' + eventBridgeRuleName);
          } 
          catch (deleteError) {
            console.error('Failed to delete EventBridge rule or target:', deleteError);
          }              
        }
      };
      `,
      { name: "index.js" }
    );
    await archive.finalize();

    // 2) Convert the zip stream to a buffer
    const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
      const buffers: Buffer[] = [];
      zipStream.on("data", (data) => buffers.push(data));
      zipStream.on("end", () => resolve(Buffer.concat(buffers)));
      zipStream.on("error", (err) => reject(err));
    });

    // 3) Create the Lambda function
    const lambdaParams = {
      Code: { ZipFile: zipBuffer },
      FunctionName: lambdaFunctionName,
      Handler: 'index.handler',
      Role,        
      Runtime: Runtime.nodejs20x,
      Description: 'TESTING: Lambda function to output event data and delete the rule and target',
    } as CreateFunctionCommandInput;
    const lambdaResponse = await lambdaClient.send(new CreateFunctionCommand(lambdaParams));
    console.log('Lambda function created:', lambdaResponse.FunctionArn);
    return lambdaResponse.FunctionArn!;
  }

  const createLambdaFunctionLogGroup = async () => {
    const logsClient = new CloudWatchLogsClient({ region });
    try {
      // 1) Create the log group
      await logsClient.send(new CreateLogGroupCommand({ logGroupName }));
      console.log(`Created log group ${logGroupName}`);
    }
    catch (error) {
      console.error('Failed to create log group:', logGroupName, error);  
    }

    // 2) Wait for a few seconds
    console.log('Waiting 5 seconds for log group to propagate...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    try {
      // 3) Add a retention policy to the log group
      const retentionInDays = 3;
      await logsClient.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays }));
      console.log(`Set retention policy for log group ${logGroupName} to ${retentionInDays} days.`);
    }
    catch (error) {
      console.error('Failed to set log group retention:', logGroupName, error);  
    }
  }

  const deleteLambdaFunctionLogGroup = async () => {
    await deleteAllLogStreams();
    const logsClient = new CloudWatchLogsClient({ region });
    try {
      // Delete the log group
      console.log(`Deleting log group: ${logGroupName}`);
      await logsClient.send(new DeleteLogGroupCommand({ logGroupName }));
    }
    catch (error) {
      console.error(`Failed to delete log group ${logGroupName}:`, error);
    }
  }

  const deleteAllLogStreams = async (): Promise<void> => {
    const logsClient = new CloudWatchLogsClient({ region });
  
    try {
      console.log(`Fetching log streams for log group: ${logGroupName}`);
  
      // Paginate through all log streams in the log group
      let nextToken: string | undefined = undefined;
      do {
        const describeLogStreamsCommand = new DescribeLogStreamsCommand({
          logGroupName,
          nextToken,
        }) as DescribeLogStreamsCommand;
        const response = await logsClient.send(describeLogStreamsCommand);
  
        if (response.logStreams && response.logStreams.length > 0) {
          for (const logStream of response.logStreams) {
            if (logStream.logStreamName) {
              console.log(`Deleting log stream: ${logStream.logStreamName}`);
              try {
                const deleteLogStreamCommand = new DeleteLogStreamCommand({
                  logGroupName,
                  logStreamName: logStream.logStreamName,
                });
                await logsClient.send(deleteLogStreamCommand);
                console.log(`Deleted log stream: ${logStream.logStreamName}`);
              } 
              catch (deleteError) {
                console.error(`Failed to delete log stream: ${logStream.logStreamName}`, deleteError);
              }
            }
          }
        }
  
        // Update the nextToken for pagination
        nextToken = response.nextToken;
      } 
      while (nextToken);
  
      console.log(`All log streams in log group ${logGroupName} have been deleted.`);
    } 
    catch (error) {
      console.error(`Failed to delete log streams in log group ${logGroupName}:`, error);
    }
  };

  const deleteLambdaFunction = async () => {
    const lambdaClient = new LambdaClient({ region });
    try {      
      await lambdaClient.send(new DeleteFunctionCommand({ FunctionName: lambdaFunctionName }));
      console.log('Deleted lambda function:', lambdaFunctionName);
    } 
    catch (error) {
      console.error('Failed to delete lambda function:', lambdaFunctionName, error);
    }
  }

  const createRole = async ():Promise<string> => {
    const iamClient = new IAMClient({ region });

    // 1) Define the trust policy for the Lambda role
    const assumeRolePolicyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
          Action: 'sts:AssumeRole',
        },
      ],
    });

    // 2) Create the role
    const roleName = `${lambdaFunctionName}-Role`;
    const createRoleCommand = new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicyDocument,
    });
    const roleResponse = await iamClient.send(createRoleCommand);
    console.log('Created IAM role:', roleResponse.Role?.Arn);

    // 3) Attach the AWS-managed policy for EventBridge and Lambda execution
    const attachPolicyCommands = [
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      }),
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: 'arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess',
      }),
    ];
    for (const command of attachPolicyCommands) {
      await iamClient.send(command);
    }
    console.log('Attached policies to role:', roleName);

    console.log('Waiting 10 seconds for IAM role to propagate...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    return roleResponse.Role?.Arn!;
  };

  const deleteRole = async () => {
    const roleName = `${lambdaFunctionName}-Role`;
    const iamClient = new IAMClient({ region });
    try {
      // 1) Detach the AWS-managed policies first so that the role can be deleted
      const detachPolicyCommands = [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        'arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess',
      ].map(policyArn =>  new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
      for (const command of detachPolicyCommands) {
        await iamClient.send(command as DetachRolePolicyCommand);
      }

      // 2) Delete the role
      await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
      console.log('Deleted IAM role:', roleName);
    } 
    catch (error) {
      console.error('Failed to delete IAM role:', roleName, error);
    }
  }

  return { create, destroy };
}