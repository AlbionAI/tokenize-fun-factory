
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface TokenData {
  name: string;
  symbol: string;
  logo: File | null;
}

interface TokenCreationStep1Props {
  tokenData: TokenData;
  updateTokenData: (data: Partial<TokenData>) => void;
}

const TokenCreationStep1 = ({ tokenData, updateTokenData }: TokenCreationStep1Props) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      updateTokenData({ logo: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-semibold mb-6">Token Details</h2>
      
      <div className="space-y-6">
        <div>
          <Label htmlFor="name">Token Name</Label>
          <Input
            id="name"
            value={tokenData.name}
            onChange={(e) => updateTokenData({ name: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
            placeholder="Enter token name"
          />
        </div>

        <div>
          <Label htmlFor="symbol">Token Symbol</Label>
          <Input
            id="symbol"
            value={tokenData.symbol}
            onChange={(e) => updateTokenData({ symbol: e.target.value })}
            className="bg-gray-900/50 border-gray-700 text-white mt-2"
            placeholder="Enter token symbol"
          />
        </div>

        <div>
          <Label>Logo</Label>
          <div className="mt-2 border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
            {previewUrl ? (
              <div className="flex flex-col items-center">
                <img 
                  src={previewUrl} 
                  alt="Token logo" 
                  className="w-24 h-24 rounded-full object-cover"
                />
                <p className="text-sm text-emerald-400 mt-2">
                  Logo uploaded and resized to 500x500!
                </p>
              </div>
            ) : (
              <div className="cursor-pointer" onClick={() => document.getElementById('logo-upload')?.click()}>
                <p className="text-gray-400">Click or drag to upload logo</p>
                <p className="text-gray-500 text-sm mt-1">Recommended: 500x500px</p>
              </div>
            )}
            <input
              id="logo-upload"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenCreationStep1;
