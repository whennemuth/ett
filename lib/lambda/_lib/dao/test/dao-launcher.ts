import { DAO, DAOFactory } from '../dao'
import { Roles, User, YN, UserFields } from '../entity';

const launch = async () => {

  const daoType = process.argv[2] as ('user'|'entity'|'invitation');
  const crudOp = process.argv[3] as ('create'|'read'|'update'|'delete'|'deactivate'|'test');

  switch(daoType) {
    case 'user':
      switch(crudOp) {
        case 'create':
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'gatekeeper@bu.edu', 
              [UserFields.entity_name]: 'Boston University', 
              [UserFields.role]: Roles.GATEKEEPER, 
              [UserFields.fullname]: 'Gate Keeper',
              [UserFields.sub]: 'gkp_sub_id',
          }});
          var response = await dao.create();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'read':
          // Read one item.
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_name]: 'Boston University'
          }});
          var user:User = await dao.read() as User
          console.log(JSON.stringify(user, null, 2));
          // Read multiple items.
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
          }});
          var users:User[] = await dao.read() as User[];
          console.log(JSON.stringify(users, null, 2));
          break;

        case 'update':
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_name]: 'Boston University',
              [UserFields.fullname]: 'Mickey M. Mouse',
              [UserFields.role]: Roles.RE_AUTH_IND
          }});
          var response = await dao.update();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'delete':
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_name]: 'The Hennemuth Foundation',
          }});
          var response = await dao.Delete();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'deactivate':
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.active]: YN.No
          }});
          var response = await dao.update();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'test':
          var dao:DAO = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com', 
              [UserFields.entity_name]: 'Boston University', 
              [UserFields.role]: Roles.RE_ADMIN, 
              [UserFields.fullname]: 'Mickey Mouse',
              [UserFields.sub]: 'mm_sub_id',
          }});
          var response = await dao.test();
          console.log(JSON.stringify(response, null, 2));
          break;
      }
      break;
    case 'entity':
      break;
    case 'invitation':
      break;
  }

}

launch().then(response => {
  console.log(JSON.stringify(response, null, 2));
})