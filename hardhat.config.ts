import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ignition';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20', // ✅ MUST be exactly 0.8.20 (not 0.8.19)
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
  },
};

export default config;
