
interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

const StepIndicator = ({ currentStep, totalSteps }: StepIndicatorProps) => {
  return (
    <div className="flex justify-between items-center">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div key={index} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              index + 1 <= currentStep
                ? "bg-purple-600 text-white"
                : "bg-gray-700 text-gray-400"
            }`}
          >
            {index + 1}
          </div>
          {index < totalSteps - 1 && (
            <div
              className={`h-1 w-24 mx-2 transition-colors ${
                index + 1 < currentStep ? "bg-purple-600" : "bg-gray-700"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default StepIndicator;
