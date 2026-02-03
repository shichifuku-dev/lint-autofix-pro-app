export type WorkerExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

export type RouteHandler<Env> = (request: Request, env: Env, ctx: WorkerExecutionContext) => Promise<Response> | Response;

type Route<Env> = {
  method: string;
  path: string;
  handler: RouteHandler<Env>;
};

export const createRouter = <Env>() => {
  const routes: Route<Env>[] = [];

  const add = (method: string, path: string, handler: RouteHandler<Env>) => {
    routes.push({ method: method.toUpperCase(), path, handler });
  };

  const handle = async (request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const route = routes.find((entry) => entry.method === method && entry.path === url.pathname);
    if (!route) {
      return new Response("Not Found", { status: 404 });
    }
    return route.handler(request, env, ctx);
  };

  return { add, handle };
};

export const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
