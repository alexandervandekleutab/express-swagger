import express, { Express, Request, Response } from "express";
import Ajv from "ajv";

/** Sample types */

type EditTodoParams = {
  id: string;
};

type EditTodoReqBody = {
  message: string;
  completed?: boolean;
};

type EditTodoResBody = {
  id: string;
  message: string;
  completed: boolean;
};

/** Sample controller */

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

const validationError = (name: string, params: any, schema: any) =>
  `Could not validate ${name} ${JSON.stringify(
    params,
    undefined,
    2
  )} against schema ${JSON.stringify(schema, undefined, 2)}`;

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
) {
  const wrappedController = (req: Request, res: Response) => {
    console.log("req", req);

    const ajv = new Ajv();

    const paramsSchema = schemas.paramsSchema
      ? require(`./schemas/${schemas.paramsSchema}.json`)
      : {};
    const validateParams = ajv.compile<Params>(paramsSchema);

    if (!validateParams(req.params)) {
      throw validationError("request", req.params, paramsSchema);
    }

    const reqBodySchema = schemas.reqBodySchema
      ? require(`./schemas/${schemas.reqBodySchema}.json`)
      : {};
    const validateReqBody = ajv.compile<ReqBody>(reqBodySchema);

    if (!validateReqBody(req.body)) {
      throw validationError("body", req.body, reqBodySchema);
    }

    const reqQuerySchema = schemas.reqQuerySchema
      ? require(`./schemas/${schemas.reqQuerySchema}.json`)
      : {};
    const validateReqQuery = ajv.compile<ReqQuery>(reqQuerySchema);

    if (!validateReqQuery(req.query)) {
      throw validationError("query", req.query, reqQuerySchema);
    }

    const resBody = controller(req.params, req.body, req.query);

    const resBodySchema = schemas.resBodySchema
      ? require(`./schemas/${schemas.resBodySchema}.json`)
      : {};
    const validateResBody = ajv.compile<ResBody>(resBodySchema);

    if (!validateResBody(resBody)) {
      throw validationError("response body", resBody, resBodySchema);
    }

    res.status(200).json(resBody);
  };

  app.put(route, wrappedController);
}

const app = express();
app.use(express.json());

/** We get type inference on the generic here
 * Or we can include it to ensure that the type
 * signature matches the strings used for schemas.
 */
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

app.listen(8001, () => console.log("Listening on port 8001"));
