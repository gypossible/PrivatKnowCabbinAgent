import { NextResponse } from "next/server";

type AsyncRouteHandler<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Promise<Response>;

export function withRouteErrorHandling<TArgs extends unknown[]>(
  handler: AsyncRouteHandler<TArgs>,
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      console.error(error);

      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Internal server error",
        },
        { status: 500 },
      );
    }
  };
}
