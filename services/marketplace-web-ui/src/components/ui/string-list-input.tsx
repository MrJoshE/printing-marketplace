import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";

interface StringListInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
}

export function StringListInput({ value = [], onChange, placeholder }: StringListInputProps) {
    const [inputValue, setInputValue] = useState("");

    // Helper to add value and clear input
    const addValues = (text: string) => {
        // Split by comma, trim whitespace, remove empty strings
        const newValues = text
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        if (newValues.length === 0) return;

        // Combine with existing (prevent duplicates if you want, currently allowing)
        const uniqueNewValues = newValues.filter(v => !value.includes(v));
        
        if (uniqueNewValues.length > 0) {
            onChange([...value, ...uniqueNewValues]);
        }
        setInputValue("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        // If Enter is pressed, add the current text
        if (e.key === "Enter") {
            e.preventDefault();
            addValues(inputValue);
        }
        // If Backspace is pressed and input is empty, remove the last item
        if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
            const newValue = [...value];
            newValue.pop();
            onChange(newValue);
        }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // If the user typed a comma, add the text before it
        if (val.includes(",")) {
            addValues(val);
        } else {
            setInputValue(val);
        }
    };

    // On blur, we should probably save whatever is left in the box
    const handleBlur = () => {
        if (inputValue.trim()) {
            addValues(inputValue);
        }
    };

    const removeValue = (indexToRemove: number) => {
        onChange(value.filter((_, index) => index !== indexToRemove));
    };

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex min-h-[2.5rem] w-full flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                {value.map((item, index) => (
                    <Badge key={`${item}-${index}`} variant="secondary" className="gap-1 pr-1">
                        {item}
                        <button
                            type="button"
                            onClick={() => removeValue(index)}
                            className="ml-1 rounded-full text-muted-foreground hover:text-foreground focus:outline-none"
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {item}</span>
                        </button>
                    </Badge>
                ))}
                <input
                    className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[120px]"
                    value={inputValue}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    placeholder={value.length === 0 ? placeholder : ""}
                />
            </div>
            <p className="text-[10px] text-muted-foreground">
                Separate materials with a comma (e.g. PLA, PETG, ABS)
            </p>
        </div>
    );
}