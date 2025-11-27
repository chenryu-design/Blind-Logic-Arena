import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Blind Logic Arena',
  projectId: '63f133d761d54ba2ac4f08d88b96f726',
  chains: [sepolia],
  ssr: false,
});
