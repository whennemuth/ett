# ETT (Ethical Transparency Tool)

This repository comprises a cloud-based implementation of the [Ethical Transparency Tool for The Societies Consortium on Sexual Harassment in STEMM](https://societiesconsortium.com/ett/) as described in the [Overview Briefing Packet](https://societiesconsortium.com/wp-content/uploads/2022/12/Ethical-Transparency-Tool-Briefing-Packet-Without-Forms.pdf). This implementation is designed for hosting on [AWS](https://aws.amazon.com/) and built completely around [AWS serverless technologies](https://aws.amazon.com/serverless/).

### Topology

This diagram depicts the basic arrangement of services and the sequencing a request made by a single page app client makes in order to access backend services (database, emailing, events, etc.)

![./topology.png](./docs/topology.png)

### Setup - Prerequisites

- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS CLI](https://aws.amazon.com/cli/)
- [Node & NPM](https://nodejs.org/en/download)
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [Visual Studio Code](https://code.visualstudio.com/download)
- Admin role for target account *(ie: Shibboleth-InfraMgt/yourself@bu.edu, for the BU CSS account)*

### Setup - Steps

Build the entire application and AWS infrastructure from scratch.

1. Clone this repository
  
1. Modify the `./context/context.json` file.
   You will probably only adjust 2 or 3 of the attributes in this file - a breakdown of all attributes are [**here**](./docs/Context.md)

3. Obtain [security credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html?icmpid=docs_homepage_genref) for the admin-level [IAM role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) you will be using for accessing the aws account to lookup and/or deploy resources.
   Create a [named profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-using-profiles) out of these credentials in your [`~/.aws/credentials`](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-where) file.

4. Install all dependencies:

   ```
   for line in $(find . -maxdepth 4 -name package.json -print | grep -v '/node_modules/') ; do (cd $(dirname $line) && npm install); done \;
   ```

5. *Bootstrapping* is the process of provisioning resources for the AWS CDK before you can deploy AWS CDK apps into an AWS [environment](https://docs.aws.amazon.com/cdk/v2/guide/environments.html). *(An AWS environment is a combination of an AWS account and Region).* You only need to bootstrap once for your chosen region within your account. The presence of a `"CDKToolKit"` cloud-formation stack for that region will indicate bootstrapping has already occurred. To bootstrap, follow [these steps](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-howto). The simple bootstrapping command is:

   ```
   export AWS_PROFILE=my_named_profile
   cdk bootstrap aws://[aws account ID]/us-east-1
   ```

6. [OPTIONAL] Run the [CDK synth command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-synth) command to generate the cloudformation template that will be used to create the stack:

   ```
   mkdir ./cdk.out 2> /dev/null
   cdk synth &> cdk.out/ett.template.yaml
   ```

   *NOTE: The synth command will create a .json file, but will also output yaml to stdout. The command above redirects that output to a yaml file alongside the json file.*

7. [OPTIONAL] Debug synthesis with breakpoints:
   If developing in vscode, add the following debug configuration to the `${workspaceFolder}/.vscode/launch.json` file if it does not already exist:

   ```
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "node",
         "request": "launch",
         "name": "CDK Debugger (App)",
         "skipFiles": ["<node_internals>/**"],
         "runtimeArgs": ["-r", "./ett-auth/node_modules/ts-node/register/transpile-only"],
         "args": ["${workspaceFolder}/ett-auth/bin/ett.ts"]
       }
     ]
   }
   ```

   Place a breakpoint at the desired location and run the launch configuration.

8. Enable API Gateway Logging for the account. Follow [these directions](./docs/EnableApiGatewayLogging.md)

9. Run the [CDK deploy command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-deploy) to create the stack:

   ```
   npm run deploy
   ```

   or to completely tear down and replace a stack without prompts use:

   ```
   npm run redeploy
   ```

   

