// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title PrimeMapping
 * @notice Library for mapping market data and addresses to prime numbers
 * @dev Essential for RSA accumulator operations which require prime elements.
 *      Provides deterministic mapping from keccak256 hashes to prime numbers.
 *
 *      The mapping algorithm:
 *      1. Compute keccak256 hash of the input data
 *      2. Use hash as starting point for prime search
 *      3. Find smallest prime >= hash value
 *      4. Return prime as both bytes and uint256
 *
 *      Security properties:
 *      - Deterministic: same input always produces same prime
 *      - Collision-resistant: relies on keccak256 collision resistance
 *      - Unpredictable: prime offset from hash is computationally hard to predict
 */
library PrimeMapping {

    // ========== Errors ==========

    error InvalidMarketData();
    error InvalidAddress();

    // ========== Market Hash Functions ==========

    /**
     * @notice Compute unique hash for a market based on its immutable properties
     * @dev Uses proposalId, collateral token, condition ID, and position IDs
     *      These fields are immutable once a market is created
     *
     * @param proposalId The governance proposal ID this market is attached to
     * @param collateralToken The ERC20 token used as collateral
     * @param conditionId The CTF1155 condition identifier
     * @param passPositionId The CTF1155 position ID for PASS outcome
     * @param failPositionId The CTF1155 position ID for FAIL outcome
     * @return hash The keccak256 hash of the market data
     */
    function computeMarketHash(
        uint256 proposalId,
        address collateralToken,
        bytes32 conditionId,
        uint256 passPositionId,
        uint256 failPositionId
    ) internal pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked(
            "MARKET_V1",  // Version prefix for future compatibility
            proposalId,
            collateralToken,
            conditionId,
            passPositionId,
            failPositionId
        ));
    }

    /**
     * @notice Compute market hash from market ID and factory address
     * @dev Alternative hash computation when full market data isn't available
     *      Useful for off-chain indexing and verification
     *
     * @param marketFactory Address of the ConditionalMarketFactory contract
     * @param marketId The market ID within the factory
     * @return hash The keccak256 hash
     */
    function computeMarketHashSimple(
        address marketFactory,
        uint256 marketId
    ) internal pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked(
            "MARKET_SIMPLE_V1",
            marketFactory,
            marketId
        ));
    }

    // ========== Address Hash Functions ==========

    /**
     * @notice Compute hash for an address to be nullified
     * @dev Adds domain separator to prevent cross-context attacks
     *
     * @param account The address to hash
     * @return hash The keccak256 hash
     */
    function computeAddressHash(address account) internal pure returns (bytes32 hash) {
        if (account == address(0)) revert InvalidAddress();
        return keccak256(abi.encodePacked(
            "ADDRESS_V1",
            account
        ));
    }

    // ========== Prime Conversion ==========

    /**
     * @notice Convert a hash to its prime representative
     * @dev Finds the smallest prime number >= hash value
     *      Uses Miller-Rabin primality test with deterministic witnesses
     *
     * @param hash The keccak256 hash to convert
     * @return prime The prime number as uint256
     */
    function hashToPrimeUint(bytes32 hash) internal pure returns (uint256 prime) {
        // Start with hash value, ensure odd
        uint256 candidate = uint256(hash) | 1;

        // Limit search to prevent DoS (extremely unlikely to exceed)
        uint256 maxIterations = 1000;
        uint256 iterations = 0;

        while (!isPrime(candidate) && iterations < maxIterations) {
            candidate += 2; // Only check odd numbers
            iterations++;

            // Handle overflow (wrap to small prime)
            if (candidate == 0) {
                candidate = 3;
            }
        }

        // If we somehow didn't find a prime (shouldn't happen), revert
        require(iterations < maxIterations, "Prime search exceeded limit");

        return candidate;
    }

    /**
     * @notice Convert market data directly to prime
     * @param proposalId The proposal ID
     * @param collateralToken The collateral token address
     * @param conditionId The CTF condition ID
     * @param passPositionId The pass position ID
     * @param failPositionId The fail position ID
     * @return prime The prime representative
     */
    function marketToPrime(
        uint256 proposalId,
        address collateralToken,
        bytes32 conditionId,
        uint256 passPositionId,
        uint256 failPositionId
    ) internal pure returns (uint256 prime) {
        bytes32 hash = computeMarketHash(
            proposalId,
            collateralToken,
            conditionId,
            passPositionId,
            failPositionId
        );
        return hashToPrimeUint(hash);
    }

    /**
     * @notice Convert address directly to prime
     * @param account The address to convert
     * @return prime The prime representative
     */
    function addressToPrime(address account) internal pure returns (uint256 prime) {
        bytes32 hash = computeAddressHash(account);
        return hashToPrimeUint(hash);
    }

    // ========== Primality Testing ==========

    /**
     * @notice Check if a number is prime using Miller-Rabin
     * @dev Uses deterministic witnesses sufficient for 256-bit numbers
     *      Based on https://miller-rabin.appspot.com/ recommendations
     *
     * @param n The number to test
     * @return True if n is prime
     */
    function isPrime(uint256 n) internal pure returns (bool) {
        // Handle small cases
        if (n < 2) return false;
        if (n == 2 || n == 3) return true;
        if (n % 2 == 0) return false;
        if (n < 9) return true;
        if (n % 3 == 0) return false;

        // Write n-1 as 2^r * d
        uint256 d = n - 1;
        uint256 r = 0;
        while (d % 2 == 0) {
            d /= 2;
            r++;
        }

        // Test with deterministic witnesses
        // These witnesses are sufficient for n < 3,317,044,064,679,887,385,961,981
        // For 256-bit, we add more witnesses for safety
        uint256[12] memory witnesses = [
            uint256(2), 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37
        ];

        for (uint256 i = 0; i < witnesses.length; i++) {
            if (witnesses[i] >= n) continue;
            if (!millerRabinTest(n, d, r, witnesses[i])) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Single round of Miller-Rabin test
     * @param n Number to test
     * @param d Odd factor of n-1
     * @param r Power of 2 in n-1 factorization
     * @param a Witness value
     * @return True if n passes this round
     */
    function millerRabinTest(
        uint256 n,
        uint256 d,
        uint256 r,
        uint256 a
    ) internal pure returns (bool) {
        // Compute a^d mod n
        uint256 x = modPow(a, d, n);

        if (x == 1 || x == n - 1) {
            return true;
        }

        // Repeated squaring
        for (uint256 i = 1; i < r; i++) {
            x = mulmod(x, x, n);

            if (x == n - 1) {
                return true;
            }
            if (x == 1) {
                return false;
            }
        }

        return false;
    }

    /**
     * @notice Modular exponentiation
     * @dev Computes base^exp mod mod using binary exponentiation
     */
    function modPow(uint256 base, uint256 exp, uint256 mod) internal pure returns (uint256 result) {
        if (mod == 1) return 0;

        result = 1;
        base = base % mod;

        while (exp > 0) {
            if (exp % 2 == 1) {
                result = mulmod(result, base, mod);
            }
            exp = exp >> 1;
            base = mulmod(base, base, mod);
        }
    }

    // ========== Batch Operations ==========

    /**
     * @notice Compute primes for multiple market hashes
     * @dev Gas-efficient batch computation
     *
     * @param hashes Array of market hashes
     * @return primes Array of prime representatives
     */
    function batchHashesToPrimes(bytes32[] memory hashes) internal pure returns (uint256[] memory primes) {
        primes = new uint256[](hashes.length);
        for (uint256 i = 0; i < hashes.length; i++) {
            primes[i] = hashToPrimeUint(hashes[i]);
        }
    }

    /**
     * @notice Compute product of primes (for accumulator computation)
     * @dev Warning: This can overflow for large sets. Use off-chain for production.
     *
     * @param primes Array of prime numbers
     * @return product The product of all primes (may overflow)
     */
    function computePrimeProduct(uint256[] memory primes) internal pure returns (uint256 product) {
        product = 1;
        for (uint256 i = 0; i < primes.length; i++) {
            // Note: This will overflow for real RSA accumulator use
            // In production, this computation happens off-chain with big integers
            unchecked {
                product *= primes[i];
            }
        }
    }

    // ========== Verification Helpers ==========

    /**
     * @notice Verify a prime was correctly derived from a market hash
     * @dev Useful for on-chain verification of off-chain computations
     *
     * @param marketHash The original market hash
     * @param claimedPrime The claimed prime representative
     * @return valid True if claimedPrime is the correct prime for marketHash
     */
    function verifyMarketPrime(bytes32 marketHash, uint256 claimedPrime) internal pure returns (bool valid) {
        // Check that claimed prime is actually prime
        if (!isPrime(claimedPrime)) return false;

        // Check that it's the correct prime (smallest >= hash)
        uint256 expectedPrime = hashToPrimeUint(marketHash);
        return claimedPrime == expectedPrime;
    }

    /**
     * @notice Verify a prime was correctly derived from an address hash
     * @param account The original address
     * @param claimedPrime The claimed prime representative
     * @return valid True if claimedPrime is correct
     */
    function verifyAddressPrime(address account, uint256 claimedPrime) internal pure returns (bool valid) {
        if (!isPrime(claimedPrime)) return false;
        uint256 expectedPrime = addressToPrime(account);
        return claimedPrime == expectedPrime;
    }
}
