# Blind Logic Arena

Blind Logic Arena is an on-chain logic puzzle built for Zama’s FHEVM. Every wallet begins with 100 encrypted points and navigates four forks with three encrypted options each. The winning route is 1 → 3 → 2 → 2; completing it adds another 100 encrypted points. All moves, rewards, and scores stay opaque to the chain and other players because inputs are encrypted locally and processed homomorphically.

## Why it is different
- Full-path privacy: encrypted inputs, encrypted state, and private decryption via Zama relayer.
- Fair verification: the contract checks correctness without ever seeing cleartext choices.
- Simple UX: single “start” and “submit encrypted choice” loop, plus one-click decrypt for your own data.
- Clean separation: reads use viem, writes use ethers; ABI is sourced from generated deployments, not hand-written.
- Production-minded: deployment uses a Sepolia RPC via Infura and a funded private key (no mnemonics), with ready-made tasks and tests.

## How the game works
1. Connect a Sepolia wallet and call `registerAndStart()` to mint an encrypted starting score (100 pts).
2. For each fork (4 total), pick option 1, 2, or 3. The client encrypts the choice locally and sends it to `submitEncryptedChoice`.
3. The contract compares each encrypted choice to the encrypted solution. Accuracy stays encrypted the whole time.
4. After the fourth fork, if all choices were correct, an extra 100 encrypted points are added to the player’s encrypted balance and stored with access control for the player and contract.
5. Players can decrypt their own score, last reward, and choices client-side through the Zama relayer flow without exposing data on-chain.

## Problems this repo solves
- Demonstrates end-to-end confidential game logic on Ethereum without leaking player intent or balances.
- Provides a reference for mixing FHE smart contracts with a production-ready React front-end (no env vars, no local storage).
- Shows how to structure hardhat-deploy, FHEVM tasks, and wagmi/ethers integration for encrypted read/write parity.
- Supplies copy-ready ABI management (front-end ABI comes from generated deployments) to avoid contract/UI drift.

## Tech stack
- Smart contracts: Solidity 0.8.27, Hardhat + hardhat-deploy, FHEVM Solidity lib (`@fhevm/solidity`).
- Tooling: TypeChain (ethers v6), hardhat-gas-reporter, solidity-coverage, dotenv configuration.
- Tests: Hardhat network with FHEVM mock, optional Sepolia integration test.
- Front-end: React + Vite, wagmi/viem for reads, ethers for writes, RainbowKit for wallet connect, custom styling (no Tailwind), Zama relayer SDK for encryption/decryption.
- Package manager: npm.

## Repository layout
```
contracts/BlindLogicArena.sol      # Encrypted puzzle contract
deploy/deploy.ts                   # hardhat-deploy script (tag: BlindLogicArena)
tasks/BlindLogicArena.ts           # Custom CLI tasks for register/choice/status
test/BlindLogicArena.ts            # FHEVM mock unit tests
test/BlindLogicArenaSepolia.ts     # Live Sepolia flow test (requires deployment)
app/                               # React front-end (no env vars, no local storage)
deployments/sepolia/*.json         # Canonical ABI and addresses for the UI
docs/zama_llm.md, docs/zama_doc_relayer.md  # Zama FHE reference material
```

## Prerequisites
- Node.js 20+
- npm 9+
- Infura API key for Sepolia RPC
- Funded Sepolia private key for deployments (use `process.env.PRIVATE_KEY`; mnemonics are disallowed)

Create a `.env` in the repository root for Hardhat (front-end does not read env vars):
```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=0xyour_sepolia_private_key
ETHERSCAN_API_KEY=optional_key
```
The Hardhat config loads these via `dotenv`. Never commit secrets.

## Smart contract workflow
- Install and compile:
  ```bash
  npm install
  npm run compile
  ```
- Run tests (FHEVM mock):
  ```bash
  npm run test
  ```
- Key Hardhat tasks:
  ```bash
  # Print the deployed address
  npx hardhat arena:address --network sepolia
  # Register/reset a run
  npx hardhat arena:register --network sepolia
  # Submit an encrypted choice (1-3)
  npx hardhat arena:choice --network sepolia --value 1
  # Inspect and decrypt status/score
  npx hardhat arena:status --network sepolia
  ```
- Deployment (hardhat-deploy):
  ```bash
  npx hardhat deploy --network sepolia
  ```
  Uses `process.env.INFURA_API_KEY` for RPC and `process.env.PRIVATE_KEY` for signing. No mnemonic support is wired in.

## Front-end workflow (`app/`)
- The UI lives in `app/` and targets Sepolia (no localhost network, no env vars, no local storage, no Tailwind).
- ABI source: copy directly from `deployments/sepolia/BlindLogicArena.json` (keep the UI ABI in sync with deployments).
- Contract address: update `app/src/config/contracts.ts` with the latest Sepolia address.
- Reads vs writes: viem (wagmi hooks) for reads; ethers signer for writes; Zama relayer handles encryption/decryption.
- Install and run:
  ```bash
  cd app
  npm install
  npm run dev    # local UI preview, still targets Sepolia
  npm run build  # production build
  ```

## Deployment notes
- Always ensure tests pass locally before deploying to Sepolia.
- After deploying, copy the generated ABI/address from `deployments/sepolia/BlindLogicArena.json` into the front-end config.
- Etherscan verification is supported via `ETHERSCAN_API_KEY` in `.env`.
- View functions avoid `msg.sender`; they take explicit addresses so front-end reads remain deterministic.

## Future roadmap
- Leaderboard backed by encrypted scores with opt-in decryption proofs.
- Alternate puzzles (variable fork counts and reward curves) driven by contract configuration.
- Session analytics surfaced client-side with zero-knowledge proofs instead of plaintext metrics.
- Additional chains supported by Zama FHEVM as they become available.
- UI polish: animations and richer storytelling while preserving the no-env-var/no-local-storage rule set.
