const { ethers } = require('ethers');
const { Pool } = require('pg');
const deployed = require('./deployed.json'); // Adjust path if needed
const abi = require('./artifacts/contracts/Remittance.sol/Remittance.json').abi; // Adjust path if needed

const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const contract = new ethers.Contract(deployed.Remittance, abi, provider);

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'remittance_logs',
  password: 'secret', // Replace with your DB password
  port: 5432,
});

const countryToCurrency = {
  US: 'USDC',
  EU: 'EURC',
  GB: 'GBPT',
};

const tokenToCurrency = {
  [deployed.USDC.toLowerCase()]: 'USDC',
  [deployed.EURC.toLowerCase()]: 'EURC',
  [deployed.GBPT.toLowerCase()]: 'GBPT',
};

contract.on(
  'TransferCompleted',
  async (
    from,
    to,
    fromCountry,
    toCountry,
    sentAmount,
    convertedAmount,
    fee,
    referenceId,
    timestamp,
    event
  ) => {
    const fromCurr = countryToCurrency[fromCountry] || 'UNKNOWN';
    const toCurr = countryToCurrency[toCountry] || 'UNKNOWN';
    const refIdHex = referenceId.startsWith('0x')
      ? referenceId
      : '0x' + referenceId.slice(2);
    const client = await pool.connect();
    try {
      await client.query(
        'INSERT INTO transactions (tx_type, from_address, to_address, from_currency, to_currency, sent_amount, converted_amount, fee, reference_id, timestamp, block_timestamp, tx_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [
          'remittance',
          from.toLowerCase(),
          to.toLowerCase(),
          fromCurr,
          toCurr,
          sentAmount.toString(),
          convertedAmount.toString(),
          fee.toString(),
          refIdHex,
          new Date(Number(timestamp) * 1000),
          Number(timestamp),
          event.transactionHash,
        ]
      );
      console.log(`Logged remittance tx: ${event.transactionHash}`);
    } catch (e) {
      console.error('Error logging remittance:', e);
    } finally {
      client.release();
    }
  }
);

contract.on(
  'RemittanceWithdrawn',
  async (user, token, amount, timestamp, event) => {
    const tokenCurr = tokenToCurrency[token.toLowerCase()] || 'UNKNOWN';
    const client = await pool.connect();
    try {
      await client.query(
        'INSERT INTO transactions (tx_type, from_address, to_address, from_currency, to_currency, sent_amount, converted_amount, fee, reference_id, timestamp, block_timestamp, tx_hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [
          'withdrawal',
          null,
          user.toLowerCase(),
          null,
          tokenCurr,
          '0',
          amount.toString(),
          '0',
          null,
          new Date(Number(timestamp) * 1000),
          Number(timestamp),
          event.transactionHash,
        ]
      );
      console.log(`Logged withdrawal tx: ${event.transactionHash}`);
    } catch (e) {
      console.error('Error logging withdrawal:', e);
    } finally {
      client.release();
    }
  }
);

console.log('Transaction logger is running...');
