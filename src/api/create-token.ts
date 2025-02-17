
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

// Ensure the endpoint starts with https://
const getFormattedEndpoint = (endpoint: string | undefined) => {
  console.log("Configuring endpoint with:", endpoint);
  
  if (!endpoint) {
    console.error("QuickNode endpoint is not configured in environment variables");
    throw new Error('QuickNode endpoint is not configured');
  }
  
  const formattedEndpoint = !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
    
  console.log("Using formatted endpoint:", formattedEndpoint);
  return formattedEndpoint;
};

export async function createToken(data: {
  name: string;
  symbol: string;
  supply: string;
  decimals: number;
  walletAddress: string;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  authorities?: {
    freezeAuthority: boolean;
    mintAuthority: boolean;
    updateAuthority: boolean;
  };
  creatorName?: string;
}) {
  try {
    console.log("Starting token creation with data:", {
      ...data,
      walletAddress: data.walletAddress.substring(0, 4) + '...' // truncate for privacy
    });

    // Initialize connection to Solana using QuickNode with properly formatted endpoint
    const formattedEndpoint = getFormattedEndpoint(QUICKNODE_ENDPOINT);
    console.log("Initializing Solana connection with endpoint");
    const connection = new Connection(formattedEndpoint, 'confirmed');

    // Test connection
    try {
      const version = await connection.getVersion();
      console.log("Successfully connected to Solana. Version:", version);
    } catch (error) {
      console.error("Failed to connect to Solana:", error);
      throw new Error('Failed to connect to Solana network');
    }

    // Calculate base fee in lamports (1 SOL = 1e9 lamports)
    let totalFee = 0.05; // Base fee
    if (data.authorities) {
      if (data.authorities.freezeAuthority) totalFee += 0.1;
      if (data.authorities.mintAuthority) totalFee += 0.1;
      if (data.authorities.updateAuthority) totalFee += 0.1;
    }
    if (data.creatorName) totalFee += 0.1;
    
    const feeInLamports = totalFee * 1e9;

    // Get minimum rent for token account
    const minimumRent = await connection.getMinimumBalanceForRentExemption(82);
    console.log("Minimum rent required:", minimumRent / 1e9, "SOL");

    // Estimate total transaction fees
    const estimatedTxFee = 10000; // 0.00001 SOL in lamports, increased to account for all transactions

    // Calculate required balance including rent and fees
    const requiredBalance = feeInLamports + minimumRent + estimatedTxFee;

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    if (balance < requiredBalance) {
      throw new Error(`Insufficient balance. You need at least ${(requiredBalance / 1e9).toFixed(4)} SOL to create this token.`);
    }

    // Create a temporary keypair for the mint operation
    const mintKeypair = Keypair.generate();
    console.log("Generated mint keypair:", mintKeypair.publicKey.toBase58());

    // Get the recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

    // Create a combined transaction that:
    // 1. Sends fee to collector
    // 2. Funds the mint account
    const combinedTransaction = new Transaction().add(
      // Send fee to collector
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: feeInLamports - minimumRent - estimatedTxFee,
      }),
      // Fund mint account
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: minimumRent,
      })
    );

    combinedTransaction.recentBlockhash = blockhash;
    combinedTransaction.lastValidBlockHeight = lastValidBlockHeight;
    combinedTransaction.feePayer = new PublicKey(data.walletAddress);

    // Have the user sign the transaction
    const signedTransaction = await data.signTransaction(combinedTransaction);

    // Send and confirm combined transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });

    console.log("Fee payment and mint account funding confirmed:", signature);
    
    console.log("Creating mint account...");
    
    // Create token mint with selected authorities
    const mint = await createMint(
      connection,
      mintKeypair,
      new PublicKey(data.walletAddress), // The customer's wallet is the mint authority
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null,
      data.decimals,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Created mint:", mint.toBase58());
    
    // Get the token account of the customer's wallet address, and if it does not exist, create it
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mint,
      new PublicKey(data.walletAddress),
      undefined,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Created token account:", tokenAccount.address.toBase58());
    
    // Convert supply string to number and mint tokens
    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      mintKeypair,
      mint,
      tokenAccount.address,
      new PublicKey(data.walletAddress),
      supplyNumber,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("Token creation completed successfully!");

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      feeAmount: totalFee,
      feeTransaction: signature,
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
