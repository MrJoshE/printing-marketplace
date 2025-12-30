// src/components/create-listing/listing-stepper.tsx
import { cn } from "@/lib/utils";

interface Step {
  id: number;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

export function ListingStepper({ steps, currentStep }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;

          return (
            <li key={step.id} className="md:flex-1">
              <div
                className={cn(
                  "group flex flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4 transition-colors",
                  isCompleted || isCurrent ? "border-primary" : "border-muted"
                )}
              >
                <span className={cn(
                    "text-xs font-semibold uppercase tracking-wide",
                     isCompleted || isCurrent ? "text-primary" : "text-muted-foreground"
                )}>
                  Step {step.id}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}