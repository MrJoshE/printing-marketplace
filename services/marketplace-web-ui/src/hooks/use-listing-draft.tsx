import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
export interface ListingDraft {
  title: string;
  categories: string[];
  tags: string[];
  description: string;
  printerSettings: {
    nozzleDiameter: string;
    material: string;
    supports: boolean;
  };
  dimensions: { x: string; y: string; z: string };
  complexity: "beginner" | "intermediate" | "expert";
  timeEstimate: string;
  price: number;
  isFree: boolean;
  license: "standard" | "commercial" | "open";
}

const INITIAL_DRAFT: ListingDraft = {
  title: "",
  categories: [],
  tags: [],
  description: "",
  printerSettings: {
    nozzleDiameter: "0.4mm",
    material: "PLA",
    supports: false,
  },
  dimensions: { x: "", y: "", z: "" },
  complexity: "beginner",
  timeEstimate: "",
  price: 0.00,
  isFree: true,
  license: "open",
};

export function useListingDraft() {
  const [draft, setDraft] = useState<ListingDraft>(INITIAL_DRAFT);
  const [draftId, setDraftId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const isMounted = useRef(false);

  // 1. Initialize from storage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("listing-draft");
      const savedId = localStorage.getItem("listing-draft-id"); // Load ID
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setDraft({ ...INITIAL_DRAFT, ...parsed }); // Merge to ensure new fields exist
          setLastSaved(new Date());
        } catch (e) {
          console.error("Failed to parse draft", e);
        }
      }

      // If we have a saved ID, use it. Otherwise, generate a new one.
      if (savedId) {
        setDraftId(savedId);
      } else {
        const newId = uuidv4();
        setDraftId(newId);
        localStorage.setItem("listing-draft-id", newId);
      }
    }
    isMounted.current = true;
  }, []);

  // 2. Auto-save effect
  useEffect(() => {
    if (!isMounted.current) return;

    setIsSaving(true);
    const timer = setTimeout(() => {
      localStorage.setItem("listing-draft", JSON.stringify(draft));
      if (draftId) localStorage.setItem("listing-draft-id", draftId);
      setLastSaved(new Date());
      setIsSaving(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [draft]);

  const updateDraft = (updates: Partial<ListingDraft>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  };

  // 3. Clear Draft (Call this on successful publish)
  const clearDraft = () => {
    setDraft(INITIAL_DRAFT);
    rotateDraftId();
    localStorage.removeItem("listing-draft");
    setLastSaved(null);
  };

  const rotateDraftId = () => {
    const newId = uuidv4();
    setDraftId(newId);
    localStorage.setItem("listing-draft-id", newId);
  }

  return { draft, updateDraft, isSaving, lastSaved, clearDraft, draftId, rotateDraftId };
}