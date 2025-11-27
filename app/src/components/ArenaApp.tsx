import { useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract, useContractReads } from 'wagmi';

import { Header } from './Header';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import '../styles/ArenaApp.css';
import '../styles/GamePanels.css';

const PATH_INDEXES = [0, 1, 2, 3] as const;
const ROUTE_OPTIONS = [1, 2, 3] as const;
const ZERO_CIPHER =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

type DecryptedView = {
  score?: string;
  reward?: string;
  choices: Record<number, string>;
};

export function ArenaApp() {
  const { address } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } =
    useZamaInstance();
  const signerPromise = useEthersSigner();

  const [statusMessage, setStatusMessage] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [choiceLoading, setChoiceLoading] = useState<number | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptedView, setDecryptedView] = useState<DecryptedView>({
    choices: {},
  });
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const configQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getArenaConfig',
  });

  const statusQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPlayerStatus',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const scoreQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedScore',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const rewardQuery = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedLastReward',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const choicesQuery = useContractReads({
    contracts: address
      ? PATH_INDEXES.map((index) => ({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getEncryptedChoice',
          args: [address, BigInt(index)],
        }))
      : [],
    allowFailure: false,
    query: { enabled: !!address },
  });

  const arenaConfig = configQuery.data as
    | readonly [bigint, bigint, bigint, bigint]
    | undefined;

  const statusData = statusQuery.data as
    | readonly [bigint, bigint, boolean, boolean]
    | undefined;

  const encryptedScore = scoreQuery.data as string | undefined;
  const encryptedReward = rewardQuery.data as string | undefined;
  const encryptedChoices =
    ((choicesQuery.data as unknown as readonly string[]) ?? []);

  const currentStage = statusData ? Number(statusData[0]) : 0;
  const completedRuns = statusData ? Number(statusData[1]) : 0;
  const registered = statusData ? Boolean(statusData[2]) : false;
  const roundFinished = statusData ? Boolean(statusData[3]) : false;

  const stageStatus = useMemo(() => {
    return PATH_INDEXES.map((index) => {
      if (currentStage > index) {
        return 'done';
      }
      if (currentStage === index) {
        return 'active';
      }
      return 'locked';
    });
  }, [currentStage]);

  const canSubmitChoice =
    registered && !roundFinished && currentStage < PATH_INDEXES.length;

  const refreshAll = async () => {
    await Promise.all([
      statusQuery.refetch(),
      scoreQuery.refetch(),
      rewardQuery.refetch(),
      choicesQuery.refetch(),
    ]);
  };

  const handleStartRound = async () => {
    if (!address) {
      setStatusMessage('Connect your wallet to enter the arena.');
      return;
    }
    if (!signerPromise) {
      setStatusMessage('Signer is not ready yet.');
      return;
    }

    try {
      setIsStarting(true);
      setStatusMessage('Preparing encrypted run...');
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.registerAndStart();
      setStatusMessage('Waiting for confirmation...');
      await tx.wait();
      setStatusMessage('Run ready. Pick your first fork.');
      setDecryptedView({ choices: {} });
      setDecryptError(null);
      await refreshAll();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error starting run';
      setStatusMessage(message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleChoiceSubmit = async (value: number) => {
    if (!address || !instance) {
      setStatusMessage('Zama encryption is not ready.');
      return;
    }
    if (!signerPromise) {
      setStatusMessage('Connect your wallet to continue.');
      return;
    }
    if (!canSubmitChoice) {
      setStatusMessage('Start or finish a round before submitting choices.');
      return;
    }

    try {
      setChoiceLoading(value);
      setStatusMessage(`Encrypting choice ${value}...`);
      const buffer = instance.createEncryptedInput(
        CONTRACT_ADDRESS,
        address
      );
      buffer.add8(BigInt(value));
      const encrypted = await buffer.encrypt();
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setStatusMessage('Submitting encrypted route...');
      const tx = await contract.submitEncryptedChoice(
        encrypted.handles[0],
        encrypted.inputProof
      );
      await tx.wait();
      setStatusMessage(`Fork ${currentStage + 1} recorded.`);
      setDecryptError(null);
      await refreshAll();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send choice';
      setStatusMessage(message);
    } finally {
      setChoiceLoading(null);
    }
  };

  const decryptEncryptedData = async () => {
    if (!instance || !address) {
      setDecryptError('Encryption service or wallet missing.');
      return;
    }
    if (!signerPromise) {
      setDecryptError('Signer not found.');
      return;
    }

    const handles: { handle: string; contractAddress: string }[] = [];
    if (encryptedScore && encryptedScore !== ZERO_CIPHER) {
      handles.push({ handle: encryptedScore, contractAddress: CONTRACT_ADDRESS });
    }
    if (encryptedReward && encryptedReward !== ZERO_CIPHER) {
      handles.push({
        handle: encryptedReward,
        contractAddress: CONTRACT_ADDRESS,
      });
    }
    encryptedChoices.forEach((choice) => {
      if (choice && choice !== ZERO_CIPHER) {
        handles.push({ handle: choice, contractAddress: CONTRACT_ADDRESS });
      }
    });

    if (!handles.length) {
      setDecryptError('Nothing to decrypt yet.');
      return;
    }

    try {
      setDecrypting(true);
      setDecryptError(null);
      const keypair = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const eip712 = instance.createEIP712(
        keypair.publicKey,
        [CONTRACT_ADDRESS],
        startTimestamp,
        durationDays
      );
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer is unavailable.');
      }
      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification:
            eip712.types.UserDecryptRequestVerification,
        },
        eip712.message
      );

      const result = await instance.userDecrypt(
        handles,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [CONTRACT_ADDRESS],
        address,
        startTimestamp,
        durationDays
      );

      const updatedChoices: Record<number, string> = {};
      encryptedChoices.forEach((choice, index) => {
        if (choice && result[choice]) {
          updatedChoices[index] = result[choice];
        }
      });

      setDecryptedView({
        score: encryptedScore ? result[encryptedScore] : undefined,
        reward: encryptedReward ? result[encryptedReward] : undefined,
        choices: updatedChoices,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to decrypt data';
      setDecryptError(message);
    } finally {
      setDecrypting(false);
    }
  };

  return (
    <div className="arena-app">
      <Header />
      <main className="arena-main">
        <section className="status-banner">
          <div>
            <p className="status-heading">Encrypted progress</p>
            <p className="status-detail">
              Fork {Math.min(currentStage + 1, PATH_INDEXES.length)} of{' '}
              {PATH_INDEXES.length}
            </p>
          </div>
          <div>
            <p className="status-heading">Runs completed</p>
            <p className="status-detail">{completedRuns}</p>
          </div>
          <div>
            <p className="status-heading">Arena access</p>
            <p className="status-detail">
              {address
                ? registered
                  ? roundFinished
                    ? 'Ready for restart'
                    : 'Live round'
                  : 'Tap start to join'
                : 'Connect wallet'}
            </p>
          </div>
        </section>

        {statusMessage && (
          <div className="message-box">
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="panels-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Path Console</p>
                <h2>Blind Logic Arena</h2>
              </div>
              <div className="config-badge">
                {arenaConfig ? (
                  <span>
                    {Number(arenaConfig[0])} forks · {Number(arenaConfig[1])}{' '}
                    options · reward {Number(arenaConfig[3])} pts
                  </span>
                ) : (
                  <span>Loading arena config...</span>
                )}
              </div>
            </div>

            <div className="stage-grid">
              {PATH_INDEXES.map((index) => (
                <div
                  key={index}
                  className={`stage-node ${stageStatus[index]}`}
                >
                  <span>Fork {index + 1}</span>
                </div>
              ))}
            </div>

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={handleStartRound}
                disabled={isStarting || !address || zamaLoading}
              >
                {isStarting
                  ? 'Starting...'
                  : registered
                  ? 'Restart round'
                  : 'Join the arena'}
              </button>
            </div>

            <div className="choices-section">
              <p className="section-title">
                Select a route for fork {currentStage + 1}
              </p>
              <div className="choices-grid">
                {ROUTE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`choice-button ${
                      canSubmitChoice ? '' : 'choice-disabled'
                    }`}
                    onClick={() => handleChoiceSubmit(option)}
                    disabled={
                      !canSubmitChoice ||
                      choiceLoading === option ||
                      zamaLoading
                    }
                  >
                    {choiceLoading === option
                      ? 'Encrypting...'
                      : `Route ${option}`}
                  </button>
                ))}
              </div>
              <p className="helper-text">
                Every pick is encrypted locally with Zama&apos;s relayer before
                touching the contract.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Encrypted scoreboard</p>
                <h2>Insights</h2>
              </div>
              <div className="config-badge">
                {zamaLoading
                  ? 'Initializing Zama...'
                  : zamaError
                  ? 'Zama unavailable'
                  : 'Zama ready'}
              </div>
            </div>

            <div className="cipher-box">
              <div>
                <p className="cipher-label">Score ciphertext</p>
                <p className="cipher-value">
                  {formatCiphertext(encryptedScore)}
                </p>
              </div>
              <div>
                <p className="cipher-label">Last reward ciphertext</p>
                <p className="cipher-value">
                  {formatCiphertext(encryptedReward)}
                </p>
              </div>
            </div>

            <div className="history-list">
              <p className="section-title">Stored fork decisions</p>
              <ul>
                {PATH_INDEXES.map((index) => (
                  <li key={index}>
                    <span>Fork {index + 1}</span>
                    <span>
                      {formatCiphertext(encryptedChoices[index] as string)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="decrypt-card">
              <button
                type="button"
                className="primary-button"
                onClick={decryptEncryptedData}
                disabled={decrypting || !address || !instance}
              >
                {decrypting ? 'Decrypting...' : 'Decrypt my data'}
              </button>
              {decryptError && <p className="error-text">{decryptError}</p>}
              {decryptedView.score && (
                <div className="decrypt-result">
                  <p>
                    Score:{' '}
                    <span className="highlight">{decryptedView.score}</span>
                  </p>
                  <p>
                    Last reward:{' '}
                    <span className="highlight">
                      {decryptedView.reward ?? '0'}
                    </span>
                  </p>
                  <div className="choice-result">
                    <p>Choices:</p>
                    <div className="choice-chips">
                      {PATH_INDEXES.map((index) => (
                        <span key={index}>
                          Fork {index + 1}:{' '}
                          {decryptedView.choices[index] ?? 'encrypted'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function formatCiphertext(value?: string) {
  if (!value || value === ZERO_CIPHER) {
    return '—';
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
