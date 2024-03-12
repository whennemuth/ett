import { DAOUser, DAOFactory, DAOInvitation } from './dao'
import { ENTITY_WAITING_ROOM } from './dao-entity';
import { Roles, User, YN, UserFields, InvitationFields } from './entity';
import { v4 as uuidv4 } from 'uuid';

const launch = async () => {

  const daoType = process.argv[2] as ('user'|'entity'|'invitation');
  const crudOp = process.argv[3] as ('create'|'read'|'update'|'migrate'|'delete'|'deactivate'|'test');

  switch(daoType) {
    case 'user':
      switch(crudOp) {
        case 'create':
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'sysadmin@bu.edu', 
              [UserFields.entity_id]: uuidv4(), 
              [UserFields.role]: Roles.SYS_ADMIN, 
              [UserFields.fullname]: 'System administrator',
              [UserFields.sub]: 'gkp_sub_id',
          }}) as DAOUser;
          var response = await daoUser.create();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'read':
          // Read one item.
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_id]: 'some_entity_id'
          }}) as DAOUser;
          var user:User = await daoUser.read() as User
          console.log(JSON.stringify(user, null, 2));
          // Read multiple items.
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
          }}) as DAOUser;
          var users:User[] = await daoUser.read() as User[];
          console.log(JSON.stringify(users, null, 2));
          break;

        case 'update':
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_id]: 'some_entity_id',
              [UserFields.fullname]: 'Mickey M. Mouse',
              [UserFields.role]: Roles.RE_AUTH_IND
          }}) as DAOUser;
          var response = await daoUser.update();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'migrate':
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'warhen@comcast.net',
              [UserFields.entity_id]: '0952e4a9-060e-4d43-8a7d-7d90f6e04be4',
          }}) as DAOUser;
          var response = await daoUser.migrate(ENTITY_WAITING_ROOM);
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'delete':
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.entity_id]: 'some_entity_id',
          }}) as DAOUser;
          var response = await daoUser.Delete();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'deactivate':
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com',
              [UserFields.active]: YN.No
          }}) as DAOUser;
          var response = await daoUser.update();
          console.log(JSON.stringify(response, null, 2));
          break;

        case 'test':
          var daoUser = DAOFactory.getInstance({
            DAOType: 'user', Payload: {
              [UserFields.email]: 'somebody@gmail.com', 
              [UserFields.entity_id]: 'some_entity_id', 
              [UserFields.role]: Roles.RE_ADMIN, 
              [UserFields.fullname]: 'Mickey Mouse',
              [UserFields.sub]: 'mm_sub_id',
          }}) as DAOUser;
          var response = await daoUser.test();
          console.log(JSON.stringify(response, null, 2));
          break;
      }
      break;
    case 'invitation':
      switch(crudOp) {
        case 'create':
          var daoInv = DAOFactory.getInstance({
            DAOType: 'invitation', Payload: {
              [InvitationFields.code]: 'dummy_invitation_code',
              [InvitationFields.email]: 'dummy_invitation_code',
              [InvitationFields.role]: Roles.SYS_ADMIN,
              [InvitationFields.message_id]: 'dummy_message_id',
              [InvitationFields.sent_timestamp]: new Date().toISOString()
            }
          }) as DAOInvitation;
          var response = await daoInv.create();
          break;
      }
      break;
    case 'entity':
      break;
  }

}

launch().then(response => {
  console.log(JSON.stringify(response, null, 2));
})