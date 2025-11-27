import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm, deployments } from "hardhat";
import { BlindLogicArena } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("BlindLogicArenaSepolia", function () {
  let signer: HardhatEthersSigner;
  let arena: BlindLogicArena;
  let arenaAddress: string;

  function logStep(message: string) {
    console.log(message);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This test suite must run on Sepolia");
      this.skip();
    }

    try {
      const deployment = await deployments.get("BlindLogicArena");
      arenaAddress = deployment.address;
      arena = (await ethers.getContractAt(CONTRACT_NAME, deployment.address)) as BlindLogicArena;
    } catch (error) {
      (error as Error).message += ". Deploy BlindLogicArena before running this test.";
      throw error;
    }

    const [wallet] = await ethers.getSigners();
    signer = wallet;
  });

  it("plays an entire winning route", async function () {
    this.timeout(4 * 60000);

    logStep("Calling registerAndStart");
    let tx = await arena.connect(signer).registerAndStart();
    await tx.wait();

    logStep("Decrypting starting score");
    await fhevm.initializeCLIApi();
    const initialEncryptedScore = await arena.getEncryptedScore(signer.address);
    const initialScore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      initialEncryptedScore,
      arenaAddress,
      signer,
    );
    expect(initialScore).to.be.gte(100);

    const winningRoute = [1, 3, 2, 2];
    for (const value of winningRoute) {
      logStep(`Encrypting choice ${value}`);
      const encryptedChoice = await fhevm
        .createEncryptedInput(arenaAddress, signer.address)
        .add8(value)
        .encrypt();

      logStep(`Submitting encrypted choice ${value}`);
      tx = await arena
        .connect(signer)
        .submitEncryptedChoice(encryptedChoice.handles[0], encryptedChoice.inputProof);
      await tx.wait();
    }

    const finalEncryptedScore = await arena.getEncryptedScore(signer.address);
    const finalScore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      finalEncryptedScore,
      arenaAddress,
      signer,
    );

    expect(finalScore - initialScore).to.eq(100);
  });
});

const CONTRACT_NAME = "BlindLogicArena";
