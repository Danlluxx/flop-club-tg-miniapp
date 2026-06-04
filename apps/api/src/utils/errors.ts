export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR"
  ) {
    super(message);
  }
}

export const notFound = (entity = "Resource") => new AppError(404, `${entity} not found`, "NOT_FOUND");
