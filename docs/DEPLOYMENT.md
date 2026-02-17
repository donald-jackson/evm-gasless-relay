# Deployment

> **Disclaimer:** This service is provided as-is, without warranty of any kind. Use at your own risk. The authors accept no liability for lost funds, failed transactions, or any other damages arising from use of this software or its deployed infrastructure.

## Live API

Base URL:

```
https://7uz3zfgmc1.execute-api.us-east-1.amazonaws.com
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/chains` | List supported chains, tokens, and contract addresses |
| `POST` | `/relay/quote` | Get a fee quote for a relay transaction |
| `POST` | `/relay/submit` | Submit a signed EIP-2612 permit to relay a transfer |
| `GET` | `/relay/status/{requestId}` | Poll for relay request status |
| `GET` | `/health` | Service health check |

See [API.md](API.md) for full request/response documentation.

## Contract Addresses

The `StablecoinRelay` contract is deployed at the same address on all chains:

```
0xc0F92D26bBeBC242F14c1d984dBB51270c674ECe
```

| Chain | Chain ID | Status |
|-------|----------|--------|
| Ethereum | 1 | Live |
| Base | 8453 | Live |
| Sepolia | 11155111 | Live |
| Base Sepolia | 84532 | Live |

Other mainnet deployments are pending.

## Deploying the Contract

```bash
cd contracts
DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol:DeployScript \
  --rpc-url <RPC_URL> --broadcast -vvv
```

After deployment, update the address in `packages/shared/src/addresses.ts`.
