import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';
import { Actions } from "../../../role/AbstractRole";
import { Role, Roles } from "../dao/entity";

/**
 * Factory for callback urls expected by cognito app clients
 * SEE: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html#cognito-user-pools-app-idp-settings-about
 * NOTE: If the pathname appears to end with a file (has file extension), it assumed that the callback url 
 * is for the bootstrap app (or something like it) and will have applied to it extra query string parameters.
 * Else it is for something like a react app using routes, with more focus on parameters being path elements.
 */
export class CallbackUrlFactory {
  private context:IContext;
  private rootUrl:URL
  private role:Role;
  private token:string;

  private static TEMP_HOST: string = 'temphost.com';

  constructor(host:string, pathname:string, role:Role) {
    this.context = <IContext>ctx;
    this.role = role;
    if(host.startsWith("${Token")) {
      // These callback urls are being constructed during creation by the CDK of the cloudformation template.
      // This means that the host is actually a token "placeholder" for the domain name of a cloudformation 
      // distribution that has not been created yet. This token cannot be fed to the URL constructor because it
      // will be seen as having illegal characters. Therefore, a temp value will be used while the URL object is
      // involved, replaced with the token at the last moment when the urls are converted to strings and returned.
      this.token = host;
      host = CallbackUrlFactory.TEMP_HOST;
    }
    this.rootUrl = new URL(host.startsWith('http') ? host : `https://${host}`);
    if(pathname && pathname != '/') {
      this.rootUrl.pathname = pathname;
    }
  }

  private clone = (url:URL=this.rootUrl) => new URL(url.href);

  private extendedPathUrl = (segments:string):URL => this.pathNameUtils(this.clone()).appendMoreSegments(segments);

  /**
   * Decorator for URL.pathname for extra functionality
   * @param url 
   * @returns 
   */
  private pathNameUtils = (url:URL) => {
    const { clone } = this;
    const { pathname } = url;
    let parts = pathname.split('/').filter(segment => segment);
    let file:string;
    if(parts.length > 0) {
      const tail = parts[parts.length-1];
      if(tail.includes('.')) {
        file = parts.pop() ?? '';
      }
    }
    return {
      endsWithFile: () => (file ?? '').length > 0,
      appendMoreSegments: (path:string|undefined):URL => {
        if( ! path) return url;
        const allParts = [] as string[];
        allParts.push(...parts);
        const newParts = path.split('/').filter(segment => segment);
        allParts.push(...newParts);
        const newUrl = clone(url);
        if(file) {
          allParts.push(file);
        }
        newUrl.pathname = allParts.join('/');
        return newUrl;
      }
    }
  }

  /**
   * Add the provided callback/logout url to the provided array.
   * Includes an additional localhost version of the url if indicated, and avoids duplicates.
   * @param urls 
   * @param url 
   */
  private addUrl = (urls:string[], url:string) => {
    const { pathNameUtils, context: { LOCALHOST, TAGS: { Landscape }}} = this;
    const push = (url:string) => {
      if( ! urls.includes(url)) {
        urls.push(url);
      }
    }
    push(url);
    const bootstrap = pathNameUtils(new URL(url)).endsWithFile();
    if( ! Landscape.startsWith('prod') && LOCALHOST && ! bootstrap) {
      const mainUrl = new URL(url);
      const localUrl = new URL(LOCALHOST);
      localUrl.pathname = mainUrl.pathname;
      localUrl.search = mainUrl.search
      push(localUrl.href);
    }
  }


  /**
   * @returns The callback urls expected by a cognito app client
   */
  public getCallbackUrls = ():string[] => {
    const { TEMP_HOST } = CallbackUrlFactory;
    const { role, clone, pathNameUtils, extendedPathUrl, token, addUrl} = this;
    const urls = [] as string[];
    const path = pathNameUtils(clone());
    let url:URL;

    if(path.endsWithFile()) {
      addUrl(urls, clone().href);

      url = clone();
      url.searchParams.set('action', Actions.login);
      url.searchParams.set('selected_role', role);
      addUrl(urls, url.href);
      if(role != Roles.CONSENTING_PERSON) {
        url.searchParams.set('task', 'amend');
        addUrl(urls, url.href);
      }
      
      url = clone();
      url.searchParams.set('action', Actions.post_signup);
      url.searchParams.set('selected_role', role);
      addUrl(urls, url.href);      
      if(role != Roles.CONSENTING_PERSON) {
        url.searchParams.set('task', 'amend');
        addUrl(urls, url.href);
      }
    }
    else {
      const addCallbackRoute = (path:string) => {
        addUrl(urls, extendedPathUrl(path).href);
        url = extendedPathUrl(path);
        url.searchParams.set('action', Actions.post_signup);
        addUrl(urls, url.href);
      }

      switch(role) {
        case Roles.SYS_ADMIN:
          addCallbackRoute('/sysadmin');
          break;
        case Roles.RE_ADMIN:
          addCallbackRoute('/entity');
          break;
        case Roles.RE_AUTH_IND:
          addCallbackRoute('/auth-ind');
          addCallbackRoute('/auth-ind/amend');
          break;
        case Roles.CONSENTING_PERSON:
          addCallbackRoute('/consenting');
          break;
      }
    }

    if(role == Roles.CONSENTING_PERSON) {
      const addEntityInviteCallback = (exhibitType:'current'|'other'|'both') => {
        url = extendedPathUrl(`/consenting/add-exhibit-form/${exhibitType}`);
        if(path.endsWithFile()) {
          url.searchParams.set('action', Actions.login);
          url.searchParams.set('selected_role', role);
        }
        addUrl(urls, url.href);
      }
      addEntityInviteCallback('both');
      addEntityInviteCallback('current');
      addEntityInviteCallback('other');
    }

    return token ? urls.map(url => url.replace(TEMP_HOST, token)) : urls;
  }

  /**
   * @returns The logout urls expected by a cognito app client
   */
  public getLogoutUrls = ():string[] => {
    const { TEMP_HOST } = CallbackUrlFactory;
    const { role, clone, pathNameUtils, extendedPathUrl, token, addUrl } = this;
    const urls = [] as string[];
    const path = pathNameUtils(clone());
    let url:URL;

    url = clone();
    if(path.endsWithFile()) {
      url.searchParams.set('action', Actions.logout);
      addUrl(urls, url.href);
    }
    else {
      addUrl(urls, extendedPathUrl('/logout').href);
    }
    
    if(role == Roles.CONSENTING_PERSON && path.endsWithFile()) {
      const addEntityInviteCallback = (exhibitType:'current'|'other'|'both') => {
        url = extendedPathUrl(`/consenting/add-exhibit-form/${exhibitType}`);
        url.searchParams.set('action', Actions.logout);
        addUrl(urls, url.href);
      }
      addEntityInviteCallback('both');
      addEntityInviteCallback('current');
      addEntityInviteCallback('other');
    }

    return token ? urls.map(url => url.replace(TEMP_HOST, token)) : urls;
  }
}

 



/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/cognito/CallbackUrls.ts')) {
  (async () => {
    // Cannot import utils at the top of the page because it introduces the following circular reference issue:
    // ../lib/lambda/Utils.ts > ../lib/role/AbstractRole.ts > ../lib/CognitoUserPoolClient.ts > ../lib/lambda/_lib/cognito/CallbackUrls.ts
    const utils = await require('../../Utils');
    
    const context:IContext = await require('../../../../contexts/context.json');
    const { REDIRECT_PATH_BOOTSTRAP, REDIRECT_PATH_WEBSITE, TAGS: { Landscape } } = context;
    const { SYS_ADMIN, RE_ADMIN, RE_AUTH_IND, CONSENTING_PERSON } = Roles;

    // Get the cloudfront domain
    let host:string;
    try {
      host = await utils.lookupCloudfrontDomain(Landscape) ?? 'error';
    }
    catch(e:any) {
      if(e.name == 'ExpiredToken') {
        console.log('Expired token! Using dummy value for domain');
        host = 'mycloudfrontDomain.net';
      }
      else {
        throw(e);
      }
    }
    
    // Print out all the callback and logout urls for each cognito app client (one client per role)
    [ SYS_ADMIN, RE_ADMIN, RE_AUTH_IND, CONSENTING_PERSON ].forEach((role:Role) => {
      const callbackUrls = [] as string[];
      const logoutUrls = [] as string[];
      let factory = new CallbackUrlFactory(host, REDIRECT_PATH_BOOTSTRAP, role);
      callbackUrls.push(...factory.getCallbackUrls());
      logoutUrls.push(...factory.getLogoutUrls());
      factory = new CallbackUrlFactory(host, REDIRECT_PATH_WEBSITE, role);
      callbackUrls.push(...factory.getCallbackUrls());
      logoutUrls.push(...factory.getLogoutUrls());
      utils.log({ role, callbackUrls, logoutUrls });
    });
  })();
}
