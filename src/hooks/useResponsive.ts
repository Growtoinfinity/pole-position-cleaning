import { useCallback, useEffect, useState } from 'react'

export function useResponsive() {
  // Seeded from the real width, not `false` — otherwise the quote step paints
  // its desktop layout for one frame on every phone before the effect corrects it.
  const [isMobileView, setIsMobileView] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )
  
  // Function to detect mobile screen size
  const checkIsMobile = useCallback(() => {
    return window.innerWidth < 768 // md breakpoint
  }, [])
  
  useEffect(() => {
    // Set initial value
    setIsMobileView(checkIsMobile())
    
    // Add resize event listener
    const handleResize = () => {
      setIsMobileView(checkIsMobile())
    }
    
    window.addEventListener('resize', handleResize)
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [checkIsMobile])
  
  return { isMobile: isMobileView }
}
