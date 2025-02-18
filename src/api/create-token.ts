
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

// Your fee collector wallet address
const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;

// QuickNode Endpoint (using dedicated mainnet endpoint)
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

// Token Metadata Program ID (hardcoded since we can't import it correctly)
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

// Function to create metadata instruction with proper serialization
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
  // Properly structure and serialize the metadata
  const metadataData = {
    name: name.padEnd(32),
    symbol: symbol.padEnd(10),
    uri: ''.padEnd(200),
    sellerFeeBasisPoints: 0,
    creators: creatorAddress ? [{
      address: creatorAddress,
      verified: 0, // Changed from boolean to number
      share: 100,
    }] : null,
    collection: null,
    uses: null,
  };

  // Convert the data to a buffer using a more structured approach
  const buffer = Buffer.alloc(1 + 32 + 10 + 200 + 2 + (creatorAddress ? 34 : 0));
  let offset = 0;

  // Write instruction discriminator
  buffer.writeUInt8(0, offset); // Create Metadata instruction
  offset += 1;

  // Write name, symbol, and uri with fixed lengths
  buffer.write(metadataData.name, offset, 'utf8');
  offset += 32;
  buffer.write(metadataData.symbol, offset, 'utf8');
  offset += 10;
  buffer.write(metadataData.uri, offset, 'utf8');
  offset += 200;

  // Write seller fee basis points
  buffer.writeUInt16LE(metadataData.sellerFeeBasisPoints, offset);
  offset += 2;

  // Write creators if present
  if (creatorAddress) {
    buffer.write(creatorAddress, offset, 32, 'utf8');
    offset += 32;
    buffer.writeUInt8(0, offset); // verified
    offset += 1;
    buffer.writeUInt8(100, offset); // share
  }

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
      isSigner: true, // Changed to true as mint authority must sign
      isWritable: false,
    },
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: updateAuthority,
      isSigner: true, // Changed to true as update authority must sign for creation
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new Transaction().add({
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: buffer,
  });
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
      await connection.getVersion();
    } catch (error) {
      console.error("Failed to connect to Solana:", error);
      throw new Error('Failed to connect to Solana network');
    }

    // Calculate all required costs
    const MINT_SPACE = 82;
    const TOKEN_ACCOUNT_SPACE = 165;
    const METADATA_SPACE = 679;
    
    // Updated metadata required lamports based on accurate space calculation
    const METADATA_REQUIRED_LAMPORTS = 3410880;

    // Minimum mint rent threshold
    const MIN_MINT_RENT_LAMPORTS = 2461600;

    // Get rent exemptions with minimum threshold for mint rent
    const calculatedMintRent = await connection.getMinimumBalanceForRentExemption(MINT_SPACE);
    const mintRent = Math.max(calculatedMintRent, MIN_MINT_RENT_LAMPORTS);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);
    
    // Calculate service fee
    let serviceFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) serviceFee += 0.1;
      if (data.authorities.mintAuthority) serviceFee += 0.1;
      if (data.authorities.updateAuthority) serviceFee += 0.1;
    }
    if (data.creatorName) serviceFee += 0.1;
    
    const serviceFeeInLamports = serviceFee * 1e9;

    // Calculate transaction fees
    const TX_FEE = 5000;
    const NUM_TRANSACTIONS = 4;
    const estimatedTxFees = TX_FEE * NUM_TRANSACTIONS;

    // Calculate total required balance
    const totalRequired = serviceFeeInLamports + 
                         mintRent + 
                         tokenAccountRent + 
                         METADATA_REQUIRED_LAMPORTS +
                         estimatedTxFees;

    console.log("Cost breakdown (in lamports):", {
      serviceFee: serviceFeeInLamports,
      mintRent,
      tokenAccountRent,
      metadataRent: METADATA_REQUIRED_LAMPORTS,
      estimatedTxFees,
      totalRequired
    });

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    
    if (balance < totalRequired) {
      const requiredSOL = (totalRequired / 1e9).toFixed(4);
      throw new Error(
        `Insufficient balance. Required ${requiredSOL} SOL for:\n` +
        `- Service fee: ${(serviceFee).toFixed(4)} SOL\n` +
        `- Mint account rent: ${(mintRent / 1e9).toFixed(4)} SOL\n` +
        `- Token account rent: ${(tokenAccountRent / 1e9).toFixed(4)} SOL\n` +
        `- Metadata rent: ${(METADATA_REQUIRED_LAMPORTS / 1e9).toFixed(4)} SOL\n` +
        `- Transaction fees: ${(estimatedTxFees / 1e9).toFixed(4)} SOL`
      );
    }

    console.log("Step 1: Paying service fee...");
    
    // Create a fee transfer transaction
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      })
    );

    // Get fresh blockhash for fee transaction
    const feeBlockhash = await connection.getLatestBlockhash('finalized');
    feeTransaction.recentBlockhash = feeBlockhash.blockhash;
    feeTransaction.lastValidBlockHeight = feeBlockhash.lastValidBlockHeight;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    // Sign and send fee transaction
    const signedTransaction = await data.signTransaction(feeTransaction);
    const feeSignature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    // Wait for fee transaction confirmation
    await connection.confirmTransaction({
      signature: feeSignature,
      blockhash: feeBlockhash.blockhash,
      lastValidBlockHeight: feeBlockhash.lastValidBlockHeight
    });

    console.log("Fee payment confirmed:", feeSignature);

    // Create a temporary keypair for the mint operation
    const mintKeypair = Keypair.generate();
    
    // Get metadata PDA
    const metadataAddress = getMetadataPDA(mintKeypair.publicKey);

    // Fund the metadata account
    console.log("Funding metadata account with exact amount:", METADATA_REQUIRED_LAMPORTS);
    const fundMetadataAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: metadataAddress,
        lamports: METADATA_REQUIRED_LAMPORTS,
      })
    );

    // Get fresh blockhash for metadata funding
    const metadataBlockhash = await connection.getLatestBlockhash('finalized');
    fundMetadataAccountTx.recentBlockhash = metadataBlockhash.blockhash;
    fundMetadataAccountTx.lastValidBlockHeight = metadataBlockhash.lastValidBlockHeight;
    fundMetadataAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedMetadataFundingTx = await data.signTransaction(fundMetadataAccountTx);
    const metadataFundingSignature = await connection.sendRawTransaction(signedMetadataFundingTx.serialize());
    
    // Wait for metadata funding confirmation
    await connection.confirmTransaction({
      signature: metadataFundingSignature,
      blockhash: metadataBlockhash.blockhash,
      lastValidBlockHeight: metadataBlockhash.lastValidBlockHeight
    });

    console.log("Metadata account funded:", metadataFundingSignature);

    console.log("Step 2: Funding mint account...");
    
    // Fund the mint account with fresh blockhash
    const fundMintAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: mintRent,
      })
    );
    
    // Get fresh blockhash for mint funding
    const mintFundBlockhash = await connection.getLatestBlockhash('finalized');
    fundMintAccountTx.recentBlockhash = mintFundBlockhash.blockhash;
    fundMintAccountTx.lastValidBlockHeight = mintFundBlockhash.lastValidBlockHeight;
    fundMintAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedFundingTx = await data.signTransaction(fundMintAccountTx);
    const fundingSignature = await connection.sendRawTransaction(signedFundingTx.serialize());
    
    // Wait for mint funding confirmation
    await connection.confirmTransaction({
      signature: fundingSignature,
      blockhash: mintFundBlockhash.blockhash,
      lastValidBlockHeight: mintFundBlockhash.lastValidBlockHeight
    });
    
    // Create token mint with selected authorities
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

    // Create metadata instruction
    const createMetadataIx = createMetadataInstruction(
      metadataAddress,
      mint,
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      new PublicKey(data.walletAddress),
      data.name,
      data.symbol,
      data.creatorName ? data.walletAddress : undefined
    );

    // Create and send metadata transaction
    const metadataInstrBlockhash = await connection.getLatestBlockhash('finalized');
    createMetadataIx.recentBlockhash = metadataInstrBlockhash.blockhash;
    createMetadataIx.feePayer = new PublicKey(data.walletAddress);

    const signedMetadataTransaction = await data.signTransaction(createMetadataIx);
    const metadataSignature = await connection.sendRawTransaction(signedMetadataTransaction.serialize());
    await connection.confirmTransaction({
      signature: metadataSignature,
      blockhash: metadataInstrBlockhash.blockhash,
      lastValidBlockHeight: metadataInstrBlockhash.lastValidBlockHeight
    });

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
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: serviceFee,
      feeTransaction: feeSignature,
    };
  } catch (error) {
    console.error('Error in createToken:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
