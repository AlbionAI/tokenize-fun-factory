
import { Card } from "@/components/ui/card";

interface TokenCreationStep3Props {
  tokenData: {
    name: string;
    symbol: string;
    description: string;
    supply: string;
    decimals: number;
  };
}

const TokenCreationStep3 = ({ tokenData }: TokenCreationStep3Props) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-6">Review & Deploy</h2>
      
      <Card className="bg-gray-700/30 border-gray-600 p-6">
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-gray-400">Name</span>
            <span className="font-medium">{tokenData.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Symbol</span>
            <span className="font-medium">{tokenData.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Supply</span>
            <span className="font-medium">{tokenData.supply}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Decimals</span>
            <span className="font-medium">{tokenData.decimals}</span>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-600">
          <h3 className="text-lg font-semibold mb-2">Description</h3>
          <p className="text-gray-400">{tokenData.description}</p>
        </div>
      </Card>

      <div className="bg-gray-700/30 border border-gray-600 rounded-lg p-4 mt-6">
        <p className="text-sm text-gray-400">
          Creation Fee: 0.1 SOL
        </p>
      </div>
    </div>
  );
};

export default TokenCreationStep3;
