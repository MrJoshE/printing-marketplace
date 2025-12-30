import { cn } from "@/lib/utils"; // Standard in shadcn projects
import { Button } from "../ui/button";

interface CategoryItemProps {
  name: string;
  onClick: () => void;
  isSelected: boolean;
  className?: string;
}

export default function CategoryItem({
  name,
  onClick,
  isSelected,
  className,
}: CategoryItemProps) {
  return (
    <Button
      variant={isSelected ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        // Add specific 3D print styling tweaks here if needed
        "rounded-md transition-all duration-200 p-4 px-6", 
        isSelected ? "shadow-md" : "hover:bg-muted",
        className
      )}
      size="default"
    >
      {name}
    </Button>
  );
}