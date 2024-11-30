import { CloudFrontClient, GetDistributionCommand, UpdateDistributionCommand, UpdateDistributionCommandInput } from "@aws-sdk/client-cloudfront";
import { IContext } from "../contexts/IContext";
import { log, lookupCloudfrontDistributionId } from "../lib/lambda/Utils";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";

const cloudfront = new CloudFrontClient({ region: "us-east-1" }); // CloudFront operations must use the us-east-1 region

const lambda = new LambdaClient({ region: "us-east-1" });

/**
 * Disassociate Lambda@Edge functions from the distribution's behaviors.
 */
const disassociateLambdaEdge = async (distributionId:string): Promise<string[]> => {
  console.log(`Fetching configuration for distribution: ${distributionId}`);

  // Step 1: Fetch the current distribution configuration
  const getCommand = new GetDistributionCommand({ Id: distributionId });
  const response = await cloudfront.send(getCommand);
  const config = response.Distribution?.DistributionConfig;
  const etag = response.ETag;

  if ( ! config || ! etag) {
    throw new Error("Failed to retrieve distribution configuration or ETag.");
  }

  console.log("Disassociating Lambda@Edge functions...");

  const lambdaArns = [] as string[];

  // Step 2: Remove Lambda associations from cache behaviors
  if (config.CacheBehaviors?.Items) {
    config.CacheBehaviors.Items.forEach((behavior) => {
      const { PathPattern, LambdaFunctionAssociations } = behavior;
      log(LambdaFunctionAssociations, `Disassociating Lambda@Edge functions from behavior ${PathPattern}`);
      if((LambdaFunctionAssociations?.Quantity ?? 0) > 0) {
        LambdaFunctionAssociations?.Items?.forEach(a => {
          if(a.LambdaFunctionARN) {
            lambdaArns.push(a.LambdaFunctionARN);
          }
        })
        behavior.LambdaFunctionAssociations = { Quantity: 0, Items: [] }; // Remove Lambda@Edge associations
      }
    });
  }
  if(config.DefaultCacheBehavior?.LambdaFunctionAssociations) {
    config.DefaultCacheBehavior.LambdaFunctionAssociations = { Quantity: 0, Items: [] };
  }
  

  // Step 3: Update the distribution configuration
  const updateCommand = new UpdateDistributionCommand({
    Id: distributionId,
    DistributionConfig: config,
    IfMatch: etag, // Required to ensure we’re modifying the latest version
  } as UpdateDistributionCommandInput);
  await cloudfront.send(updateCommand);

  console.log("Lambda@Edge functions disassociated. Waiting for changes to deploy...");

  return lambdaArns;
};

/**
 * Poll CloudFront for the distribution status until it is 'Deployed'.
 */
const waitForDeployment = async (distributionId:string): Promise<void> => {
  console.log("Waiting for CloudFront deployment...");
  while (true) {
    const getCommand = new GetDistributionCommand({ Id: distributionId });
    const response = await cloudfront.send(getCommand);
    const status = response.Distribution?.Status;

    if (status === "Deployed") {
      console.log("CloudFront distribution changes deployed.");
      break;
    }

    console.log(`Still deploying (status is ${status})... Checking again in 10 seconds.`);
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds before checking again
  }
};

/**
 * Wait until all Lambda@Edge functions are fully deleted.
 */
const waitForLambdaEdgeDeletion = async (lambdaArn:string): Promise<void> => {
  console.log("Waiting for Lambda@Edge functions to be fully deleted...");

  while (true) {
    // List all Lambda functions
    const command = new ListFunctionsCommand({});
    const response = await lambda.send(command);

    // Check for any remaining Lambda@Edge functions
    const replicatedFunctions = response.Functions?.filter((fn) =>
      fn.FunctionArn?.startsWith(lambdaArn)
    );

    if (!replicatedFunctions || replicatedFunctions.length === 0) {
      console.log("All Lambda@Edge functions have been deleted.");
      break;
    }

    console.log(
      `Still waiting for the following Lambda@Edge functions to be deleted:\n${replicatedFunctions
        .map((fn) => fn.FunctionArn)
        .join("\n")}`
    );

    // Wait 30 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
};

const waitForLambdaEdgeDeletions = async (lambdaArns:string[]): Promise<void> => {
  for(const lambdaArn of lambdaArns) {
    await waitForLambdaEdgeDeletion(lambdaArn);
  }
}

/**
 * Main function to handle the teardown process.
 */
const main = async () => {
  try {
    const context:IContext = await require('../contexts/context.json');
    const { TAGS: { Landscape }} = context;
    const distributionId = await lookupCloudfrontDistributionId(Landscape);
    if( ! distributionId) {
      console.error(`Cannot determine distributionId for landscape: ${Landscape}`);
      process.exit(1);
    }

    console.log(`Distribution lookup found: ${distributionId}`);

    const functionArns = await disassociateLambdaEdge(distributionId);

    await waitForDeployment(distributionId);

    await waitForLambdaEdgeDeletions(functionArns);

    console.log("Disassociation complete. You can now safely run `cdk destroy`.");
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
};

(async () => {
  await main();
})();

