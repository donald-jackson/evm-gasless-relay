# Stablecoin Relay API

Base URL: `https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com`

## Endpoints

### GET /chains

Returns supported chains with token lists and contract addresses.

```bash
curl https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com/chains
```

Response:
```json
{
  "chains": [
    {
      "chainId": 1,
      "name": "Ethereum",
      "nativeToken": "ETH",
      "blockExplorer": "https://etherscan.io",
      "relayContract": "0x...",
      "permit2": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      "tokens": [
        {
          "symbol": "USDC",
          "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "decimals": 6,
          "hasNativePermit": true
        }
      ]
    }
  ]
}
```

---

### POST /relay/quote

Get a fee quote for a relay transaction.

```bash
curl -X POST https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com/relay/quote \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 11155111,
    "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "amount": "1000000",
    "sender": "0xYourAddress",
    "recipient": "0xRecipientAddress"
  }'
```

Response:
```json
{
  "chainId": 11155111,
  "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "fee": "16875000",
  "totalRequired": "17875000",
  "gasEstimate": "150000",
  "gasPriceGwei": "30",
  "nativeTokenPriceUsd": "3000.00",
  "expiresAt": "2026-02-17T12:00:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `fee` | Relay fee in token units (6 decimals for USDC) |
| `totalRequired` | `amount + fee` — total tokens the sender must approve via permit |
| `expiresAt` | Quote validity (5 minutes) |

---

### POST /relay/submit

Submit a signed EIP-2612 permit to relay a stablecoin transfer.

```bash
curl -X POST https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com/relay/submit \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 11155111,
    "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "from": "0xSenderAddress",
    "to": "0xRecipientAddress",
    "amount": "1000000",
    "fee": "16875000",
    "deadline": 1739800000,
    "v": 28,
    "r": "0xabc...64hex",
    "s": "0xdef...64hex"
  }'
```

Response:
```json
{
  "requestId": "req_a1b2c3d4e5f6",
  "status": "queued",
  "estimatedWaitSeconds": 15
}
```

**Permit signature**: The sender signs an EIP-2612 permit allowing the relay contract to spend `amount + fee` tokens. The `spender` in the permit must be the relay contract address for the target chain.

**Validation rules**:
- `chainId` must be a supported chain
- `token` must be a supported token on the chain
- `amount` must be between 0.10 USDC and 100,000 USDC
- `deadline` must be in the future
- `v`, `r`, `s` must be valid signature components

---

### GET /relay/status/{requestId}

Poll for the status of a relay request.

```bash
curl https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com/relay/status/req_a1b2c3d4e5f6
```

Response:
```json
{
  "requestId": "req_a1b2c3d4e5f6",
  "status": "confirmed",
  "chainId": 11155111,
  "txHash": "0x123...abc",
  "fee": "16875000",
  "createdAt": "2026-02-17T10:00:00.000Z",
  "updatedAt": "2026-02-17T10:00:30.000Z",
  "confirmedAt": "2026-02-17T10:00:30.000Z",
  "error": null
}
```

**Status values**:
| Status | Description |
|--------|-------------|
| `queued` | Request received, waiting to be processed |
| `pending` | Worker acquired a relayer wallet |
| `submitted` | Transaction submitted to chain |
| `confirmed` | Transaction confirmed on-chain |
| `failed` | Transaction failed (see `error` field) |

---

### GET /health

Service health check with wallet pool and queue status.

```bash
curl https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-17T10:00:00.000Z",
  "walletPool": {
    "1": { "available": 5, "busy": 0, "cooldown": 0 },
    "137": { "available": 5, "busy": 0, "cooldown": 0 }
  },
  "queue": {
    "depth": 0
  }
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Description of the error",
  "details": {}
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Invalid request (validation error) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Rate Limits

- Default: 100 requests/second, burst 50
- `POST /relay/submit`: 20 requests/second, burst 10
- Exceeding limits returns HTTP 429

## Supported Chains

| Chain | ID | USDC | USDT |
|-------|----|------|------|
| Ethereum | 1 | Yes | Yes (Permit2) |
| Polygon | 137 | Yes | Yes (Permit2) |
| Arbitrum | 42161 | Yes | Yes (Permit2) |
| Optimism | 10 | Yes | Yes (Permit2) |
| Base | 8453 | Yes | — |
| BSC | 56 | Yes (Permit2) | Yes (Permit2) |
| Avalanche | 43114 | Yes | Yes (Permit2) |
| Linea | 59144 | Yes | — |
| Scroll | 534352 | Yes | — |
| Sepolia | 11155111 | Yes | — |
