import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { BlindLogicArena, BlindLogicArena__factory } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

describe("BlindLogicArena", function () {
  let arena: BlindLogicArena;
  let arenaAddress: string;
  let signers: Signers;

  before(async function () {
    const [deployer, alice, bob] = await ethers.getSigners();
    signers = { deployer, alice, bob };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("BlindLogicArena unit tests run only against the FHEVM mock");
      this.skip();
    }

    const factory = (await ethers.getContractFactory("BlindLogicArena")) as BlindLogicArena__factory;
    arena = (await factory.deploy()) as BlindLogicArena;
    arenaAddress = await arena.getAddress();
  });

  async function encryptChoice(player: HardhatEthersSigner, value: number) {
    return fhevm.createEncryptedInput(arenaAddress, player.address).add8(value).encrypt();
  }

  it("registers players with an encrypted score of 100 points", async function () {
    await arena.connect(signers.alice).registerAndStart();
    const status = await arena.getPlayerStatus(signers.alice.address);
    expect(status[2]).to.eq(true);
    expect(status[0]).to.eq(0);

    const encryptedScore = await arena.getEncryptedScore(signers.alice.address);
    expect(encryptedScore).to.not.eq(ethers.ZeroHash);

    const clearScore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedScore,
      arenaAddress,
      signers.alice,
    );
    expect(clearScore).to.eq(100);
  });

  it("rewards 100 additional points when the hidden path is solved", async function () {
    await arena.connect(signers.alice).registerAndStart();
    const winningRoute = [1, 3, 2, 2];

    for (const choice of winningRoute) {
      const encrypted = await encryptChoice(signers.alice, choice);
      const tx = await arena
        .connect(signers.alice)
        .submitEncryptedChoice(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
    }

    const status = await arena.getPlayerStatus(signers.alice.address);
    expect(status[0]).to.eq(4);
    expect(status[3]).to.eq(true);
    expect(status[1]).to.eq(1);

    const encryptedScore = await arena.getEncryptedScore(signers.alice.address);
    const clearScore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedScore,
      arenaAddress,
      signers.alice,
    );
    expect(clearScore).to.eq(200);

    const encryptedReward = await arena.getEncryptedLastReward(signers.alice.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedReward,
      arenaAddress,
      signers.alice,
    );
    expect(clearReward).to.eq(100);
  });

  it("does not reward runs with incorrect paths", async function () {
    await arena.connect(signers.bob).registerAndStart();
    const wrongRoute = [1, 1, 1, 1];
    for (const choice of wrongRoute) {
      const encrypted = await encryptChoice(signers.bob, choice);
      const tx = await arena
        .connect(signers.bob)
        .submitEncryptedChoice(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
    }

    const status = await arena.getPlayerStatus(signers.bob.address);
    expect(status[0]).to.eq(4);
    expect(status[3]).to.eq(true);
    expect(status[1]).to.eq(1);

    const encryptedScore = await arena.getEncryptedScore(signers.bob.address);
    const clearScore = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedScore,
      arenaAddress,
      signers.bob,
    );
    expect(clearScore).to.eq(100);

    const encryptedReward = await arena.getEncryptedLastReward(signers.bob.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedReward,
      arenaAddress,
      signers.bob,
    );
    expect(clearReward).to.eq(0);
  });
});
