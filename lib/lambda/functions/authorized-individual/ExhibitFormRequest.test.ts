import { ExhibitFormRequest, SendExhibitFormRequestParms } from "./ExhibitFormRequest";

const expectedLink = (expected:string) => {
  return { test: (parms:SendExhibitFormRequestParms) => {
    const efr = new ExhibitFormRequest(parms);
    const link = efr.getLink() as string;
    expect(link).toEqual(expected);
  }};
}

const defaultParms = {
  consenterEmail: 'cp1@warhen.work',
  entity_id: 'ea14dcfd-2f5a-40e1-9bc1-48a3afeec996',
  linkUri: 'https://d227na12o3l3dd.cloudfront.net',
  constraint: 'other',
} as SendExhibitFormRequestParms;


describe('ExhibitFormRequest', () => {

  it('Should properly form an exhibit form request link for bootstrap exhibit form "backdoor"', async () => {
    const parms = { ...defaultParms, linkUri: `${defaultParms.linkUri}/bootstrap/index.htm` };
    const entity_id = parms.entity_id;
    const expectedbase= `https://d227na12o3l3dd.cloudfront.net/bootstrap/consenting/add-exhibit-form/other/index.htm`;
    const expectedNoQuerystring = `${expectedbase}#entity_id=${entity_id}`;
    const expectedWithQuerystring = `${expectedbase}?foo=bar#entity_id=${entity_id}`;

    // Test without trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm`;
    expectedLink(expectedNoQuerystring).test(parms);

    // Test with trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm/`;
    expectedLink(expectedNoQuerystring).test(parms);

    // Test without index.htm and trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap`;
    expectedLink(expectedNoQuerystring).test(parms);

    // Test without index.htm 
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap/`;
    expectedLink(expectedNoQuerystring).test(parms);
    
    // Test with a querystring
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
    
    // Test with a querystring and a trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm/?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
    
    // Test with a querystring and no file name
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
    
    // Test with a querystring and no file name and a trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/bootstrap/?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
  });

  it('Should properly form an exhibit form request link for cloudfront for the standard website exhibit form "backdoor"', async () => {
    const parms = { ...defaultParms };
    const entity_id = parms.entity_id;
    const expectedbase = `https://d227na12o3l3dd.cloudfront.net/consenting/add-exhibit-form/other`;
    const expectedNoQuerystring = `${expectedbase}#entity_id=${entity_id}`;
    const expectedWithQuerystring = `${expectedbase}?foo=bar#entity_id=${entity_id}`;


    // Test without trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net`;
    expectedLink(expectedNoQuerystring).test(parms);

    // Test with trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/`;
    expectedLink(expectedNoQuerystring).test(parms);

    // Test with index.html
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/index.html`;
    expectedLink(expectedNoQuerystring).test(parms);

    // Test with index.html and slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/index.html/`;
    expectedLink(expectedNoQuerystring).test(parms);
    
    // Test with a querystring and no file name
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
    
    // Test with a querystring and no file name and a trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
    
    // Test with a querystring and a file name
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/index.html?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
    
    // Test with a querystring and a file name and a trailing slash
    parms.linkUri = `https://d227na12o3l3dd.cloudfront.net/index.html/?foo=bar`;
    expectedLink(expectedWithQuerystring).test(parms);
  });
});