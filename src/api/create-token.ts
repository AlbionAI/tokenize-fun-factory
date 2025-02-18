import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

// Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Ensure the endpoint starts with https://
const getFormattedEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    throw new Error('QuickNode endpoint is not configured');
  }
  
  return !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
};

// Function to derive metadata PDA
const getMetadataPDA = (mint: PublicKey): PublicKey => {
  const [publicKey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return publicKey;
};

// Function to create metadata instruction
const createMetadataInstruction = (
  metadata: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  creatorAddress?: string
) => {
  const data = {
    name,
    symbol,
    uri: '',
    sellerFeeBasisPoints: 0,
    creators: creatorAddress ? [{
      address: creatorAddress,
      verified: false,
      share: 100,
    }] : null,
    collection: null,
    uses: null,
  };

  const keys = [
    {
      pubkey: metadata,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mint,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mintAuthority,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: updateAuthority,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  return {
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: Buffer.from([
      0,
      ...Buffer.from(JSON.stringify(data)),
    ]),
  };
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
    const formattedEndpoint = getFormattedEndpoint(QUICKNODE_ENDPOINT);
    const connection = new Connection(formattedEndpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 120000 // 2 minutes timeout
    });

    // Get the latest blockhash once for all transactions
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

    // Calculate all required costs
    const MINT_SPACE = 82;
    const TOKEN_ACCOUNT_SPACE = 165;
    const METADATA_SPACE = 679;
    
    const [metadataRentExemption, mintRent, tokenAccountRent] = await Promise.all([
      connection.getMinimumBalanceForRentExemption(METADATA_SPACE),
      connection.getMinimumBalanceForRentExemption(MINT_SPACE),
      connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE)
    ]);
    
    // Calculate service fee
    let serviceFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) serviceFee += 0.1;
      if (data.authorities.mintAuthority) serviceFee += 0.1;
      if (data.authorities.updateAuthority) serviceFee += 0.1;
    }
    if (data.creatorName) serviceFee += 0.1;
    
    const serviceFeeInLamports = serviceFee * 1e9;
    const estimatedTxFees = 5000 * 2; // Reduced number of transactions
    const totalRequired = serviceFeeInLamports + mintRent + tokenAccountRent + metadataRentExemption + estimatedTxFees;

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    
    if (balance < totalRequired) {
      throw new Error(`Insufficient balance. Required ${(totalRequired / 1e9).toFixed(4)} SOL`);
    }

    // Create a temporary keypair for the mint operation
    const mintKeypair = Keypair.generate();
    const metadataAddress = getMetadataPDA(mintKeypair.publicKey);

    // Batch all setup instructions into a single transaction
    const setupTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      }),
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: metadataAddress,
        lamports: metadataRentExemption,
      }),
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: mintRent,
      })
    );

    setupTransaction.recentBlockhash = blockhash;
    setupTransaction.feePayer = new PublicKey(data.walletAddress);
    
    const signedSetupTransaction = await data.signTransaction(setupTransaction);
    const setupSignature = await connection.sendRawTransaction(signedSetupTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    // Wait for setup transaction to confirm
    await connection.confirmTransaction({
      signature: setupSignature,
      blockhash,
      lastValidBlockHeight
    });

    // Create token mint with authorities
    const mint = await createMint(
      connection,
      mintKeypair,
      new PublicKey(data.walletAddress),
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null,
      data.decimals,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create metadata and mint tokens in final transaction
    const finalTransaction = new Transaction();

    // Add metadata instruction
    finalTransaction.add(createMetadataInstruction(
      metadataAddress,
      mint,
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      data.name,
      data.symbol,
      data.creatorName ? data.walletAddress : undefined
    ));

    finalTransaction.recentBlockhash = blockhash;
    finalTransaction.feePayer = new PublicKey(data.walletAddress);

    const signedFinalTransaction = await data.signTransaction(finalTransaction);
    const finalSignature = await connection.sendRawTransaction(signedFinalTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    await connection.confirmTransaction({
      signature: finalSignature,
      blockhash,
      lastValidBlockHeight
    });

    // Create token account and mint tokens
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mint,
      new PublicKey(data.walletAddress)
    );

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

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: serviceFee,
      feeTransaction: setupSignature,
    };
  } catch (error) {
    throw error;
  }
}
