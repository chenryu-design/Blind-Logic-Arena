import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

const CONTRACT_NAME = "BlindLogicArena";

task("arena:address", "Prints the BlindLogicArena address").setAction(async (_taskArgs: TaskArguments, hre) => {
  const { deployments } = hre;
  const deployment = await deployments.get(CONTRACT_NAME);
  console.log(`${CONTRACT_NAME} address: ${deployment.address}`);
});

task("arena:register", "Register the caller and (re)start the encrypted path round")
  .addOptionalParam("contract", "Optional BlindLogicArena contract address")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const deployment = taskArguments.contract
      ? { address: taskArguments.contract as string }
      : await deployments.get(CONTRACT_NAME);

    const [signer] = await ethers.getSigners();
    const arena = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const tx = await arena.connect(signer).registerAndStart();
    console.log(`Sent registerAndStart tx: ${tx.hash}`);
    await tx.wait();
    console.log("Round is ready!");
  });

task("arena:choice", "Submit an encrypted choice for the current fork")
  .addParam("value", "The fork option to use (1-3)")
  .addOptionalParam("contract", "Optional BlindLogicArena contract address")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;

    const value = parseInt(taskArguments.value as string, 10);
    if (![1, 2, 3].includes(value)) {
      throw new Error("--value must be 1, 2 or 3");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.contract
      ? { address: taskArguments.contract as string }
      : await deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const arena = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encryptedChoice = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add8(value)
      .encrypt();

    const tx = await arena
      .connect(signer)
      .submitEncryptedChoice(encryptedChoice.handles[0], encryptedChoice.inputProof);
    console.log(`submitEncryptedChoice tx: ${tx.hash}`);
    await tx.wait();
    console.log("Encrypted choice accepted.");
  });

task("arena:status", "Inspect the caller state in BlindLogicArena")
  .addOptionalParam("player", "Optional player address to inspect")
  .addOptionalParam("contract", "Optional BlindLogicArena contract address")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    const [signer] = await ethers.getSigners();
    const playerAddress = (taskArguments.player as string | undefined) ?? signer.address;

    const deployment = taskArguments.contract
      ? { address: taskArguments.contract as string }
      : await deployments.get(CONTRACT_NAME);
    const arena = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const status = await arena.getPlayerStatus(playerAddress);
    console.log(`Player:        ${playerAddress}`);
    console.log(`Registered:    ${status[2]}`);
    console.log(`Current stage: ${status[0]} (4 required)`);
    console.log(`Runs cleared:  ${status[1]}`);
    console.log(`Round finished:${status[3]}`);

    await fhevm.initializeCLIApi();

    const encryptedScore = await arena.getEncryptedScore(playerAddress);
    if (encryptedScore !== ethers.ZeroHash) {
      const clearScore = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encryptedScore,
        deployment.address,
        signer,
      );
      console.log(`Encrypted score: ${encryptedScore}`);
      console.log(`Clear score    : ${clearScore}`);
    } else {
      console.log("Player does not have an encrypted score yet.");
    }

    const encryptedReward = await arena.getEncryptedLastReward(playerAddress);
    if (encryptedReward !== ethers.ZeroHash) {
      const clearReward = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encryptedReward,
        deployment.address,
        signer,
      );
      console.log(`Last reward (clear): ${clearReward}`);
    }
  });
