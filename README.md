### Auto-document express API with swagger
The goal of this project is to write a simple library for express that lets you:
- Document the expected data from incoming `Request`s and expected data in outgoing `Response`s
- Use typescript's type system to allow static type checking while writing (and at compile time)
- Use `Ajv` to do validation on incoming data and outgoing data
- Use Swagger to document the routes on express automatically as you define them
- Use JSON schemas as a common source of truth for both `Ajv` and Swagger to ensure that data is validated and thus always matches the API spec

### Setup and running

1. `yarn install`
2. `yarn start`

In postman, point to `localhost:8001/todo/1` and make a `PUT` request. Set the `Content-type` header to `application/json` and write a raw body:
```json
{
    "message": "todo"
}
```
It should respond with
```json
{
    "id": "1",
    "message": "todo",
    "completed": true
}
```

### How it works (or how it should work eventually)
- For HTTP requests with express, we care about data mostly from these places:
  - `req.params`: Path parameters like `id` in `/todo/:id` 
  - `req.query`: Query parameters like `name` in `/todo/:id?name=Alice` 
  - `req.body`: Body parameters like `{"foo": "bar"}`
  - `res`: The response object, and specifically its body when we do `res.json(<someObject>)`
- For each of these four pieces of data, we can optionally define types. For example:
```ts
// type for req.params
type EditTodoParams = {
  id: string;
};

// type for req.body
type EditTodoReqBody = {
  message: string;
  completed?: boolean;
};

// type for response
type EditTodoResBody = {
  id: string;
  message: string;
  completed: boolean;
};
```
(These types should be compatible with the types specified from `Express.Request` but I don't currently understand how to do a type declaration that is a subset of another type)
- We take these types and convert each of them into a JSON schema, like this:
```json
// EditTodoParams.json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" }
  },
  "required": ["id"]
}
```
```json
// EditTodoReqBody.json
{
  "type": "object",
  "properties": {
    "message": { "type": "string" },
    "completed?": { "type": "boolean", "nullable": true }
  },
  "required": ["message"]
}
```
```json
// EditTodoResBody.json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "message": { "type": "string" },
    "completed": { "type": "boolean" }
  },
  "required": ["id", "message", "completed"]
}
```
- Tools exist that can parse typescript type definitions and turn them into JSON schemas, but that is yet to be completed. For now they are just written manually.
- These JSON schemas are used by Ajv to (optionally) validate the data in the request, and, combined with the actual type definitions, allow for type narrowing upon validation thus allowing us to write type-safe code.

- Here is a breakdown of the current implementation:
```ts
function put<Params, ReqBody, ResBody, ReqQuery>(
  app: Express,
  route: string,
  schemas: {
    paramsSchema?: string;
    reqBodySchema?: string;
    resBodySchema?: string;
    reqQuerySchema?: string;
  },
  controller: (params: Params, reqBody: ReqBody, reqQuery: ReqQuery) => ResBody
)
```
- (This is for the `put` method but I think we can abstract this away since all express methods should have the same `req` and `res` parameters)
- The generic types `Params, ReqBody, ResBody, ReqQuery` correspond to the generic types from an Express request (including `undefined`).
  - I think I have to change this and just replace them with the same types that Express uses...
- Parameters:
  - `app`: the express app
  - `route`: the route you would normally use in express with possible parameters.
  - `schemas`: a dict object which should just contain the string versions of the types. See example below.
  - `controller`: this is a standardized format that all controller functions need to be implemented in. It includes as parameters all of the possible sources of information from an express request. It should return the actual body that will be used in the express response.
- Example:
```ts
function editTodo(
  params: EditTodoParams,
  reqBody: EditTodoReqBody,
  reqQuery: any
): EditTodoResBody {
  return {
    id: params.id,
    message: reqBody.message,
    completed: !reqBody.completed,
  };
}

put<EditTodoParams, EditTodoReqBody, EditTodoResBody, undefined>(
  app,
  "/todo/:id",
  {
    paramsSchema: "EditTodoParams", // references schemas.json/EditTodoParams
    reqBodySchema: "EditTodoReqBody", // references schemas.json/EditTodoReqBody
    resBodySchema: "EditTodoResBody", // references schemas.json/EditTodoResBody
    reqQuerySchema: undefined, // none for this route are expected
  },
  editTodo
);
```
- As you can see, the type names used with generics must match the strings passed in for the schemas. This is required since typescript does not have runtime typechecking. It is only a transpiler. We therefore need to supply the type names as strings, which are then used to grab the corresponding JSON schema for those types.
- If you check `index.ts` and remove the generics you will see that we get type inference from the definition of `editTodo`.

- Inside the `put` method (to be generalized later to other http methods) we use `Ajv` to load json schemas for the provided types, and then validate the incoming request parameters, query parameters, and body. If all of the data validates, then we can pass it to our controller. Since `Ajv` provides type narrowing on validation, we can safely call the controller and know that the types are correct. Since the json schemas used are derived from the types themselves, incorrect data will not be accepted and can return a 400 status code.
```ts
const paramsSchema = schemas.paramsSchema
      ? require(`./schemas/${schemas.paramsSchema}.json`)
      : {};
const validateParams = ajv.compile<Params>(paramsSchema);

if (!validateParams(req.params)) {
  throw validationError("request", req.params, paramsSchema);
}
// req.params consistent with type Params here
//...
// this call can be done safely since `req.params` has the correct type Params for controller argument
const resBody = controller(req.params, req.body, req.query);
```
- One we get the response from the controller, we can use Ajv to validate it again (though with type checking there should never be any disagreement, but layers of safety can never hurt since a controller could lie about the returned data).

**TODO:**
- Find tool that can take typescript types and make `schemas/<type>.json` JSON schemas for each
  - I know this exists but may take some configuration
- use JSON schemas and route information to make swagger documentation
- add "description" lines etc that let you add descriptions to the api
- eventually work on autodoc status codes? that may be less automatic though
- respond with status code 400 if bad data rather than throw error