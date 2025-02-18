import { Connection, PublicKey, Transaction, SystemProgram, Keypair, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';

const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const getFormattedEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    throw new Error('QuickNode endpoint is not configured');
  }
  
  return !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
};

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

const fetchMetadata = async (connection: Connection, metadataPDA: PublicKey) => {
  try {
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    if (!accountInfo) {
      throw new Error('Metadata account not found');
    }
    return accountInfo;
  } catch (error) {
    console.error('Error fetching metadata:', error);
    throw error;
  }
};

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
  // Create metadata JSON
  const uri = JSON.stringify({
    name,
    symbol,
    description: `${name} token`,
    image: '', // Optional: Add image URL if available
    attributes: [],
    properties: {
      files: [],
      creators: creatorAddress ? [{
        address: creatorAddress,
        verified: true,
        share: 100
      }] : []
    }
  });

  // Calculate buffer size (fixed size + variable parts)
  const nameBuffer = Buffer.from(name);
  const symbolBuffer = Buffer.from(symbol);
  const uriBuffer = Buffer.from(uri);
  
  const bufferSize = 1 + // Instruction discriminator
    32 + // Name max length
    10 + // Symbol max length
    200 + // URI max length
    2 + // Seller fee basis points (u16)
    1 + // Creator present bool
    (creatorAddress ? 34 : 0); // Creator data if present

  const buffer = Buffer.alloc(bufferSize);
  let offset = 0;

  // Write instruction discriminator (create metadata instruction)
  buffer.writeUInt8(33, offset);
  offset += 1;

  // Write name with length prefix
  nameBuffer.copy(buffer, offset, 0, Math.min(nameBuffer.length, 32));
  offset += 32;

  // Write symbol with length prefix
  symbolBuffer.copy(buffer, offset, 0, Math.min(symbolBuffer.length, 10));
  offset += 10;

  // Write URI with length prefix
  uriBuffer.copy(buffer, offset, 0, Math.min(uriBuffer.length, 200));
  offset += 200;

  // Write seller fee basis points (0)
  buffer.writeUInt16LE(0, offset);
  offset += 2;

  // Write creator presence
  buffer.writeUInt8(creatorAddress ? 1 : 0, offset);
  offset += 1;

  // Write creator data if present
  if (creatorAddress) {
    const creatorPubkey = new PublicKey(creatorAddress);
    creatorPubkey.toBuffer().copy(buffer, offset);
    offset += 32;
    buffer.writeUInt8(1, offset); // verified = true
    offset += 1;
    buffer.writeUInt8(100, offset); // share = 100%
  }

  const transaction = new Transaction();
  
  // Add compute budget instruction
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 400000
    })
  );

  // Add metadata instruction
  transaction.add({
    keys: [
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
      {
        pubkey: TOKEN_METADATA_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: buffer,
  });

  return transaction;
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
      walletAddress: data.walletAddress.substring(0, 4) + '...'
    });

    const formattedEndpoint = getFormattedEndpoint(QUICKNODE_ENDPOINT);
    console.log("Initializing Solana connection with endpoint");
    const connection = new Connection(formattedEndpoint, 'confirmed');

    try {
      await connection.getVersion();
    } catch (error) {
      console.error("Failed to connect to Solana:", error);
      throw new Error('Failed to connect to Solana network');
    }

    // Calculate required space and rent
    const MINT_SPACE = 82;
    const TOKEN_ACCOUNT_SPACE = 165;
    const METADATA_SPACE = 679;
    
    const METADATA_REQUIRED_LAMPORTS = 3410880;
    const MIN_MINT_RENT_LAMPORTS = 2461600;
    
    const calculatedMintRent = await connection.getMinimumBalanceForRentExemption(MINT_SPACE);
    const mintRent = Math.max(calculatedMintRent, MIN_MINT_RENT_LAMPORTS);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);

    // Calculate fees
    let baseFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) baseFee += 0.1;
      if (data.authorities.mintAuthority) baseFee += 0.1;
      if (data.authorities.updateAuthority) baseFee += 0.1;
    }
    if (data.creatorName) baseFee += 0.1;
    
    baseFee = Number(baseFee.toFixed(2));
    const serviceFeeInLamports = Math.floor(baseFee * LAMPORTS_PER_SOL);

    const TX_FEE = 5000;
    const NUM_TRANSACTIONS = 4;
    const estimatedTxFees = TX_FEE * NUM_TRANSACTIONS;

    const totalRequired = serviceFeeInLamports + 
                         mintRent + 
                         tokenAccountRent + 
                         METADATA_REQUIRED_LAMPORTS +
                         estimatedTxFees;

    // Check balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    if (balance < totalRequired) {
      const requiredSOL = (totalRequired / LAMPORTS_PER_SOL).toFixed(4);
      throw new Error(
        `Insufficient balance. Required ${requiredSOL} SOL`
      );
    }

    // Step 1: Pay service fee
    const mintKeypair = Keypair.generate();
    let latestBlockhash = await connection.getLatestBlockhash('finalized');
    
    console.log("Step 1: Paying service fee...");
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      })
    );

    feeTransaction.recentBlockhash = latestBlockhash.blockhash;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    const signedFeeTransaction = await data.signTransaction(feeTransaction);
    const feeSignature = await connection.sendRawTransaction(signedFeeTransaction.serialize());
    await connection.confirmTransaction({
      signature: feeSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });

    // Step 2: Fund and create mint account
    console.log("Step 2: Funding mint account...");
    latestBlockhash = await connection.getLatestBlockhash('finalized');
    
    const fundMintTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: new PublicKey(data.walletAddress),
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SPACE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      })
    );

    fundMintTransaction.recentBlockhash = latestBlockhash.blockhash;
    fundMintTransaction.feePayer = new PublicKey(data.walletAddress);
    fundMintTransaction.sign(mintKeypair);

    const signedMintTransaction = await data.signTransaction(fundMintTransaction);
    const mintSignature = await connection.sendRawTransaction(signedMintTransaction.serialize());
    await connection.confirmTransaction({
      signature: mintSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });

    // Initialize mint
    const mint = await createMint(
      connection,
      mintKeypair,
      new PublicKey(data.walletAddress),
      data.authorities?.freezeAuthority ? new PublicKey(data.walletAddress) : null,
      data.decimals,
      mintKeypair
    );

    // Step 3: Create metadata account after mint is initialized
    const metadataAddress = getMetadataPDA(mint);
    console.log("Step 3: Creating metadata account...");
    latestBlockhash = await connection.getLatestBlockhash('finalized');

    const metadataTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: metadataAddress,
        lamports: METADATA_REQUIRED_LAMPORTS,
      })
    );

    metadataTransaction.recentBlockhash = latestBlockhash.blockhash;
    metadataTransaction.feePayer = new PublicKey(data.walletAddress);

    const signedMetadataTransaction = await data.signTransaction(metadataTransaction);
    const metadataSignature = await connection.sendRawTransaction(signedMetadataTransaction.serialize());
    await connection.confirmTransaction({
      signature: metadataSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });

    // Step 4: Create token account and mint tokens
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
      supplyNumber
    );

    console.log("Token creation completed successfully!");

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: baseFee,
      feeTransaction: feeSignature,
    };
  } catch (error) {
    console.error('Error in createToken:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
