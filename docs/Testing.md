# Testing/Debugging

This project uses [jest](https://jestjs.io/) for unit testing.
An attempt is made to follow test-driven development.

### ESM support

In order to allow jest to test against ECMAScript Modules, it is necessary to activate its experimental support for ESM.
The following [jest documentation](https://jestjs.io/docs/ecmascript-modules) was followed in order to do this, but a few things are worth pointing out that were encountered while getting this to work:

- Do NOT explicitly mark the nodejs project as using modules by putting `"type": "module"` into the package.json file.

- Make sure that files under test and the test files themselves have the `.mjs` extension.

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
        "internalConsoleOptions": "neverOpen",
        "env": { "DYNAMODB_USER_TABLE_NAME": "ett-users" }
      },
    ]
  }
  ```
  
  With this launch configuration, you can place a breakpoint inside your tests, or the file under test and step through the code.
  *NOTE: If on windows, the `--runTestsByPath` jest argument is necessary*

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

