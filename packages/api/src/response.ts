import type { APIGatewayProxyResultV2 } from "aws-lambda";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(
  statusCode: number,
  message: string,
  details?: unknown,
): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, {
    error: message,
    ...(details ? { details } : {}),
  });
}
