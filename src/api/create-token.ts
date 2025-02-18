
import { Connection, PublicKey, Transaction, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { 
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';

const FEE_COLLECTOR_WALLET = import.meta.env.VITE_FEE_COLLECTOR_WALLET;
const QUICKNODE_ENDPOINT = import.meta.env.VITE_QUICKNODE_ENDPOINT;

const getFormattedEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    throw new Error('QuickNode endpoint is not configured');
  }
  return !endpoint.startsWith('http://') && !endpoint.startsWith('https://')
    ? `https://${endpoint}`
    : endpoint;
};

// Helper function to wait for transaction confirmation
const confirmTransaction = async (connection: Connection, signature: string) => {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    signature: signature
  }, 'confirmed');
};

// Helper function to derive metadata PDA
const getMetadataPDA = (mint: PublicKey) => {
  const [metadata] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return metadata;
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

    // Calculate fees
    let totalFee = 0.05; // Base fee
    if (data.authorities) {
      if (data.authorities.freezeAuthority) totalFee += 0.1;
      if (data.authorities.mintAuthority) totalFee += 0.1;
      if (data.authorities.updateAuthority) totalFee += 0.1;
    }
    if (data.creatorName) totalFee += 0.1;
    
    const feeInLamports = totalFee * LAMPORTS_PER_SOL;
    
    // Get minimum rent for accounts
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);
    const metadataRent = await connection.getMinimumBalanceForRentExemption(679); // Size for metadata account
    
    // Calculate total required lamports
    const totalRequired = feeInLamports + mintRent + tokenAccountRent + metadataRent;

    // Check wallet balance
    const balance = await connection.getBalance(new PublicKey(data.walletAddress));
    if (balance < totalRequired) {
      throw new Error(`Insufficient balance. Required: ${(totalRequired / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    }

    // Create a temporary keypair for the mint
    const mintKeypair = Keypair.generate();

    // Step 1: Send fees and fund mint account
    console.log('Step 1: Sending fees and funding mint account...');
    const fundingTx = new Transaction();
    
    if (FEE_COLLECTOR_WALLET) {
      fundingTx.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(data.walletAddress),
          toPubkey: new PublicKey(FEE_COLLECTOR_WALLET),
          lamports: feeInLamports,
        })
      );
    }

    fundingTx.add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(data.walletAddress),
        toPubkey: mintKeypair.publicKey,
        lamports: mintRent + tokenAccountRent + metadataRent,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    fundingTx.recentBlockhash = blockhash;
    fundingTx.feePayer = new PublicKey(data.walletAddress);

    const signedFundingTx = await data.signTransaction(fundingTx);
    const fundingSignature = await connection.sendRawTransaction(signedFundingTx.serialize());
    await confirmTransaction(connection, fundingSignature);
    console.log('Funding transaction confirmed');

    // Step 2: Create and initialize the token mint
    console.log('Step 2: Creating mint account...');
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
    console.log('Mint account created:', mint.toBase58());

    // Step 3: Create metadata account
    console.log('Step 3: Creating metadata account...');
    const metadataPDA = getMetadataPDA(mint);
    const metadataTx = new Transaction().add(
      createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataPDA,
          mint: mint,
          mintAuthority: new PublicKey(data.walletAddress),
          payer: new PublicKey(data.walletAddress),
          updateAuthority: new PublicKey(data.walletAddress),
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: data.name,
              symbol: data.symbol,
              uri: '',
              sellerFeeBasisPoints: 0,
              creators: data.creatorName ? [{
                address: new PublicKey(data.walletAddress),
                verified: true,
                share: 100
              }] : null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      )
    );

    metadataTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    metadataTx.feePayer = new PublicKey(data.walletAddress);
    
    const signedMetadataTx = await data.signTransaction(metadataTx);
    const metadataSignature = await connection.sendRawTransaction(signedMetadataTx.serialize());
    await confirmTransaction(connection, metadataSignature);
    console.log('Metadata account created:', metadataPDA.toBase58());

    // Step 4: Create associated token account with retries
    console.log('Step 4: Creating associated token account...');
    let tokenAccount;
    let retries = 3;
    while (retries > 0) {
      try {
        tokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          mintKeypair,
          mint,
          new PublicKey(data.walletAddress)
        );
        console.log('Token account created:', tokenAccount.address.toBase58());
        break;
      } catch (error) {
        console.log(`Retry ${4 - retries} - Error creating token account:`, error);
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      }
    }

    if (!tokenAccount) {
      throw new Error('Failed to create token account after retries');
    }

    // Step 5: Mint tokens
    console.log('Step 5: Minting tokens...');
    const supplyNumber = parseInt(data.supply.replace(/,/g, ''));
    const mintSignature = await mintTo(
      connection,
      mintKeypair,
      mint,
      tokenAccount.address,
      new PublicKey(data.walletAddress),
      supplyNumber
    );
    await confirmTransaction(connection, mintSignature);
    console.log('Tokens minted successfully');

    return {
      success: true,
      tokenAddress: mint.toBase58(),
      feeAmount: totalFee,
    };
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}
