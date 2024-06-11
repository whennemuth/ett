# Testing/Debugging

This project uses [jest](https://jestjs.io/) for unit testing.
An attempt is made to follow test-driven development.

### Run all Jest unit tests

```
npm test
```

### ESM support for unit tests

In order to allow jest to test against [ECMAScript Modules](https://nodejs.org/api/esm.html#modules-ecmascript-modules), it is necessary to activate its experimental support for ESM.
The following [jest documentation](https://jestjs.io/docs/ecmascript-modules) was followed in order to do this, but a few things are worth pointing out that were encountered while getting this to work:

- Do NOT explicitly mark the nodejs project as using modules by putting `"type": "module"` into the package.json file.

- One could activate the ESM support by exporting the necessary environment variable:

  ```
  export NODE_OPTIONS=--experimental-vm-modules
  ```

  However, to achieve the same effect automatically, use the [cross-env](https://www.npmjs.com/package/cross-env) package to allow setting the environment variable automatically as part of the script execution. Note the cross-env usage in the following package.json excerpt:

  ```
    "scripts": {
      "build": "tsc",
      "watch": "tsc -w",
      "test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest",
      "cdk": "cdk"
    },
  ```

- Lastly, you can activate ESM directly from a launch configuration. This example also targets a specific test file:

  ```
  {
    "version": "0.2.0",
    "configurations": [
      {
        "type": "node",
        "request": "launch",
        "name": "Test RE-Admin",
        "program": "${workspaceFolder}/node_modules/jest/bin/jest.js",
        "args": [ 
          "--runTestsByPath", 
          "-i", 
          "${workspaceFolder}/lib/lambda/re-admin/test/ReAdminDAO.test.mjs" 
        ],
        "runtimeArgs": [ "--experimental-vm-modules" ],
        "console": "integratedTerminal",
        "internalConsoleOptions": "neverOpen"
      },
    ]
  }
  ```
  
  With this launch configuration, you can place a breakpoint inside your tests, or the file under test and step through the code.
  *NOTE: If on windows, the `--runTestsByPath` jest argument is necessary*

### Mocking for unit tests:

Part of testing includes mocking for lambda functions. In particular, it is helpful in typescript to have the [event object](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-concepts.html#gettingstarted-concepts-event) mocked.
The AWS article ["Using types for the event object"](https://docs.aws.amazon.com/lambda/latest/dg/typescript-handler.html#event-types) explains how to do this, but here are the relevant steps:

1. [Install the SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

2. install [quicktype](https://quicktype.io/typescript):

   ```
   npm install -g quicktype
   ```

3. Create a sample event:

   ```
   cd lib/lambda/lib
   sam local generate-event cloudfront simple-remote-call > sp-event.json
   ```

4. Extract a type from the sample event:

   ```
   quicktype sp-event.json -o SimpleRemoteCall.ts
   ```

5. For any lambda entry-point file that expects to process such an event, you can now type the event object passed to the handler:

   ```
   import { SimpleRemoteCall, Request as BasicRequest } from './lib/SimpleRemoteCall';
   ...
   export const handler =  async (event:SimpleRemoteCall) => {
   ```

### Gotchas:

Use of the [aws-sdk-client-mock](https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/) mocking library will typically fail if your modules/functions under test are in a subdirectory for a nodejs code that is part of a lambda function, and therefore has its own node_modules directory within:

```
root
|__ lib
    |__ lambda-root
        |__ file_under_test.mjs (has import { something } from '@aws-sdk/client-dynamodb')
        |__ node_modules
            |__ @aws-sdk
                |__ client-dynamodb
    test
    |__ file_under_test.test.mjs (has import { something } from '@aws-sdk/client-dynamodb')
    |__ node_modules
        |__ @aws-sdk
            |__ client-dynamodb
```

Here you can see there are two dynamodb target libraries. The mocking library fails to mock the aws dynamodb module because it targets the wrong one *(probably `root/test/node_modules/@aws-sdk/client-dynamodb`)*
To avoid this, the tests need to be in the same nodejs root as the files under test:

```
root
|__ lib
    |__ lambda-root
        |__ file_under_test.mjs
        |__ test
            |__ file_under_test.test.mjs
        |__ node_modules
            |__ @aws-sdk
                |__ client-dynamodb

```

