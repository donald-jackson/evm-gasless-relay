import { describe, it, expect } from "vitest";
import { handler } from "../handlers/chains.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /chains",
    rawPath: "/chains",
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "test",
      domainPrefix: "test",
      http: {
        method: "GET",
        path: "/chains",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "GET /chains",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe("GET /chains", () => {
  it("returns 200 with chains array", async () => {
    const result = await handler(makeEvent(), {} as never, () => {});

    expect(result).toBeDefined();
    const response = result as { statusCode: number; body: string; headers: Record<string, string> };
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.chains).toBeInstanceOf(Array);
    expect(body.chains.length).toBeGreaterThanOrEqual(9);
  });

  it("includes CORS headers", async () => {
    const result = await handler(makeEvent(), {} as never, () => {});
    const response = result as { headers: Record<string, string> };
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("each chain has required fields", async () => {
    const result = await handler(makeEvent(), {} as never, () => {});
    const response = result as { body: string };
    const body = JSON.parse(response.body);

    for (const chain of body.chains) {
      expect(chain).toHaveProperty("chainId");
      expect(chain).toHaveProperty("name");
      expect(chain).toHaveProperty("nativeToken");
      expect(chain).toHaveProperty("tokens");
      expect(chain.tokens.length).toBeGreaterThan(0);
    }
  });

  it("Sepolia has relay contract address", async () => {
    const result = await handler(makeEvent(), {} as never, () => {});
    const response = result as { body: string };
    const body = JSON.parse(response.body);
    const sepolia = body.chains.find((c: { chainId: number }) => c.chainId === 11155111);
    expect(sepolia).toBeDefined();
    expect(sepolia.relayContract).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
