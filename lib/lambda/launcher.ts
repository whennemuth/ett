import { DAO, DAOFactory } from './dao/dao'

const launch = async () => {
  switch(process.argv[2]) {

    case 'add-user':
      var dao:DAO = DAOFactory.getInstance({
        email: 'somebody@gmail.com', 
        entity_name: 'Boston University', 
        role: 're-admin', 
        fullname: 'Mickey Mouse'
      });
      var response = await dao.create();
      console.log(JSON.stringify(response, null, 2));
      break;

    case 'read-user':
      var dao:DAO = DAOFactory.getInstance({
        email: 'somebody@gmail.com',
        entity_name: 'Boston University'
      });
      var response = await dao.read();
      console.log(JSON.stringify(response, null, 2));
      break;

    case 'query-user':
      var dao:DAO = DAOFactory.getInstance({
        email: 'somebody@gmail.com',
      });
      var response = await dao.query();
      console.log(JSON.stringify(response, null, 2));
      break;

    case 'delete-user':
      var dao:DAO = DAOFactory.getInstance({
        email: 'somebody@gmail.com'
      });
      var response = await dao._delete();
      console.log(JSON.stringify(response, null, 2));
      break;

    case 'deactivate-user':
      var dao:DAO = DAOFactory.getInstance({
        email: 'somebody@gmail.com'
      });
      var response = await dao._delete();
      console.log(JSON.stringify(response, null, 2));
      break;

    case 'test':
      var dao:DAO = DAOFactory.getInstance({
        email: 'somebody@gmail.com', 
        entity_name: 'Boston University', 
        role: 're-admin', 
        fullname: 'Mickey Mouse'
      });
      var response = dao.test();
      console.log(JSON.stringify(response, null, 2));
      break;
  }
}

launch().then(response => {
  console.log(JSON.stringify(response, null, 2));
})