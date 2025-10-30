import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];

  console.log(`\n🚀 Deploying contracts with: ${deployer.address}`);

  const Remittance = await ethers.getContractFactory('Remittance');
  const remittance = await Remittance.deploy(deployer.address);
  await remittance.waitForDeployment();
  console.log(`✅ Remittance deployed at: ${remittance.target}`);

  const MockERC20 = await ethers.getContractFactory('MockERC20');

  const tokens = [
    { name: 'USD Coin', symbol: 'USDC', country: 'US', decimals: 6 },
    { name: 'Euro Coin', symbol: 'EURC', country: 'EU', decimals: 6 },
    { name: 'British Pound', symbol: 'GBPT', country: 'GB', decimals: 6 },
  ];

  const deployedTokens: { [symbol: string]: any } = {};
  const addresses: { [symbol: string]: string } = {
    Remittance: remittance.target.toString(),
  };

  for (const token of tokens) {
    const instance = await MockERC20.deploy(
      token.name,
      token.symbol,
      token.decimals
    );
    await instance.waitForDeployment();
    deployedTokens[token.symbol] = instance;
    addresses[token.symbol] = instance.target.toString();

    const tx = await remittance.setStablecoinForCountry(
      token.country,
      instance.target
    );
    await tx.wait();
    console.log(`🔗 ${token.symbol} mapped to ${token.country}`);
  }
  // Define exact exchange rates for each pair (scaled by 1e18)
  const rates: Record<string, Record<string, bigint>> = {
    USDC: {
      EURC: BigInt(0.92e18), // 1 USDC = 0.92 EURC
      GBPT: BigInt(0.78e18), // 1 USDC = 0.78 GBPT
    },
    EURC: {
      USDC: BigInt(1.09e18), // 1 EURC = 1.09 USDC
      GBPT: BigInt(0.85e18), // 1 EURC = 0.85 GBPT
    },
    GBPT: {
      USDC: BigInt(1.28e18), // 1 GBPT = 1.28 USDC
      EURC: BigInt(1.18e18), // 1 GBPT = 1.18 EURC
    },
  };

  for (const from of tokens) {
    const fromAddr = deployedTokens[from.symbol].target;

    for (const to of tokens) {
      if (from.symbol === to.symbol) continue;

      const toAddr = deployedTokens[to.symbol].target;
      const rate = rates[from.symbol]?.[to.symbol];

      if (!rate) {
        console.warn(
          `⚠️ No rate found for ${from.symbol} -> ${to.symbol}, skipping`
        );
        continue;
      }

      const tx = await remittance.setExchangeRate(fromAddr, toAddr, rate);
      await tx.wait();

      console.log(
        `📈 Set rate ${from.symbol} -> ${to.symbol}: ${Number(rate) / 1e18}`
      );
    }
  }

  console.log(`\n💰 Minting tokens to test users...`);
  for (let i = 0; i < accounts.length; i++) {
    for (const token of tokens) {
      const amount = ethers.parseUnits('1000', token.decimals);
      await deployedTokens[token.symbol].mint(accounts[i].address, amount);
    }
  }

  // Mint extra to deployer and add liquidity (10000 each)
  console.log(`\n🪙 Adding initial liquidity...`);
  for (const token of tokens) {
    const liquidityAmount = ethers.parseUnits('10000', token.decimals);
    await deployedTokens[token.symbol].mint(deployer.address, liquidityAmount);
    await deployedTokens[token.symbol]
      .connect(deployer)
      .approve(remittance.target, liquidityAmount);
    const tx = await remittance.addLiquidity(
      deployedTokens[token.symbol].target,
      liquidityAmount
    );
    await tx.wait();
    console.log(`Added ${token.symbol} liquidity`);
  }

  // Write deployed.json
  fs.writeFileSync(
    path.join(__dirname, '..', 'deployed.json'),
    JSON.stringify(
      { ...addresses, network: 'localhost', deployer: deployer.address },
      null,
      2
    )
  );

  // Copy files to remittance-frontend/public/
  const frontendPublicDir = path.join(
    __dirname,
    '..',
    'remittance-frontend',
    'public'
  );
  try {
    fs.copyFileSync(
      path.join(__dirname, '..', 'deployed.json'),
      path.join(frontendPublicDir, 'deployed.json')
    );
    fs.copyFileSync(
      path.join(
        __dirname,
        '..',
        'artifacts',
        'contracts',
        'Remittance.sol',
        'Remittance.json'
      ),
      path.join(frontendPublicDir, 'remittance-abi.json')
    );
    fs.copyFileSync(
      path.join(
        __dirname,
        '..',
        'artifacts',
        'contracts',
        'MockERC20.sol',
        'MockERC20.json'
      ),
      path.join(frontendPublicDir, 'erc20-abi.json')
    );
    console.log(
      '📁 Copied deployed.json and ABI files to remittance-frontend/public'
    );
  } catch (err) {
    console.error('Failed to copy files to remittance-frontend/public:', err);
    throw err; // Rethrow to fail deployment if copying fails
  }

  console.log('\n✅ Simplified deployment completed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
