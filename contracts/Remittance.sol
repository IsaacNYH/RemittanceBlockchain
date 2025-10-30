// SPDX-License-Identifier: MIT
// Remittance.sol

pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
}

contract Remittance {
    address public owner;

    mapping(string => address) public countryStablecoins;
    mapping(address => uint256) public liquidityPools;
    mapping(address => mapping(address => uint256)) public exchangeRates;

    uint256 public conversionFee = 50; // 0.5% in basis points
    mapping(address => uint256) public collectedFees;

    mapping(address => mapping(address => uint256)) public pendingWithdrawals;

    event StablecoinAssigned(string countryCode, address stablecoin, uint256 timestamp);
    event TransferCompleted(
        address indexed from, 
        address indexed to, 
        string fromCountry, 
        string toCountry, 
        uint256 sentAmount, 
        uint256 convertedAmount, 
        uint256 fee,
        bytes32 referenceId, 
        uint256 timestamp
    );
    event LiquidityAdded(address token, uint256 amount, uint256 timestamp);
    event LiquidityRemoved(address token, uint256 amount, uint256 timestamp);
    event ExchangeRateUpdated(address fromToken, address toToken, uint256 rate, uint256 timestamp);
    event ConversionFeeUpdated(uint256 oldFee, uint256 newFee, uint256 timestamp);
    event FeesCollected(address token, uint256 amount, uint256 timestamp);
    event RemittanceWithdrawn(address indexed user, address token, uint256 amount, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    bool public paused = false;

    constructor(address _owner) {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
    }

    function setConversionFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1000, "Fee too high (max 10%)");
        uint256 oldFee = conversionFee;
        conversionFee = _fee;
        emit ConversionFeeUpdated(oldFee, _fee, block.timestamp);
    }

    function addLiquidity(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");

        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed");

        liquidityPools[token] += amount;
        emit LiquidityAdded(token, amount, block.timestamp);
    }

    function removeLiquidity(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(liquidityPools[token] >= amount, "Insufficient liquidity");

        liquidityPools[token] -= amount;
        bool success = IERC20(token).transfer(owner, amount);
        require(success, "Transfer failed");

        emit LiquidityRemoved(token, amount, block.timestamp);
    }

    function setExchangeRate(address fromToken, address toToken, uint256 rate) external onlyOwner {
        require(fromToken != address(0) && toToken != address(0), "Invalid tokens");
        require(fromToken != toToken, "Cannot set rate for same token");
        require(rate > 0, "Rate must be > 0");

        exchangeRates[fromToken][toToken] = rate;
        emit ExchangeRateUpdated(fromToken, toToken, rate, block.timestamp);
    }

    function setStablecoinForCountry(string memory countryCode, address tokenAddress) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        require(bytes(countryCode).length > 0, "Empty country code");

        countryStablecoins[countryCode] = tokenAddress;
        emit StablecoinAssigned(countryCode, tokenAddress, block.timestamp);
    }

    function sendRemittance(
        string memory fromCountry,
        string memory toCountry,
        address to,
        uint256 amount,
        bytes32 referenceId
    ) external whenNotPaused {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(bytes(fromCountry).length > 0, "Empty from country");
        require(bytes(toCountry).length > 0, "Empty to country");

        address fromToken = countryStablecoins[fromCountry];
        address toToken = countryStablecoins[toCountry];

        require(fromToken != address(0), "Unsupported sender currency");
        require(toToken != address(0), "Unsupported recipient currency");

        require(IERC20(fromToken).balanceOf(msg.sender) >= amount, "Insufficient balance");

        bool pulled = IERC20(fromToken).transferFrom(msg.sender, address(this), amount);
        require(pulled, "Token transfer failed");

        uint256 convertedAmount;
        uint256 fee = 0;

        if (fromToken == toToken) {
            // Same currency transfer - no conversion needed
            convertedAmount = amount;
        } else {
            // Different currency - conversion required
            uint256 rate = exchangeRates[fromToken][toToken];
            require(rate > 0, "Exchange rate not set");

            fee = (amount * conversionFee) / 10000;
            uint256 amountAfterFee = amount - fee;

            uint8 fromDecimals = IERC20(fromToken).decimals();
            uint8 toDecimals = IERC20(toToken).decimals();

            if (toDecimals >= fromDecimals) {
                convertedAmount = (amountAfterFee * rate * (10 ** (toDecimals - fromDecimals))) / 1e18;
            } else {
                convertedAmount = (amountAfterFee * rate) / (1e18 * (10 ** (fromDecimals - toDecimals)));
            }

            require(convertedAmount > 0, "Converted amount too small");
            require(liquidityPools[toToken] >= convertedAmount, "Insufficient liquidity");

            liquidityPools[fromToken] += amountAfterFee;
            liquidityPools[toToken] -= convertedAmount;
            collectedFees[fromToken] += fee;
        }

        // Add to pending withdrawals instead of direct transfer
        pendingWithdrawals[to][toToken] += convertedAmount;

        emit TransferCompleted(
            msg.sender,
            to,
            fromCountry,
            toCountry,
            amount,
            convertedAmount,
            fee,
            referenceId,
            block.timestamp
        );
    }

    function withdrawRemittance(address token, uint256 amount) external whenNotPaused {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        uint256 pending = pendingWithdrawals[msg.sender][token];
        require(pending >= amount, "Insufficient pending balance");

        pendingWithdrawals[msg.sender][token] -= amount;
        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "Withdrawal failed");

        emit RemittanceWithdrawn(msg.sender, token, amount, block.timestamp);
    }

    function getPendingWithdrawal(address user, address token) external view returns (uint256) {
        return pendingWithdrawals[user][token];
    }

    function getLiquidityBalance(address token) external view returns (uint256) {
        return liquidityPools[token];
    }

    function getExchangeRate(address fromToken, address toToken) external view returns (uint256) {
        return exchangeRates[fromToken][toToken];
    }

    function getStablecoinForCountry(string memory countryCode) external view returns (address) {
        return countryStablecoins[countryCode];
    }

    function getCollectedFees(address token) external view returns (uint256) {
        return collectedFees[token];
    }

    function collectFees(address token) external onlyOwner {
        uint256 feeAmount = collectedFees[token];
        require(feeAmount > 0, "No fees to collect");

        collectedFees[token] = 0;

        bool success = IERC20(token).transfer(owner, feeAmount);
        require(success, "Fee collection failed");

        emit FeesCollected(token, feeAmount, block.timestamp);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(amount <= liquidityPools[token], "Insufficient pool balance");

        liquidityPools[token] -= amount;
        bool success = IERC20(token).transfer(owner, amount);
        require(success, "Emergency withdrawal failed");

        emit LiquidityRemoved(token, amount, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        require(newOwner != owner, "Already owner");
        owner = newOwner;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }
}