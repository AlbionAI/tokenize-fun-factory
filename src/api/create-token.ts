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
  uri: string = ''
) => {
  const metadataData = {
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null
  };

  const buffer = Buffer.alloc(1 + name.length + symbol.length + uri.length + 2);
  let offset = 0;

  // Write instruction discriminator for create metadata
  buffer.writeUInt8(0, offset);
  offset += 1;

  // Write name
  buffer.write(name, offset);
  offset += name.length;

  // Write symbol
  buffer.write(symbol, offset);
  offset += symbol.length;

  // Write uri
  buffer.write(uri, offset);

  return new Transaction().add({
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
    data: buffer
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
    const connection = new Connection(getFormattedEndpoint(QUICKNODE_ENDPOINT), 'confirmed');
    const mintKeypair = Keypair.generate();
    const userPublicKey = new PublicKey(data.walletAddress);
    
    // Step 1: Fund mint account and initialize it
    console.log("Step 1: Creating and funding mint account...");
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    let transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: userPublicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: 82,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      })
    );

    let latestBlockhash = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = userPublicKey;
    transaction.sign(mintKeypair);

    let signedTransaction = await data.signTransaction(transaction);
    let signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });

    // Initialize mint
    console.log("Initializing mint...");
    const mint = await createMint(
      connection,
      mintKeypair,
      userPublicKey,
      data.authorities?.freezeAuthority ? userPublicKey : null,
      data.decimals,
      mintKeypair
    );

    // Step 2: Create metadata
    console.log("Step 2: Creating metadata...");
    const metadataAddress = getMetadataPDA(mint);
    
    const metadataIx = createMetadataInstruction(
      metadataAddress,
      mint,
      userPublicKey,
      userPublicKey,
      userPublicKey,
      data.name,
      data.symbol
    );

    latestBlockhash = await connection.getLatestBlockhash('finalized');
    metadataIx.recentBlockhash = latestBlockhash.blockhash;
    metadataIx.feePayer = userPublicKey;

    signedTransaction = await data.signTransaction(metadataIx);
    signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    });

    // Step 3: Create token account and mint tokens
    console.log("Step 3: Creating token account and minting tokens...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      mintKeypair,
      mint,
      userPublicKey
    );

    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    await mintTo(
      connection,
      mintKeypair,
      mint,
      tokenAccount.address,
      userPublicKey,
      supplyNumber
    );

    console.log("Token creation completed successfully!");
    return {
      success: true,
      tokenAddress: mint.toBase58(),
      metadataAddress: metadataAddress.toBase58(),
      feeAmount: 0.05, // Simplified fee structure for testing
      feeTransaction: signature,
    };

  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
