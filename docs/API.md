## API Documentation

The ETT application follows the convention of a single-page solution that loads most of its dynamic content through api calls to the "backend" to retrieve JSON payloads.

Front-end developers can reference this document for api definitions available to them.

These definitions fall into one of two initial categories:

1. [**Pre-Registration**](./API-pre-registration.md)
   These api endpoints are used during the registration process where the user has not yet established a cognito userpool presence for themselves, and hence will not yet be involving use of a JWT for authentication.
   Most pre-registration endpoints include an "invitation-code" path element, and authentication involves an otherwise public api call that is backed by a lambda function that checks the invitation code for a match in the applications dynamodb database before proceeding with its intended workload.
   
2. [**Post-Registration**](./API-post-registration.md)
   These api endpoints are used for all activity taking place for a user that has logged in through cognito and acquired a JWT (JSON web token). Authentication is implemented through the signed portion of the JWT, and further authorization can be implemented by the backing lambda functions when they unpack the claims found when inspecting the JWT found in the request cookie header.
   Post registration api endpoints further subdivide into 4 categories, each designated by the role of the currently authenticated user:
   - System administrator *(SYS_ADMIN)*
   - Registered entity administrator *(RE_ADMIN)*
   - Registered entity authorized individual *(AUTH_IND)*
   - Consenting Individual *(CONSENTING_INDIVIDUAL)*
   
   [REST Api](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-rest-api.html) is chosen over [Http Api](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html) for its [support of integration with a web application firewall *(WAF)*](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html).
   
   REST Apis do not have direct support for JWT authorizers as do Http Apis, but you can [control access to a REST API using Amazon Cognito user pools as authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html), which can be based on JWTs *([SEE: Using tokens with User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html))*.
   
   The ETT application uses cognito to implement token based authentication for the internet as detailed in the following blog:  [OAUTH 2 with PKCE in single page apps](https://www.valentinog.com/blog/oauth2/)

