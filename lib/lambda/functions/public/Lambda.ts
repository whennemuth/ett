import { PublicApiConstruct } from "../../../PublicApi";
import { EntityPublicTask, EntityUtils } from "./Entity";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { error, errorResponse, okResponse, debugLog, invalidResponse, okPdfResponse } from "../../Utils";
import { Downloader, FormName } from "./FormsDownload";

/**
 * Handler for the public API request.
 * @param event 
 * @returns 
 */
export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {

  try {
    debugLog(event);

    const { path } = event;

    if(path.startsWith('/public/forms/download/')) {
      return await downloadForm(event);
    }    
    else if(path.startsWith('/public/entity/')) {
      return await getEntityInfo(event);
    }

    return okResponse('Ok', { event });
  }
  catch(e:any) {
    error(e);
    return errorResponse(e.message);
  }
}

/**
 * Handle requests for public pdf form downloads.
 * @param event 
 * @returns 
 */
const downloadForm = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  const { FORM_NAME_PATH_PARAM: pathParm} = PublicApiConstruct;
  const { pathParameters: {[pathParm]:formName }, requestContext: { domainName } } = event;

  if( ! formName ) {
    return invalidResponse(`Bad Request: ${pathParm} not specified (${Object.values(formName).join('|')})`);
  }
  if( ! Object.values<string>(FormName).includes(formName || '')) {
    return invalidResponse(`Bad Request: invalid form name specified (${Object.values(FormName).join('|')})`);
  }

  const downloader = new Downloader(formName, domainName);
  const bytes = await downloader.getBytes();
  return okPdfResponse(bytes, `${formName}.pdf`);
}

/**
 * Handle requests for performing public tasks related to entities.
 * @param event 
 * @returns 
 */
const getEntityInfo = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  const { ENTITY_TASK_PATH_PARAM: taskParm } = PublicApiConstruct
  const { [taskParm]:task } = event.pathParameters;

  if( ! task ) {
    return errorResponse(`Bad Request: ${taskParm} not specified (${Object.values(EntityPublicTask).join('|')})`);
  }
  if( ! Object.values<string>(EntityPublicTask).includes(task || '')) {
    return errorResponse(`Bad Request: invalid task name specified (${Object.values(EntityPublicTask).join('|')})`);
  }

  const inventory = await (new EntityUtils()).performTask(EntityPublicTask.INVENTORY);
  return okResponse('Ok', { inventory });
}