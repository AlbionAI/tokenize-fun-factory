
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import TokenCreationStep1 from "@/components/TokenCreationStep1";
import TokenCreationStep2 from "@/components/TokenCreationStep2";
import TokenCreationStep3 from "@/components/TokenCreationStep3";
import StepIndicator from "@/components/StepIndicator";

require("@solana/wallet-adapter-react-ui/styles.css");

const Index = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const { connected } = useWallet();
  const [tokenData, setTokenData] = useState({
    name: "",
    symbol: "",
    description: "",
    supply: "",
    decimals: 9,
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 space-y-4 animate-fade-in">
          <h1 className="text-4xl font-bold">Create Your Solana Token</h1>
          <p className="text-gray-400">Launch your token in minutes with our simple three-step process</p>
        </div>

        <div className="mb-8">
          <StepIndicator currentStep={currentStep} totalSteps={3} />
        </div>

        <Card className="bg-gray-800/50 backdrop-blur-lg border-gray-700 p-8 rounded-xl shadow-xl">
          <div className="mb-6 flex justify-end">
            <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 transition-colors" />
          </div>

          {!connected ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-semibold mb-4">Connect Your Wallet to Start</h2>
              <p className="text-gray-400">You need to connect your Solana wallet to create a token</p>
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
                <TokenCreationStep3 tokenData={tokenData} />
              )}

              <div className="flex justify-between pt-6">
                {currentStep > 1 && (
                  <Button
                    onClick={handlePrevStep}
                    variant="outline"
                    className="bg-transparent border-gray-600 hover:bg-gray-700"
                  >
                    Previous
                  </Button>
                )}
                {currentStep < 3 ? (
                  <Button
                    onClick={handleNextStep}
                    className="ml-auto bg-purple-600 hover:bg-purple-700"
                  >
                    Next Step
                  </Button>
                ) : (
                  <Button
                    onClick={() => console.log("Create token", tokenData)}
                    className="ml-auto bg-purple-600 hover:bg-purple-700"
                  >
                    Create Token
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Index;
