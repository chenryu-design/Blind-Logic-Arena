import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedArena = await deploy("BlindLogicArena", {
    from: deployer,
    log: true,
  });

  console.log(`BlindLogicArena contract: `, deployedArena.address);
};
export default func;
func.id = "deploy_blindLogicArena"; // id required to prevent reexecution
func.tags = ["BlindLogicArena"];
