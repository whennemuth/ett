
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const dbclient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async(event) => {

  console.log(JSON.stringify(event, null, 2));

  const { task, email, re, role, fullname } = event.headers.ApiParameters;

  const dir = Directory(email);

  const dao = DAO({ email, re, role, fullname });

  switch(task) {
    case 'invite-user':

      break;
    case 'bulk-invite-user':
      break;
  }

  const user = User(dao);
}

export function User(directory, dao) {

}

export function DAO(user) {

  const { email, re, role, fullname } = user;

  const create = async() => {
    const params = JSON.stringify({
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Item: { 
        email: { S: email }, 
        re: { S: re }, 
        fullname: { S: fullname },
        role: { S: role }, 
      }
    }, null, 2);

    const command = new PutItemCommand(params)
    let response;
    try {
      // RESUME NEXT: Getting ExpiredTokenError if running in mocked context. Fix it.
      response = await dbclient.send(command);
    }
    catch(e) {
      console.error(e);
    }          
    return response;
  }

  const read = () => {

  }

  const update = () => {

  }

  const _delete = () => {

  }

  return {
    create, read, update, _delete
  }
}

export function Directory(email) {

  const sendInvitationToSignUp = () => {
    console.log(`Sending userpool email invitation for ${email}`);
  }

  return {
    sendInvitationToSignUp
  }
}