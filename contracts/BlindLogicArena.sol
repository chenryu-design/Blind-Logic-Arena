// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title BlindLogicArena
/// @notice Zama FHE powered puzzle where players guess a hidden route through four encrypted forks.
/// Players start with 100 encrypted points and gain 100 more each time they clear an entire path.
contract BlindLogicArena is ZamaEthereumConfig {
    uint8 private constant PATH_LENGTH = 4;
    uint8 private constant ROUTE_OPTIONS = 3;
    uint32 private constant STARTING_SCORE = 100;
    uint32 private constant BONUS_REWARD = 100;

    struct PlayerState {
        euint32 balance;
        ebool encryptedAccuracy;
        uint8 stage;
        uint32 completedRuns;
        bool registered;
    }

    mapping(address => PlayerState) private _players;
    mapping(address => euint8[PATH_LENGTH]) private _choices;
    mapping(address => euint32) private _lastRewards;

    euint8[PATH_LENGTH] private _encryptedSolution;

    event PlayerRegistered(address indexed player);
    event RoundStarted(address indexed player, uint32 indexed runId);
    event ChoiceSubmitted(address indexed player, uint8 forkIndex);
    event RoundCompleted(address indexed player, uint32 indexed runId);

    constructor() {
        _encryptedSolution[0] = FHE.asEuint8(1);
        _encryptedSolution[1] = FHE.asEuint8(3);
        _encryptedSolution[2] = FHE.asEuint8(2);
        _encryptedSolution[3] = FHE.asEuint8(2);

        for (uint8 i = 0; i < PATH_LENGTH; i++) {
            FHE.allowThis(_encryptedSolution[i]);
        }
    }

    /// @notice Registers a new player (if necessary) and starts/reset the current run.
    /// @dev Players always keep their encrypted score. This function only resets the run metadata.
    function registerAndStart() external {
        PlayerState storage player = _players[msg.sender];

        if (!player.registered) {
            player.registered = true;
            player.balance = FHE.asEuint32(STARTING_SCORE);
            FHE.allowThis(player.balance);
            FHE.allow(player.balance, msg.sender);
            emit PlayerRegistered(msg.sender);
        } else {
            require(player.stage == 0 || player.stage == PATH_LENGTH, "Round already active");
        }

        player.stage = 0;
        player.encryptedAccuracy = FHE.asEbool(true);
        FHE.allowThis(player.encryptedAccuracy);
        _clearChoices(msg.sender);
        _resetLastReward(msg.sender);

        emit RoundStarted(msg.sender, player.completedRuns + 1);
    }

    /// @notice Submit an encrypted choice for the current fork.
    /// @param encryptedChoice The encrypted option (1,2,3) supplied by the player.
    /// @param inputProof Zama input proof authorizing the ciphertext.
    function submitEncryptedChoice(externalEuint8 encryptedChoice, bytes calldata inputProof) external {
        PlayerState storage player = _players[msg.sender];
        require(player.registered, "Player is not registered");
        require(player.stage < PATH_LENGTH, "Round already completed");

        euint8 choice = FHE.fromExternal(encryptedChoice, inputProof);
        FHE.allowThis(choice);
        uint8 forkIndex = player.stage;

        _choices[msg.sender][forkIndex] = choice;
        FHE.allowThis(_choices[msg.sender][forkIndex]);
        FHE.allow(_choices[msg.sender][forkIndex], msg.sender);

        ebool isCorrect = FHE.eq(choice, _encryptedSolution[forkIndex]);
        player.encryptedAccuracy = FHE.and(player.encryptedAccuracy, isCorrect);
        FHE.allowThis(player.encryptedAccuracy);

        player.stage = forkIndex + 1;
        emit ChoiceSubmitted(msg.sender, forkIndex);

        if (player.stage == PATH_LENGTH) {
            player.completedRuns += 1;

            euint32 reward = FHE.select(
                player.encryptedAccuracy,
                FHE.asEuint32(BONUS_REWARD),
                FHE.asEuint32(0)
            );

            player.balance = FHE.add(player.balance, reward);
            _lastRewards[msg.sender] = reward;

            FHE.allowThis(player.balance);
            FHE.allow(player.balance, msg.sender);
            FHE.allowThis(_lastRewards[msg.sender]);
            FHE.allow(_lastRewards[msg.sender], msg.sender);

            emit RoundCompleted(msg.sender, player.completedRuns);
        }
    }

    /// @notice Return the encrypted score for a given player.
    function getEncryptedScore(address player) external view returns (euint32) {
        return _players[player].balance;
    }

    /// @notice Return the encrypted reward that was applied after the last round.
    function getEncryptedLastReward(address player) external view returns (euint32) {
        return _lastRewards[player];
    }

    /// @notice Return the encrypted choice a player submitted for a fork.
    function getEncryptedChoice(address player, uint8 forkIndex) external view returns (euint8) {
        require(forkIndex < PATH_LENGTH, "Invalid fork");
        return _choices[player][forkIndex];
    }

    /// @notice Provides plain data to drive the UI state machine.
    /// @return currentStep How many forks have already been solved.
    /// @return completedRuns Number of finished attempts.
    /// @return registered Whether the address is known to the arena.
    /// @return roundFinished True when the user needs to call registerAndStart() again.
    function getPlayerStatus(
        address player
    )
        external
        view
        returns (uint8 currentStep, uint32 completedRuns, bool registered, bool roundFinished)
    {
        PlayerState storage info = _players[player];
        return (info.stage, info.completedRuns, info.registered, info.stage == PATH_LENGTH);
    }

    /// @notice Returns public configuration knobs for the front-end.
    function getArenaConfig()
        external
        pure
        returns (uint8 forks, uint8 optionsPerFork, uint32 baseScore, uint32 bonusScore)
    {
        return (PATH_LENGTH, ROUTE_OPTIONS, STARTING_SCORE, BONUS_REWARD);
    }

    function _clearChoices(address player) private {
        for (uint8 i = 0; i < PATH_LENGTH; i++) {
            _choices[player][i] = FHE.asEuint8(0);
        }
    }

    function _resetLastReward(address player) private {
        _lastRewards[player] = FHE.asEuint32(0);
        FHE.allowThis(_lastRewards[player]);
        FHE.allow(_lastRewards[player], player);
    }
}
