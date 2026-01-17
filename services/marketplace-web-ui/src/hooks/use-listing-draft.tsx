import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
export interface ListingDraft {
  // ==================================================
  // CORE IDENTITY & SEARCH
  // ==================================================
  title: string;
  description: string;
  categories: string[];
  license: "standard" | "commercial" | "open";

  // ==================================================
  // SLICER & 3D TECH SPECS (Machine Readable)
  // ==================================================
  printerSettings: {
    nozzleDiameter: string;
    nozzleTemperature: number | null;
    recommendedMaterials: string[];
    recommendedNozzleTempC: number | null;
    isAssemblyRequired: boolean;
    isHardwareRequired: boolean;
    isMulticolor: boolean; // Mutli Material / MMU
    hardwareRequired: string[] | null;  
  };
  dimensions: { x: number; y: number; z: number } | null // in mm

  // ==================================================
  // Legal, Safety & Content Rating
  // ==================================================
  isNSFW: boolean;
  isPhysical: boolean;

  // ==================================================
  // AI GENERATION
  // ==================================================
  isAIGenerated: boolean;
  aiModelName: string | null;

  // ==================================================
  // COMMUNITY & REMIX CULTURE
  // ==================================================
  isRemixingAllowed: boolean;
  
  // ==================================================
  // SALES & MERCHANDISING
  // ==================================================
  priceMinUnits: number;
  currency: string;
  isFree: boolean;
}

const INITIAL_DRAFT: ListingDraft = {
  title: "",
  categories: [],
  description: "",
  printerSettings: {
    nozzleTemperature: null,
    nozzleDiameter: "0.4mm",
    recommendedMaterials: ["PLA"],
    recommendedNozzleTempC: null,
    isAssemblyRequired: false,
    isMulticolor: false,
    isHardwareRequired: false,
    hardwareRequired: null,
  },
  dimensions: { x: 0, y: 0, z: 0 } ,
  priceMinUnits: 0,
  currency: "GBP",
  isPhysical: true,
  isNSFW: false,
  isFree: true,
  license: "standard",
  isAIGenerated: false,
  aiModelName: "",
  isRemixingAllowed: false,
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