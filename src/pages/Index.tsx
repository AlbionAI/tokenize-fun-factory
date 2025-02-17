
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import TokenCreationStep1 from "@/components/TokenCreationStep1";
import TokenCreationStep2 from "@/components/TokenCreationStep2";
import TokenCreationStep3 from "@/components/TokenCreationStep3";
import StepIndicator from "@/components/StepIndicator";
import "@solana/wallet-adapter-react-ui/styles.css";

const Index = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const { connected } = useWallet();
  const [tokenData, setTokenData] = useState({
    name: "",
    symbol: "",
    description: "",
    supply: "",
    decimals: 9,
    logo: null as File | null,
    website: "",
    twitter: "",
    telegram: "",
    discord: "",
    creatorName: "",
    creatorWebsite: "",
    authorities: {
      freezeAuthority: false,
      mintAuthority: false,
      updateAuthority: false
    }
  });

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateTokenData = (data: Partial<typeof tokenData>) => {
    setTokenData({ ...tokenData, ...data });
  };

  return (
    <div className="min-h-screen bg-[#0B1221] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 space-y-4 animate-fade-in">
          <h1 className="text-5xl font-bold mb-4">Launch a Meme Coin At Lightning Speed!</h1>
          <p className="text-[#8B96A5] text-xl">No coding required, launched in seconds the professional way</p>
        </div>

        <div className="mb-8">
          <StepIndicator currentStep={currentStep} totalSteps={3} />
        </div>

        <Card className="bg-[#131B2E] border-[#1C2539] p-8 rounded-xl shadow-xl">
          <div className="mb-6 flex justify-end">
            <WalletMultiButton className="!bg-[#00B679] hover:!bg-[#00A069] transition-colors" />
          </div>

          {!connected ? (
            <div className="text-center py-12">
              <h2 className="text-3xl font-semibold mb-4">Connect Your Wallet</h2>
              <p className="text-[#8B96A5] text-lg">Connect your Solana wallet to start creating your token</p>
            </div>
          ) : (
            <div className="space-y-8">
              {currentStep === 1 && (
                <TokenCreationStep1 tokenData={tokenData} updateTokenData={updateTokenData} />
              )}
              {currentStep === 2 && (
                <TokenCreationStep2 tokenData={tokenData} updateTokenData={updateTokenData} />
              )}
              {currentStep === 3 && (
                <TokenCreationStep3 tokenData={tokenData} updateTokenData={updateTokenData} />
              )}

              <div className="flex justify-between pt-6">
                {currentStep > 1 && (
                  <Button
                    onClick={handlePrevStep}
                    variant="outline"
                    className="bg-transparent border-[#1C2539] hover:bg-[#1C2539] text-white"
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={currentStep === 3 ? () => console.log("Create token", tokenData) : handleNextStep}
                  className="ml-auto bg-[#00B679] hover:bg-[#00A069]"
                >
                  {currentStep === 3 ? "Create Token" : "Next"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Index;
