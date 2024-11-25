import { IAppConfig } from "../../../_lib/config/Config";
import { Roles, User, YN } from "../../../_lib/dao/entity";
import { bugsbunny, daffyduck, yosemitesam } from "../MockObjects";
import { Personnel, PersonnelParms } from "./EntityPersonnel";
import { EntityState } from "./EntityState";

const DAY:number = 1000 * 60 * 60 * 24;
const nowISO = '2024-11-04T18:00:00.000Z';
const updatedISO = '2024-09-04T18:00:00.000Z'; // 2 months before nowISO

// Get some ASP users to be returned by the mocked personnel instance.
const getBugs = ():User => {
  const bugs = Object.assign({}, bugsbunny);
  bugs.update_timestamp = updatedISO;
  return bugs;
}
const getFred = ():User => {
  const fred = getBugs();
  fred.email = "fred@HannaBarbarra.com"; fred.fullname = 'Fred Flintstone'; fred.title = 'Caveman';
  return fred;
}

// Get some AI users to be returned by the mocked personnel instance.
const getDaffy = ():User => {
  const daffy = Object.assign({}, daffyduck);
  daffy.update_timestamp = updatedISO;
  return daffy;
}
const getSam = ():User => {
  const sam = Object.assign({}, yosemitesam);
  sam.update_timestamp = updatedISO;
  return sam;
}
const getBarney = ():User => {
  const barney = getDaffy();
  barney.email = "barney@HannaBarbarra.com"; barney.fullname = 'Barney Rubble'; barney.title = 'Caveman';
  return barney;
}

// Mock the Personnel class
jest.mock('./EntityPersonnel.ts', () => {
  return {
    Personnel: jest.fn().mockImplementation((personnel_parms:PersonnelParms) => {
      const { entity:json } = personnel_parms;
      const parms = JSON.parse(json as string);
      const { scenario, nowISO } = parms;
      const now = new Date(nowISO ?? new Date().toISOString());
      return {
        getUsers: ():User[] => {
          console.log(scenario);
          const bugs = getBugs(); const daffy = getDaffy(); const sam = getSam();
          const fred = getFred(); const barney = getBarney();
          switch(scenario) {
            case 1:
              return [ daffy, sam ];
            case 2:
              return [ bugs, daffy ];
            case 3:
              bugs.active = YN.No;
              return [ bugs, daffy, sam ];
            case 4:
              daffy.active = YN.No;
              return [ bugs, daffy, sam ];
            case 5:
              return [ bugs, daffy, sam ];
            case 6:
              bugs.active = YN.No;
              bugs.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs ];
            case 7:
              bugs.active = YN.No;
              bugs.update_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              return [ bugs ];
            case 8:
              bugs.active = YN.No;
              bugs.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              fred.active = YN.No;
              fred.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs, fred ];
            case 9:
              bugs.active = YN.No;
              bugs.update_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              fred.active = YN.No;
              fred.update_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              return [ bugs, fred ];
            case 10:
              bugs.active = YN.No;
              bugs.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              fred.active = YN.No;
              fred.update_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              return [ bugs, fred ];
            case 11:
              bugs.active = YN.No;
              bugs.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs, fred ];
            case 12:
              bugs.create_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              bugs.update_timestamp = bugs.create_timestamp;
              return [ bugs ];
            case 13:
              bugs.create_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              bugs.update_timestamp = bugs.create_timestamp;
              fred.active = YN.No
              fred.create_timestamp = new Date(now.getTime() - (DAY * 28)).toISOString();
              fred.update_timestamp = fred.create_timestamp;
              return [ bugs, fred ];
            case 14:
              bugs.create_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              bugs.update_timestamp = bugs.create_timestamp;
              return [ bugs ];
            case 15:
              bugs.create_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              bugs.update_timestamp = bugs.create_timestamp;
              fred.active = YN.No
              fred.create_timestamp = new Date(now.getTime() - (DAY * 28)).toISOString();
              fred.update_timestamp = fred.create_timestamp;
              return [ bugs, fred ];
            case 16:
              daffy.active = YN.No;
              daffy.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs, daffy ];
            case 17:
              daffy.active = YN.No;
              daffy.update_timestamp = new Date(now.getTime() - (DAY * 29)).toISOString();
              return [ bugs, daffy ];
            case 18:
              daffy.active = YN.No;
              daffy.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs, daffy, sam ];
            case 19:
              daffy.active = YN.No;
              daffy.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              sam.active = YN.No
              sam.update_timestamp = daffy.update_timestamp;
              return [ bugs, daffy, sam, barney ];
            case 20:
              bugs.create_timestamp = new Date(now.getTime() - (DAY * 31)).toISOString();
              daffy.create_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              daffy.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs, daffy ];
            case 21:
              daffy.active = YN.No;
              daffy.update_timestamp = new Date(now.getTime() - (DAY * 30)).toISOString();
              sam.active = YN.No
              sam.update_timestamp =new Date(now.getTime() - (DAY * 29)).toISOString();
              return [ bugs, daffy, sam, barney ];
            case 22:
              return [ bugs, daffy, sam ];
            case 23:
              sam.active = YN.No
              sam.update_timestamp =new Date(now.getTime() - (DAY * 30)).toISOString();
              return [ bugs, daffy, sam, barney ];
          }
          return [ bugs, daffy, sam ];
        },
        initialize: async ():Promise<Personnel> => {
          return {} as Personnel;
        }
      }
    })
  }
});

describe('EntityState.isUnderStaffed', () => {

  it('Should be understaffed if the ASP is missing', async () => {
    const personnel = new Personnel({ entity:'{ "scenario": 1 }' });
    const state = await EntityState.getInstance(personnel);
    expect(state.isUnderStaffed()).toBeTruthy();
  });

  it('Should be understaffed if an AI is missing', async () => {
    const personnel = new Personnel({ entity:'{ "scenario": 2 }' });
    const state = await EntityState.getInstance(personnel);
    expect(state.isUnderStaffed()).toBeTruthy();
  });

  it('Should be understaffed if the ASP is NOT active', async () => {
    const personnel = new Personnel({ entity:'{ "scenario": 3 }' });
    const state = await EntityState.getInstance(personnel);
    expect(state.isUnderStaffed()).toBeTruthy();
  });

  it('Should be understaffed if an AI is NOT active', async () => {
    const personnel = new Personnel({ entity:'{ "scenario": 4 }' });
    const state = await EntityState.getInstance(personnel);
    expect(state.isUnderStaffed()).toBeTruthy();
  });

  it('Should be staffed if full active contingent', async () => {
    const personnel = new Personnel({ entity:'{ "scenario": 5 }' });
    const state = await EntityState.getInstance(personnel);
    expect(state.isUnderStaffed()).toBeFalsy();
  });
});

describe('EntityState.exceededRoleVacancyTimeLimit(ASP)', () => {

  Date.now = () => { return new Date(nowISO).getTime() };

  const thirtyDays = ():number => (DAY * 30)/1000; // 30 days in seconds

  it('Should be overdue if single ASP that has been inactive for too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 6, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();    
  });

  it('Should NOT be overdue if single ASP that has NOT been inactive for too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 7, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();    
  });

  it('Should be overdue if entity has 2 ASPs that have been inactive for too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 8, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();    
  });

  it('Should NOT be overdue if entity has 2 ASPs, both inactive, neither having been inactive for too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 9, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();    
  });

  it('Should NOT be overdue if entity has 2 ASPs, both inactive, one having been inactive for too long, but not the other', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 10, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();  
  });

  it('Should NOT be overdue if entity has 2 ASPs, one having been inactive for too long, but one is active', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 11, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();       
  });
});

describe('EntityState.overdueForAI', () => {

  Date.now = () => { return new Date(nowISO).getTime() };

  const thirtyDays = ():number => (DAY * 30)/1000; // 30 days in seconds

  it('Should be overdue if entity has never had an AI for too long', async () => {
    let personnel = new Personnel({ entity:`{ "scenario": 12, "nowISO": "${nowISO}" }` });
    let state = await EntityState.getInstance(personnel);
    let overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy(); 

    personnel = new Personnel({ entity:`{ "scenario": 13, "nowISO": "${nowISO}" }` });
    state = await EntityState.getInstance(personnel);
    overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();        
  });

  it('Should NOT be overdue if entity has never had an AI, but not for too long', async () => {
    let personnel = new Personnel({ entity:`{ "scenario": 14, "nowISO": "${nowISO}" }` });
    let state = await EntityState.getInstance(personnel);
    let overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();  
    
    personnel = new Personnel({ entity:`{ "scenario": 15, "nowISO": "${nowISO}" }` });
    state = await EntityState.getInstance(personnel);
    overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();
  });

  it('Should be overdue if entity has only one AI and it has been inactive too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 16, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();       
  });

  it('Should NOT be overdue if entity has only one AI, and it has NOT been inactive for too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 17, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();       
  });

  it('Should be overdue if entity has one AI that is active, but has been without the 2nd AI for too long', async () => {
    let personnel = new Personnel({ entity:`{ "scenario": 18, "nowISO": "${nowISO}" }` });
    let state = await EntityState.getInstance(personnel);
    let overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();  
    
    personnel = new Personnel({ entity:`{ "scenario": 19, "nowISO": "${nowISO}" }` });
    state = await EntityState.getInstance(personnel);
    overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();
    
    personnel = new Personnel({ entity:`{ "scenario": 20, "nowISO": "${nowISO}" }` });
    state = await EntityState.getInstance(personnel);
    overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeTruthy();
  });

  it('Should NOT be overdue if entity has one AI that has been inactive too long, one that has not, and one that is active', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 21, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();       
  });

  it('Should NOT be overdue if entity has two active AIs', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 22, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();       
  });

  it('Should NOT be overdue if entity has two active AIs and one that has been inactive for too long', async () => {
    const personnel = new Personnel({ entity:`{ "scenario": 23, "nowISO": "${nowISO}" }` });
    const state = await EntityState.getInstance(personnel);
    const overdue = await state.exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, { getDuration: thirtyDays } as IAppConfig);
    expect(overdue).toBeFalsy();       
  });
});