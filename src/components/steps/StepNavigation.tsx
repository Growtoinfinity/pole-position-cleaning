import { useMemo } from "react";
import { useFormStore } from "@/stores/formStore";
import StepsBar from "@/components/StepsBar";

export default function StepNavigation() {
  const { step } = useFormStore();

  // Determine the current navigation step based on the form step
  const currentNavigationStep = useMemo(() => {
    if (step === "contact") {
      return "contact";
    }

    // Property Type Selection / Business Details
    if (
      step === "residentialType" ||
      step === "bungalowType" ||
      step === "bungalowTypeMobile" ||
      step === "townhouseType" ||
      step === "townhouseTypeMobile" ||
      step === "commercialDetails"
    ) {
      return "propertyType";
    }

    // Property Details
    if (step === "propertyDetails") {
      return "details";
    }

    // Quote / Frequency
    if (step === "residentialQuote" || step === "residentialFrequency") {
      return "quote";
    }

    // Book / Thank You
    if (
      step === "residentialBook" ||
      step === "residentialLargeAddress" ||
      step === "commercialThanks" ||
      step === "thankYou" ||
      step === "residentialThanks"
    ) {
      return "book";
    }

    return "details";
  }, [step]);

  // The terminal screens: nothing left to do. Going back is BackLink's job now.
  const isComplete =
    step === "thankYou" ||
    step === "residentialThanks" ||
    step === "commercialThanks";

  return (
    <StepsBar current={currentNavigationStep} complete={isComplete} />
  );
}
