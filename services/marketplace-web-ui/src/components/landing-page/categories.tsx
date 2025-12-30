import { AVAILABLE_CATEGORIES, type CategoryFilter } from "@/lib/api/models";
import CategoryItem from "./category-item";

interface CategoriesProps {
  // Ideally, pass the available categories in. Default to constant if not provided.
  items?: CategoryFilter[]; 
  selected: CategoryFilter[];
  onSelect: (categories: CategoryFilter[]) => void;
}

export default function Categories({ 
  items = AVAILABLE_CATEGORIES, 
  selected, 
  onSelect 
}: CategoriesProps) {
    
  // "All" is active if the selected array is empty
  const isAllSelected = selected.length === 0;

  const handleSelect = (category: CategoryFilter) => {

    // SCENARIO 1: User clicked "All Categories"
    if (category.value === null) {
      onSelect([]); // Clear all filters
      return;
    }

    // SCENARIO 2: User clicked a specific category
    // Check if currently selected by matching VALUES (safer than object reference)
    const isAlreadySelected = selected.some((c) => c.value === category.value);

    let newSelection: CategoryFilter[];

    if (isAlreadySelected) {
      newSelection = selected.filter((c) => c.value !== category.value);
    } else {
      newSelection = [...selected, category];
    }

    onSelect(newSelection);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* 1. Render the 'All Categories' option explicitly */}
      <CategoryItem
        name="All Categories"
        isSelected={isAllSelected}
        onClick={() => handleSelect({ value: null, label: "All Categories" })}
      />

      {/* 2. Render the dynamic categories */}
      {items.map((category) => {
        const isSelected = selected.some((s) => s.value === category.value);
        return (
          <CategoryItem
            key={category.value}
            name={category.label}
            isSelected={isSelected}
            onClick={() => handleSelect(category)}
          />
        );
      })}
    </div>
  );
}