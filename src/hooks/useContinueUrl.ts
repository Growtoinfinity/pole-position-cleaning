/**
 * Hook for managing the continue URL feature
 * 
 * This hook:
 * - Automatically updates the browser URL when form state changes
 * - Provides the current continue URL
 * - Handles restoration from URL on initial load
 */

import { useEffect, useRef, useCallback } from 'react';
import { useFormStore } from '@/stores/formStore';

export function useContinueUrl() {
  const {
    step,
    contactData,
    propertyType,
    residentialType,
    bungalowKind,
    townhouseKind,
    propertyDetails,
    residentialFrequency,
    residentialQuoteResult,
    bookingDetails,
    largeUnusualAddress,
    businessDetails,
    showBungalowInline,
    showTownhouseInline,
    updateUrl,
    getContinueUrl,
  } = useFormStore();

  // Track if we've done initial restoration
  const hasInitialized = useRef(false);

  // Update URL whenever relevant state changes
  // Skip the initial contact step to keep URLs clean until user starts filling
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      // Don't update URL on initial mount - let App handle restoration
      return;
    }

    // Only update URL if we have some meaningful data
    // (after contact step is completed or if restored from URL)
    if (contactData || step !== 'contact') {
      updateUrl();
    }
  }, [
    step,
    contactData,
    propertyType,
    residentialType,
    bungalowKind,
    townhouseKind,
    propertyDetails,
    residentialFrequency,
    residentialQuoteResult,
    bookingDetails,
    largeUnusualAddress,
    businessDetails,
    showBungalowInline,
    showTownhouseInline,
    updateUrl,
  ]);

  // Get the current continue URL
  const continueUrl = useCallback(() => {
    return getContinueUrl();
  }, [getContinueUrl]);

  return {
    continueUrl,
    currentStep: step,
  };
}

export default useContinueUrl;

