import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import { IContext } from '../contexts/IContext';

type IParameters = {
  landscape: string,
  region: string,
  dryrun?: boolean
}

/**
 * Get parameters, checking the command line first, context.json second
 * @returns The landscape and region parameters
 */
const getParameters = async ():Promise<IParameters> => {
  let landscape:string = '';
  let region:string = '';
  let dryrun:boolean = false;

  const isRegion = (arg:string):boolean => /^[a-z]{2}-[a-z]+-\d+$/.test(arg);

  // Check for a particular command line argument and attempt to match it up as region, landscape, or dryrun
  const checkProcessArg = (index:number):void => {
    if(process.argv.length > index) {
      const arg = process.argv[index];
      if(arg === 'dryrun') {
        dryrun = true;
      }
      else if(isRegion(arg)) {
        region = arg;
      }
      else {
        landscape = arg;
      }
    }
  }

  // Check for command line arguments
  checkProcessArg(2);
  checkProcessArg(3);
  checkProcessArg(4);

  if(landscape && region) {
    return { landscape, region, dryrun }
  }

  // For any parameters not specified on the command line, load them from context.json
  const context:IContext = await require('../contexts/context.json');
  const { REGION, TAGS: { Landscape }} = context;

  return {
    landscape: landscape || Landscape,
    region: region || REGION,
    dryrun
  }
}

/**
 * Load all files in the specified directory to the S3 bucket
 * @param parms 
 */
const loadBucket = async (parms:IParameters) => {
  console.log(JSON.stringify(parms, null, 2));
  const { landscape, region, dryrun=false } = parms;
  const bucketName = `ett-${landscape}-static-site-content`;
  const directoryPath = path.join(__dirname, '../frontend/images');

  /**
   * Load a specified file to the S3 bucket
   * @param filePath 
   */
  const uploadFile = async (filePath: string) => {
    const s3 = new S3Client({ region });
    const fileContent = fs.readFileSync(filePath);
    const params = {
      Bucket: bucketName,
      Key: path.basename(filePath),
      Body: fileContent
    };

    try {
      const data = await s3.send(new PutObjectCommand(params));
      console.log(`Successfully uploaded ${filePath} to ${bucketName}`);
    } 
    catch (err) {
      console.error(`Error uploading ${filePath}:`, err);
    }
  };

  // Load all files in the directory
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(directoryPath, file);
      if(dryrun) {
        console.log(`DRYRUN: Would upload ${filePath}`);
        return;
      }
      uploadFile(filePath);
    });
  });
}


/**
 * Run this process examples (ommitted command line arguments will be loaded from context.json):
 *   1) npm run load-bucket
 *   2) npm run load-bucket dryrun
 *   3) npm run load-bucket dryrun us-east-1
 *   4) npm run load-bucket dryrun us-east-1 dev
 *   5) npm run load-bucket dev
 */
(async () => {
  const parms = await getParameters();
  await loadBucket(parms);
})();