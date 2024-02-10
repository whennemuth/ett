import { DAOUser, DAOFactory } from './dao'
import { Roles, User, YN, UserFields } from './entity';
import { v4 as uuidv4 } from 'uuid';

const launch = async () => {

  const daoType = process.argv[2] as ('user'|'entity'|'invitation');
  const crudOp = process.argv[3] as ('create'|'read'|'update'|'delete'|'deactivate'|'test');
  const entity_id1 = uuidv4();
  const entity_id2 = uuidv4();

  switch(daoType) {
    case 'user':
      switch(crudOp) {
        case 'create':
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'sysadmin@bu.edu', 
              [UserFields.entity_id]: entity_id1, 
              [UserFields.role]: Roles.SYS_ADMIN, 
              [UserFields.fullname]: 'System administrator',
              [UserFields.sub]: 'gkp_sub_id',
          }}) as DAOUser;
          var response = await dao.create();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'read':
          // Read one item.
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_id]: entity_id1
          }}) as DAOUser;
          var user:User = await dao.read() as User
          console.log(JSON.stringify(user, null, 2));
          // Read multiple items.
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
          }}) as DAOUser;
          var users:User[] = await dao.read() as User[];
          console.log(JSON.stringify(users, null, 2));
          break;

        case 'update':
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_id]: entity_id1,
              [UserFields.fullname]: 'Mickey M. Mouse',
              [UserFields.role]: Roles.RE_AUTH_IND
          }}) as DAOUser;
          var response = await dao.update();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'delete':
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_id]: entity_id2,
          }}) as DAOUser;
          var response = await dao.Delete();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'deactivate':
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.active]: YN.No
          }}) as DAOUser;
          var response = await dao.update();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'test':
          var dao = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com', 
              [UserFields.entity_id]: entity_id1, 
              [UserFields.role]: Roles.RE_ADMIN, 
              [UserFields.fullname]: 'Mickey Mouse',
              [UserFields.sub]: 'mm_sub_id',
          }}) as DAOUser;
          var response = await dao.test();
          console.log(JSON.stringify(response, null, 2));
          break;
      }
      break;
    case 'invitation':
      // RESUME NEXT 2: Create an invitation, and update one.
      break;
    case 'entity':
      break;
  }

}

launch().then(response => {
  console.log(JSON.stringify(response, null, 2));
})