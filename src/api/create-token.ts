import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
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
  const metadataData = {
    name: name.padEnd(32),
    symbol: symbol.padEnd(10),
    uri: ''.padEnd(200),
    sellerFeeBasisPoints: 0,
    creators: creatorAddress ? [{
      address: new PublicKey(creatorAddress),
      verified: 0,
      share: 100,
    }] : null,
    collection: null,
    uses: null,
  };

  const buffer = Buffer.alloc(1 + 32 + 10 + 200 + 2 + (creatorAddress ? 34 : 0));
  let offset = 0;

  buffer.writeUInt8(0, offset); // Create Metadata instruction
  offset += 1;

  buffer.write(metadataData.name, offset, 'utf8');
  offset += 32;
  buffer.write(metadataData.symbol, offset, 'utf8');
  offset += 10;
  buffer.write(metadataData.uri, offset, 'utf8');
  offset += 200;

  buffer.writeUInt16LE(metadataData.sellerFeeBasisPoints, offset);
  offset += 2;

  if (creatorAddress) {
    const creatorPubkey = new PublicKey(creatorAddress);
    creatorPubkey.toBuffer().copy(buffer, offset);
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
      isSigner: true,
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

    const MINT_SPACE = 82;
    const TOKEN_ACCOUNT_SPACE = 165;
    const METADATA_SPACE = 679;
    
    const METADATA_REQUIRED_LAMPORTS = 3410880;
    const MIN_MINT_RENT_LAMPORTS = 2461600;

    const calculatedMintRent = await connection.getMinimumBalanceForRentExemption(MINT_SPACE);
    const mintRent = Math.max(calculatedMintRent, MIN_MINT_RENT_LAMPORTS);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);
    
    let serviceFee = 0.05;
    if (data.authorities) {
      if (data.authorities.freezeAuthority) serviceFee += 0.1;
      if (data.authorities.mintAuthority) serviceFee += 0.1;
      if (data.authorities.updateAuthority) serviceFee += 0.1;
    }
    if (data.creatorName) serviceFee += 0.1;
    
    const serviceFeeInLamports = serviceFee * 1e9;

    const TX_FEE = 5000;
    const NUM_TRANSACTIONS = 4;
    const estimatedTxFees = TX_FEE * NUM_TRANSACTIONS;

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

    const latestBlockhash = await connection.getLatestBlockhash('finalized');
    console.log("Got fresh blockhash:", latestBlockhash.blockhash);

    console.log("Step 1: Paying service fee...");
    const feeTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
        lamports: serviceFeeInLamports,
      })
    );

    feeTransaction.recentBlockhash = latestBlockhash.blockhash;
    feeTransaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    feeTransaction.feePayer = new PublicKey(data.walletAddress);

    const signedTransaction = await data.signTransaction(feeTransaction);
    const feeSignature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    const confirmationStrategy = {
      signature: feeSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    };

    console.log("Waiting for fee transaction confirmation...");
    const confirmation = await connection.confirmTransaction(confirmationStrategy);
    
    if (confirmation.value.err) {
      throw new Error(`Fee transaction failed: ${confirmation.value.err}`);
    }

    console.log("Fee payment confirmed:", feeSignature);

    const mintKeypair = Keypair.generate();
    
    const metadataAddress = getMetadataPDA(mintKeypair.publicKey);

    const metadataBlockhash = await connection.getLatestBlockhash('finalized');
    console.log("Got fresh blockhash for metadata transaction:", metadataBlockhash.blockhash);

    console.log("Funding metadata account with exact amount:", METADATA_REQUIRED_LAMPORTS);
    const fundMetadataAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: metadataAddress,
        lamports: METADATA_REQUIRED_LAMPORTS,
      })
    );

    fundMetadataAccountTx.recentBlockhash = metadataBlockhash.blockhash;
    fundMetadataAccountTx.lastValidBlockHeight = metadataBlockhash.lastValidBlockHeight;
    fundMetadataAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedMetadataFundingTx = await data.signTransaction(fundMetadataAccountTx);
    const metadataFundingSignature = await connection.sendRawTransaction(signedMetadataFundingTx.serialize());
    
    const metadataConfirmationStrategy = {
      signature: metadataFundingSignature,
      blockhash: metadataBlockhash.blockhash,
      lastValidBlockHeight: metadataBlockhash.lastValidBlockHeight
    };

    console.log("Waiting for metadata funding confirmation...");
    const metadataConfirmation = await connection.confirmTransaction(metadataConfirmationStrategy);
    
    if (metadataConfirmation.value.err) {
      throw new Error(`Metadata funding failed: ${metadataConfirmation.value.err}`);
    }

    const mintFundBlockhash = await connection.getLatestBlockhash('finalized');
    console.log("Got fresh blockhash for mint funding:", mintFundBlockhash.blockhash);

    console.log("Step 2: Funding mint account...");
    const fundMintAccountTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: mintRent,
      })
    );
    
    fundMintAccountTx.recentBlockhash = mintFundBlockhash.blockhash;
    fundMintAccountTx.lastValidBlockHeight = mintFundBlockhash.lastValidBlockHeight;
    fundMintAccountTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedFundingTx = await data.signTransaction(fundMintAccountTx);
    const fundingSignature = await connection.sendRawTransaction(signedFundingTx.serialize());
    
    const mintFundingConfirmationStrategy = {
      signature: fundingSignature,
      blockhash: mintFundBlockhash.blockhash,
      lastValidBlockHeight: mintFundBlockhash.lastValidBlockHeight
    };

    console.log("Waiting for mint funding confirmation...");
    const mintFundingConfirmation = await connection.confirmTransaction(mintFundingConfirmationStrategy);
    
    if (mintFundingConfirmation.value.err) {
      throw new Error(`Mint funding failed: ${mintFundingConfirmation.value.err}`);
    }

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
