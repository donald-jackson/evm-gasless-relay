import { describe, it, expect } from "vitest";
import { handler } from "../handlers/quote.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /relay/quote",
    rawPath: "/relay/quote",
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "test",
      domainPrefix: "test",
      http: {
        method: "POST",
        path: "/relay/quote",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "POST /relay/quote",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe("POST /relay/quote", () => {
  it("returns 200 with valid request", async () => {
    const result = await handler(
      makeEvent({
        chainId: 11155111,
        token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        amount: "1000000",
        sender: "0x1234567890123456789012345678901234567890",
        recipient: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      }),
      {} as never,
      () => {},
    );

    const response = result as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.chainId).toBe(11155111);
    expect(body.fee).toBeDefined();
    expect(body.totalRequired).toBeDefined();
    expect(body.expiresAt).toBeDefined();
    expect(BigInt(body.totalRequired)).toBe(BigInt(body.fee) + 1000000n);
  });

  it("rejects unsupported chainId", async () => {
    const result = await handler(
      makeEvent({
        chainId: 99999,
        token: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        amount: "1000000",
        sender: "0x1234567890123456789012345678901234567890",
        recipient: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      }),
      {} as never,
      () => {},
    );

    const response = result as { statusCode: number };
    expect(response.statusCode).toBe(400);
  });

  it("rejects invalid token address", async () => {
    const result = await handler(
      makeEvent({
        chainId: 11155111,
        token: "not-an-address",
        amount: "1000000",
        sender: "0x1234567890123456789012345678901234567890",
        recipient: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      }),
      {} as never,
      () => {},
    );

    const response = result as { statusCode: number };
    expect(response.statusCode).toBe(400);
  });

  it("rejects unsupported token on chain", async () => {
    const result = await handler(
      makeEvent({
        chainId: 11155111,
        token: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT on Ethereum, not Sepolia
        amount: "1000000",
        sender: "0x1234567890123456789012345678901234567890",
        recipient: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      }),
      {} as never,
      () => {},
    );

    const response = result as { statusCode: number };
    expect(response.statusCode).toBe(400);
  });
});
